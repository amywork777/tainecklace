/**
 * Generic BLE Manager for Audio Device Connection
 * Supports multiple BLE devices with audio streaming capabilities
 */
import { BleManager } from 'react-native-ble-plx';
import { ADPCMDecoder } from './ADPCMDecoder';

export class GenericBLEManager {
  constructor() {
    this.manager = new BleManager();
    this.device = null;
    this.isConnected = false;
    this.adpcmDecoder = new ADPCMDecoder();
    this.frameBuffer = new Map();
    this.callbacks = {};
    this.stats = {
      packetsReceived: 0,
      framesProcessed: 0,
      audioSamplesGenerated: 0
    };
    
    // Common BLE Service UUIDs for audio devices
    this.COMMON_AUDIO_SERVICES = [
      '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service (XIAO)
      '0000180a-0000-1000-8000-00805f9b34fb', // Device Information Service
      '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
      '0000110b-0000-1000-8000-00805f9b34fb', // Audio Sink Service
    ];
    this.NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    this.NUS_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';
    this.NUS_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
    this.discoveredDevices = [];
  }

  async initialize() {
    console.log('🔄 Initializing BLE Manager...');
    
    // Check if Bluetooth is enabled
    const state = await this.manager.state();
    if (state !== 'PoweredOn') {
      throw new Error(`Bluetooth not ready. Current state: ${state}`);
    }
    
    console.log('✅ BLE Manager initialized');
    return true;
  }

