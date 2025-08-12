import { EventEmitter } from 'events';

export class AIService extends EventEmitter {
  constructor(apiKey, provider = 'openai') {
    super();
    this.apiKey = apiKey;
    this.provider = provider;
    this.baseUrl = provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com/v1';
    this.model = provider === 'openai' ? 'gpt-4' : 'claude-3-sonnet-20240229';
  }

  async chatWithConversation(conversationData, userMessage, chatHistory = []) {
    try {
      const systemPrompt = this.buildSystemPrompt(conversationData);
      const messages = this.buildChatMessages(systemPrompt, chatHistory, userMessage);

      const response = await this.callAI(messages);
      
      this.emit('chatResponse', {
        userMessage,
        aiResponse: response,
        conversationId: conversationData.id
      });

      return response;

    } catch (error) {
      console.error('Chat error:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async summarizeConversation(transcriptText, conversationData = {}) {
    try {
      const prompt = this.buildSummarizationPrompt(transcriptText, conversationData);
      const messages = [{ role: 'user', content: prompt }];

      const summary = await this.callAI(messages);
      
      this.emit('conversationSummarized', {
        conversationId: conversationData.id,
        summary,
        originalLength: transcriptText.length
      });

      return summary;

    } catch (error) {
      console.error('Summarization error:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async extractInsights(transcriptText, conversationData = {}) {
    try {
      const prompt = this.buildInsightsPrompt(transcriptText);
      const messages = [{ role: 'user', content: prompt }];

      const insightsText = await this.callAI(messages);
      const insights = this.parseInsights(insightsText);
      
      this.emit('insightsExtracted', {
        conversationId: conversationData.id,
        insights
      });

      return insights;

    } catch (error) {
      console.error('Insights extraction error:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async generateTitle(transcriptText) {
    try {
      const prompt = `Based on this conversation transcript, generate a concise, descriptive title (maximum 60 characters):

"${transcriptText.substring(0, 500)}..."

Respond with only the title, no explanation or quotes.`;

      const messages = [{ role: 'user', content: prompt }];
      const title = await this.callAI(messages);
      
      return title.trim().replace(/^"|"$/g, ''); // Remove quotes if present

    } catch (error) {
      console.error('Title generation error:', error);
      return null;
    }
  }

  buildSystemPrompt(conversationData) {
    const { title, summary, duration, participants, location, start_time } = conversationData;
    const startDate = new Date(start_time).toLocaleString();

    return `You are an AI assistant helping the user understand and explore their recorded conversations. 

CONVERSATION CONTEXT:
- Title: ${title || 'Untitled Conversation'}
- Date: ${startDate}
- Duration: ${duration ? Math.round(duration / 60000) : 'Unknown'} minutes
- Participants: ${participants || 'Unknown'}
- Location: ${location || 'Unknown'}
- Summary: ${summary || 'No summary available'}

CAPABILITIES:
- Answer questions about the conversation content
- Help recall specific details or topics discussed
- Provide insights and analysis
- Search for information within the conversation
- Relate current conversation to past conversations when relevant

STYLE:
- Be helpful, concise, and conversational
- Reference specific parts of the transcript when relevant
- Ask clarifying questions if needed
- Suggest related questions the user might want to ask

Remember: You have access to the full conversation transcript and can search through all the user's recorded conversations.`;
  }

  buildChatMessages(systemPrompt, chatHistory, userMessage) {
    const messages = [{ role: 'system', content: systemPrompt }];
    
    // Add chat history
    for (const msg of chatHistory) {
      messages.push({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  buildSummarizationPrompt(transcriptText, conversationData) {
    const duration = conversationData.duration ? Math.round(conversationData.duration / 60000) : null;
    
    return `Please analyze and summarize this conversation transcript. Provide a comprehensive summary that includes:

1. **Main Topics**: What were the primary subjects discussed?
2. **Key Points**: Important information, decisions, or insights shared
3. **Action Items**: Any tasks, commitments, or follow-ups mentioned
4. **Participants**: Who was involved and their roles in the conversation
5. **Context**: Setting, purpose, or background of the discussion
6. **Sentiment**: Overall tone and mood of the conversation

**Conversation Details:**
${conversationData.location ? `Location: ${conversationData.location}` : ''}
${duration ? `Duration: ${duration} minutes` : ''}
${conversationData.participants ? `Participants: ${conversationData.participants}` : ''}

**Transcript:**
${transcriptText}

Please provide a well-structured summary that captures the essence of this conversation in a clear, organized manner.`;
  }

  buildInsightsPrompt(transcriptText) {
    return `Analyze this conversation transcript and extract structured insights in JSON format. Return a JSON object with the following structure:

{
  "topics": ["topic1", "topic2", "topic3"],
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "sentiment": "positive|neutral|negative",
  "mood": "professional|casual|serious|friendly|tense|excited",
  "actionItems": ["action1", "action2"],
  "questions": ["question1", "question2"],
  "decisions": ["decision1", "decision2"],
  "participants": {
    "count": 2,
    "roles": ["speaker", "listener"]
  },
  "categories": ["work|personal|education|healthcare|social"]
}

Transcript to analyze:
${transcriptText}

Respond with only the JSON object, no additional text or explanation.`;
  }

  parseInsights(insightsText) {
    try {
      // Clean up the response and try to parse JSON
      const cleanText = insightsText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      return JSON.parse(cleanText);
    } catch (error) {
      console.error('Failed to parse insights JSON:', error);
      
      // Return default structure if parsing fails
      return {
        topics: [],
        keywords: [],
        sentiment: 'neutral',
        mood: 'neutral',
        actionItems: [],
        questions: [],
        decisions: [],
        participants: { count: 1, roles: [] },
        categories: []
      };
    }
  }

  async callAI(messages) {
    const headers = {
      'Content-Type': 'application/json',
    };

    let body;

    if (this.provider === 'openai') {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      body = {
        model: this.model,
        messages,
        temperature: 0.7,
        max_tokens: 1500
      };
    } else if (this.provider === 'anthropic') {
      headers['x-api-key'] = this.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      
      // Convert messages format for Anthropic
      const systemMessage = messages.find(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');
      
      body = {
        model: this.model,
        messages: conversationMessages,
        system: systemMessage?.content,
        max_tokens: 1500
      };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`AI API error: ${response.status} ${errorData}`);
    }

    const data = await response.json();
    
    if (this.provider === 'openai') {
      return data.choices[0].message.content;
    } else if (this.provider === 'anthropic') {
      return data.content[0].text;
    }
  }

  // General conversation search and analysis
  async searchAcrossConversations(searchQuery, conversations) {
    try {
      const prompt = `You are helping search across multiple recorded conversations. The user is looking for: "${searchQuery}"

Here are the conversations to search through:

${conversations.map((conv, idx) => 
  `Conversation ${idx + 1}: ${conv.title || 'Untitled'}
  Date: ${new Date(conv.start_time).toLocaleDateString()}
  Summary: ${conv.summary || 'No summary'}
  Transcript snippet: ${conv.full_transcript ? conv.full_transcript.substring(0, 300) : 'No transcript'}...
  `
).join('\n\n')}

Please analyze these conversations and provide:
1. Which conversations are most relevant to the search query
2. Specific details or quotes that match the search
3. Connections or patterns across conversations
4. Summary of findings

Be specific and cite which conversation contains which information.`;

      const messages = [{ role: 'user', content: prompt }];
      const searchResults = await this.callAI(messages);
      
      return searchResults;

    } catch (error) {
      console.error('Cross-conversation search error:', error);
      throw error;
    }
  }

  setApiKey(apiKey, provider = null) {
    this.apiKey = apiKey;
    if (provider) {
      this.provider = provider;
      this.baseUrl = provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.anthropic.com/v1';
      this.model = provider === 'openai' ? 'gpt-4' : 'claude-3-sonnet-20240229';
    }
  }
}