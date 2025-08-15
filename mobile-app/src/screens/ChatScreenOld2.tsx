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
  Modal,
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

  const loadSavedChats = async () => {
    try {
      const saved = await AsyncStorage.getItem('saved_chats');
      if (saved) {
        setSavedChats(JSON.parse(saved));
      }
    } catch (error) {
      console.error('❌ Error loading saved chats:', error);
    }
  };

  const generateChatTitle = async (messageHistory) => {
    if (!aiChatService.current?.isConfigured) return;
    
    try {
      const conversation = messageHistory.map(m => m.content).join(' ');
      const response = await aiChatService.current.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: `Generate a short, descriptive title (3-6 words) for this conversation: "${conversation.substring(0, 300)}..."`
        }],
        max_tokens: 20,
        temperature: 0.3,
      });
      
      const title = response.choices[0]?.message?.content?.trim()?.replace(/"/g, '') || 'New Chat';
      setChatTitle(title);
    } catch (error) {
      console.log('Could not generate title:', error.message);
    }
  };

  const saveCurrentChat = async () => {
    if (!messages.length || messages.length < 2) {
      Alert.alert('Nothing to Save', 'Start a conversation first!');
      return;
    }

    try {
      const chatData = {
        id: currentChatId || Date.now().toString(),
        title: chatTitle,
        messages: messages,
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
        transcriptionContext: transcriptions.length
      };

      const updatedChats = currentChatId 
        ? savedChats.map(chat => chat.id === currentChatId ? chatData : chat)
        : [chatData, ...savedChats];

      await AsyncStorage.setItem('saved_chats', JSON.stringify(updatedChats));
      setSavedChats(updatedChats);
      setCurrentChatId(chatData.id);
      setHasUnsavedChanges(false);
      
      Alert.alert('Chat Saved', `"${chatTitle}" has been saved successfully!`);
    } catch (error) {
      Alert.alert('Save Error', 'Could not save chat. Please try again.');
    }
  };

  const loadChat = async (chatData) => {
    setMessages(chatData.messages);
    setChatTitle(chatData.title);
    setCurrentChatId(chatData.id);
    setHasUnsavedChanges(false);
    setShowChatList(false);
  };

  const startNewChat = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Hi! I can help you analyze your ${transcriptions.length} recorded conversations. Ask me anything about your transcriptions!`,
      timestamp: new Date().toISOString()
    }]);
    setChatTitle('New Chat');
    setCurrentChatId(null);
    setHasUnsavedChanges(false);
    setShowChatList(false);
  };

  const deleteChat = async (chatId) => {
    try {
      const updatedChats = savedChats.filter(chat => chat.id !== chatId);
      await AsyncStorage.setItem('saved_chats', JSON.stringify(updatedChats));
      setSavedChats(updatedChats);
      
      if (currentChatId === chatId) {
        startNewChat();
      }
    } catch (error) {
      Alert.alert('Delete Error', 'Could not delete chat.');
    }
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
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => setShowChatList(true)}>
            <Text style={styles.headerIcon}>📚</Text>
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{chatTitle}</Text>
            <Text style={styles.subtitle}>{transcriptions.length} recordings • {messages.length - 1} messages</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            style={[styles.actionButton, hasUnsavedChanges && styles.unsavedButton]} 
            onPress={saveCurrentChat}
          >
            <Text style={styles.actionButtonText}>💾</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={startNewChat}>
            <Text style={styles.actionButtonText}>➕</Text>
          </TouchableOpacity>
        </View>
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
                <Text style={styles.typingText}>Analyzing your recordings...</Text>
              </View>
            </View>
          )}

          {/* Suggested Questions */}
          {messages.length <= 1 && (
            <View style={styles.suggestedContainer}>
              <Text style={styles.suggestedTitle}>💡 Try asking:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestedScroll}>
                {suggestedQuestions.map((question, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.suggestedButton}
                    onPress={() => handleSuggestedQuestion(question)}
                  >
                    <Text style={styles.suggestedText}>{question}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
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

      {/* Chat History Modal */}
      <Modal visible={showChatList} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Chat History</Text>
            <TouchableOpacity onPress={() => setShowChatList(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.chatList}>
            {savedChats.map(chat => (
              <TouchableOpacity
                key={chat.id}
                style={styles.chatItem}
                onPress={() => loadChat(chat)}
              >
                <View style={styles.chatItemHeader}>
                  <Text style={styles.chatItemTitle}>{chat.title}</Text>
                  <TouchableOpacity 
                    onPress={() => deleteChat(chat.id)}
                    style={styles.deleteButton}
                  >
                    <Text style={styles.deleteButtonText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.chatItemMeta}>
                  {chat.messageCount} messages • {new Date(chat.timestamp).toLocaleDateString()}
                </Text>
                <Text style={styles.chatItemPreview}>
                  {chat.messages[1]?.content?.substring(0, 100) || 'No preview'}...
                </Text>
              </TouchableOpacity>
            ))}
            {savedChats.length === 0 && (
              <Text style={styles.emptyText}>No saved chats yet. Start a conversation and save it!</Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: 50,
  },
  header: {
    backgroundColor: '#5A7FFF',
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  unsavedButton: {
    backgroundColor: '#FF6B6B',
  },
  actionButtonText: {
    fontSize: 16,
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
  suggestedScroll: {
    marginBottom: 10,
  },
  suggestedButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    minWidth: 200,
  },
  suggestedText: {
    color: '#5A7FFF',
    fontSize: 14,
    textAlign: 'center',
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: 50,
  },
  modalHeader: {
    backgroundColor: '#5A7FFF',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  closeButton: {
    fontSize: 24,
    color: '#ffffff',
  },
  chatList: {
    flex: 1,
    padding: 16,
  },
  chatItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chatItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chatItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 16,
  },
  chatItemMeta: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  chatItemPreview: {
    fontSize: 14,
    color: '#888',
    lineHeight: 18,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 16,
    marginTop: 50,
  },
});
