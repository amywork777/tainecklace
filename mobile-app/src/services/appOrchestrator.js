import { EventEmitter } from 'events';
import { BLEAudioManager } from './bleManager';
import { AssemblyAITranscriber } from './assemblyAI';
import { ConversationDatabase } from './database';
import { AIService } from './aiService';
// AsyncStorage import - with web fallback
let AsyncStorage;
if (typeof window !== 'undefined') {
  // Web environment - use localStorage
  AsyncStorage = {
    getItem: (key) => Promise.resolve(localStorage.getItem(key)),
    setItem: (key, value) => {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
  };
} else {
  // React Native environment
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
}

export class AppOrchestrator extends EventEmitter {
  constructor() {
    super();
    
    // Core services
    this.bleManager = new BLEAudioManager();
    this.transcriber = null;
    this.database = new ConversationDatabase();
    this.aiService = null;
    
    // Current session state
    this.currentConversationId = null;
    this.isRecording = false;
    this.transcriptBuffer = '';
    this.audioChunkBuffer = [];
    
    // Settings
    this.settings = {
      assemblyAI: { apiKey: null },
      ai: { provider: 'openai', apiKey: null },
      autoSummarize: true,
      autoGenerateTitle: true,
      chunkSize: 1600 // 100ms at 16kHz
    };
    
    this.setupEventHandlers();
  }

  async initialize() {
    try {
      // Initialize database
      await this.database.initialize();
      
      // Load settings
      await this.loadSettings();
      
      // Initialize services with API keys
      if (this.settings.assemblyAI.apiKey) {
        this.transcriber = new AssemblyAITranscriber(this.settings.assemblyAI.apiKey);
        this.setupTranscriberEvents();
      }
      
      if (this.settings.ai.apiKey) {
        this.aiService = new AIService(
          this.settings.ai.apiKey,
          this.settings.ai.provider
        );
        this.setupAIServiceEvents();
      }
      
      // Initialize BLE manager
      await this.bleManager.initialize();
      
      this.emit('initialized');
      console.log('App orchestrator initialized successfully');
      
    } catch (error) {
      console.error('App initialization error:', error);
      this.emit('error', error);
      throw error;
    }
  }

  setupEventHandlers() {
    // BLE audio events
    this.bleManager.on('connected', (deviceName) => {
      this.emit('deviceConnected', deviceName);
    });
    
    this.bleManager.on('disconnected', () => {
      this.emit('deviceDisconnected');
    });
    
    this.bleManager.on('audioChunk', (audioData) => {
      this.handleAudioChunk(audioData);
    });
    
    this.bleManager.on('error', (error) => {
      this.emit('error', { source: 'ble', error });
    });
  }

  setupTranscriberEvents() {
    this.transcriber.on('connected', () => {
      this.emit('transcriberConnected');
    });
    
    this.transcriber.on('partialTranscript', (transcript) => {
      this.emit('partialTranscript', transcript);
    });
    
    this.transcriber.on('finalTranscript', (transcript) => {
      this.handleFinalTranscript(transcript);
    });
    
    this.transcriber.on('error', (error) => {
      this.emit('error', { source: 'transcriber', error });
    });
  }

  setupAIServiceEvents() {
    this.aiService.on('conversationSummarized', (data) => {
      this.handleConversationSummarized(data);
    });
    
    this.aiService.on('insightsExtracted', (data) => {
      this.handleInsightsExtracted(data);
    });
    
    this.aiService.on('error', (error) => {
      this.emit('error', { source: 'ai', error });
    });
  }

  // Recording workflow
  async startRecording() {
    try {
      if (!this.transcriber) {
        throw new Error('AssemblyAI not configured. Please set API key in settings.');
      }
      
      if (!this.bleManager.getConnectionState().connected) {
        throw new Error('BLE device not connected');
      }
      
      // Create new conversation
      this.currentConversationId = await this.database.createConversation(
        Date.now(),
        null, // Title will be generated later
        null  // Location could be added later
      );
      
      // Start transcription session
      await this.transcriber.connect();
      await this.transcriber.startTranscribing();
      
      // Start BLE recording
      this.bleManager.startRecording();
      
      this.isRecording = true;
      this.transcriptBuffer = '';
      this.audioChunkBuffer = [];
      
      this.emit('recordingStarted', this.currentConversationId);
      console.log(`Started recording conversation ${this.currentConversationId}`);
      
    } catch (error) {
      console.error('Start recording error:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async stopRecording() {
    try {
      if (!this.isRecording) return;
      
      // Stop BLE recording
      this.bleManager.stopRecording();
      
      // Stop transcription
      if (this.transcriber) {
        this.transcriber.stopTranscribing();
      }
      
      // Finalize conversation
      await this.finalizeConversation();
      
      this.isRecording = false;
      this.emit('recordingStopped', this.currentConversationId);
      console.log(`Stopped recording conversation ${this.currentConversationId}`);
      
    } catch (error) {
      console.error('Stop recording error:', error);
      this.emit('error', error);
    }
  }

  handleAudioChunk(audioData) {
    if (!this.isRecording || !this.transcriber) return;
    
    try {
      // Send audio to transcription service
      this.transcriber.sendAudio(audioData.samples);
      
      // Buffer for later use if needed
      this.audioChunkBuffer.push(audioData);
      
      // Keep only recent audio chunks (last 10 seconds)
      const maxChunks = 100; // 10 seconds worth
      if (this.audioChunkBuffer.length > maxChunks) {
        this.audioChunkBuffer = this.audioChunkBuffer.slice(-maxChunks);
      }
      
      this.emit('audioProcessed', {
        samplesCount: audioData.samples.length,
        timestamp: audioData.timestamp
      });
      
    } catch (error) {
      console.error('Audio chunk handling error:', error);
    }
  }

  async handleFinalTranscript(transcript) {
    if (!this.currentConversationId) return;
    
    try {
      // Add to database
      await this.database.addTranscriptSegment(this.currentConversationId, transcript);
      
      // Update transcript buffer
      this.transcriptBuffer += ' ' + transcript.text;
      
      // Update conversation with latest transcript
      await this.database.updateConversation(this.currentConversationId, {
        full_transcript: this.transcriptBuffer.trim()
      });
      
      this.emit('finalTranscript', {
        ...transcript,
        conversationId: this.currentConversationId
      });
      
    } catch (error) {
      console.error('Final transcript handling error:', error);
    }
  }

  async finalizeConversation() {
    if (!this.currentConversationId || !this.transcriptBuffer.trim()) return;
    
    try {
      const endTime = Date.now();
      const conversation = await this.database.getConversation(this.currentConversationId);
      const startTime = conversation.start_time;
      
      // Generate title if enabled and AI service available
      let title = null;
      if (this.settings.autoGenerateTitle && this.aiService) {
        try {
          title = await this.aiService.generateTitle(this.transcriptBuffer);
        } catch (error) {
          console.warn('Title generation failed:', error);
        }
      }
      
      // Finish conversation in database
      await this.database.finishConversation(
        this.currentConversationId,
        endTime,
        this.transcriptBuffer.trim()
      );
      
      if (title) {
        await this.database.updateConversation(this.currentConversationId, { title });
      }
      
      // Generate summary and insights if enabled
      if (this.settings.autoSummarize && this.aiService) {
        this.generateSummaryAndInsights(this.currentConversationId);
      }
      
      this.emit('conversationFinalized', {
        conversationId: this.currentConversationId,
        title,
        duration: endTime - startTime,
        transcript: this.transcriptBuffer.trim()
      });
      
    } catch (error) {
      console.error('Conversation finalization error:', error);
    }
  }

  async generateSummaryAndInsights(conversationId) {
    try {
      const conversation = await this.database.getConversation(conversationId);
      if (!conversation.full_transcript) return;
      
      // Generate summary
      const summary = await this.aiService.summarizeConversation(
        conversation.full_transcript,
        conversation
      );
      
      // Generate insights
      const insights = await this.aiService.extractInsights(
        conversation.full_transcript,
        conversation
      );
      
      // Update conversation with AI summary
      await this.database.updateConversation(conversationId, {
        ai_summary: summary
      });
      
      console.log(`Generated summary and insights for conversation ${conversationId}`);
      
    } catch (error) {
      console.error('Summary/insights generation error:', error);
    }
  }

  async handleConversationSummarized(data) {
    await this.database.updateConversation(data.conversationId, {
      ai_summary: data.summary
    });
    
    this.emit('conversationSummarized', data);
  }

  async handleInsightsExtracted(data) {
    const { conversationId, insights } = data;
    
    try {
      // Store insights in database
      for (const topic of insights.topics || []) {
        await this.database.addInsight(conversationId, 'topic', topic);
      }
      
      for (const keyword of insights.keywords || []) {
        await this.database.addInsight(conversationId, 'keyword', keyword);
      }
      
      if (insights.sentiment) {
        await this.database.addInsight(conversationId, 'sentiment', insights.sentiment);
      }
      
      if (insights.mood) {
        await this.database.addInsight(conversationId, 'mood', insights.mood);
      }
      
      for (const actionItem of insights.actionItems || []) {
        await this.database.addInsight(conversationId, 'action_item', actionItem);
      }
      
      // Store full insights as metadata
      await this.database.addInsight(
        conversationId,
        'full_analysis',
        JSON.stringify(insights),
        1.0,
        { timestamp: Date.now() }
      );
      
      this.emit('insightsExtracted', data);
      
    } catch (error) {
      console.error('Insights storage error:', error);
    }
  }

  // AI Chat interface
  async chatWithConversation(conversationId, message, chatHistory = []) {
    if (!this.aiService) {
      throw new Error('AI service not configured');
    }
    
    const conversation = await this.database.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    // Get full conversation context including segments
    const segments = await this.database.getTranscriptSegments(conversationId);
    const conversationData = {
      ...conversation,
      segments
    };
    
    // Add user message to chat history
    await this.database.addChatMessage(conversationId, 'user', message);
    
    // Get AI response
    const response = await this.aiService.chatWithConversation(
      conversationData,
      message,
      chatHistory
    );
    
    // Add AI response to chat history
    await this.database.addChatMessage(conversationId, 'assistant', response);
    
    return response;
  }

  // Settings management
  async loadSettings() {
    try {
      const stored = await AsyncStorage.getItem('appSettings');
      if (stored) {
        this.settings = { ...this.settings, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
  }

  async saveSettings(updates) {
    try {
      this.settings = { ...this.settings, ...updates };
      await AsyncStorage.setItem('appSettings', JSON.stringify(this.settings));
      
      // Reinitialize services if API keys changed
      if (updates.assemblyAI?.apiKey) {
        this.transcriber = new AssemblyAITranscriber(updates.assemblyAI.apiKey);
        this.setupTranscriberEvents();
      }
      
      if (updates.ai?.apiKey || updates.ai?.provider) {
        this.aiService = new AIService(
          updates.ai.apiKey || this.settings.ai.apiKey,
          updates.ai.provider || this.settings.ai.provider
        );
        this.setupAIServiceEvents();
      }
      
      this.emit('settingsUpdated', this.settings);
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  // Public API methods
  async connectToDevice(deviceAddress) {
    return this.bleManager.connect(deviceAddress);
  }

  async disconnectDevice() {
    if (this.isRecording) {
      await this.stopRecording();
    }
    return this.bleManager.disconnect();
  }

  getRecordingState() {
    return {
      isRecording: this.isRecording,
      currentConversationId: this.currentConversationId,
      ...this.bleManager.getConnectionState()
    };
  }

  async getConversations(limit, offset) {
    return this.database.getAllConversations(limit, offset);
  }

  async searchConversations(query) {
    return this.database.searchConversations(query);
  }

  async getConversationStats() {
    return this.database.getConversationStats();
  }

  async getChatHistory(conversationId) {
    return this.database.getChatMessages(conversationId);
  }

  async destroy() {
    if (this.isRecording) {
      await this.stopRecording();
    }
    
    await this.bleManager.disconnect();
    this.bleManager.destroy();
    
    if (this.transcriber) {
      this.transcriber.disconnect();
    }
    
    await this.database.close();
  }
}