import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  PermissionsAndroid,
  Platform,
  TextInput,
  ActivityIndicator,
  StatusBar,
  SafeAreaView,
  Modal,
  Animated,
  LayoutAnimation,
  UIManager,
  KeyboardAvoidingView,
  Keyboard,
  Share,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { XiaoBLEManager } from './src/services/bleManager';
import { TranscriptionService } from './src/services/TranscriptionService';
import { BackgroundTaskManager } from './src/services/BackgroundTaskManager';
import { HybridStorageService } from './src/services/HybridStorageService';
import { AISummaryService } from './src/services/AISummaryService';
import { AIChatService } from './src/services/AIChatService';

const ASSEMBLYAI_KEY = 'your-assemblyai-api-key-here';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [stats, setStats] = useState({
    packetsReceived: 0,
    framesProcessed: 0,
    audioSamplesGenerated: 0
  });
  const [transcription, setTranscription] = useState('');
  const [transcriptions, setTranscriptions] = useState([]);
  const [status, setStatus] = useState('Ready to connect');
  const [apiKey, setApiKey] = useState('');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isBackgroundCapable, setIsBackgroundCapable] = useState(false);
  const [backgroundStatus, setBackgroundStatus] = useState('');
  const [storageStatus, setStorageStatus] = useState({ local: 0, cloudEnabled: false });
  const [openaiKey, setOpenaiKey] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [lastSummary, setLastSummary] = useState(null);
  const [showSummarySection, setShowSummarySection] = useState(false);
  const [selectedTranscription, setSelectedTranscription] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatMessage, setChatMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showChatSection, setShowChatSection] = useState(false);
  const chatAnimationValue = useRef(new Animated.Value(0)).current;
  const messageAnimations = useRef(new Map()).current;
  const chatScrollViewRef = useRef(null);
  const [isTyping, setIsTyping] = useState(false);
  const typingDot1 = useRef(new Animated.Value(0)).current;
  const typingDot2 = useRef(new Animated.Value(0)).current;
  const typingDot3 = useRef(new Animated.Value(0)).current;
  const [inputFocused, setInputFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const chatInputRef = useRef(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllConversations, setShowAllConversations] = useState(false);
  const [showDetailsSection, setShowDetailsSection] = useState(false);

  const bleManager = useRef(null);
  const transcriptionService = useRef(null);
  const audioBuffer = useRef([]);
  const statsInterval = useRef(null);
  const isRecordingRef = useRef(false);
  const recordingTimer = useRef(null);
  const backgroundTaskManager = useRef(null);
  const hybridStorage = useRef(null);
  const aiSummaryService = useRef(null);
  const aiChatService = useRef(null);

  useEffect(() => {
    initializeApp();
    
    // Enable LayoutAnimation on Android
    if (Platform.OS === 'android') {
      if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
    }
    
    // Keyboard listeners
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setTimeout(() => scrollToBottom(), 100);
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    
    return () => {
      keyboardDidShowListener?.remove();
      keyboardDidHideListener?.remove();
      cleanup();
    };
  }, []);

  const initializeApp = async () => {
    try {
      console.log('🔄 Starting app initialization...');
      
      // Load saved API key
      try {
        const savedKey = await AsyncStorage.getItem('assemblyai_key');
        if (savedKey) {
          setApiKey(savedKey);
          transcriptionService.current = new TranscriptionService(savedKey);
        }
      } catch (error) {
        console.log('⚠️ Could not load saved API key:', error.message);
      }

      // Initialize hybrid storage
      hybridStorage.current = new HybridStorageService();
      
      // Initialize AI summary service
      aiSummaryService.current = new AISummaryService();
      
      // Initialize AI chat service
      aiChatService.current = new AIChatService();
      
      // Load saved OpenAI key
      try {
        const savedOpenaiKey = await aiSummaryService.current.getApiKey();
        if (savedOpenaiKey) {
          setOpenaiKey(savedOpenaiKey);
        }
      } catch (error) {
        console.log('⚠️ Could not load saved OpenAI API key:', error.message);
      }
      
      // Initialize background task manager
      backgroundTaskManager.current = new BackgroundTaskManager();
      backgroundTaskManager.current.setCallbacks({
        onBackgroundStateChange: handleBackgroundStateChange,
      });

      // Check background permissions
      const bgStatus = await backgroundTaskManager.current.getBackgroundPermissionStatus();
      setIsBackgroundCapable(bgStatus !== 1); // 1 = Denied
      setBackgroundStatus(bgStatus === 1 ? 'Disabled' : 'Available');

      // Load transcriptions from hybrid storage
      await loadTranscriptions();

      setStatus('Ready to connect');
      console.log('✅ App initialization complete');
    } catch (error) {
      console.error('❌ Initialization error:', error);
      setStatus('Ready to connect'); // Still allow manual connection attempt
    }
  };

  const loadTranscriptions = async () => {
    try {
      if (hybridStorage.current) {
        const allTranscriptions = await hybridStorage.current.getAllTranscriptions();
        setTranscriptions(allTranscriptions);
        
        // Update storage status for UI
        const status = await hybridStorage.current.getStorageStatus();
        setStorageStatus(status);
        
        console.log(`📊 Loaded ${allTranscriptions.length} transcriptions (${status.local} local, cloud: ${status.cloudEnabled ? 'enabled' : 'disabled'})`);
      }
    } catch (error) {
      console.error('❌ Error loading transcriptions:', error);
      // Fallback to old method
      const savedTranscriptions = await AsyncStorage.getItem('transcriptions');
      if (savedTranscriptions) {
        setTranscriptions(JSON.parse(savedTranscriptions));
      }
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      
      const allGranted = Object.values(granted).every(
        permission => permission === PermissionsAndroid.RESULTS.GRANTED
      );
      
      if (!allGranted) {
        throw new Error('Required permissions not granted');
      }
    }
  };

  const handleConnectXIAO = async () => {
    if (isConnecting || isConnected) return;
    
    try {
      setIsConnecting(true);
      setStatus('Initializing Bluetooth...');
      
      // Request permissions first
      await requestPermissions();
      
      // Initialize BLE Manager if not already done
      if (!bleManager.current) {
        bleManager.current = new XiaoBLEManager();
        await bleManager.current.initialize();
      }
      
      // Always set callbacks (in case they were cleared)
      bleManager.current.setCallbacks({
        onAudioData: handleAudioData,
        onDisconnected: handleDisconnection,
      });
      
      setStatus('Scanning for XIAO...');
      const device = await bleManager.current.scanForXIAO(10000);
      
      setStatus('Connecting...');
      await bleManager.current.connectToDevice(device.id);
      
      await bleManager.current.startAudioStreaming();
      
      setIsConnected(true);
      setStatus('Connected to XIAO');
      
      // Start stats update interval
      statsInterval.current = setInterval(() => {
        if (bleManager.current) {
          setStats(bleManager.current.getStats());
        }
      }, 500);
      
    } catch (error) {
      console.error('Connection error:', error);
      Alert.alert('Connection Error', error.message);
      setStatus(`Connection failed: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectXIAO = async () => {
    if (isDisconnecting || !isConnected) return;
    
    try {
      setIsDisconnecting(true);
      setStatus('Disconnecting...');
      
      if (bleManager.current) {
        await bleManager.current.disconnect();
      }
      
      // Force cleanup
      handleDisconnection();
      
    } catch (error) {
      console.error('Disconnect error:', error);
      // Force cleanup even if disconnect fails
      handleDisconnection();
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleDisconnection = () => {
    setIsConnected(false);
    setIsRecording(false);
    isRecordingRef.current = false;
    setStatus('Disconnected');
    
    if (statsInterval.current) {
      clearInterval(statsInterval.current);
      statsInterval.current = null;
    }
    
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }
  };

  const handleAudioData = (pcmSamples) => {
    // Always buffer audio data when connected, only process during recording
    if (pcmSamples && pcmSamples.length > 0) {
      if (isRecordingRef.current) {
        console.log(`🎵 Buffering ${pcmSamples.length} audio samples (recording active)`);
        audioBuffer.current.push(...pcmSamples);
      }
      // Special case: still recording UI state but ref is false (flushing mode)
      else if (isRecording) {
        console.log(`🚰 Flushing ${pcmSamples.length} audio samples (finishing recording)`);
        audioBuffer.current.push(...pcmSamples);
      }
      // Still log when not recording to show audio is flowing (reduced logging)
      else {
        if (Math.random() < 0.001) { // Log 0.1% of packets to reduce spam
          console.log(`🔊 Audio flowing: ${pcmSamples.length} samples (not recording)`);
        }
      }
    }
  };

  const handleStartRecording = async () => {
    if (!isConnected) {
      Alert.alert('Error', 'XIAO device not connected');
      return;
    }
    
    // Clear previous audio buffer
    audioBuffer.current = [];
    setIsRecording(true);
    isRecordingRef.current = true;
    setTranscription('');
    setRecordingDuration(0);
    setStatus('Recording...');
    console.log('🎤 Started recording, clearing buffer and waiting for audio data...');
    
    // Start recording timer
    recordingTimer.current = setInterval(() => {
      setRecordingDuration(prev => prev + 0.1);
    }, 100);

    // Enable background recording if available
    if (backgroundTaskManager.current && isBackgroundCapable) {
      try {
        await backgroundTaskManager.current.startBackgroundRecording(
          bleManager.current, 
          audioBuffer
        );
        console.log('✅ Background recording enabled');
      } catch (error) {
        console.error('❌ Failed to enable background recording:', error);
      }
    }
  };

  const handleStopRecording = async () => {
    if (!isRecording) return;
    
    setIsRecording(false);
    setStatus('Finishing recording...');
    
    // Stop recording timer
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }
    
    console.log(`🔍 Pre-flush audio buffer: ${audioBuffer.current.length} samples`);
    
    // Wait 500ms for any remaining audio packets to arrive
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Now stop the recording flag to prevent new audio from being buffered
    isRecordingRef.current = false;
    setStatus('Processing audio...');
    
    console.log(`🔍 Post-flush audio buffer: ${audioBuffer.current.length} samples`);
    
    try {
      if (audioBuffer.current.length === 0) {
        console.log('❌ No audio data in buffer during recording period');
        Alert.alert('Error', 'No audio data recorded. Check XIAO connection and ensure it\'s streaming audio.');
        setStatus('Connected to XIAO');
        return;
      }
      
      if (!transcriptionService.current) {
        Alert.alert('Error', 'Please set AssemblyAI API key first');
        setStatus('Connected to XIAO');
        return;
      }
      
      const bufferSizeKB = Math.round((audioBuffer.current.length * 2) / 1024); // 16-bit samples
      console.log(`🎵 Transcribing ${audioBuffer.current.length} audio samples (${bufferSizeKB}KB)...`);
      setIsTranscribing(true);
      
      const result = await transcriptionService.current.transcribeAudio(
        audioBuffer.current,
        16000 // Sample rate
      );
      
      const newTranscription = {
        id: Date.now(),
        text: result.text || '[No transcription]',
        confidence: result.confidence || 0,
        timestamp: new Date().toISOString(),
        duration: audioBuffer.current.length / 16000 // seconds
      };
      
      setTranscription(newTranscription.text);
      
      // Auto-generate AI summary for this transcription
      setStatus('Generating AI summary...');
      let aiSummary = null;
      if (aiSummaryService.current) {
        try {
          aiSummary = await aiSummaryService.current.summarizeTranscription(newTranscription, {
            summaryType: 'concise'
          });
          
          if (aiSummary) {
            console.log(`🤖 AI Summary: ${aiSummary.summary}`);
            // Add AI summary to transcription object
            newTranscription.aiSummary = aiSummary.summary;
            newTranscription.aiSummaryMeta = {
              tokensUsed: aiSummary.tokensUsed,
              summaryType: aiSummary.summaryType,
              summaryTimestamp: aiSummary.timestamp
            };
          }
        } catch (error) {
          console.error('❌ AI summary failed:', error);
          // Continue without summary - don't block transcription
        }
      }
      
      // Save using hybrid storage (local + cloud sync)
      if (hybridStorage.current) {
        const updatedTranscriptions = await hybridStorage.current.saveTranscription(newTranscription);
        setTranscriptions(updatedTranscriptions);
        
        // Update storage status
        const status = await hybridStorage.current.getStorageStatus();
        setStorageStatus(status);
      } else {
        // Fallback to old method
        const updatedTranscriptions = [newTranscription, ...transcriptions];
        setTranscriptions(updatedTranscriptions);
        await AsyncStorage.setItem('transcriptions', JSON.stringify(updatedTranscriptions));
      }
      
      const statusMessage = aiSummary 
        ? 'Transcription & AI summary complete' 
        : 'Transcription complete';
      setStatus(statusMessage);
      
    } catch (error) {
      console.error('❌ Transcription error:', error);
      Alert.alert('Transcription Error', error.message || 'Unknown error occurred');
      setStatus('Transcription failed');
    } finally {
      setIsTranscribing(false);
      
      // Disable background recording (now safe from crashes)
      if (backgroundTaskManager.current) {
        try {
          await backgroundTaskManager.current.stopBackgroundRecording();
        } catch (error) {
          console.error('❌ Background cleanup error:', error);
        }
      }
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      Alert.alert('Error', 'Please enter a valid API key');
      return;
    }
    
    try {
      await AsyncStorage.setItem('assemblyai_key', apiKey);
      transcriptionService.current = new TranscriptionService(apiKey);
      Alert.alert('Success', 'API key saved successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save API key');
    }
  };

  const handleSaveOpenAIKey = async () => {
    if (!openaiKey.trim()) {
      Alert.alert('Error', 'Please enter a valid OpenAI API key');
      return;
    }
    
    try {
      await aiSummaryService.current.saveApiKey(openaiKey);
      Alert.alert('Success', 'OpenAI API key saved successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save OpenAI API key: ' + error.message);
    }
  };

  const handleGenerateSummary = async () => {
    if (!transcriptions || transcriptions.length === 0) {
      Alert.alert('No Data', 'No transcriptions available to summarize');
      return;
    }

    try {
      setIsGeneratingSummary(true);
      
      const result = await aiSummaryService.current.summarizeTranscriptions(transcriptions, {
        maxTranscriptions: 10,
        summaryType: 'conversation',
        includeTimestamps: true
      });
      
      setLastSummary(result);
      setShowSummarySection(true);
      
    } catch (error) {
      console.error('❌ Summary generation error:', error);
      Alert.alert('Summary Error', error.message || 'Failed to generate summary');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleBackgroundStateChange = (state, duration) => {
    if (state === 'background') {
      console.log('📱 App went to background during recording');
      setBackgroundStatus('Recording in background...');
    } else if (state === 'active') {
      console.log(`📱 App returned to foreground after ${duration}s`);
      setBackgroundStatus('Background capable');
    }
  };

  const cleanup = () => {
    if (bleManager.current) {
      bleManager.current.destroy();
    }
    if (statsInterval.current) {
      clearInterval(statsInterval.current);
    }
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
    }
    if (backgroundTaskManager.current) {
      backgroundTaskManager.current.destroy();
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const openTranscriptionDetail = async (transcription) => {
    setSelectedTranscription(transcription);
    setShowDetailModal(true);
    setShowChatSection(false);
    setChatMessage('');
    chatAnimationValue.setValue(0);
    
    // Load existing chat history
    if (aiChatService.current && transcription.id) {
      try {
        const history = await aiChatService.current.getChatHistory(transcription.id);
        setChatHistory(history);
      } catch (error) {
        console.error('❌ Error loading chat history:', error);
        setChatHistory([]);
      }
    } else {
      setChatHistory([]);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      if (chatScrollViewRef.current) {
        chatScrollViewRef.current.scrollToEnd({ animated: true });
      }
    }, 100);
  };

  const startTypingAnimation = () => {
    const animateDot = (dot, delay) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
    };

    Animated.parallel([
      animateDot(typingDot1, 0),
      animateDot(typingDot2, 200),
      animateDot(typingDot3, 400),
    ]).start();
  };

  const stopTypingAnimation = () => {
    typingDot1.stopAnimation(() => typingDot1.setValue(0));
    typingDot2.stopAnimation(() => typingDot2.setValue(0));
    typingDot3.stopAnimation(() => typingDot3.setValue(0));
  };

  useEffect(() => {
    if (isTyping) {
      startTypingAnimation();
    } else {
      stopTypingAnimation();
    }
  }, [isTyping]);

  const handleSendChatMessage = async () => {
    if (!chatMessage.trim() || !selectedTranscription || isChatLoading) {
      return;
    }

    if (!aiChatService.current || !aiChatService.current.isChatAvailable()) {
      Alert.alert('Chat Unavailable', 'Please configure your OpenAI API key to use the chat feature.');
      return;
    }

    try {
      setIsChatLoading(true);
      const messageToSend = chatMessage.trim();
      setChatMessage(''); // Clear input immediately
      setIsTyping(true);
      
      // Scroll to show user message immediately
      scrollToBottom();

      const result = await aiChatService.current.chatWithTranscription(
        selectedTranscription.id,
        messageToSend,
        selectedTranscription,
        chatHistory
      );

      // Animate new messages
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setChatHistory(result.chatHistory);
      
      // Auto-scroll to new messages
      scrollToBottom();
      
    } catch (error) {
      console.error('❌ Chat error:', error);
      Alert.alert('Chat Error', error.message || 'Failed to send message');
      // Restore message if there was an error
      setChatMessage(messageToSend);
    } finally {
      setIsChatLoading(false);
      setIsTyping(false);
      stopTypingAnimation();
    }
  };

  const handleSuggestedQuestion = (question) => {
    setChatMessage(question);
    // Focus input after setting question
    setTimeout(() => {
      if (chatInputRef.current) {
        chatInputRef.current.focus();
      }
    }, 100);
  };

  const clearChatHistory = async () => {
    if (!selectedTranscription) return;
    
    try {
      if (aiChatService.current) {
        await aiChatService.current.clearChatHistory(selectedTranscription.id);
      }
      setChatHistory([]);
    } catch (error) {
      console.error('❌ Error clearing chat:', error);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      })
    };
  };

  // Share transcription text using React Native's built-in Share
  const shareText = async (transcription) => {
    try {
      const timestamp = formatTimestamp(transcription.timestamp);
      const content = `📝 TaiNecklace Transcription

📅 ${timestamp.date} at ${timestamp.time}
⏱️ Duration: ${formatDuration(transcription.duration || 0)}

${transcription.aiSummary ? `🤖 AI Summary:\n${transcription.aiSummary}\n\n` : ''}📄 Full Text:\n${transcription.text || 'No transcription available'}

---
Shared from TaiNecklace App`;

      await Share.share({
        message: content,
        title: 'TaiNecklace Transcription'
      });
    } catch (error) {
      console.error('❌ Error sharing text:', error);
      Alert.alert('Share Error', 'Failed to share transcription');
    }
  };

  // Share transcription with more detail
  const shareDetailed = async (transcription) => {
    try {
      const timestamp = formatTimestamp(transcription.timestamp);
      const content = `📄 TaiNecklace Transcription Report

📅 Date: ${timestamp.date}
🕐 Time: ${timestamp.time}
⏱️ Duration: ${formatDuration(transcription.duration || 0)}
${transcription.confidence ? `📊 Accuracy: ${(transcription.confidence * 100).toFixed(1)}%\n` : ''}
${transcription.aiSummary ? `🤖 AI Summary:\n${transcription.aiSummary}\n\n` : ''}📝 Full Transcription:
${transcription.text || 'No transcription available'}

---
Generated by TaiNecklace App
AI-powered voice companion`;

      await Share.share({
        message: content,
        title: 'TaiNecklace Transcription Report'
      });
    } catch (error) {
      console.error('❌ Error sharing detailed text:', error);
      Alert.alert('Share Error', 'Failed to share transcription');
    }
  };

  // Show export options menu
  const showExportOptions = () => {
    Alert.alert(
      'Share Transcription',
      'Choose how you would like to share this transcription',
      [
        {
          text: 'Quick Share',
          onPress: () => shareText(selectedTranscription),
          style: 'default'
        },
        {
          text: 'Detailed Report',
          onPress: () => shareDetailed(selectedTranscription),
          style: 'default'
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  // Show quick export options for conversation list items
  const showQuickExportOptions = (transcription) => {
    const timestamp = formatTimestamp(transcription.timestamp);
    Alert.alert(
      'Quick Actions',
      `Transcription from ${timestamp.date}`,
      [
        {
          text: 'Quick Share',
          onPress: () => shareText(transcription),
          style: 'default'
        },
        {
          text: 'Share Report',
          onPress: () => shareDetailed(transcription),
          style: 'default'
        },
        {
          text: 'View Details',
          onPress: () => openTranscriptionDetail(transcription),
          style: 'default'
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  };

  // Filter transcriptions based on search query
  const filteredTranscriptions = transcriptions.filter(item => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    const text = (item.text || '').toLowerCase();
    const aiSummary = (item.aiSummary || '').toLowerCase();
    const date = new Date(item.timestamp).toLocaleDateString().toLowerCase();
    
    return text.includes(query) || 
           aiSummary.includes(query) || 
           date.includes(query);
  });

  // Determine how many conversations to show
  const conversationsToShow = showAllConversations ? filteredTranscriptions : filteredTranscriptions.slice(0, 10);

  // Helper function to highlight search results
  const highlightSearchTerm = (text, searchTerm) => {
    if (!searchTerm.trim()) return text;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.split(regex).map((part, index) => {
      if (part.toLowerCase() === searchTerm.toLowerCase()) {
        return `**${part}**`; // Simple highlighting marker
      }
      return part;
    }).join('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Notes</Text>
        <TouchableOpacity 
          style={styles.settingsButton}
          onPress={() => setShowSettingsModal(true)}
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={[styles.recordButton, !isConnected && styles.disabledActionButton, isRecording && styles.recordingButton]} 
            onPress={isRecording ? handleStopRecording : handleStartRecording}
            disabled={!isConnected}
          >
            <View style={styles.recordIcon}>
              <Text style={styles.recordIconText}>{isRecording ? '⏹' : '●'}</Text>
            </View>
            <Text style={styles.recordButtonText}>
              {isRecording ? 'Recording' : 'Record'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.connectButton, isConnected && styles.connectedButton]} 
            onPress={isConnected ? handleDisconnectXIAO : handleConnectXIAO}
            disabled={isConnecting || isDisconnecting}
          >
            <View style={styles.connectIcon}>
              <Text style={styles.connectIconText}>📱</Text>
            </View>
            <Text style={styles.connectButtonText}>
              {isConnecting ? 'Connecting' : isDisconnecting ? 'Disconnecting' : isConnected ? 'Connected' : 'Connect Device'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              style={styles.clearSearchButton}
              onPress={() => setSearchQuery('')}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Recording Status */}
        {(isRecording || isTranscribing) && (
          <View style={styles.statusCard}>
            {isRecording && (
              <View style={styles.recordingStatus}>
                <View style={styles.recordingIndicator} />
                <Text style={styles.statusText}>Recording • {recordingDuration.toFixed(1)}s</Text>
              </View>
            )}
            {isTranscribing && (
              <View style={styles.processingStatus}>
                <ActivityIndicator size="small" color="#3B82F6" />
                <Text style={styles.statusText}>Transcribing audio...</Text>
              </View>
            )}
          </View>
        )}

        {/* Current Transcription */}
        {transcription && transcription.length > 0 && (
          <View style={styles.latestCard}>
            <Text style={styles.latestTitle}>Latest Recording</Text>
            <Text style={styles.latestText}>{transcription}</Text>
            <Text style={styles.tapToSave}>Tap to save and continue</Text>
          </View>
        )}

        {/* Conversations Section */}
        <View style={styles.conversationsSection}>
          <View style={styles.conversationsHeader}>
            <Text style={styles.conversationsTitle}>
              Conversations {searchQuery && `(${filteredTranscriptions.length})`}
            </Text>
            {filteredTranscriptions.length > 10 && !showAllConversations && (
              <TouchableOpacity onPress={() => setShowAllConversations(true)}>
                <Text style={styles.viewAllButton}>View all ({filteredTranscriptions.length})</Text>
              </TouchableOpacity>
            )}
            {showAllConversations && (
              <TouchableOpacity onPress={() => setShowAllConversations(false)}>
                <Text style={styles.viewAllButton}>Show less</Text>
              </TouchableOpacity>
            )}
          </View>
          
          {!transcriptions || transcriptions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No conversations yet</Text>
              <Text style={styles.emptyStateSubtext}>Start recording to create your first conversation</Text>
            </View>
          ) : filteredTranscriptions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No matches found</Text>
              <Text style={styles.emptyStateSubtext}>Try adjusting your search query</Text>
            </View>
          ) : (
            <View style={styles.conversationsList}>
              {conversationsToShow.map((item, index) => {
                if (!item || typeof item !== 'object') return null;
                const date = new Date(item.timestamp);
                const isToday = date.toDateString() === new Date().toDateString();
                
                return (
                <TouchableOpacity 
                  key={item.id || `transcription-${index}`} 
                  style={styles.conversationCard}
                  onPress={() => openTranscriptionDetail(item)}
                  onLongPress={() => showQuickExportOptions(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.conversationHeader}>
                    <View style={styles.conversationMeta}>
                      <Text style={styles.conversationDate}>
                        {isToday ? 'Today' : date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                      </Text>
                      <Text style={styles.conversationTime}>
                        {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={styles.durationBadge}>
                      <Text style={styles.durationText}>{formatDuration(item.duration || 0)}</Text>
                      <Text style={styles.arrowIcon}>→</Text>
                    </View>
                  </View>
                  
                  {/* AI Summary */}
                  {item.aiSummary && (
                    <View style={styles.summaryContainer}>
                      <View style={styles.aiIcon}>
                        <Text style={styles.aiIconText}>🤖</Text>
                      </View>
                      <View style={styles.summaryContent}>
                        <Text style={styles.summaryLabel}>AI Summary:</Text>
                        <Text style={styles.summaryPreview} numberOfLines={3}>
                          {item.aiSummary}
                        </Text>
                      </View>
                    </View>
                  )}
                  
                  {/* Original Text Preview */}
                  <Text style={styles.originalText} numberOfLines={2}>
                    {item.text || 'No transcription available'}
                  </Text>
                  
                  <Text style={styles.tapToViewDetails}>Tap to view details</Text>
                </TouchableOpacity>
                );
              }).filter(Boolean)}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Detail Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetailModal(false)}
      >
        {selectedTranscription && (
          <SafeAreaView style={styles.detailModalContainer}>
            {/* Clean Modal Header */}
            <View style={styles.detailHeader}>
              <TouchableOpacity 
                onPress={() => setShowDetailModal(false)}
              >
                <Text style={styles.detailBackText}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.detailTitle}>Conversation</Text>
              <TouchableOpacity onPress={() => showExportOptions()}>
                <Text style={styles.detailShareText}>Share</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.detailContent} showsVerticalScrollIndicator={false}>
              {/* AI Chat Section - Moved to First Position */}
              <View style={styles.detailCard}>
                <View style={styles.chatHeader}>
                  <View style={styles.chatTitleContainer}>
                    <Text style={styles.sectionTitle}>🤖 Chat with Recording</Text>
                    <Text style={styles.chatSubtitle}>Ask questions about this transcription</Text>
                  </View>
                  <TouchableOpacity 
                    style={[styles.modernToggleChatButton, showChatSection && styles.modernToggleChatButtonActive]}
                    onPress={() => {
                      LayoutAnimation.configureNext({
                        duration: 300,
                        create: {
                          type: LayoutAnimation.Types.easeInEaseOut,
                          property: LayoutAnimation.Properties.opacity,
                        },
                        update: {
                          type: LayoutAnimation.Types.easeInEaseOut,
                        },
                      });
                      setShowChatSection(!showChatSection);
                      
                      if (!showChatSection) {
                        Animated.timing(chatAnimationValue, {
                          toValue: 1,
                          duration: 300,
                          useNativeDriver: false,
                        }).start();
                      } else {
                        Animated.timing(chatAnimationValue, {
                          toValue: 0,
                          duration: 200,
                          useNativeDriver: false,
                        }).start();
                      }
                    }}
                  >
                    <Text style={[styles.modernToggleChatText, showChatSection && styles.modernToggleChatTextActive]}>
                      {showChatSection ? 'Hide' : 'Chat'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {showChatSection && (
                  <Animated.View 
                    style={[
                      styles.modernChatContainer,
                      {
                        opacity: chatAnimationValue,
                        transform: [{
                          translateY: chatAnimationValue.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-20, 0],
                          })
                        }]
                      }
                    ]}
                  >
                    {/* Suggested Questions */}
                    {chatHistory.length === 0 && aiChatService.current && (
                      <View style={styles.modalSuggestionsContainer}>
                        <Text style={styles.modalSuggestionsTitle}>Suggested Questions</Text>
                        <View style={styles.modalSuggestionsGrid}>
                          {aiChatService.current.getSuggestedQuestions(selectedTranscription).map((question, index) => (
                            <TouchableOpacity 
                              key={index}
                              style={styles.modalSuggestionChip}
                              onPress={() => handleSuggestedQuestion(question)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.modalSuggestionText}>{question}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Chat Messages */}
                    {(chatHistory.length > 0 || isTyping) && (
                      <View style={styles.modalChatMessagesContainer}>
                        <ScrollView 
                          ref={chatScrollViewRef}
                          style={styles.modalChatMessages} 
                          showsVerticalScrollIndicator={false}
                          contentContainerStyle={styles.modalChatMessagesContent}
                          onContentSizeChange={scrollToBottom}
                        >
                          {chatHistory.map((message, index) => (
                            <View key={message.id || index} style={[
                              styles.modalChatMessage,
                              message.role === 'user' ? styles.modalUserMessage : styles.modalAiMessage
                            ]}>
                              {message.role === 'assistant' && (
                                <View style={styles.modalAiAvatar}>
                                  <Text style={styles.modalAiAvatarText}>🤖</Text>
                                </View>
                              )}
                              <View style={styles.modalMessageContent}>
                                <Text style={[
                                  styles.modalMessageText,
                                  message.role === 'user' ? styles.modalUserMessageText : styles.modalAiMessageText
                                ]}>
                                  {message.content}
                                </Text>
                                <Text style={styles.modalMessageTime}>
                                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                              </View>
                            </View>
                          ))}
                          
                          {/* Typing Indicator */}
                          {isTyping && (
                            <View style={styles.modalTypingMessage}>
                              <View style={styles.modalAiAvatar}>
                                <Text style={styles.modalAiAvatarText}>🤖</Text>
                              </View>
                              <View style={styles.modalTypingContent}>
                                <View style={styles.modalTypingIndicator}>
                                  <Animated.View style={[
                                    styles.modalTypingDot,
                                    {
                                      opacity: typingDot1,
                                      transform: [{
                                        scale: typingDot1.interpolate({
                                          inputRange: [0, 1],
                                          outputRange: [1, 1.2],
                                        })
                                      }]
                                    }
                                  ]} />
                                  <Animated.View style={[
                                    styles.modalTypingDot,
                                    {
                                      opacity: typingDot2,
                                      transform: [{
                                        scale: typingDot2.interpolate({
                                          inputRange: [0, 1],
                                          outputRange: [1, 1.2],
                                        })
                                      }]
                                    }
                                  ]} />
                                  <Animated.View style={[
                                    styles.modalTypingDot,
                                    {
                                      opacity: typingDot3,
                                      transform: [{
                                        scale: typingDot3.interpolate({
                                          inputRange: [0, 1],
                                          outputRange: [1, 1.2],
                                        })
                                      }]
                                    }
                                  ]} />
                                </View>
                                <Text style={styles.modalTypingText}>AI is thinking...</Text>
                              </View>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    )}

                    {/* Chat Input */}
                    <View style={styles.modalChatInputSection}>
                      <View style={styles.modalChatInputContainer}>
                        <TextInput
                          ref={chatInputRef}
                          style={[styles.modalChatInput, inputFocused && styles.modalChatInputFocused]}
                          placeholder="Ask about this conversation..."
                          placeholderTextColor="#9CA3AF"
                          value={chatMessage}
                          onChangeText={setChatMessage}
                          multiline={true}
                          maxLength={500}
                          editable={!isChatLoading}
                          textAlignVertical="top"
                          onFocus={() => setInputFocused(true)}
                          onBlur={() => setInputFocused(false)}
                          returnKeyType="send"
                          blurOnSubmit={false}
                          onSubmitEditing={() => {
                            if (chatMessage.trim() && !isChatLoading) {
                              handleSendChatMessage();
                            }
                          }}
                        />
                        <TouchableOpacity 
                          style={[
                            styles.modalSendButton, 
                            (!chatMessage.trim() || isChatLoading) && styles.modalSendButtonDisabled
                          ]} 
                          onPress={handleSendChatMessage}
                          disabled={!chatMessage.trim() || isChatLoading}
                          activeOpacity={0.7}
                        >
                          {isChatLoading ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={styles.modalSendButtonText}>→</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Chat Actions */}
                    {chatHistory.length > 0 && (
                      <View style={styles.modalChatActions}>
                        <Text style={styles.modalChatStats}>
                          {chatHistory.length} message{chatHistory.length !== 1 ? 's' : ''}
                        </Text>
                        <TouchableOpacity style={styles.modalClearButton} onPress={clearChatHistory}>
                          <Text style={styles.modalClearButtonText}>Clear Chat</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </Animated.View>
                )}
              </View>

              {/* AI Summary Card */}
              {selectedTranscription.aiSummary && (
                <View style={styles.detailCard}>
                  <View style={styles.aiSummaryHeader}>
                    <View style={styles.aiSummaryIcon}>
                      <Text style={styles.aiSummaryIconText}>🤖</Text>
                    </View>
                    <View style={styles.aiSummaryTitleContainer}>
                      <Text style={styles.detailCardTitle}>AI Summary</Text>
                      <Text style={styles.aiSummarySubtitle}>Key insights from this conversation</Text>
                    </View>
                  </View>
                  <View style={styles.aiSummaryContent}>
                    <Text style={styles.aiSummaryCleanText}>{selectedTranscription.aiSummary}</Text>
                  </View>
                </View>
              )}

              {/* Full Transcription Card */}
              <View style={styles.detailCard}>
                <View style={styles.detailCardHeader}>
                  <Text style={styles.detailCardTitle}>Full Transcription</Text>
                  <Text style={styles.wordCountBadge}>
                    {(selectedTranscription.text || '').split(/\s+/).filter(word => word.length > 0).length} words
                  </Text>
                </View>
                <View style={styles.transcriptionContent}>
                  <Text style={styles.transcriptionCleanText}>
                    {selectedTranscription.text || 'No transcription available'}
                  </Text>
                </View>
              </View>

              {/* Details Section - Collapsible */}
              <View style={styles.detailCard}>
                <TouchableOpacity 
                  style={styles.detailsToggleHeader}
                  onPress={() => setShowDetailsSection(!showDetailsSection)}
                >
                  <Text style={styles.detailCardTitle}>Details</Text>
                  <Text style={styles.detailsToggleIcon}>
                    {showDetailsSection ? '▼' : '▶'}
                  </Text>
                </TouchableOpacity>
                
                {showDetailsSection && (
                  <View style={styles.detailsContent}>
                    {/* Recording Details */}
                    {selectedTranscription.timestamp && (
                      <View style={styles.detailsSubsection}>
                        <Text style={styles.detailsSubsectionTitle}>Recording Information</Text>
                        <View style={styles.dateTimeContainer}>
                          <Text style={styles.detailDate}>
                            {formatTimestamp(selectedTranscription.timestamp).date}
                          </Text>
                          <Text style={styles.detailTime}>
                            {formatTimestamp(selectedTranscription.timestamp).time}
                          </Text>
                        </View>
                        {selectedTranscription.confidence && (
                          <View style={styles.confidenceContainer}>
                            <Text style={styles.confidenceLabel}>Transcription Accuracy</Text>
                            <View style={styles.confidenceBar}>
                              <View style={[styles.confidenceFill, { width: `${selectedTranscription.confidence * 100}%` }]} />
                            </View>
                            <Text style={styles.confidenceText}>
                              {(selectedTranscription.confidence * 100).toFixed(1)}%
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Technical Details */}
                    <View style={styles.detailsSubsection}>
                      <Text style={styles.detailsSubsectionTitle}>Technical Information</Text>
                      <View style={styles.modernDetailsGrid}>
                        <View style={styles.modernDetailItem}>
                          <Text style={styles.modernDetailLabel}>Duration</Text>
                          <Text style={styles.modernDetailValue}>{formatDuration(selectedTranscription.duration || 0)}</Text>
                        </View>

                        <View style={styles.modernDetailItem}>
                          <Text style={styles.modernDetailLabel}>Recording ID</Text>
                          <Text style={styles.modernDetailValue}>{selectedTranscription.id || 'N/A'}</Text>
                        </View>

                        <View style={styles.modernDetailItem}>
                          <Text style={styles.modernDetailLabel}>Text Length</Text>
                          <Text style={styles.modernDetailValue}>{(selectedTranscription.text || '').length} chars</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Settings Modal */}
      <Modal
        visible={showSettingsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <SafeAreaView style={styles.settingsModalContainer}>
          {/* Settings Header */}
          <View style={styles.settingsHeader}>
            <TouchableOpacity 
              onPress={() => setShowSettingsModal(false)}
            >
              <Text style={styles.settingsBackText}>← Done</Text>
            </TouchableOpacity>
            <Text style={styles.settingsTitle}>Settings</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView style={styles.settingsContent} showsVerticalScrollIndicator={false}>
            {/* API Configuration Section */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>API Configuration</Text>
              
              <View style={styles.settingsCard}>
                <Text style={styles.settingsLabel}>AssemblyAI API Key</Text>
                <Text style={styles.settingsDescription}>Required for transcription</Text>
                <TextInput
                  style={styles.settingsInput}
                  placeholder="Enter AssemblyAI API Key"
                  placeholderTextColor="#9CA3AF"
                  value={apiKey}
                  onChangeText={setApiKey}
                  secureTextEntry={true}
                />
                <TouchableOpacity style={styles.settingsSaveButton} onPress={handleSaveApiKey}>
                  <Text style={styles.settingsSaveButtonText}>Save Key</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsLabel}>OpenAI API Key</Text>
                <Text style={styles.settingsDescription}>Optional for AI summaries and chat</Text>
                <TextInput
                  style={styles.settingsInput}
                  placeholder="Enter OpenAI API Key"
                  placeholderTextColor="#9CA3AF"
                  value={openaiKey}
                  onChangeText={setOpenaiKey}
                  secureTextEntry={true}
                />
                <TouchableOpacity style={styles.settingsSaveButton} onPress={handleSaveOpenAIKey}>
                  <Text style={styles.settingsSaveButtonText}>Save Key</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Device Status Section */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Device Status</Text>
              
              <View style={styles.settingsCard}>
                <View style={styles.deviceStatusRow}>
                  <Text style={styles.settingsLabel}>XIAO Device</Text>
                  <View style={[styles.statusBadge, isConnected && styles.connectedBadge]}>
                    <Text style={[styles.statusBadgeText, isConnected && styles.connectedBadgeText]}>
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.settingsDescription}>{status}</Text>
                
                <Text style={styles.settingsLabel} style={{marginTop: 16}}>Background Recording</Text>
                <View style={styles.deviceStatusRow}>
                  <Text style={styles.settingsDescription}>Record when app is in background</Text>
                  <View style={[styles.statusBadge, isBackgroundCapable && styles.connectedBadge]}>
                    <Text style={[styles.statusBadgeText, isBackgroundCapable && styles.connectedBadgeText]}>
                      {isBackgroundCapable ? 'Available' : 'Disabled'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Storage Section */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Storage</Text>
              
              <View style={styles.settingsCard}>
                <Text style={styles.settingsLabel}>Local Storage</Text>
                <Text style={styles.settingsDescription}>{storageStatus.local} conversations stored</Text>
                
                <Text style={styles.settingsLabel} style={{marginTop: 16}}>Cloud Sync</Text>
                <View style={styles.deviceStatusRow}>
                  <Text style={styles.settingsDescription}>Sync to cloud storage</Text>
                  <View style={[styles.statusBadge, storageStatus.cloudEnabled && styles.connectedBadge]}>
                    <Text style={[styles.statusBadgeText, storageStatus.cloudEnabled && styles.connectedBadgeText]}>
                      {storageStatus.cloudEnabled ? 'Enabled' : 'Disabled'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#3B82F6',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  settingsButton: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  // Search
  searchContainer: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 24,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 12,
    opacity: 0.5,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
  },
  clearSearchButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  clearSearchText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  // Action Buttons
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  recordButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  recordingButton: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  recordIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  recordIconText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  recordButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  connectButton: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  connectedButton: {
    backgroundColor: '#10B981',
  },
  connectIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  connectIconText: {
    fontSize: 14,
  },
  connectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  disabledActionButton: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  // Status Cards
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  recordingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 12,
  },
  processingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginLeft: 8,
  },
  latestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  latestTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  latestText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
    marginBottom: 12,
  },
  tapToSave: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },
  // Conversations
  conversationsSection: {
    flex: 1,
  },
  conversationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  conversationsTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  viewAllButton: {
    fontSize: 16,
    fontWeight: '500',
    color: '#3B82F6',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  conversationsList: {
    gap: 12,
  },
  conversationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  conversationMeta: {
    flex: 1,
  },
  conversationDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  conversationTime: {
    fontSize: 14,
    color: '#6B7280',
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  durationText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    marginRight: 4,
  },
  arrowIcon: {
    fontSize: 12,
    color: '#6B7280',
  },
  summaryContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  aiIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiIconText: {
    fontSize: 16,
  },
  summaryContent: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryPreview: {
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
  },
  originalText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6B7280',
    marginBottom: 8,
  },
  tapToViewDetails: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
    textAlign: 'center',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    backgroundColor: '#2d2d2d',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#007bff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  placeholder: {
    width: 40,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  timestampContainer: {
    alignItems: 'center',
  },
  dateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  timeText: {
    fontSize: 14,
    color: '#6B7280',
  },
  aiSummaryBox: {
    backgroundColor: '#2a4d3a',
    borderRadius: 4,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#28a745',
  },
  aiSummaryMeta: {
    borderTopWidth: 1,
    borderTopColor: '#357a42',
    paddingTop: 8,
  },
  aiMetaText: {
    color: '#a8d5aa',
    fontSize: 12,
    fontStyle: 'italic',
  },
  wordCount: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'right',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  detailItem: {
    width: '48%',
    backgroundColor: '#333',
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  detailLabel: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 4,
  },
  detailValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Chat styles
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  chatTitleContainer: {
    flex: 1,
  },
  chatSubtitle: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 2,
  },
  toggleChatButton: {
    backgroundColor: '#444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  toggleChatButtonActive: {
    backgroundColor: '#6f42c1',
    borderColor: '#8a63d2',
  },
  toggleChatText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  chatContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
    marginTop: 4,
  },
  suggestionsContainer: {
    marginBottom: 20,
  },
  suggestionsHeader: {
    marginBottom: 12,
  },
  suggestionsTitle: {
    color: '#e8e8e8',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  suggestionsSubtitle: {
    color: '#6B7280',
    fontSize: 12,
  },
  suggestionsGrid: {
    flexDirection: 'column',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: '#2a2a2a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  suggestionText: {
    color: '#e0e0e0',
    fontSize: 13,
    lineHeight: 18,
  },
  chatMessagesContainer: {
    marginBottom: 16,
  },
  chatMessages: {
    maxHeight: 300,
  },
  chatMessagesContent: {
    paddingVertical: 8,
  },
  chatMessage: {
    marginBottom: 12,
    maxWidth: '88%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007bff',
    borderRadius: 18,
    borderBottomRightRadius: 6,
    padding: 14,
    marginLeft: 40,
    shadowColor: '#007bff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a2a',
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    padding: 14,
    marginRight: 40,
    borderWidth: 1,
    borderColor: '#444',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    position: 'relative',
  },
  aiMessageHeader: {
    marginBottom: 4,
  },
  aiLabel: {
    color: '#6f42c1',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#ffffff',
    fontWeight: '500',
  },
  aiMessageText: {
    color: '#e8e8e8',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 6,
  },
  userMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'right',
  },
  aiMessageTime: {
    color: '#9CA3AF',
    textAlign: 'left',
  },
  chatInputSection: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 12,
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  chatInputWrapper: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chatInputWrapperFocused: {
    borderColor: '#007bff',
  },
  chatInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 12,
    color: '#ffffff',
    maxHeight: 100,
    minHeight: 44,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#444',
    lineHeight: 20,
  },
  chatInputFocused: {
    backgroundColor: '#333',
    borderColor: '#007bff',
    shadowColor: '#007bff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  characterCount: {
    color: '#9CA3AF',
    fontSize: 10,
    textAlign: 'right',
    marginTop: 4,
    marginRight: 4,
  },
  characterCountWarning: {
    color: '#ffc107',
  },
  characterCountError: {
    color: '#dc3545',
    fontWeight: 'bold',
  },
  sendButton: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  activeSendButton: {
    backgroundColor: '#007bff',
  },
  disabledSendButton: {
    backgroundColor: '#555',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  chatActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  chatStats: {
    flex: 1,
  },
  chatStatsText: {
    color: '#6B7280',
    fontSize: 12,
  },
  clearChatButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    opacity: 0.8,
  },
  clearChatText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  // Typing indicator styles
  typingMessage: {
    opacity: 0.9,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6f42c1',
    marginRight: 6,
  },
  typingText: {
    color: '#6B7280',
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 8,
  },
  // Settings Modal Styles
  settingsModalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  settingsHeader: {
    backgroundColor: '#3B82F6',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsBackText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  settingsContent: {
    flex: 1,
    padding: 20,
  },
  settingsSection: {
    marginBottom: 32,
  },
  settingsSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  settingsLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  settingsDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  settingsInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#111827',
    marginBottom: 16,
  },
  settingsSaveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  settingsSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  connectedBadge: {
    backgroundColor: '#D1FAE5',
  },
  connectedBadgeText: {
    color: '#065F46',
  },
  // Detail Modal Styles
  detailModalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  detailHeader: {
    backgroundColor: '#3B82F6',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailBackText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  detailShareText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  detailContent: {
    flex: 1,
    padding: 20,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  detailCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  detailDuration: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  dateTimeContainer: {
    marginBottom: 16,
  },
  detailDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  detailTime: {
    fontSize: 14,
    color: '#6B7280',
  },
  confidenceContainer: {
    marginTop: 16,
  },
  confidenceLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  confidenceBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginBottom: 4,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  confidenceText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
  },
  aiSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  aiSummaryIcon: {
    width: 40,
    height: 40,
    backgroundColor: '#3B82F6',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  aiSummaryIconText: {
    fontSize: 18,
  },
  aiSummaryTitleContainer: {
    flex: 1,
  },
  aiSummarySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  aiSummaryContent: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  aiSummaryCleanText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1E40AF',
  },
  wordCountBadge: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  transcriptionContent: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 16,
  },
  transcriptionCleanText: {
    fontSize: 16,
    lineHeight: 26,
    color: '#374151',
  },
  chatCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  chatCardSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  chatToggleButton: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chatToggleActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
  },
  chatToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  chatModalContainer: {
    marginTop: 8,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 16,
  },
  // Modal Chat Specific Styles
  modalSuggestionsContainer: {
    marginBottom: 20,
  },
  modalSuggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  modalSuggestionsGrid: {
    gap: 8,
  },
  modalSuggestionChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  modalSuggestionText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  modalChatMessagesContainer: {
    marginBottom: 16,
  },
  modalChatMessages: {
    maxHeight: 200,
  },
  modalChatMessagesContent: {
    paddingVertical: 4,
  },
  modalChatMessage: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  modalUserMessage: {
    justifyContent: 'flex-end',
    flexDirection: 'row-reverse',
  },
  modalAiMessage: {
    justifyContent: 'flex-start',
  },
  modalAiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  modalAiAvatarText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  modalMessageContent: {
    flex: 1,
    maxWidth: '85%',
  },
  modalMessageText: {
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
    borderRadius: 12,
  },
  modalUserMessageText: {
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    borderBottomRightRadius: 4,
  },
  modalAiMessageText: {
    backgroundColor: '#FFFFFF',
    color: '#374151',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderBottomLeftRadius: 4,
  },
  modalMessageTime: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    marginLeft: 12,
  },
  modalTypingMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalTypingContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderBottomLeftRadius: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginLeft: 8,
  },
  modalTypingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTypingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3B82F6',
    marginRight: 4,
  },
  modalTypingText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  modalChatInputSection: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    marginTop: 8,
  },
  modalChatInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  modalChatInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 80,
    minHeight: 40,
    fontSize: 14,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalChatInputFocused: {
    borderColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  modalSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  modalSendButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0,
    elevation: 0,
  },
  modalSendButtonText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modalChatActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  modalChatStats: {
    fontSize: 12,
    color: '#6B7280',
  },
  modalClearButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  modalClearButtonText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  // Modern Technical Details Styles
  techIconBadge: {
    fontSize: 16,
    color: '#3B82F6',
  },
  modernDetailsGrid: {
    gap: 12,
  },
  modernDetailItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modernDetailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  modernDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  // Modern Toggle Button Styles
  modernToggleChatButton: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  modernToggleChatButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.2,
  },
  modernToggleChatText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  modernToggleChatTextActive: {
    color: '#FFFFFF',
  },
  // Modern Chat Container Style
  modernChatContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  // Collapsible Details Section Styles
  detailsToggleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailsToggleIcon: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  detailsContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  detailsSubsection: {
    marginBottom: 20,
  },
  detailsSubsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
});