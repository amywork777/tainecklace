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
  Dimensions,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AIChatService } from '../services/AIChatService';
import SettingsModal from '../components/SettingsModal';

const { width: screenWidth } = Dimensions.get('window');

export default function ChatScreen() {
  // Chat states
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [transcriptions, setTranscriptions] = useState([]);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatTitle, setChatTitle] = useState('New Chat');
  const [savedChats, setSavedChats] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Navigation states
  const [currentScreen, setCurrentScreen] = useState('list'); // 'list' or 'chat'
  const [selectedChat, setSelectedChat] = useState(null);
  
  const scrollViewRef = useRef(null);
  const aiChatService = useRef(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

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
      
      // Improve titles for existing chats if needed
      setTimeout(() => improveExistingChatTitles(), 2000);

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
      "Show me patterns in my communication style",
      "Compare different recording sessions",
      "Help me track project progress mentioned"
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

    return suggestions.slice(0, 10);
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
      
      // Generate/update title regularly
      const allMessages = [...messages, userMessage, aiMessage];
      await generateChatTitle(allMessages);
      
      // Auto-save the chat after each exchange
      await autoSaveChat(allMessages);
      
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

  const cancelTyping = () => {
    if (isLoading) {
      // Cancel the current request if possible
      setIsLoading(false);
      setIsTyping(false);
      
      // Add cancellation message
      const cancelMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Response cancelled by user.',
        timestamp: new Date().toISOString(),
        isCancelled: true
      };
      
      setMessages(prev => [...prev, cancelMessage]);
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


  const improveExistingChatTitles = async () => {
    if (!aiChatService.current?.isConfigured || savedChats.length === 0) return;
    
    console.log('🔍 Checking for chats that need better titles...');
    
    // Find chats with generic titles that could be improved
    const chatsToImprove = savedChats.filter(chat => 
      chat.title === 'New Chat' || 
      chat.title === 'Chat Analysis' ||
      chat.title.includes('Untitled') ||
      (chat.messages?.length >= 4 && !chat.titleLastUpdated)
    );

    if (chatsToImprove.length === 0) return;

    console.log(`📝 Improving titles for ${chatsToImprove.length} conversations...`);

    for (const chat of chatsToImprove.slice(0, 3)) { // Limit to 3 at a time
      try {
        const userMessages = chat.messages
          ?.filter(m => m.role === 'user')
          ?.map(m => m.content)
          ?.join(' ') || '';

        if (userMessages.length < 10) continue; // Skip very short conversations

        const response = await aiChatService.current.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{
            role: 'user',
            content: `Generate a short, descriptive title (3-6 words) that captures the main topic of this conversation about analyzing voice recordings: "${userMessages.substring(0, 300)}"`
          }],
          max_tokens: 25,
          temperature: 0.4,
        });

        const newTitle = response.choices[0]?.message?.content?.trim()?.replace(/['"]/g, '') || chat.title;
        
        if (newTitle !== chat.title && newTitle.length > 5) {
          // Update the chat with new title
          const updatedChat = {
            ...chat,
            title: newTitle,
            titleLastUpdated: new Date().toISOString()
          };

          const updatedChats = savedChats.map(c => 
            c.id === chat.id ? updatedChat : c
          );

          await AsyncStorage.setItem('saved_chats', JSON.stringify(updatedChats));
          setSavedChats(updatedChats);

          console.log(`✨ Improved title: "${chat.title}" → "${newTitle}"`);
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.log(`Failed to improve title for chat ${chat.id}:`, error.message);
      }
    }
  };

  const generateChatTitle = async (messageHistory) => {
    if (!aiChatService.current?.isConfigured || messageHistory.length < 2) return;
    
    // Only regenerate title every few messages or if it's still "New Chat"
    const shouldRegenerateTitle = 
      chatTitle === 'New Chat' || 
      messageHistory.length % 4 === 0 || // Every 4 messages
      messageHistory.length === 2; // First real exchange
    
    if (!shouldRegenerateTitle) return;
    
    try {
      // Get the most relevant parts of the conversation
      const userMessages = messageHistory
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join(' ');
      
      const conversation = userMessages.substring(0, 400); // Focus on user questions
      
      const response = await aiChatService.current.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{
          role: 'user',
          content: `Generate a short, descriptive title (3-6 words) that captures the main topic of this conversation about voice recordings analysis: "${conversation}"`
        }],
        max_tokens: 25,
        temperature: 0.4,
      });
      
      const newTitle = response.choices[0]?.message?.content?.trim()?.replace(/['"]/g, '') || 'Chat Analysis';
      
      // Only update if the title actually changed
      if (newTitle !== chatTitle) {
        setChatTitle(newTitle);
        console.log(`📝 Updated chat title: "${newTitle}"`);
      }
      
    } catch (error) {
      console.log('Could not generate title:', error.message);
    }
  };

  const autoSaveChat = async (messageList = messages) => {
    if (!messageList.length || messageList.length < 2) {
      return; // Nothing to save yet
    }

    try {
      const chatData = {
        id: currentChatId || Date.now().toString(),
        title: chatTitle,
        messages: messageList,
        timestamp: currentChatId ? savedChats.find(c => c.id === currentChatId)?.timestamp || new Date().toISOString() : new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        messageCount: messageList.length,
        transcriptionContext: transcriptions.length,
        preview: messageList[1]?.content?.substring(0, 100) || 'No preview'
      };

      const updatedChats = currentChatId 
        ? savedChats.map(chat => chat.id === currentChatId ? chatData : chat)
        : [chatData, ...savedChats];

      await AsyncStorage.setItem('saved_chats', JSON.stringify(updatedChats));
      setSavedChats(updatedChats);
      
      if (!currentChatId) {
        setCurrentChatId(chatData.id);
      }
      
      setHasUnsavedChanges(false);
      console.log(`💾 Auto-saved chat: "${chatTitle}" (${messageList.length} messages)`);
    } catch (error) {
      console.error('❌ Auto-save failed:', error);
      setHasUnsavedChanges(true); // Keep unsaved flag if auto-save fails
    }
  };

  const saveCurrentChat = async () => {
    // Manual save with user feedback
    await autoSaveChat();
    Alert.alert('Chat Saved', `"${chatTitle}" has been saved successfully!`);
  };

  const openChat = (chatData) => {
    setMessages(chatData.messages);
    setChatTitle(chatData.title);
    setCurrentChatId(chatData.id);
    setHasUnsavedChanges(false);
    setSelectedChat(chatData);
    slideToChat();
  };

  const startNewChat = () => {
    const welcomeMessage = {
      id: 'welcome',
      role: 'assistant',
      content: `Hi! I can help you analyze your ${transcriptions.length} recorded conversations. Ask me anything about your transcriptions!`,
      timestamp: new Date().toISOString()
    };
    
    setMessages([welcomeMessage]);
    setChatTitle('New Chat');
    setCurrentChatId(null);
    setHasUnsavedChanges(false); // Reset for new chat
    setSelectedChat(null);
    slideToChat();
  };

  const deleteChat = async (chatId) => {
    Alert.alert(
      'Delete Chat',
      'Are you sure you want to delete this chat?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedChats = savedChats.filter(chat => chat.id !== chatId);
              await AsyncStorage.setItem('saved_chats', JSON.stringify(updatedChats));
              setSavedChats(updatedChats);
              
              if (currentChatId === chatId) {
                slideToList();
              }
            } catch (error) {
              Alert.alert('Delete Error', 'Could not delete chat.');
            }
          }
        }
      ]
    );
  };

  const slideToChat = () => {
    setCurrentScreen('chat');
    Animated.timing(slideAnim, {
      toValue: -screenWidth,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const slideToList = () => {
    setCurrentScreen('list');
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  useEffect(() => {
    if (currentScreen === 'chat') {
      scrollToBottom();
    }
  }, [messages, currentScreen]);

  const renderChatList = () => (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#5A7FFF" />
      
      {/* Chat List Header */}
      <View style={styles.header}>
        <View style={styles.chatListHeaderContent}>
          <Text style={styles.title}>Conversations</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity 
              style={styles.settingsButton}
              onPress={() => setShowSettingsModal(true)}
            >
              <Text style={styles.settingsIcon}>⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.newChatButton} onPress={startNewChat}>
              <Text style={styles.newChatButtonText}>+ New</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Stats Bar */}
      {savedChats.length > 0 && (
        <View style={styles.statsBar}>
          <Text style={styles.statsText}>
            {savedChats.length} {savedChats.length === 1 ? 'conversation' : 'conversations'} • {transcriptions.length} recordings available
          </Text>
        </View>
      )}

      {/* Chat List */}
      <ScrollView style={styles.chatListContainer}>
        {savedChats.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No Chats Yet</Text>
            <Text style={styles.emptyText}>Start your first conversation to analyze your recordings</Text>
            <TouchableOpacity style={styles.startChatButton} onPress={startNewChat}>
              <Text style={styles.startChatButtonText}>Start First Chat</Text>
            </TouchableOpacity>
          </View>
        ) : (
          savedChats.map(chat => (
            <TouchableOpacity
              key={chat.id}
              style={styles.chatCard}
              onPress={() => openChat(chat)}
            >
              <View style={styles.chatCardHeader}>
                <View style={styles.chatCardTitleContainer}>
                  <Text style={styles.chatCardTitle}>{chat.title}</Text>
                  <Text style={styles.chatCardMeta}>
                    {chat.messageCount} messages • {new Date(chat.lastUpdated || chat.timestamp).toLocaleDateString()}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={styles.chatDeleteButton}
                  onPress={() => deleteChat(chat.id)}
                >
                  <Text style={styles.chatDeleteButtonText}>×</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.chatCardPreview} numberOfLines={2}>
                {chat.preview}...
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );

  const renderChatView = () => (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#5A7FFF" />
      
      {/* Chat Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.backButton} onPress={slideToList}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{chatTitle}</Text>
            <Text style={styles.subtitle}>{messages.length - 1} messages</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {isLoading && (
            <TouchableOpacity style={styles.cancelButton} onPress={cancelTyping}>
              <Text style={styles.cancelButtonText}>✕</Text>
            </TouchableOpacity>
          )}
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
                message.isError && styles.errorBubble,
                message.isCancelled && styles.cancelledBubble
              ]}>
                <Text style={[
                  styles.messageText,
                  message.role === 'user' ? styles.userText : styles.assistantText,
                  message.isCancelled && styles.cancelledText
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
            editable={!isLoading}
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

  return (
    <View style={styles.mainContainer}>
      <Animated.View 
        style={[
          styles.slideContainer,
          {
            transform: [{ translateX: slideAnim }]
          }
        ]}
      >
        {/* Chat List Screen */}
        <View style={[styles.screen, { left: 0 }]}>
          {renderChatList()}
        </View>

        {/* Chat View Screen */}
        <View style={[styles.screen, { left: screenWidth }]}>
          {renderChatView()}
        </View>
      </Animated.View>

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        transcriptions={transcriptions}
        savedChats={savedChats}
        aiChatService={aiChatService}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  slideContainer: {
    flexDirection: 'row',
    width: screenWidth * 2,
    flex: 1,
  },
  screen: {
    width: screenWidth,
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
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
  chatListHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backButtonText: {
    fontSize: 18,
    color: '#ffffff',
    fontWeight: 'bold',
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
  cancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: 'bold',
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
  newChatButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  newChatButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  statsBar: {
    backgroundColor: '#f8f9fa',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  statsText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  chatListContainer: {
    flex: 1,
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 32,
  },
  startChatButton: {
    backgroundColor: '#5A7FFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 25,
  },
  startChatButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  chatCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  chatCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  chatCardTitleContainer: {
    flex: 1,
  },
  chatCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  chatCardMeta: {
    fontSize: 12,
    color: '#666',
  },
  chatDeleteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatDeleteButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: 'bold',
  },
  chatCardPreview: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
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
  cancelledBubble: {
    backgroundColor: '#f5f5f5',
    borderColor: '#ddd',
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
  cancelledText: {
    color: '#999',
    fontStyle: 'italic',
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
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingsIcon: {
    fontSize: 16,
  },
});
