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
import { XiaoBLEManager } from './src/services/bleManager';
import { TranscriptionService } from './src/services/TranscriptionService';

const ASSEMBLYAI_KEY = 'your-assemblyai-api-key-here';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
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

  const bleManager = useRef(null);
  const transcriptionService = useRef(null);
  const audioBuffer = useRef([]);
  const statsInterval = useRef(null);

  useEffect(() => {
    initializeApp();
    return cleanup;
  }, []);

  const initializeApp = async () => {
    try {
      // Load saved API key
      const savedKey = await AsyncStorage.getItem('assemblyai_key');
      if (savedKey) {
        setApiKey(savedKey);
        transcriptionService.current = new TranscriptionService(savedKey);
      }

      // Load saved transcriptions
      const savedTranscriptions = await AsyncStorage.getItem('transcriptions');
      if (savedTranscriptions) {
        setTranscriptions(JSON.parse(savedTranscriptions));
      }

      // Request permissions
      await requestPermissions();
      
      // Initialize BLE Manager
      bleManager.current = new XiaoBLEManager();
      await bleManager.current.initialize();
      
      // Set up callbacks
      bleManager.current.setCallbacks({
        onAudioData: handleAudioData,
        onDisconnected: handleDisconnection,
      });

      setStatus('Ready to connect');
    } catch (error) {
      console.error('Initialization error:', error);
      setStatus(`Error: ${error.message}`);
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
    try {
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
    }
  };

  const handleDisconnection = () => {
    setIsConnected(false);
    setIsRecording(false);
    setStatus('Disconnected');
    
    if (statsInterval.current) {
      clearInterval(statsInterval.current);
      statsInterval.current = null;
    }
  };

  const handleAudioData = (pcmSamples) => {
    // Buffer audio data for batch transcription
    audioBuffer.current.push(...pcmSamples);
  };

  const handleStartRecording = () => {
    if (!isConnected) {
      Alert.alert('Error', 'XIAO device not connected');
      return;
    }
    
    // Clear previous audio buffer
    audioBuffer.current = [];
    setIsRecording(true);
    setTranscription('');
    setStatus('Recording...');
  };

  const handleStopRecording = async () => {
    if (!isRecording) return;
    
    setIsRecording(false);
    setStatus('Processing audio...');
    
    try {
      if (audioBuffer.current.length === 0) {
        Alert.alert('Error', 'No audio data recorded');
        setStatus('Connected to XIAO');
        return;
      }
      
      if (!transcriptionService.current) {
        Alert.alert('Error', 'Please set AssemblyAI API key first');
        setStatus('Connected to XIAO');
        return;
      }
      
      console.log(`🎵 Transcribing ${audioBuffer.current.length} audio samples...`);
      setIsTranscribing(true);
      
      const result = await transcriptionService.current.transcribeAudio(
        audioBuffer.current,
        16000 // Sample rate
      );
      
      const newTranscription = {
        id: Date.now(),
        text: result.text,
        confidence: result.confidence,
        timestamp: new Date().toISOString(),
        duration: audioBuffer.current.length / 16000 // seconds
      };
      
      setTranscription(result.text);
      
      // Add to transcriptions list
      const updatedTranscriptions = [newTranscription, ...transcriptions];
      setTranscriptions(updatedTranscriptions);
      
      // Save to storage
      await AsyncStorage.setItem('transcriptions', JSON.stringify(updatedTranscriptions));
      
      setStatus('Transcription complete');
      
    } catch (error) {
      console.error('Transcription error:', error);
      Alert.alert('Transcription Error', error.message);
      setStatus('Transcription failed');
    } finally {
      setIsTranscribing(false);
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

  const cleanup = () => {
    if (bleManager.current) {
      bleManager.current.destroy();
    }
    if (statsInterval.current) {
      clearInterval(statsInterval.current);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
          <Text style={styles.sectionTitle}>AssemblyAI Configuration</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter AssemblyAI API Key"
            placeholderTextColor="#888"
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry={true}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleSaveApiKey}>
            <Text style={styles.buttonText}>Save API Key</Text>
          </TouchableOpacity>
        </View>

        {/* Connection Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Device Connection</Text>
          <Text style={styles.status}>{status}</Text>
          
          {!isConnected ? (
            <TouchableOpacity style={styles.connectButton} onPress={handleConnectXIAO}>
              <Text style={styles.buttonText}>Connect to XIAO</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.connectButton, { backgroundColor: '#dc3545' }]} 
              onPress={() => bleManager.current?.disconnect()}
            >
              <Text style={styles.buttonText}>Disconnect</Text>
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
              <TouchableOpacity style={styles.stopButton} onPress={handleStopRecording}>
                <Text style={styles.recordButtonText}>⏹️ Stop Recording</Text>
              </TouchableOpacity>
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
        {transcription && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Latest Transcription</Text>
            <View style={styles.transcriptionBox}>
              <Text style={styles.transcriptionText}>{transcription}</Text>
            </View>
          </View>
        )}

        {/* Transcription History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transcription History</Text>
          {transcriptions.length === 0 ? (
            <Text style={styles.emptyText}>No transcriptions yet</Text>
          ) : (
            transcriptions.slice(0, 10).map((item, index) => (
              <View key={`transcription-${index}`} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyTime}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </Text>
                  <Text style={styles.historyDuration}>
                    {formatDuration(item.duration)}
                  </Text>
                </View>
                <Text style={styles.historyText}>{item.text}</Text>
                {item.confidence && (
                  <Text style={styles.confidence}>
                    Confidence: {(item.confidence * 100).toFixed(1)}%
                  </Text>
                )}
              </View>
            ))
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
  emptyText: {
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
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
    marginBottom: 8,
  },
  historyTime: {
    color: '#888',
    fontSize: 12,
  },
  historyDuration: {
    color: '#888',
    fontSize: 12,
  },
  historyText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  confidence: {
    color: '#28a745',
    fontSize: 12,
    marginTop: 4,
  },
});
