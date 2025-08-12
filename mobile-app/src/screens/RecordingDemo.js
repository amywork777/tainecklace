import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function RecordingDemo({ orchestrator }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [transcriptionText, setTranscriptionText] = useState('');
  const [partialText, setPartialText] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [stats, setStats] = useState({});
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (!orchestrator) return;

    // Set up event listeners
    orchestrator.on('deviceConnected', (deviceName) => {
      setIsConnected(true);
      setConnectionStatus(`Connected to ${deviceName}`);
      setIsConnecting(false);
    });

    orchestrator.on('deviceDisconnected', () => {
      setIsConnected(false);
      setConnectionStatus('Disconnected');
      setIsRecording(false);
      setIsConnecting(false);
    });

    orchestrator.on('recordingStarted', (convId) => {
      setIsRecording(true);
      setConversationId(convId);
      setTranscriptionText('');
      setPartialText('');
      console.log('Recording started:', convId);
    });

    orchestrator.on('recordingStopped', (convId) => {
      setIsRecording(false);
      console.log('Recording stopped:', convId);
    });

    orchestrator.on('partialTranscript', (transcript) => {
      setPartialText(transcript.text);
    });

    orchestrator.on('finalTranscript', (transcript) => {
      setTranscriptionText(prev => prev + ' ' + transcript.text);
      setPartialText(''); // Clear partial text when we get final
    });

    orchestrator.on('transcriberConnected', () => {
      console.log('Transcriber connected');
    });

    orchestrator.on('audioProcessed', (data) => {
      // Could show audio level indicators here
    });

    orchestrator.on('error', (error) => {
      console.error('Orchestrator error:', error);
      Alert.alert('Error', `${error.source}: ${error.error.message || error.error}`);
      setIsConnecting(false);
    });

    return () => {
      // Clean up listeners
      orchestrator.removeAllListeners();
    };
  }, [orchestrator]);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setConnectionStatus('Connecting...');
      await orchestrator.connectToDevice();
    } catch (error) {
      console.error('Connection error:', error);
      Alert.alert('Connection Error', error.message);
      setIsConnecting(false);
      setConnectionStatus('Connection failed');
    }
  };

  const handleDisconnect = async () => {
    try {
      await orchestrator.disconnectDevice();
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  const handleStartRecording = async () => {
    if (!isConnected) {
      Alert.alert('Not Connected', 'Please connect to your device first');
      return;
    }

    try {
      await orchestrator.startRecording();
    } catch (error) {
      console.error('Recording start error:', error);
      Alert.alert('Recording Error', error.message);
    }
  };

  const handleStopRecording = async () => {
    try {
      await orchestrator.stopRecording();
    } catch (error) {
      console.error('Recording stop error:', error);
    }
  };

  const formatTranscript = () => {
    let fullText = transcriptionText;
    if (partialText) {
      fullText += ' ' + partialText;
    }
    return fullText.trim();
  };

  if (!orchestrator) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>App not initialized</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎙️ TaiNecklace Recording</Text>
        <Text style={styles.subtitle}>
          {typeof window !== 'undefined' ? 'Web Demo - UI Test Mode' : 'Test your BLE audio streaming'}
        </Text>
        {typeof window !== 'undefined' && (
          <Text style={styles.webNotice}>
            📱 BLE features require mobile app. This is a UI demo.
          </Text>
        )}
      </View>

      {/* Connection Status */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Ionicons 
            name={isConnected ? 'bluetooth' : 'bluetooth-outline'} 
            size={24} 
            color={isConnected ? '#4CAF50' : '#666'} 
          />
          <Text style={[styles.statusText, { color: isConnected ? '#4CAF50' : '#666' }]}>
            {connectionStatus}
          </Text>
          {isConnecting && <ActivityIndicator size="small" color="#007AFF" />}
        </View>
        
        {!isConnected ? (
          <TouchableOpacity 
            style={styles.connectButton} 
            onPress={handleConnect}
            disabled={isConnecting}
          >
            <Text style={styles.connectButtonText}>
              {isConnecting ? 'Connecting...' : 'Connect to Device'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
            <Text style={styles.disconnectButtonText}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Recording Controls */}
      {isConnected && (
        <View style={styles.recordingCard}>
          <View style={styles.recordingHeader}>
            <Ionicons 
              name={isRecording ? 'mic' : 'mic-outline'} 
              size={32} 
              color={isRecording ? '#FF6B6B' : '#007AFF'} 
            />
            <Text style={styles.recordingStatus}>
              {isRecording ? 'Recording...' : 'Ready to Record'}
            </Text>
          </View>

          {!isRecording ? (
            <TouchableOpacity style={styles.recordButton} onPress={handleStartRecording}>
              <Text style={styles.recordButtonText}>Start Recording</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopButton} onPress={handleStopRecording}>
              <Text style={styles.stopButtonText}>Stop Recording</Text>
            </TouchableOpacity>
          )}

          {conversationId && (
            <Text style={styles.conversationId}>
              Conversation ID: {conversationId}
            </Text>
          )}
        </View>
      )}

      {/* Live Transcription */}
      {isRecording && (
        <View style={styles.transcriptionCard}>
          <Text style={styles.transcriptionHeader}>Live Transcription</Text>
          <ScrollView style={styles.transcriptionScroll}>
            <Text style={styles.transcriptionText}>
              {formatTranscript() || 'Listening... Start speaking to see transcription appear here.'}
            </Text>
            {partialText && (
              <Text style={styles.partialText}>
                {partialText}
              </Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* Instructions */}
      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsHeader}>How to use:</Text>
        <Text style={styles.instructionText}>1. Make sure your XIAO device is powered on</Text>
        <Text style={styles.instructionText}>2. Tap "Connect to Device" to establish BLE connection</Text>
        <Text style={styles.instructionText}>3. Set your AssemblyAI API key in settings</Text>
        <Text style={styles.instructionText}>4. Tap "Start Recording" to begin live transcription</Text>
        <Text style={styles.instructionText}>5. Speak clearly into your device microphone</Text>
        <Text style={styles.instructionText}>6. Tap "Stop Recording" when finished</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  statusCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusText: {
    fontSize: 16,
    marginLeft: 12,
    flex: 1,
    fontWeight: '500',
  },
  connectButton: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  connectButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  disconnectButton: {
    backgroundColor: '#FF6B6B',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  disconnectButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  recordingCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  recordingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  recordingStatus: {
    fontSize: 18,
    marginLeft: 12,
    fontWeight: '600',
    color: '#333',
  },
  recordButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  recordButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  stopButton: {
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  stopButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  conversationId: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  transcriptionCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  transcriptionHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  transcriptionScroll: {
    maxHeight: 200,
  },
  transcriptionText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  partialText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#666',
    fontStyle: 'italic',
  },
  instructionsCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  instructionsHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    paddingLeft: 8,
  },
  errorText: {
    fontSize: 18,
    color: '#FF6B6B',
    textAlign: 'center',
    marginTop: 50,
  },
  webNotice: {
    fontSize: 14,
    color: '#FF8C00',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
});