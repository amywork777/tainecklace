import { EventEmitter } from 'events';

export class AssemblyAITranscriber extends EventEmitter {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.ws = null;
    this.isConnected = false;
    this.isTranscribing = false;
    this.sessionId = null;
    this.currentTranscript = '';
    this.interimTranscripts = new Map();
    this.finalTranscripts = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async connect() {
    try {
      const wsUrl = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${this.apiKey}`;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('AssemblyAI WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.ws.onclose = (event) => {
        console.log('AssemblyAI WebSocket closed:', event.code, event.reason);
        this.isConnected = false;
        this.emit('disconnected');
        
        // Auto-reconnect if not intentionally closed
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
        }
      };

      this.ws.onerror = (error) => {
        console.error('AssemblyAI WebSocket error:', error);
        this.emit('error', error);
      };

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  handleMessage(message) {
    switch (message.message_type) {
      case 'SessionBegins':
        this.sessionId = message.session_id;
        console.log(`AssemblyAI session started: ${this.sessionId}`);
        this.emit('sessionStarted', this.sessionId);
        break;

      case 'PartialTranscript':
        this.handlePartialTranscript(message);
        break;

      case 'FinalTranscript':
        this.handleFinalTranscript(message);
        break;

      case 'SessionTerminated':
        console.log('AssemblyAI session terminated');
        this.emit('sessionEnded');
        break;

      default:
        console.log('Unknown message type:', message.message_type);
    }
  }

  handlePartialTranscript(message) {
    if (message.text && message.text.trim()) {
      this.interimTranscripts.set(message.audio_start, {
        text: message.text,
        confidence: message.confidence,
        audioStart: message.audio_start,
        audioEnd: message.audio_end,
        timestamp: Date.now()
      });

      this.emit('partialTranscript', {
        text: message.text,
        confidence: message.confidence,
        audioStart: message.audio_start,
        audioEnd: message.audio_end,
        isPartial: true
      });
    }
  }

  handleFinalTranscript(message) {
    if (message.text && message.text.trim()) {
      const finalTranscript = {
        text: message.text,
        confidence: message.confidence,
        audioStart: message.audio_start,
        audioEnd: message.audio_end,
        timestamp: Date.now(),
        isFinal: true
      };

      this.finalTranscripts.push(finalTranscript);
      
      // Remove corresponding partial transcript
      this.interimTranscripts.delete(message.audio_start);

      this.emit('finalTranscript', finalTranscript);
      
      // Update current transcript
      this.updateCurrentTranscript();
    }
  }

  updateCurrentTranscript() {
    const allTranscripts = [
      ...this.finalTranscripts,
      ...Array.from(this.interimTranscripts.values())
    ].sort((a, b) => a.audioStart - b.audioStart);

    this.currentTranscript = allTranscripts
      .map(t => t.text)
      .join(' ')
      .trim();

    this.emit('transcriptUpdated', {
      fullTranscript: this.currentTranscript,
      segments: allTranscripts
    });
  }

  sendAudio(audioData) {
    if (!this.isConnected || !this.ws) {
      console.warn('Cannot send audio: WebSocket not connected');
      return;
    }

    try {
      // Convert Int16Array to base64
      const base64Audio = this.samplesToBase64(audioData);
      
      this.ws.send(JSON.stringify({
        audio_data: base64Audio
      }));
      
    } catch (error) {
      console.error('Error sending audio:', error);
      this.emit('error', error);
    }
  }

  samplesToBase64(samples) {
    // Convert 16-bit PCM samples to base64
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);
    
    for (let i = 0; i < samples.length; i++) {
      view.setInt16(i * 2, samples[i], true); // little-endian
    }
    
    const uint8Array = new Uint8Array(buffer);
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i]);
    }
    
    return btoa(binaryString);
  }

  startTranscribing() {
    if (!this.isConnected) {
      throw new Error('WebSocket not connected');
    }
    
    this.isTranscribing = true;
    this.currentTranscript = '';
    this.interimTranscripts.clear();
    this.finalTranscripts = [];
    
    this.emit('transcribingStarted');
    console.log('Transcription started');
  }

  stopTranscribing() {
    this.isTranscribing = false;
    
    // Send terminate message
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify({ terminate_session: true }));
    }
    
    this.emit('transcribingStopped', {
      finalTranscript: this.currentTranscript,
      segments: this.finalTranscripts,
      totalSegments: this.finalTranscripts.length
    });
    
    console.log('Transcription stopped');
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
    }
    
    this.isConnected = false;
    this.isTranscribing = false;
    this.ws = null;
  }

  getCurrentTranscript() {
    return {
      text: this.currentTranscript,
      segments: [...this.finalTranscripts],
      partialSegments: Array.from(this.interimTranscripts.values())
    };
  }

  getStats() {
    return {
      connected: this.isConnected,
      transcribing: this.isTranscribing,
      sessionId: this.sessionId,
      finalSegments: this.finalTranscripts.length,
      partialSegments: this.interimTranscripts.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}