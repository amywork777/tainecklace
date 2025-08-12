export class WebAudioService {
  constructor() {
    this.mediaRecorder = null;
    this.audioStream = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.callbacks = {};
  }

  async initialize() {
    try {
      // Request microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      console.log('Web audio initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize web audio:', error);
      throw new Error('Microphone access denied or not available');
    }
  }

  startRecording(onAudioData) {
    if (!this.audioStream) {
      throw new Error('Audio not initialized');
    }

    try {
      this.audioChunks = [];
      this.callbacks.onAudioData = onAudioData;

      // Create MediaRecorder for real-time audio capture
      this.mediaRecorder = new MediaRecorder(this.audioStream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      // Handle audio data chunks
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          if (onAudioData) {
            this.processAudioChunk(event.data);
          }
        }
      };

      // Start recording with small chunks for real-time processing
      this.mediaRecorder.start(100); // 100ms chunks
      this.isRecording = true;
      
      console.log('Web recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  async processAudioChunk(audioBlob) {
    try {
      // Convert blob to array buffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // For demo purposes, we'll simulate audio processing
      // In a real implementation, you'd convert this to the format expected by AssemblyAI
      const audioData = {
        data: arrayBuffer,
        timestamp: Date.now(),
        duration: 100 // ms
      };

      if (this.callbacks.onAudioData) {
        this.callbacks.onAudioData(audioData);
      }
    } catch (error) {
      console.error('Audio processing error:', error);
    }
  }

  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      console.log('Web recording stopped');
    }
  }

  async getRecordedAudio() {
    if (this.audioChunks.length === 0) {
      return null;
    }

    // Combine all audio chunks into a single blob
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    return audioBlob;
  }

  destroy() {
    this.stopRecording();
    
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
  }

  getState() {
    return {
      initialized: !!this.audioStream,
      recording: this.isRecording
    };
  }
}