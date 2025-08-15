import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AIChatService } from '../services/AIChatService';

export default function ChatScreen() {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [transcriptions, setTranscriptions] = useState([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatTitle, setChatTitle] = useState('New Chat');
  const [savedChats, setSavedChats] = useState([]);
  const [showChatList, setShowChatList] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const scrollViewRef = useRef(null);
  const aiChatService = useRef(null);

  useEffect(() => {
    initializeChat();
  }, []);

  const initializeChat = async () => {
    try {
      // Initialize AI chat service
      aiChatService.current = new AIChatService();
      
      // Load transcriptions for context
      const savedTranscriptions = await AsyncStorage.getItem('transcriptions');
      if (savedTranscriptions) {
        const parsed = JSON.parse(savedTranscriptions);
        setTranscriptions(parsed);
        
        // Set context for the AI service
        if (aiChatService.current.setTranscriptionsContext) {
          aiChatService.current.setTranscriptionsContext(parsed);
        }
      }

      // Generate suggested questions
      const suggestions = getSuggestedQuestionsForAll(transcriptions);
      setSuggestedQuestions(suggestions);
      
      // Load saved chats
      await loadSavedChats();

      // Add welcome message
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Hi! I can help you analyze your ${transcriptions.length} recorded conversations. Ask me anything about your transcriptions - I can find patterns, summarize topics, or answer specific questions about your recordings.`,
        timestamp: new Date().toISOString()
      }]);

    } catch (error) {
      console.error('❌ Chat initialization error:', error);
    }
  };

  const getSuggestedQuestionsForAll = (transcriptions) => {
    if (!transcriptions || transcriptions.length === 0) {
      return [
        "How can you help me analyze recordings?",
        "What features are available in this chat?",
        "Show me example questions I can ask"
      ];
    }

    const recentCount = Math.min(transcriptions.length, 10);
    const hasMultiple = transcriptions.length > 1;
    const hasSummaries = transcriptions.some(t => t.aiSummary);
    
    const suggestions = [
      `Summarize my last ${recentCount} recordings`,
      "What are the key themes across my conversations?",
      "Find the most important action items mentioned",
      "What topics do I discuss most frequently?",
      "Show me patterns in my communication style"
    ];

    if (hasSummaries) {
      suggestions.push("Compare the AI summaries of my recordings");
    }
    
    if (hasMultiple) {
      suggestions.push("Which recording had the most detailed discussion?");
      suggestions.push("Help me find mentions of specific people or projects");
    }
    
    // Add contextual suggestions based on content
    const allText = transcriptions.map(t => t.text || '').join(' ').toLowerCase();
    
    if (allText.includes('meeting') || allText.includes('call')) {
      suggestions.push("Extract all meeting action items and decisions");
    }
    
    if (allText.includes('project') || allText.includes('task')) {
      suggestions.push("List all projects and tasks mentioned");
    }
    
    if (allText.includes('deadline') || allText.includes('date')) {
      suggestions.push("Find all dates and deadlines mentioned");
    }

    return suggestions.slice(0, 8);
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    
    const userMessage = {
      id: Date.now().toString(),
      role: 'user', 
      content: inputText.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    setIsTyping(true);

    try {
      // Use enhanced chat service to query all transcriptions
      const response = await chatWithAllTranscriptions(inputText.trim());
      
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        tokensUsed: response.tokensUsed
      };

      setMessages(prev => [...prev, aiMessage]);
      setHasUnsavedChanges(true);
      
      // Auto-generate title after first exchange
      if (messages.length === 1 && !currentChatId) {
        await generateChatTitle([userMessage, aiMessage]);
      }
      
    } catch (error) {
      console.error('❌ Chat error:', error);
      
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${error.message}. Please make sure your OpenAI API key is set in Settings.`,
        timestamp: new Date().toISOString(),
        isError: true
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const chatWithAllTranscriptions = async (message) => {
    if (!aiChatService.current || !aiChatService.current.isConfigured) {
      throw new Error('OpenAI not configured. Please set API key in Settings.');
    }

    // Build context from all transcriptions
    const contextText = transcriptions
      .slice(0, 20) // Limit to avoid token limits
      .map((t, index) => {
        const date = t.timestamp ? new Date(t.timestamp).toLocaleString() : 'Unknown date';
        const summary = t.aiSummary ? `\nAI Summary: ${t.aiSummary}` : '';
        return `[Recording ${index + 1}] ${date}${summary}\nTranscription: ${t.text || '[No text]'}`;
      })
      .join('\n\n---\n\n');

    const systemPrompt = `You are an AI assistant that helps users understand and analyze their voice recordings. You have access to ${transcriptions.length} transcriptions and can answer questions about them.

Here are the user's transcriptions:

${contextText}

Answer the user's questions about their recordings. Be conversational and helpful.`;

    const response = await aiChatService.current.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const aiResponse = response.choices[0]?.message?.content?.trim();
    
    if (!aiResponse) {
      throw new Error('No response generated');
    }

    return {
      message: aiResponse,
      tokensUsed: response.usage?.total_tokens || 0
    };
  };

  const handleSuggestedQuestion = (question) => {
    setInputText(question);
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#5A7FFF" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Chat</Text>
        <Text style={styles.subtitle}>{transcriptions.length} recordings available</Text>
      </View>

      <KeyboardAvoidingView 
        style={styles.chatContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Messages */}
        <ScrollView 
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
        >
          {messages.map(message => (
            <View 
              key={message.id} 
              style={[
                styles.messageContainer,
                message.role === 'user' ? styles.userMessage : styles.assistantMessage
              ]}
            >
              {message.role === 'assistant' && (
                <View style={styles.aiAvatar}>
                  <Text style={styles.aiAvatarText}>🤖</Text>
                </View>
              )}
              <View style={[
                styles.messageBubble,
                message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                message.isError && styles.errorBubble
              ]}>
                <Text style={[
                  styles.messageText,
                  message.role === 'user' ? styles.userText : styles.assistantText
                ]}>
                  {message.content}
                </Text>
              </View>
            </View>
          ))}

          {/* Typing Indicator */}
          {isTyping && (
            <View style={[styles.messageContainer, styles.assistantMessage]}>
              <View style={styles.aiAvatar}>
                <Text style={styles.aiAvatarText}>🤖</Text>
              </View>
              <View style={[styles.messageBubble, styles.assistantBubble]}>
                <ActivityIndicator size="small" color="#666" />
                <Text style={styles.typingText}>Thinking...</Text>
              </View>
            </View>
          )}

          {/* Suggested Questions */}
          {messages.length <= 1 && (
            <View style={styles.suggestedContainer}>
              <Text style={styles.suggestedTitle}>Try asking:</Text>
              {suggestedQuestions.map((question, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.suggestedButton}
                  onPress={() => handleSuggestedQuestion(question)}
                >
                  <Text style={styles.suggestedText}>{question}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask me anything about your recordings..."
            placeholderTextColor="#999"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.sendButtonText}>→</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: 50, // Add top padding to compensate for no SafeAreaView
  },
  header: {
    backgroundColor: '#5A7FFF',
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messagesContent: {
    paddingVertical: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  userMessage: {
    justifyContent: 'flex-end',
  },
  assistantMessage: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e3f2fd',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  aiAvatarText: {
    fontSize: 16,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#5A7FFF',
    marginLeft: 40,
  },
  assistantBubble: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  errorBubble: {
    backgroundColor: '#ffebee',
    borderColor: '#ffcdd2',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  userText: {
    color: '#ffffff',
  },
  assistantText: {
    color: '#333333',
  },
  typingText: {
    color: '#666',
    fontSize: 14,
    marginLeft: 8,
  },
  suggestedContainer: {
    marginTop: 20,
    paddingHorizontal: 8,
  },
  suggestedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  suggestedButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  suggestedText: {
    color: '#5A7FFF',
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#5A7FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});