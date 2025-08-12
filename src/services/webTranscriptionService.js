export class WebTranscriptionService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.ws = null;
    this.isConnected = false;
    this.callbacks = {};
    this.transcriptionBuffer = '';
    this.sessionId = null;
  }

  async connect() {
    if (!this.apiKey) {
      throw new Error('AssemblyAI API key is required');
    }

    try {
      const wsUrl = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${this.apiKey}`;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('AssemblyAI WebSocket connected');
        this.isConnected = true;
        if (this.callbacks.onConnected) {
          this.callbacks.onConnected();
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.ws.onclose = (event) => {
        console.log('AssemblyAI WebSocket closed:', event.code);
        this.isConnected = false;
        if (this.callbacks.onDisconnected) {
          this.callbacks.onDisconnected();
        }
      };

      this.ws.onerror = (error) => {
        console.error('AssemblyAI WebSocket error:', error);
        if (this.callbacks.onError) {
          this.callbacks.onError(error);
        }
      };

    } catch (error) {
      console.error('Failed to connect to AssemblyAI:', error);
      throw error;
    }
  }

  handleMessage(message) {
    switch (message.message_type) {
      case 'SessionBegins':
        this.sessionId = message.session_id;
        console.log(`AssemblyAI session started: ${this.sessionId}`);
        break;

      case 'PartialTranscript':
        if (message.text && this.callbacks.onPartialTranscript) {
          this.callbacks.onPartialTranscript({
            text: message.text,
            confidence: message.confidence,
            isPartial: true
          });
        }
        break;

      case 'FinalTranscript':
        if (message.text && this.callbacks.onFinalTranscript) {
          this.transcriptionBuffer += ' ' + message.text;
          this.callbacks.onFinalTranscript({
            text: message.text,
            confidence: message.confidence,
            isFinal: true,
            fullTranscript: this.transcriptionBuffer.trim()
          });
        }
        break;

      case 'SessionTerminated':
        console.log('AssemblyAI session terminated');
        if (this.callbacks.onSessionEnded) {
          this.callbacks.onSessionEnded();
        }
        break;

      default:
        console.log('Unknown message type:', message.message_type);
    }
  }

  // Simulate sending audio data (in real implementation, would need proper audio format conversion)
  sendAudioData(audioData) {
    if (!this.isConnected || !this.ws) {
      return;
    }

    try {
      // For demo purposes, we'll simulate this
      // In real implementation, you'd need to:
      // 1. Convert WebM audio to raw PCM
      // 2. Encode as base64
      // 3. Send to AssemblyAI
      
      console.log('Simulating audio data send to AssemblyAI');
      
      // Simulate transcription responses for demo
      if (Math.random() > 0.7) { // 30% chance of getting text
        const sampleTexts = [
          "Hello, this is a test of the TaiNecklace transcription service.",
          "The weather is beautiful today.",
          "I'm testing the real-time transcription feature.",
          "This AI companion necklace is working great.",
          "AssemblyAI is providing real-time speech to text."
        ];
        
        const randomText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
        
        // Simulate partial transcript first
        if (this.callbacks.onPartialTranscript) {
          this.callbacks.onPartialTranscript({
            text: randomText,
            confidence: 0.85,
            isPartial: true
          });
        }
        
        // Then final transcript after a short delay
        setTimeout(() => {
          if (this.callbacks.onFinalTranscript) {
            this.transcriptionBuffer += ' ' + randomText;
            this.callbacks.onFinalTranscript({
              text: randomText,
              confidence: 0.92,
              isFinal: true,
              fullTranscript: this.transcriptionBuffer.trim()
            });
          }
        }, 500);
      }
    } catch (error) {
      console.error('Error sending audio data:', error);
    }
  }

  startTranscribing() {
    this.transcriptionBuffer = '';
    console.log('Transcription started');
    
    if (this.callbacks.onTranscriptionStarted) {
      this.callbacks.onTranscriptionStarted();
    }
  }

  stopTranscribing() {
    if (this.ws) {
      this.ws.send(JSON.stringify({ terminate_session: true }));
    }
    
    console.log('Transcription stopped');
    
    if (this.callbacks.onTranscriptionStopped) {
      this.callbacks.onTranscriptionStopped({
        finalTranscript: this.transcriptionBuffer.trim()
      });
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.isConnected = false;
    this.ws = null;
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...callbacks };
  }

  getFullTranscript() {
    return this.transcriptionBuffer.trim();
  }

  getState() {
    return {
      connected: this.isConnected,
      sessionId: this.sessionId,
      hasApiKey: !!this.apiKey
    };
  }
}