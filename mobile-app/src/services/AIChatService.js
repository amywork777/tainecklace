/**
 * AI Chat Service for TaiNecklace
 * Enables conversational Q&A about transcriptions using OpenAI
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import OpenAI from 'openai';

const OPENAI_API_KEY_STORAGE = 'openai_api_key';
const CHAT_HISTORY_PREFIX = 'chat_history_';

export class AIChatService {
  constructor() {
    this.openai = null;
    this.isConfigured = false;
    this.initializeFromStorage();
  }

  async initializeFromStorage() {
    try {
      const apiKey = await AsyncStorage.getItem(OPENAI_API_KEY_STORAGE);
      if (apiKey) {
        this.configure(apiKey);
      }
    } catch (error) {
      console.warn('⚠️ Could not load OpenAI API key for chat:', error.message);
    }
  }

  configure(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('OpenAI API key is required for chat');
    }

    this.openai = new OpenAI({
      apiKey: apiKey.trim(),
    });
    this.isConfigured = true;
    console.log('✅ OpenAI Chat configured');
  }

  /**
   * Chat with a specific transcription
   */
  async chatWithTranscription(transcriptionId, userMessage, transcriptionData, chatHistory = []) {
    if (!this.isConfigured) {
      throw new Error('OpenAI not configured. Please set API key first.');
    }

    if (!userMessage || !userMessage.trim()) {
      throw new Error('Please enter a message');
    }

    if (!transcriptionData || !transcriptionData.text) {
      throw new Error('No transcription data available');
    }

    try {
      // Build conversation context
      const systemPrompt = this.buildSystemPrompt(transcriptionData);
      
      // Format chat history for OpenAI
      const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        { role: 'user', content: userMessage.trim() }
      ];

      console.log(`🤖 Chatting about transcription ${transcriptionId}...`);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: messages,
        max_tokens: 300,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
      });

      const aiResponse = response.choices[0]?.message?.content?.trim();
      
      if (!aiResponse) {
        throw new Error('No response generated');
      }

      // Create chat message objects
      const userMsg = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: userMessage.trim(),
        timestamp: new Date().toISOString()
      };

      const aiMsg = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date().toISOString(),
        tokensUsed: response.usage?.total_tokens || 0
      };

      // Save to chat history
      const updatedHistory = [...chatHistory, userMsg, aiMsg];
      await this.saveChatHistory(transcriptionId, updatedHistory);

      console.log('✅ AI chat response generated');
      
      return {
        userMessage: userMsg,
        aiResponse: aiMsg,
        chatHistory: updatedHistory,
        tokensUsed: response.usage?.total_tokens || 0
      };

    } catch (error) {
      console.error('❌ AI chat failed:', error);
      
      if (error.message?.includes('API key')) {
        throw new Error('Invalid OpenAI API key. Please check your configuration.');
      } else if (error.message?.includes('rate limit')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.message?.includes('quota')) {
        throw new Error('OpenAI quota exceeded. Please check your billing.');
      }
      
      throw new Error(`Chat failed: ${error.message}`);
    }
  }

  buildSystemPrompt(transcriptionData) {
    const { text, timestamp, duration, confidence, aiSummary } = transcriptionData;
    
    const formattedDate = timestamp ? new Date(timestamp).toLocaleDateString() : 'Unknown date';
    const formattedTime = timestamp ? new Date(timestamp).toLocaleTimeString() : 'Unknown time';
    const durationText = duration ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}` : 'Unknown';
    
    return `You are an AI assistant helping a user understand and analyze their voice recording transcription. You have access to the following information about this specific recording:

**Recording Details:**
- Date: ${formattedDate}
- Time: ${formattedTime}
- Duration: ${durationText}
- Transcription Confidence: ${confidence ? `${(confidence * 100).toFixed(1)}%` : 'Unknown'}

**AI Summary:** ${aiSummary || 'No summary available'}

**Full Transcription:**
"${text}"

**Your Role:**
- Answer questions about the content of this specific transcription
- Provide insights, analysis, or clarification about what was said
- Help identify key points, action items, or important information
- Be conversational and helpful, but stay focused on this recording
- If asked about information not in the transcription, politely clarify that you can only discuss what's in this specific recording

**Guidelines:**
- Be concise but thorough in your responses
- Reference specific parts of the transcription when relevant
- Use a friendly, helpful tone
- If the transcription seems incomplete or unclear, acknowledge this
- Don't make assumptions about context not provided in the recording`;
  }

  /**
   * Get chat history for a transcription
   */
  async getChatHistory(transcriptionId) {
    try {
      const key = `${CHAT_HISTORY_PREFIX}${transcriptionId}`;
      const stored = await AsyncStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('❌ Error loading chat history:', error);
      return [];
    }
  }

  /**
   * Save chat history for a transcription
   */
  async saveChatHistory(transcriptionId, chatHistory) {
    try {
      const key = `${CHAT_HISTORY_PREFIX}${transcriptionId}`;
      await AsyncStorage.setItem(key, JSON.stringify(chatHistory));
      console.log(`💾 Chat history saved for transcription ${transcriptionId}`);
    } catch (error) {
      console.error('❌ Error saving chat history:', error);
    }
  }

  /**
   * Clear chat history for a transcription
   */
  async clearChatHistory(transcriptionId) {
    try {
      const key = `${CHAT_HISTORY_PREFIX}${transcriptionId}`;
      await AsyncStorage.removeItem(key);
      console.log(`🗑️ Chat history cleared for transcription ${transcriptionId}`);
    } catch (error) {
      console.error('❌ Error clearing chat history:', error);
    }
  }

  /**
   * Get suggested questions for a transcription
   */
  getSuggestedQuestions(transcriptionData) {
    if (!transcriptionData || !transcriptionData.text) {
      return ['What was discussed in this recording?'];
    }

    const text = transcriptionData.text.toLowerCase();
    const suggestions = [];

    // Generic questions that work for any transcription
    suggestions.push('What are the main points from this recording?');
    suggestions.push('Can you summarize the key takeaways?');

    // Context-aware suggestions based on content
    if (text.includes('meeting') || text.includes('discuss')) {
      suggestions.push('What decisions were made in this meeting?');
      suggestions.push('Were there any action items mentioned?');
    }

    if (text.includes('task') || text.includes('todo') || text.includes('need to')) {
      suggestions.push('What tasks or action items were mentioned?');
    }

    if (text.includes('date') || text.includes('time') || text.includes('schedule')) {
      suggestions.push('Are there any dates or deadlines mentioned?');
    }

    if (text.includes('problem') || text.includes('issue') || text.includes('challenge')) {
      suggestions.push('What problems or challenges were discussed?');
    }

    if (text.includes('idea') || text.includes('suggestion') || text.includes('propose')) {
      suggestions.push('What ideas or suggestions were mentioned?');
    }

    // Limit to 4-5 most relevant suggestions
    return suggestions.slice(0, 5);
  }

  /**
   * Check if chat is available
   */
  isChatAvailable() {
    return this.isConfigured;
  }
}