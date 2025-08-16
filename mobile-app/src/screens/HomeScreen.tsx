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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { XiaoBLEManager } from '../services/bleManager';
import { TranscriptionService } from '../services/TranscriptionService';
import { BackgroundTaskManager } from '../services/BackgroundTaskManager';
import { HybridStorageService } from '../services/HybridStorageService';
import { AISummaryService } from '../services/AISummaryService';

const ASSEMBLYAI_KEY = 'your-assemblyai-api-key-here';

export default function HomeScreen({ navigation }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showDeviceList, setShowDeviceList] = useState(false);
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

  const bleManager = useRef(null);
  const transcriptionService = useRef(null);
  const audioBuffer = useRef([]);
  const statsInterval = useRef(null);
  const isRecordingRef = useRef(false);
  const recordingTimer = useRef(null);
  const backgroundTaskManager = useRef(null);
  const hybridStorage = useRef(null);
  const aiSummaryService = useRef(null);

  useEffect(() => {
    initializeApp();
    return cleanup;
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

  const handleScanDevices = async () => {
    if (isScanning) return;
    
    try {
      setIsScanning(true);
      setStatus('Initializing Bluetooth...');
      
      await requestPermissions();
      
      if (!bleManager.current) {
        bleManager.current = new GenericBLEManager();
        await bleManager.current.initialize();
      }
      
      setStatus('Scanning for BLE devices...');
      const devices = await bleManager.current.scanForAudioDevices(10000);
      
      setDiscoveredDevices(devices);
      setShowDeviceList(true);
      setStatus(`Found ${devices.length} devices`);
      
    } catch (error) {
      console.error('Scan error:', error);
      Alert.alert('Scan Error', error.message);
      setStatus('Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  const handleConnectToSelectedDevice = async () => {
    if (!selectedDevice || isConnecting) return;
    
    try {
      setIsConnecting(true);
      setStatus(`Connecting to ${selectedDevice.name}...`);
      
      if (!bleManager.current) {
        bleManager.current = new GenericBLEManager();
        await bleManager.current.initialize();
      }
      
      bleManager.current.setCallbacks({
        onAudioData: handleAudioData,
        onDisconnected: handleDisconnection,
      });
      
      await bleManager.current.connectToDevice(selectedDevice.id);
      await bleManager.current.startAudioStreaming();
      
      setIsConnected(true);
      setStatus(`Connected to ${selectedDevice.name}`);
      
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

  const handleConnectXIAO = async () => {
    if (isConnecting || isConnected) return;
    
    try {
      setIsConnecting(true);
      setStatus('Initializing Bluetooth...');
      
      // Request permissions first
      await requestPermissions();
      
      // Initialize BLE Manager if not already done
      if (!bleManager.current) {
        bleManager.current = new GenericBLEManager();
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

  const handleDisconnectDevice = async () => {
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
        setStatus(`Connected to ${selectedDevice?.name || 'device'}`);
        return;
      }
      
      if (!transcriptionService.current) {
        Alert.alert('Error', 'Please set AssemblyAI API key first');
        setStatus(`Connected to ${selectedDevice?.name || 'device'}`);
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

  const navigateToTranscription = (transcription) => {
    navigation.navigate('TranscriptionDetail', { transcription });
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
            <View>
              <TouchableOpacity 
                style={[styles.scanButton, isScanning && styles.disabledButton]} 
                onPress={handleScanDevices}
                disabled={isScanning || isConnecting}
              >
                <Text style={styles.buttonText}>
                  {isScanning ? '🔄 Scanning...' : '🔍 Scan for Devices'}
                </Text>
              </TouchableOpacity>
              
              {discoveredDevices.length > 0 && (
                <View style={styles.deviceList}>
                  <Text style={styles.deviceListTitle}>Found Devices:</Text>
                  {discoveredDevices.map((device, index) => (
                    <TouchableOpacity 
                      key={device.id}
                      style={[
                        styles.deviceItem,
                        selectedDevice?.id === device.id && styles.selectedDevice
                      ]}
                      onPress={() => setSelectedDevice(device)}
                    >
                      <Text style={styles.deviceName}>{device.name}</Text>
                      <Text style={styles.deviceId}>RSSI: {device.rssi}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              
              {selectedDevice && (
                <TouchableOpacity 
                  style={[styles.connectButton, isConnecting && styles.disabledButton]} 
                  onPress={handleConnectToSelectedDevice}
                  disabled={isConnecting}
                >
                  <Text style={styles.buttonText}>
                    {isConnecting ? '🔄 Connecting...' : `Connect to ${selectedDevice.name}`}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity 
              style={[styles.connectButton, { backgroundColor: '#dc3545' }, isDisconnecting && styles.disabledButton]} 
              onPress={handleDisconnectDevice}
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
                  onPress={() => navigateToTranscription(item)}
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
  scanButton: {
    backgroundColor: '#17a2b8',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceList: {
    marginBottom: 12,
  },
  deviceListTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  deviceItem: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 4,
    padding: 10,
    marginBottom: 6,
  },
  selectedDevice: {
    borderColor: '#007bff',
    backgroundColor: '#1a2332',
  },
  deviceName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deviceId: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
});