/**
 * Mock BLE Manager for testing without BLE dependencies
 * Simulates XIAO device behavior for app development
 */
import { ADPCMDecoder } from './ADPCMDecoder';

export class GenericBLEManager {
  constructor() {
    this.device = null;
    this.isConnected = false;
    this.adpcmDecoder = new ADPCMDecoder();
    this.callbacks = {};
    this.stats = {
      packetsReceived: 0,
      framesProcessed: 0,
      audioSamplesGenerated: 0
    };
    this.simulationInterval = null;
  }

  async initialize() {
    console.log('🔄 Initializing Mock BLE Manager...');
    console.log('✅ Mock BLE Manager initialized');
    return true;
  }

  async scanForXIAO(timeoutMs = 10000) {
    console.log('🔍 Mock scanning for XIAO devices...');
    
    // Simulate scan delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const mockDevice = {
      id: 'mock-xiao-device-001',
      name: 'XIAO BLE (Mock)',
      services: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']
    };
    
    console.log('✅ Mock device found:', mockDevice.name);
    return mockDevice;
  }

  async connectToDevice(deviceId) {
    console.log(`🔗 Mock connecting to device: ${deviceId}`);
    
    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    this.device = { id: deviceId };
    this.isConnected = true;
    
    console.log('✅ Mock connection established');
    return true;
  }

  async startAudioStreaming() {
    console.log('🎤 Starting mock audio streaming...');
    
    // Start simulating audio data
    this.startAudioSimulation();
    
    console.log('✅ Mock audio streaming started');
    return true;
  }

  startAudioSimulation() {
    // Generate mock audio data every 50ms (20 FPS)
    this.simulationInterval = setInterval(() => {
      if (this.isConnected) {
        this.generateMockAudioData();
      }
    }, 50);
  }

  generateMockAudioData() {
    // Create realistic-looking ADPCM data
    const audioDataSize = 64; // bytes of ADPCM data
    const mockAudioData = new Uint8Array(audioDataSize);
    
    // Generate pseudo-random audio data that looks like compressed audio
    for (let i = 0; i < audioDataSize; i++) {
      // Mix of patterns and randomness to simulate real audio
      const basePattern = Math.sin(i * 0.1) * 127 + 127;
      const noise = (Math.random() - 0.5) * 50;
      mockAudioData[i] = Math.max(0, Math.min(255, basePattern + noise));
    }
    
    this.processAudioData(mockAudioData);
  }

  processAudioData(audioData) {
    try {
      this.stats.packetsReceived++;
      
      // Decode ADPCM to PCM
      const pcmSamples = this.adpcmDecoder.decodeBlock(audioData);
      this.stats.audioSamplesGenerated += pcmSamples.length;
      
      if (this.stats.packetsReceived <= 3) {
        console.log(`🎵 Mock decoded ${audioData.length} ADPCM bytes → ${pcmSamples.length} PCM samples`);
      }
      
      // Send to callback for processing
      if (this.callbacks.onAudioData && pcmSamples.length > 0) {
        this.callbacks.onAudioData(pcmSamples);
      }
      
    } catch (error) {
      console.error('❌ Mock ADPCM decode error:', error);
    }
  }

  async disconnect() {
    console.log('🔌 Mock disconnecting...');
    
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
    
    this.device = null;
    this.isConnected = false;
    this.adpcmDecoder.reset();
    
    if (this.callbacks.onDisconnected) {
      this.callbacks.onDisconnected();
    }
    
    console.log('✅ Mock device disconnected');
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...callbacks };
  }

  getStats() {
    return { ...this.stats };
  }

  destroy() {
    this.disconnect();
  }
}