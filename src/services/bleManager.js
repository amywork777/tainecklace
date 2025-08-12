// BLE import - only works on mobile
let BleManager, Device;
if (typeof navigator !== 'undefined' && navigator.product !== 'ReactNative') {
  // Web environment - mock BLE
  BleManager = class MockBleManager {
    async state() { return 'Unsupported'; }
    startDeviceScan() { return null; }
    stopDeviceScan() {}
    destroy() {}
  };
  Device = class MockDevice {};
} else {
  // React Native environment
  try {
    const ble = require('react-native-ble-plx');
    BleManager = ble.BleManager;
    Device = ble.Device;
  } catch (e) {
    // Fallback for web
    BleManager = class MockBleManager {
      async state() { return 'Unsupported'; }
      startDeviceScan() { return null; }
      stopDeviceScan() {}
      destroy() {}
    };
    Device = class MockDevice {};
  }
}
import { FrameBuffer } from './frameBuffer';
import { ADPCMDecoder } from './adpcm';
import { EventEmitter } from 'events';

const NUS_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
const NUS_CHAR_TX = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";
const XIAO_ADDRESS = "4946229F-BE14-34B7-1703-3F9292D6BA00";
const SAMPLE_RATE = 16000;

export class BLEAudioManager extends EventEmitter {
  constructor() {
    super();
    this.manager = new BleManager();
    this.device = null;
    this.frameBuffer = new FrameBuffer();
    this.adpcmDecoder = new ADPCMDecoder();
    this.isConnected = false;
    this.isRecording = false;
    this.audioBuffer = [];
    this.stats = { totalSamples: 0, droppedFrames: 0 };
  }

  async initialize() {
    const state = await this.manager.state();
    if (state !== 'PoweredOn') {
      throw new Error(`Bluetooth is not powered on. State: ${state}`);
    }
    
    this.emit('initialized');
    console.log('BLE Manager initialized');
  }

  async connect(deviceAddress = XIAO_ADDRESS) {
    try {
      this.emit('status', { message: 'Scanning for device...', type: 'info' });
      
      // Scan for device
      const subscription = this.manager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          console.error('Scan error:', error);
          return;
        }

        if (device.id === deviceAddress || device.name === 'XIAO-ADPCM') {
          this.manager.stopDeviceScan();
          this.connectToDevice(device);
        }
      });

      // Stop scanning after 10 seconds if device not found
      setTimeout(() => {
        this.manager.stopDeviceScan();
        if (!this.isConnected) {
          this.emit('error', new Error('Device not found within timeout'));
        }
      }, 10000);

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async connectToDevice(device) {
    try {
      this.emit('status', { message: 'Connecting to device...', type: 'info' });
      
      this.device = await device.connect();
      await this.device.discoverAllServicesAndCharacteristics();
      
      // Subscribe to notifications
      await this.device.monitorCharacteristicForService(
        NUS_SERVICE_UUID,
        NUS_CHAR_TX,
        (error, characteristic) => {
          if (error) {
            console.error('Notification error:', error);
            this.emit('error', error);
            return;
          }
          
          this.handleNotification(characteristic.value);
        }
      );

      this.isConnected = true;
      this.emit('connected', device.name || device.id);
      console.log(`Connected to ${device.name || device.id}`);
      
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  handleNotification(base64Data) {
    try {
      // Convert base64 to Uint8Array
      const data = new Uint8Array(
        atob(base64Data)
          .split('')
          .map(char => char.charCodeAt(0))
      );

      const parsed = this.parseNotification(data);
      if (!parsed) return;

      this.frameBuffer.addFragment(
        parsed.seq,
        parsed.fragId,
        parsed.format,
        parsed.totalLen,
        parsed.payload
      );

      // Process completed frames
      this.processCompletedFrames();

      // Emit stats periodically
      if (this.frameBuffer.stats.notifications % 100 === 0) {
        this.emit('stats', this.frameBuffer.getStats());
      }

    } catch (error) {
      console.error('Notification handling error:', error);
    }
  }

  parseNotification(data) {
    if (data.length < 5) return null;
    if (data[0] !== 0xAA || data[1] !== 0x55) return null;

    const seqLo = data[2];
    const seqHi = data[3];
    const fragId = data[4];
    const seq = seqLo | (seqHi << 8);

    let formatChar = null;
    let totalLen = null;
    let payload;

    if (fragId === 0) {
      if (data.length < 8) return null;
      formatChar = String.fromCharCode(data[5]);
      totalLen = data[6] | (data[7] << 8);
      payload = data.slice(8);
    } else {
      payload = data.slice(5);
    }

    return {
      seq,
      fragId,
      format: formatChar,
      totalLen,
      payload
    };
  }

  processCompletedFrames() {
    const completedFrames = this.frameBuffer.getCompletedFrames();
    this.frameBuffer.clearCompleted();

    for (const frame of completedFrames) {
      if (frame.format === 'I') { // ADPCM format
        try {
          const pcmSamples = this.adpcmDecoder.decodeBlock(frame.data);
          this.audioBuffer.push(...pcmSamples);
          this.stats.totalSamples += pcmSamples.length;

          // Emit audio chunk when we have enough samples (100ms = 1600 samples at 16kHz)
          if (this.audioBuffer.length >= 1600) {
            const chunk = this.audioBuffer.splice(0, 1600);
            this.emit('audioChunk', {
              samples: chunk,
              sampleRate: SAMPLE_RATE,
              timestamp: Date.now()
            });
          }
        } catch (error) {
          console.error('ADPCM decode error:', error);
          this.stats.droppedFrames++;
        }
      }
    }
  }

  startRecording() {
    if (!this.isConnected) {
      throw new Error('Device not connected');
    }
    
    this.isRecording = true;
    this.frameBuffer = new FrameBuffer(); // Reset buffer
    this.adpcmDecoder.reset();
    this.audioBuffer = [];
    this.stats = { totalSamples: 0, droppedFrames: 0 };
    
    this.emit('recordingStarted');
    console.log('Recording started');
  }

  stopRecording() {
    this.isRecording = false;
    
    // Process any remaining audio
    if (this.audioBuffer.length > 0) {
      this.emit('audioChunk', {
        samples: [...this.audioBuffer],
        sampleRate: SAMPLE_RATE,
        timestamp: Date.now()
      });
      this.audioBuffer = [];
    }
    
    this.frameBuffer.finalizeStats();
    this.emit('recordingStopped', {
      stats: this.frameBuffer.getStats(),
      audioStats: this.stats
    });
    
    console.log('Recording stopped');
  }

  async disconnect() {
    if (this.device) {
      try {
        await this.device.cancelConnection();
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
    
    this.device = null;
    this.isConnected = false;
    this.isRecording = false;
    this.emit('disconnected');
    console.log('Disconnected');
  }

  getConnectionState() {
    return {
      connected: this.isConnected,
      recording: this.isRecording,
      deviceId: this.device?.id || null
    };
  }

  destroy() {
    this.disconnect();
    this.manager.destroy();
  }
}