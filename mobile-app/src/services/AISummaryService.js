/**
 * AI Summary Service for TaiNecklace
 * Uses OpenAI to summarize conversations and transcriptions
 */
import OpenAI from 'openai';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OPENAI_API_KEY_STORAGE = 'openai_api_key';

export class AISummaryService {
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
      console.warn('⚠️ Could not load OpenAI API key from storage:', error.message);
    }
  }

  configure(apiKey) {
    if (!apiKey || !apiKey.trim()) {
      throw new Error('OpenAI API key is required');
    }

    this.openai = new OpenAI({
      apiKey: apiKey.trim(),
    });
    this.isConfigured = true;
    console.log('✅ OpenAI configured for conversation summarization');
  }

  async saveApiKey(apiKey) {
    await AsyncStorage.setItem(OPENAI_API_KEY_STORAGE, apiKey);
    this.configure(apiKey);
  }

  async getApiKey() {
    return await AsyncStorage.getItem(OPENAI_API_KEY_STORAGE);
  }

  /**
   * Summarize a single transcription automatically
   */
  async summarizeTranscription(transcription, options = {}) {
    if (!this.isConfigured) {
      console.log('⚠️ OpenAI not configured, skipping AI summary');
      return null;
    }

    if (!transcription || !transcription.text || transcription.text.trim().length < 10) {
      console.log('⚠️ Transcription too short for AI summary');
      return null;
    }

    const {
      summaryType = 'concise', // 'concise', 'detailed', 'key-points'
    } = options;

    try {
      const prompt = this.buildTranscriptionSummaryPrompt(transcription.text, summaryType);

      console.log(`🤖 Auto-summarizing transcription (${transcription.text.length} chars)...`);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that creates concise, helpful summaries of individual voice recordings. Focus on the main points and key information.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150, // Shorter summaries for individual transcriptions
        temperature: 0.2,
      });

      const summary = response.choices[0]?.message?.content?.trim();
      
      if (!summary) {
        console.log('⚠️ No summary generated');
        return null;
      }

      console.log('✅ AI transcription summary generated');
      
      return {
        summary,
        summaryType,
        timestamp: new Date().toISOString(),
        tokensUsed: response.usage?.total_tokens || 0,
        originalLength: transcription.text.length
      };

    } catch (error) {
      console.error('❌ AI transcription summary failed:', error);
      
      // Don't throw error - just log and return null so transcription still works
      if (error.message?.includes('API key')) {
        console.log('⚠️ Invalid OpenAI API key, skipping summary');
      } else if (error.message?.includes('rate limit')) {
        console.log('⚠️ OpenAI rate limit hit, skipping summary');
      } else if (error.message?.includes('quota')) {
        console.log('⚠️ OpenAI quota exceeded, skipping summary');
      }
      
      return null;
    }
  }

  /**
   * Summarize a collection of transcriptions (for bulk analysis)
   */
  async summarizeTranscriptions(transcriptions, options = {}) {
    if (!this.isConfigured) {
      throw new Error('OpenAI not configured. Please set API key first.');
    }

    if (!transcriptions || transcriptions.length === 0) {
      throw new Error('No transcriptions to summarize');
    }

    const {
      maxTranscriptions = 20,
      summaryType = 'conversation', // 'conversation', 'bullet-points', 'topics'
      includeTimestamps = false
    } = options;

    try {
      // Limit transcriptions for better processing
      const recentTranscriptions = transcriptions.slice(0, maxTranscriptions);
      
      // Format transcriptions for AI
      const transcriptionText = recentTranscriptions
        .map(t => {
          const timestamp = includeTimestamps && t.timestamp 
            ? `[${new Date(t.timestamp).toLocaleTimeString()}] ` 
            : '';
          return `${timestamp}${t.text || '[No text]'}`;
        })
        .join('\n\n');

      const prompt = this.buildSummaryPrompt(transcriptionText, summaryType);

      console.log(`🤖 Summarizing ${recentTranscriptions.length} transcriptions...`);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant that helps summarize voice recordings and conversations. Provide clear, concise, and helpful summaries.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      });

      const summary = response.choices[0]?.message?.content?.trim();
      
      if (!summary) {
        throw new Error('No summary generated');
      }

      console.log('✅ AI summary generated successfully');
      
      return {
        summary,
        transcriptionCount: recentTranscriptions.length,
        summaryType,
        timestamp: new Date().toISOString(),
        tokensUsed: response.usage?.total_tokens || 0
      };

    } catch (error) {
      console.error('❌ AI summarization failed:', error);
      
      if (error.message?.includes('API key')) {
        throw new Error('Invalid OpenAI API key. Please check your configuration.');
      } else if (error.message?.includes('rate limit')) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.message?.includes('quota')) {
        throw new Error('OpenAI quota exceeded. Please check your billing.');
      }
      
      throw new Error(`Summarization failed: ${error.message}`);
    }
  }

  buildTranscriptionSummaryPrompt(transcriptionText, summaryType) {
    const basePrompt = `Please summarize this voice recording:

"${transcriptionText}"

`;

    switch (summaryType) {
      case 'detailed':
        return basePrompt + `Provide a detailed summary that includes:
• Main topics or subjects discussed
• Key points and important details
• Any action items or decisions mentioned
• Context and background information`;

      case 'key-points':
        return basePrompt + `Extract the key points as bullet points:
• Most important information
• Main topics discussed
• Any specific details or numbers mentioned
• Action items or next steps`;

      case 'concise':
      default:
        return basePrompt + `Provide a concise 1-2 sentence summary focusing on:
• The main topic or purpose of the recording
• The most important information shared

Keep it brief but capture the essence of what was said.`;
    }
  }

  buildSummaryPrompt(transcriptionText, summaryType) {
    const basePrompt = `Please analyze and summarize the following voice transcriptions:

${transcriptionText}

`;

    switch (summaryType) {
      case 'bullet-points':
        return basePrompt + `Provide a summary in bullet points covering:
• Main topics discussed
• Key decisions or action items
• Important details mentioned
• Overall themes or patterns`;

      case 'topics':
        return basePrompt + `Identify and categorize the main topics discussed:
• List each distinct topic
• Provide a brief description for each
• Note any relationships between topics
• Highlight the most frequently discussed subjects`;

      case 'conversation':
      default:
        return basePrompt + `Provide a conversational summary that captures:
• What was mainly discussed
• Any important points or decisions
• The general flow of the conversation
• Key takeaways or insights

Keep it natural and easy to read, as if you're explaining it to someone who wasn't there.`;
    }
  }

  /**
   * Generate smart insights from transcription patterns
   */
  async generateInsights(transcriptions, timeframe = 'week') {
    if (!this.isConfigured) {
      throw new Error('OpenAI not configured. Please set API key first.');
    }

    try {
      // Filter by timeframe
      const cutoffDate = new Date();
      switch (timeframe) {
        case 'day':
          cutoffDate.setDate(cutoffDate.getDate() - 1);
          break;
        case 'week':
          cutoffDate.setDate(cutoffDate.getDate() - 7);
          break;
        case 'month':
          cutoffDate.setMonth(cutoffDate.getMonth() - 1);
          break;
      }

      const recentTranscriptions = transcriptions.filter(t => 
        new Date(t.timestamp) >= cutoffDate
      );

      if (recentTranscriptions.length === 0) {
        return {
          insights: 'No transcriptions found in the selected timeframe.',
          period: timeframe,
          transcriptionCount: 0
        };
      }

      const transcriptionText = recentTranscriptions
        .map(t => t.text)
        .join(' ')
        .substring(0, 3000); // Limit text length

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are an AI that analyzes voice recordings to provide insights about communication patterns, topics, and themes.'
          },
          {
            role: 'user',
            content: `Analyze these voice recordings from the past ${timeframe} and provide insights:

${transcriptionText}

Provide insights about:
• Most common topics or themes
• Communication patterns
• Recurring words or phrases
• Overall trends or changes
• Any notable patterns

Keep insights practical and actionable.`
          }
        ],
        max_tokens: 300,
        temperature: 0.4,
      });

      return {
        insights: response.choices[0]?.message?.content?.trim() || 'No insights generated',
        period: timeframe,
        transcriptionCount: recentTranscriptions.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Insights generation failed:', error);
      throw new Error(`Insights generation failed: ${error.message}`);
    }
  }
}