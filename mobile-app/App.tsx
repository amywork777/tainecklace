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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>TaiNecklace</Text>
        <Text style={styles.subtitle}>AI Voice Companion</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* API Key Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API Configuration</Text>
          
          <Text style={styles.apiSubtitle}>AssemblyAI (Required for transcription)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter AssemblyAI API Key"
            placeholderTextColor="#888"
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry={true}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveApiKey}>
            <Text style={styles.buttonText}>Save AssemblyAI Key</Text>
          </TouchableOpacity>

          <Text style={styles.apiSubtitle}>OpenAI (Optional for AI summaries)</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter OpenAI API Key"
            placeholderTextColor="#888"
            value={openaiKey}
            onChangeText={setOpenaiKey}
            secureTextEntry={true}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveOpenAIKey}>
            <Text style={styles.buttonText}>Save OpenAI Key</Text>
          </TouchableOpacity>
        </View>

        {/* Connection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Connection</Text>
          <Text style={styles.status}>{status}</Text>
          
          {/* Background Status */}
          <View style={styles.backgroundStatus}>
            <Text style={styles.backgroundStatusLabel}>
              🔄 Background Recording: 
            </Text>
            <Text style={[styles.backgroundStatusText, isBackgroundCapable ? styles.enabledText : styles.disabledText]}>
              {backgroundStatus}
            </Text>
          </View>
          
          {!isConnected ? (
            <TouchableOpacity 
              style={[styles.connectButton, (isConnecting) && styles.disabledButton]} 
              onPress={handleConnectXIAO}
              disabled={isConnecting}
            >
              <Text style={styles.buttonText}>
                {isConnecting ? '🔄 Connecting...' : 'Connect to XIAO'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.connectButton, { backgroundColor: '#dc3545' }, isDisconnecting && styles.disabledButton]} 
              onPress={handleDisconnectXIAO}
              disabled={isDisconnecting}
            >
              <Text style={styles.buttonText}>
                {isDisconnecting ? '🔄 Disconnecting...' : 'Disconnect'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats Section */}
        {isConnected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Statistics</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.packetsReceived}</Text>
                <Text style={styles.statLabel}>Packets</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.framesProcessed}</Text>
                <Text style={styles.statLabel}>Frames</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{Math.floor(stats.audioSamplesGenerated / 1000)}k</Text>
                <Text style={styles.statLabel}>Samples</Text>
              </View>
            </View>
          </View>
        )}

        {/* Recording Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Audio Recording</Text>
          
          <View style={styles.recordingControls}>
            {!isRecording ? (
              <TouchableOpacity 
                style={[styles.recordButton, !isConnected && styles.disabledButton]} 
                onPress={handleStartRecording}
                disabled={!isConnected}
              >
                <Text style={styles.recordButtonText}>🎤 Start Recording</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.recordingContainer}>
                <TouchableOpacity style={styles.stopButton} onPress={handleStopRecording}>
                  <Text style={styles.recordButtonText}>⏹️ Stop Recording</Text>
                </TouchableOpacity>
                <Text style={styles.recordingTimer}>
                  {recordingDuration.toFixed(1)}s • {Math.floor(audioBuffer.current.length / 1000)}k samples
                </Text>
              </View>
            )}
          </View>

          {isTranscribing && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007bff" />
              <Text style={styles.loadingText}>Transcribing audio...</Text>
            </View>
          )}
        </View>

        {/* Current Transcription */}
        {transcription && transcription.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Latest Transcription</Text>
            <View style={styles.transcriptionBox}>
              <Text style={styles.transcriptionText}>{transcription}</Text>
            </View>
          </View>
        )}

        {/* AI Summary Section */}
        {showSummarySection && lastSummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🤖 AI Summary</Text>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>{lastSummary.summary}</Text>
              <Text style={styles.summaryMeta}>
                Based on {lastSummary.transcriptionCount} recent transcriptions
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.closeSummaryButton} 
              onPress={() => setShowSummarySection(false)}
            >
              <Text style={styles.buttonText}>Close Summary</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Transcription History */}
        <View style={styles.section}>
          <View style={styles.transcriptionHeader}>
            <Text style={styles.sectionTitle}>
              Transcription History ({transcriptions?.length || 0} total)
            </Text>
            <View style={styles.storageStatus}>
              <Text style={styles.storageStatusText}>
                📱 {storageStatus.local} local
              </Text>
              {storageStatus.cloudEnabled && (
                <Text style={styles.storageStatusText}>
                  ☁️ cloud sync
                </Text>
              )}
              {storageStatus.local >= 50 && (
                <Text style={styles.syncThresholdText}>
                  🔄 auto-sync enabled
                </Text>
              )}
            </View>
          </View>
          
          {/* Summary Controls */}
          {transcriptions && transcriptions.length > 0 && (
            <View style={styles.summaryControls}>
              <TouchableOpacity 
                style={[styles.summaryButton, isGeneratingSummary && styles.disabledButton]} 
                onPress={handleGenerateSummary}
                disabled={isGeneratingSummary}
              >
                <Text style={styles.buttonText}>
                  {isGeneratingSummary ? '🤖 Generating...' : '🤖 AI Summary'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          
          {!transcriptions || transcriptions.length === 0 ? (
            <Text style={styles.emptyText}>No transcriptions yet</Text>
          ) : (
            <ScrollView style={styles.historyScroll} showsVerticalScrollIndicator={true}>
              {transcriptions.map((item, index) => {
                if (!item || typeof item !== 'object') return null;
                return (
                <TouchableOpacity 
                  key={item.id || `transcription-${index}`} 
                  style={styles.historyItem}
                  onPress={() => openTranscriptionDetail(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.historyHeader}>
                    <View style={styles.historyHeaderLeft}>
                      <Text style={styles.historyDate}>
                        {item.timestamp ? new Date(item.timestamp).toLocaleDateString() : 'Unknown date'}
                      </Text>
                      <Text style={styles.historyTime}>
                        {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unknown time'}
                      </Text>
                    </View>
                    <View style={styles.historyHeaderRight}>
                      <Text style={styles.historyDuration}>{formatDuration(item.duration || 0)}</Text>
                      <Text style={styles.expandIcon}>▶</Text>
                    </View>
                  </View>
                  
                  {/* AI Summary Preview */}
                  {item.aiSummary && (
                    <View style={styles.aiSummaryPreview}>
                      <Text style={styles.aiSummaryLabel}>🤖 AI Summary:</Text>
                      <Text style={styles.aiSummaryText} numberOfLines={2}>
                        {item.aiSummary}
                      </Text>
                    </View>
                  )}
                  
                  {/* Transcription Preview */}
                  <View style={styles.transcriptionPreview}>
                    <Text style={styles.transcriptionPreviewText} numberOfLines={2}>
                      {item.text && item.text.length > 100 
                        ? `${item.text.substring(0, 100)}...` 
                        : (item.text || '[No text]')}
                    </Text>
                  </View>
                  
                  <Text style={styles.tapToView}>Tap to view details</Text>
                </TouchableOpacity>
                );
              }).filter(Boolean)}
            </ScrollView>
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
          <SafeAreaView style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                style={styles.backButton} 
                onPress={() => setShowDetailModal(false)}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Transcription Details</Text>
              <View style={styles.placeholder} />
            </View>

            <ScrollView style={styles.modalContent}>
              {/* Timestamp Section */}
              {selectedTranscription.timestamp && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>📅 Recording Details</Text>
                  <View style={styles.timestampContainer}>
                    <Text style={styles.dateText}>
                      {formatTimestamp(selectedTranscription.timestamp).date}
                    </Text>
                    <Text style={styles.timeText}>
                      {formatTimestamp(selectedTranscription.timestamp).time}
                    </Text>
                  </View>
                </View>
              )}

              {/* AI Summary Section */}
              {selectedTranscription.aiSummary && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>🤖 AI Summary</Text>
                  <View style={styles.aiSummaryBox}>
                    <Text style={styles.aiSummaryText}>{selectedTranscription.aiSummary}</Text>
                    {selectedTranscription.aiSummaryMeta && (
                      <View style={styles.aiSummaryMeta}>
                        <Text style={styles.aiMetaText}>
                          Type: {selectedTranscription.aiSummaryMeta.summaryType || 'concise'} | 
                          Tokens: {selectedTranscription.aiSummaryMeta.tokensUsed || 0}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Full Transcription Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📝 Full Transcription</Text>
                <View style={styles.transcriptionBox}>
                  <Text style={styles.transcriptionText}>
                    {selectedTranscription.text || '[No transcription available]'}
                  </Text>
                </View>
                
                {/* Word count */}
                <Text style={styles.wordCount}>
                  {(selectedTranscription.text || '').split(/\s+/).filter(word => word.length > 0).length} words, {(selectedTranscription.text || '').length} characters
                </Text>
              </View>

              {/* AI Chat Section */}
              <View style={styles.section}>
                <View style={styles.chatHeader}>
                  <View style={styles.chatTitleContainer}>
                    <Text style={styles.sectionTitle}>🤖 Chat with Recording</Text>
                    <Text style={styles.chatSubtitle}>Ask questions about this transcription</Text>
                  </View>
                  <TouchableOpacity 
                    style={[styles.toggleChatButton, showChatSection && styles.toggleChatButtonActive]}
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
                    <Text style={styles.toggleChatText}>
                      {showChatSection ? '🔽 Hide' : '🔼 Chat'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                {showChatSection && (
                  <Animated.View 
                    style={[
                      styles.chatContainer,
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
                      <View style={styles.suggestionsContainer}>
                        <View style={styles.suggestionsHeader}>
                          <Text style={styles.suggestionsTitle}>💡 Suggested Questions</Text>
                          <Text style={styles.suggestionsSubtitle}>Tap any question to get started</Text>
                        </View>
                        <View style={styles.suggestionsGrid}>
                          {aiChatService.current.getSuggestedQuestions(selectedTranscription).map((question, index) => (
                            <TouchableOpacity 
                              key={index}
                              style={styles.suggestionChip}
                              onPress={() => handleSuggestedQuestion(question)}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.suggestionText}>{question}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Chat Messages */}
                    {(chatHistory.length > 0 || isTyping) && (
                      <View style={styles.chatMessagesContainer}>
                        <ScrollView 
                          ref={chatScrollViewRef}
                          style={styles.chatMessages} 
                          showsVerticalScrollIndicator={true}
                          contentContainerStyle={styles.chatMessagesContent}
                          onContentSizeChange={scrollToBottom}
                        >
                          {chatHistory.map((message, index) => (
                            <View key={message.id || index} style={[
                              styles.chatMessage,
                              message.role === 'user' ? styles.userMessage : styles.aiMessage
                            ]}>
                              {message.role === 'assistant' && (
                                <View style={styles.aiMessageHeader}>
                                  <Text style={styles.aiLabel}>🤖 AI Assistant</Text>
                                </View>
                              )}
                              <Text style={[
                                styles.messageText,
                                message.role === 'user' ? styles.userMessageText : styles.aiMessageText
                              ]}>
                                {message.content}
                              </Text>
                              <Text style={[
                                styles.messageTime,
                                message.role === 'user' ? styles.userMessageTime : styles.aiMessageTime
                              ]}>
                                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            </View>
                          ))}
                          
                          {/* Typing Indicator */}
                          {isTyping && (
                            <View style={[styles.chatMessage, styles.aiMessage, styles.typingMessage]}>
                              <View style={styles.aiMessageHeader}>
                                <Text style={styles.aiLabel}>🤖 AI Assistant</Text>
                              </View>
                              <View style={styles.typingIndicator}>
                                <Animated.View style={[
                                  styles.typingDot,
                                  {
                                    opacity: typingDot1,
                                    transform: [{
                                      scale: typingDot1.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [1, 1.3],
                                      })
                                    }]
                                  }
                                ]} />
                                <Animated.View style={[
                                  styles.typingDot,
                                  {
                                    opacity: typingDot2,
                                    transform: [{
                                      scale: typingDot2.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [1, 1.3],
                                      })
                                    }]
                                  }
                                ]} />
                                <Animated.View style={[
                                  styles.typingDot,
                                  {
                                    opacity: typingDot3,
                                    transform: [{
                                      scale: typingDot3.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [1, 1.3],
                                      })
                                    }]
                                  }
                                ]} />
                                <Text style={styles.typingText}>Thinking...</Text>
                              </View>
                            </View>
                          )}
                        </ScrollView>
                      </View>
                    )}

                    {/* Chat Input */}
                    <KeyboardAvoidingView 
                      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                      style={styles.chatInputSection}
                    >
                      <View style={styles.chatInputContainer}>
                        <View style={[styles.chatInputWrapper, inputFocused && styles.chatInputWrapperFocused]}>
                          <TextInput
                            ref={chatInputRef}
                            style={[styles.chatInput, inputFocused && styles.chatInputFocused]}
                            placeholder="Ask about this recording..."
                            placeholderTextColor="#888"
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
                          <Text style={[
                            styles.characterCount,
                            chatMessage.length > 450 && styles.characterCountWarning,
                            chatMessage.length >= 500 && styles.characterCountError
                          ]}>
                            {chatMessage.length}/500
                          </Text>
                        </View>
                        <TouchableOpacity 
                          style={[
                            styles.sendButton, 
                            (!chatMessage.trim() || isChatLoading) ? styles.disabledSendButton : styles.activeSendButton
                          ]} 
                          onPress={handleSendChatMessage}
                          disabled={!chatMessage.trim() || isChatLoading}
                          activeOpacity={0.7}
                        >
                          {isChatLoading ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={styles.sendButtonText}>Send</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </KeyboardAvoidingView>

                    {/* Chat Actions */}
                    {chatHistory.length > 0 && (
                      <View style={styles.chatActions}>
                        <View style={styles.chatStats}>
                          <Text style={styles.chatStatsText}>
                            {chatHistory.length} message{chatHistory.length !== 1 ? 's' : ''} in conversation
                          </Text>
                        </View>
                        <TouchableOpacity style={styles.clearChatButton} onPress={clearChatHistory}>
                          <Text style={styles.clearChatText}>🗑️ Clear</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </Animated.View>
                )}
              </View>

              {/* Technical Details Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📊 Technical Details</Text>
                <View style={styles.detailsGrid}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Duration</Text>
                    <Text style={styles.detailValue}>{formatDuration(selectedTranscription.duration || 0)}</Text>
                  </View>

                  {selectedTranscription.confidence && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Confidence</Text>
                      <Text style={[styles.detailValue, { 
                        color: selectedTranscription.confidence > 0.8 ? '#28a745' : 
                               selectedTranscription.confidence > 0.6 ? '#ffc107' : '#dc3545' 
                      }]}>
                        {(selectedTranscription.confidence * 100).toFixed(1)}%
                      </Text>
                    </View>
                  )}

                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Recording ID</Text>
                    <Text style={styles.detailValue}>{selectedTranscription.id || 'N/A'}</Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Text Length</Text>
                    <Text style={styles.detailValue}>{(selectedTranscription.text || '').length}</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    backgroundColor: '#2d2d2d',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#2d2d2d',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },
  apiSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ccc',
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 4,
    padding: 12,
    color: '#ffffff',
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: '#28a745',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  status: {
    color: '#888',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  backgroundStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 4,
  },
  backgroundStatusLabel: {
    color: '#ccc',
    fontSize: 12,
  },
  backgroundStatusText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  enabledText: {
    color: '#28a745',
  },
  disabledText: {
    color: '#dc3545',
  },
  connectButton: {
    backgroundColor: '#007bff',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#555',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007bff',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  recordingControls: {
    alignItems: 'center',
    marginBottom: 16,
  },
  recordingContainer: {
    alignItems: 'center',
  },
  recordingTimer: {
    color: '#dc3545',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
  },
  recordButton: {
    backgroundColor: '#dc3545',
    padding: 16,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#6c757d',
    padding: 16,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  recordButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#888',
    marginTop: 8,
  },
  transcriptionBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 4,
    padding: 12,
  },
  transcriptionText: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 24,
  },
  summaryBox: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 4,
    padding: 12,
    marginBottom: 12,
  },
  summaryText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  summaryMeta: {
    color: '#888',
    fontSize: 12,
    fontStyle: 'italic',
  },
  summaryControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryButton: {
    backgroundColor: '#6f42c1',
    padding: 10,
    borderRadius: 4,
    minWidth: 120,
    alignItems: 'center',
  },
  closeSummaryButton: {
    backgroundColor: '#6c757d',
    padding: 8,
    borderRadius: 4,
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  transcriptionHeader: {
    marginBottom: 12,
  },
  storageStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  storageStatusText: {
    fontSize: 11,
    color: '#888',
    marginRight: 8,
  },
  syncThresholdText: {
    fontSize: 11,
    color: '#28a745',
    fontWeight: 'bold',
  },
  historyScroll: {
    maxHeight: 400,
    marginBottom: 8,
  },
  historyItem: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyHeaderLeft: {
    flex: 1,
  },
  historyHeaderRight: {
    alignItems: 'flex-end',
  },
  historyDate: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: 'bold',
  },
  historyTime: {
    color: '#888',
    fontSize: 12,
  },
  historyDuration: {
    color: '#888',
    fontSize: 12,
  },
  expandIcon: {
    color: '#007bff',
    fontSize: 12,
    marginTop: 2,
  },
  aiSummaryPreview: {
    backgroundColor: '#2a4d3a',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#28a745',
  },
  aiSummaryLabel: {
    color: '#28a745',
    fontSize: 11,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  aiSummaryText: {
    color: '#e8f5e8',
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  transcriptionPreview: {
    marginBottom: 8,
  },
  transcriptionPreviewText: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 18,
  },
  tapToView: {
    color: '#007bff',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
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
    color: '#888',
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
    color: '#888',
    fontSize: 12,
    textAlign: 'right',
    fontStyle: 'italic',
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
    color: '#888',
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
  },
  toggleChatButton: {
    backgroundColor: '#444',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#666',
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
    color: '#888',
    fontSize: 11,
    fontStyle: 'italic',
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
    color: '#888',
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
    color: '#888',
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
    color: '#888',
    fontSize: 11,
    fontStyle: 'italic',
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
    color: '#888',
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 8,
  },
});