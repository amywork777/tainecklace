/**
 * AssemblyAI Transcription Service for React Native
 * Handles batch audio transcription
 */
export class TranscriptionService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.assemblyai.com/v2';
  }

  async transcribeAudio(pcmSamples, sampleRate = 16000) {
    if (!this.apiKey) {
      throw new Error('AssemblyAI API key is required');
    }

    console.log(`🎯 Starting transcription of ${pcmSamples.length} PCM samples...`);

    try {
      // Create WAV blob from PCM data
      const wavData = this.createWavData(pcmSamples, sampleRate);
      console.log(`📄 Created WAV data: ${wavData.length} bytes`);

      // Upload to AssemblyAI
      const uploadResponse = await fetch(`${this.baseUrl}/upload`, {
        method: 'POST',
        headers: {
          'authorization': this.apiKey,
          'content-type': 'application/octet-stream'
        },
        body: wavData
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed: ${uploadResponse.status} ${errorText}`);
      }

      const uploadData = await uploadResponse.json();
      console.log('✅ Audio uploaded:', uploadData.upload_url);

      // Request transcription
      const transcribeResponse = await fetch(`${this.baseUrl}/transcript`, {
        method: 'POST',
        headers: {
          'authorization': this.apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          audio_url: uploadData.upload_url,
          speech_model: 'best',
          language_detection: true,
          punctuate: true,
          format_text: true,
          filter_profanity: false
        })
      });

      if (!transcribeResponse.ok) {
        const errorText = await transcribeResponse.text();
        throw new Error(`Transcription request failed: ${transcribeResponse.status} ${errorText}`);
      }

      const transcribeData = await transcribeResponse.json();
      console.log('🔄 Transcription requested:', transcribeData.id);

      // Poll for completion
      const result = await this.pollTranscriptionStatus(transcribeData.id);
      return result;

    } catch (error) {
      console.error('❌ Transcription error:', error);
      throw error;
    }
  }

  async pollTranscriptionStatus(transcriptId) {
    console.log('⏳ Polling transcription status...');
    
    while (true) {
      try {
        const response = await fetch(`${this.baseUrl}/transcript/${transcriptId}`, {
          headers: { 'authorization': this.apiKey }
        });

        if (!response.ok) {
          throw new Error(`Polling failed: ${response.status}`);
        }

        const data = await response.json();
        console.log(`📋 Status: ${data.status}`);

        if (data.status === 'completed') {
          console.log('✅ Transcription completed!');
          const resultText = data.text || '[No speech detected]';
          console.log(`📝 Transcription: "${resultText.substring(0, 100)}${resultText.length > 100 ? '...' : ''}"`); 
          return {
            text: resultText,
            confidence: data.confidence,
            words: data.words || []
          };
        } else if (data.status === 'error') {
          throw new Error(data.error || 'Transcription failed');
        }

        // Wait 2 seconds before polling again
        await this.delay(2000);

      } catch (error) {
        console.error('❌ Polling error:', error);
        throw error;
      }
    }
  }

  createWavData(pcmSamples, sampleRate) {
    const byteLength = pcmSamples.length * 2;
    const buffer = new ArrayBuffer(44 + byteLength);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + byteLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, byteLength, true);
    
    // PCM data
    let offset = 44;
    for (let i = 0; i < pcmSamples.length; i++) {
      view.setInt16(offset, pcmSamples[i], true);
      offset += 2;
    }
    
    return new Uint8Array(buffer);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}