  async scanForAudioDevices(timeoutMs = 10000) {
    console.log('🔍 Scanning for BLE audio devices...');
    this.discoveredDevices = [];
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.manager.stopDeviceScan();
        console.log(`✅ Found ${this.discoveredDevices.length} devices`);
        resolve(this.discoveredDevices);
      }, timeoutMs);

      // Scan with Nordic UART Service filter for audio devices
      this.manager.startDeviceScan(['6e400001-b5a3-f393-e0a9-e50e24dcca9e'], null, (error, device) => {
        if (error) {
          clearTimeout(timeout);
          this.manager.stopDeviceScan();
          reject(error);
          return;
        }

        if (device && device.name && !this.discoveredDevices.find(d => d.id === device.id)) {
          console.log(`📱 Found device: ${device.name} (${device.id})`);
          this.discoveredDevices.push({
            id: device.id,
            name: device.name,
            rssi: device.rssi,
            serviceUUIDs: device.serviceUUIDs || []
          });
        }
      });
    });
  }

  async scanForXIAO(timeoutMs = 10000) {
    console.log('🔍 Scanning for XIAO devices (legacy method)...');
    const devices = await this.scanForAudioDevices(timeoutMs);
    const xiaoDevice = devices.find(d => d.name.toLowerCase().includes('xiao'));
    if (!xiaoDevice) {
      throw new Error('XIAO device not found');
    }
    return xiaoDevice;
  }

  async connectToDevice(deviceId) {
    console.log(`🔌 Connecting to device: ${deviceId}`);
    
    try {
      this.device = await this.manager.connectToDevice(deviceId);
      console.log('✅ Connected to device');
      
      await this.device.discoverAllServicesAndCharacteristics();
      console.log('✅ Services and characteristics discovered');
      
      this.isConnected = true;
      
      // Set up disconnect handler
      this.device.onDisconnected(() => {
        console.log('📱 Device disconnected');
        this.isConnected = false;
        if (this.callbacks.onDisconnected) {
          this.callbacks.onDisconnected();
        }
      });
      
      return true;
    } catch (error) {
      console.error('❌ Connection failed:', error);
      throw error;
    }
  }

  async startAudioStreaming() {
    if (!this.isConnected || !this.device) {
      throw new Error('Device not connected');
    }

    console.log('🎤 Starting audio streaming...');
    
    try {
      // Start listening for audio data on TX characteristic
      this.device.monitorCharacteristicForService(
        this.NUS_SERVICE_UUID,
        this.NUS_TX_CHAR_UUID,
        (error, characteristic) => {
          if (error) {
            console.error('❌ Monitor error:', error);
            return;
          }
          
          if (characteristic?.value) {
            this.handleAudioData(characteristic.value);
          }
        }
      );
      
      console.log('✅ Audio streaming started');
      return true;
    } catch (error) {
      console.error('❌ Failed to start audio streaming:', error);
      throw error;
    }
  }

  handleAudioData(base64Data) {
    try {
      // Convert base64 to byte array
      const data = this.base64ToBytes(base64Data);
      this.stats.packetsReceived++;
      
      // Debug log for first few packets
      if (this.stats.packetsReceived <= 5) {
        console.log(`📦 Packet ${this.stats.packetsReceived}:`, 
          Array.from(data.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
      }
      
      // Check for fragmented packet format: 0xAA 0x55 header (XIAO and similar devices)
      if (data.length >= 4 && data[0] === 0xAA && data[1] === 0x55) {
        this.handleFragmentedPacket(data);
      } else {
        // Direct audio data (for devices that don't use fragmentation)
        this.processAudioData(data);
      }
      
    } catch (error) {
      console.error('❌ Audio data processing error:', error);
    }
  }

  handleFragmentedPacket(data) {
    const seqNum = data[2];
    const fragId = data[3];
    const audioData = data.slice(4);
    
    if (this.stats.packetsReceived <= 5) {
      console.log(`📦 Fragment: seq=${seqNum}, frag=${fragId}, len=${audioData.length}`);
    }
    
    // Store fragment
    const frameKey = `${seqNum}`;
    if (!this.frameBuffer.has(frameKey)) {
      this.frameBuffer.set(frameKey, new Map());
    }
    
    const fragments = this.frameBuffer.get(frameKey);
    fragments.set(fragId, audioData);
    
    // Complete frame immediately for single fragments (fragId=59 pattern from web app)
    const isComplete = fragId === 255 || fragId === 59 || fragments.size === 1;
    
    if (isComplete) {
      this.reassembleAndDecodeFrame(frameKey, fragments);
      this.frameBuffer.delete(frameKey);
      this.stats.framesProcessed++;
    }
  }

  reassembleAndDecodeFrame(frameKey, fragments) {
    // Reassemble fragments in order
    const sortedFragments = Array.from(fragments.entries()).sort((a, b) => a[0] - b[0]);
    let completeFrame = [];
    
    for (const [fragId, data] of sortedFragments) {
      completeFrame.push(...data);
    }
    
    // Convert to Uint8Array for ADPCM decoder
    const audioData = new Uint8Array(completeFrame);
    this.processAudioData(audioData);
  }

  processAudioData(audioData) {
    try {
      // Decode ADPCM to PCM
      const pcmSamples = this.adpcmDecoder.decodeBlock(audioData);
      this.stats.audioSamplesGenerated += pcmSamples.length;
      
      if (this.stats.framesProcessed <= 3) {
        console.log(`🎵 Decoded ${audioData.length} ADPCM bytes → ${pcmSamples.length} PCM samples`);
      }
      
      // Send to callback for processing
      if (this.callbacks.onAudioData && pcmSamples.length > 0) {
        console.log(`🔔 Calling onAudioData callback with ${pcmSamples.length} samples`);
        this.callbacks.onAudioData(pcmSamples);
      } else {
        console.log(`🚫 Callback not available: onAudioData=${!!this.callbacks.onAudioData}, samples=${pcmSamples.length}`);
      }
      
    } catch (error) {
      console.error('❌ ADPCM decode error:', error);
    }
  }

  async disconnect() {
    if (this.device) {
      try {
        await this.device.cancelConnection();
        console.log('✅ Device disconnected');
      } catch (error) {
        console.error('❌ Disconnect error:', error);
      }
    }
    
    this.device = null;
    this.isConnected = false;
    this.adpcmDecoder.reset();
    this.frameBuffer.clear();
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...callbacks };
  }

  getStats() {
    return { ...this.stats };
  }

  // Utility function to convert base64 to bytes
  base64ToBytes(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  destroy() {
    this.disconnect();
    this.manager.destroy();
  }
}