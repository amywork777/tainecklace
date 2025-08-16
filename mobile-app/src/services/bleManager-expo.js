/**
 * BLE Manager for XIAO Device Connection - Expo Compatible Version
 * Uses expo-bluetooth instead of react-native-ble-plx
 */
import * as Bluetooth from 'expo-bluetooth';
import { ADPCMDecoder } from './ADPCMDecoder';

export class GenericBLEManager {
  constructor() {
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
    
    // XIAO BLE Service UUIDs (Nordic UART Service)
    this.NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
    this.NUS_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // XIAO transmits to us
    this.NUS_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // We transmit to XIAO
  }

  async initialize() {
    console.log('🔄 Initializing BLE Manager...');
    
    try {
      // Check if Bluetooth is available
      const isAvailable = await Bluetooth.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Bluetooth not available on this device');
      }
      
      console.log('✅ BLE Manager initialized');
      return true;
    } catch (error) {
      console.error('❌ BLE initialization failed:', error);
      throw error;
    }
  }

  async scanForXIAO(timeoutMs = 10000) {
    console.log('🔍 Scanning for XIAO devices...');
    
    try {
      // For now, return a mock device until expo-bluetooth scanning is implemented
      // This is a placeholder - expo-bluetooth might not support scanning yet
      console.log('⚠️ Mock scanning - expo-bluetooth scanning not fully implemented yet');
      
      return {
        id: 'xiao-mock-device',
        name: 'XIAO BLE (Mock)',
        services: [this.NUS_SERVICE_UUID]
      };
      
    } catch (error) {
      console.error('❌ Scan failed:', error);
      throw error;
    }
  }

  async connectToDevice(deviceId) {
    console.log(`🔗 Connecting to device: ${deviceId}`);
    
    try {
      // Placeholder connection logic
      // expo-bluetooth connection implementation would go here
      this.device = { id: deviceId };
      this.isConnected = true;
      
      console.log('✅ Connected to device');
      return true;
      
    } catch (error) {
      console.error('❌ Connection failed:', error);
      throw error;
    }
  }

  async startAudioStreaming() {
    console.log('🎤 Starting audio streaming...');
    
    try {
      // Mock audio streaming - would implement actual BLE characteristic monitoring here
      console.log('⚠️ Mock audio streaming - expo-bluetooth characteristic monitoring not implemented yet');
      
      // Simulate receiving audio data for testing
      setTimeout(() => {
        this.simulateAudioData();
      }, 1000);
      
      console.log('✅ Audio streaming started (mock)');
      return true;
    } catch (error) {
      console.error('❌ Failed to start audio streaming:', error);
      throw error;
    }
  }

  simulateAudioData() {
    // Simulate audio data for testing purposes
    const mockAudioData = new Uint8Array(64).fill(0);
    for (let i = 0; i < mockAudioData.length; i++) {
      mockAudioData[i] = Math.floor(Math.random() * 256);
    }
    
    this.handleAudioData(btoa(String.fromCharCode(...mockAudioData)));
    
    // Continue simulating data every 100ms if connected
    if (this.isConnected) {
      setTimeout(() => this.simulateAudioData(), 100);
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
      
      // Process audio data directly (simplified for mock)
      this.processAudioData(data);
      
    } catch (error) {
      console.error('❌ Audio data processing error:', error);
    }
  }

  processAudioData(audioData) {
    try {
      // Decode ADPCM to PCM
      const pcmSamples = this.adpcmDecoder.decodeBlock(audioData);
      this.stats.audioSamplesGenerated += pcmSamples.length;
      
      if (this.stats.packetsReceived <= 3) {
        console.log(`🎵 Decoded ${audioData.length} ADPCM bytes → ${pcmSamples.length} PCM samples`);
      }
      
      // Send to callback for processing
      if (this.callbacks.onAudioData && pcmSamples.length > 0) {
        this.callbacks.onAudioData(pcmSamples);
      }
      
    } catch (error) {
      console.error('❌ ADPCM decode error:', error);
    }
  }

  async disconnect() {
    if (this.device) {
      try {
        // Disconnect logic would go here
        console.log('✅ Device disconnected');
      } catch (error) {
        console.error('❌ Disconnect error:', error);
      }
    }
    
    this.device = null;
    this.isConnected = false;
    this.adpcmDecoder.reset();
    this.frameBuffer.clear();
    
    if (this.callbacks.onDisconnected) {
      this.callbacks.onDisconnected();
    }
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
  }
}