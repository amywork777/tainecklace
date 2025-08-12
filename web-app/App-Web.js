import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  View, 
  StatusBar,
  Text,
  TouchableOpacity,
  ScrollView
} from 'react-native';

// Simple web-compatible version of TaiNecklace for testing
function SettingsTab() {
  const [apiKey, setApiKey] = useState('');
  
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>⚙️ TaiNecklace Settings</Text>
        <Text style={styles.subtitle}>Configure your API keys</Text>
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AssemblyAI API Key</Text>
        <Text style={styles.description}>
          Get your API key from https://www.assemblyai.com/
        </Text>
        
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>API Key:</Text>
          <Text style={styles.inputPlaceholder}>
            [Enter your AssemblyAI API key here]
          </Text>
        </View>
        
        <TouchableOpacity style={styles.button}>
          <Text style={styles.buttonText}>Save Settings</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function RecordingTab() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎙️ TaiNecklace Recording</Text>
        <Text style={styles.subtitle}>Web Demo - UI Test Mode</Text>
        <Text style={styles.webNotice}>
          📱 BLE features require mobile app. This is a UI demo.
        </Text>
      </View>

      {/* Connection Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device Connection</Text>
        <Text style={[styles.status, { color: isConnected ? '#4CAF50' : '#666' }]}>
          {isConnected ? '✅ Connected to XIAO Device' : '❌ Disconnected'}
        </Text>
        
        <TouchableOpacity 
          style={isConnected ? styles.disconnectButton : styles.connectButton}
          onPress={() => setIsConnected(!isConnected)}
        >
          <Text style={styles.buttonText}>
            {isConnected ? 'Disconnect' : 'Connect to Device'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Recording Controls */}
      {isConnected && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recording</Text>
          <Text style={[styles.status, { color: isRecording ? '#FF6B6B' : '#007AFF' }]}>
            {isRecording ? '🎙️ Recording...' : '⏸️ Ready to Record'}
          </Text>
          
          <TouchableOpacity 
            style={isRecording ? styles.stopButton : styles.recordButton}
            onPress={() => setIsRecording(!isRecording)}
          >
            <Text style={styles.buttonText}>
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Live Transcription */}
      {isRecording && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Live Transcription</Text>
          <Text style={styles.transcriptionText}>
            This is where live transcription would appear as you speak into your TaiNecklace device. 
            The text would update in real-time using AssemblyAI's speech-to-text API.
            {'\n\n'}
            In the mobile app, this connects to your XIAO device via Bluetooth LE and streams 
            ADPCM audio for real-time transcription.
          </Text>
        </View>
      )}

      {/* Instructions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Instructions</Text>
        <Text style={styles.instructionText}>
          1. This is the web demo version of TaiNecklace{'\n'}
          2. The full app works on mobile with BLE connectivity{'\n'}
          3. Connect your XIAO device for live audio streaming{'\n'}
          4. Add your AssemblyAI API key in settings{'\n'}
          5. Enjoy real-time conversation transcription!
        </Text>
      </View>
    </ScrollView>
  );
}

export default function App() {
  const [currentTab, setCurrentTab] = useState('record');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Tab Content */}
      {currentTab === 'record' ? <RecordingTab /> : <SettingsTab />}
      
      {/* Bottom Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, currentTab === 'record' && styles.activeTab]}
          onPress={() => setCurrentTab('record')}
        >
          <Text style={[styles.tabText, currentTab === 'record' && styles.activeTabText]}>
            🎙️ Record
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tab, currentTab === 'settings' && styles.activeTab]}
          onPress={() => setCurrentTab('settings')}
        >
          <Text style={[styles.tabText, currentTab === 'settings' && styles.activeTabText]}>
            ⚙️ Settings
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    marginBottom: 16,
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
    textAlign: 'center',
  },
  webNotice: {
    fontSize: 14,
    color: '#FF8C00',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  status: {
    fontSize: 16,
    marginBottom: 16,
    fontWeight: '500',
  },
  connectButton: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  disconnectButton: {
    backgroundColor: '#FF6B6B',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  recordButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  transcriptionText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  instructionText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#666',
  },
  section: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  inputPlaceholder: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  tab: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#F0F8FF',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
});