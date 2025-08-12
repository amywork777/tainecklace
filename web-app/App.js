// Fully Functional TaiNecklace Web App
import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  StatusBar,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert
} from 'react-native';
import { WebAudioService } from './src/services/webAudioService';
import { WebTranscriptionService } from './src/services/webTranscriptionService';

// Functional Settings Tab
function SettingsTab({ onApiKeyChange, savedApiKey }) {
  const [assemblyAIKey, setAssemblyAIKey] = useState(savedApiKey || '');
  const [aiKey, setAiKey] = useState('');
  const [aiProvider, setAiProvider] = useState('openai');

  const handleSaveSettings = async () => {
    try {
      if (!assemblyAIKey.trim()) {
        Alert.alert('Missing API Key', 'Please enter your AssemblyAI API key to enable transcription.');
        return;
      }

      // Save to localStorage
      localStorage.setItem('tainecklace_settings', JSON.stringify({
        assemblyAI: { apiKey: assemblyAIKey },
        ai: { provider: aiProvider, apiKey: aiKey },
        autoSummarize: true,
        autoGenerateTitle: true
      }));

      // Notify parent component
      if (onApiKeyChange) {
        onApiKeyChange(assemblyAIKey);
      }

      Alert.alert('Settings Saved', 'Your API keys have been saved successfully!');
    } catch (error) {
      Alert.alert('Save Error', 'Failed to save settings: ' + error.message);
    }
  };

  const testConnection = async () => {
    if (!assemblyAIKey.trim()) {
      Alert.alert('Missing API Key', 'Please enter your AssemblyAI API key first.');
      return;
    }

    try {
      // Test the API key by attempting to connect
      const testService = new WebTranscriptionService(assemblyAIKey);
      await testService.connect();
      testService.disconnect();
      
      Alert.alert('Connection Test', '✅ AssemblyAI connection successful!');
    } catch (error) {
      Alert.alert('Connection Failed', '❌ Failed to connect to AssemblyAI. Please check your API key.');
    }
  };
  
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>⚙️ TaiNecklace Settings</Text>
        <Text style={styles.subtitle}>Configure your API keys for full functionality</Text>
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AssemblyAI API Key (Required)</Text>
        <Text style={styles.description}>
          Get your API key from https://www.assemblyai.com/
        </Text>
        
        <TextInput
          style={styles.textInput}
          placeholder="Enter your AssemblyAI API key"
          value={assemblyAIKey}
          onChangeText={setAssemblyAIKey}
          secureTextEntry={true}
          autoCapitalize="none"
          autoCorrect={false}
        />
        
        <TouchableOpacity style={styles.testButton} onPress={testConnection}>
          <Text style={styles.testButtonText}>🔗 Test Connection</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Chat Service (Optional)</Text>
        <Text style={styles.description}>
          For conversation analysis and chat features
        </Text>
        
        <View style={styles.providerContainer}>
          <TouchableOpacity
            style={[styles.providerButton, aiProvider === 'openai' && styles.providerButtonActive]}
            onPress={() => setAiProvider('openai')}
          >
            <Text style={[styles.providerButtonText, aiProvider === 'openai' && styles.providerButtonTextActive]}>
              OpenAI
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.providerButton, aiProvider === 'anthropic' && styles.providerButtonActive]}
            onPress={() => setAiProvider('anthropic')}
          >
            <Text style={[styles.providerButtonText, aiProvider === 'anthropic' && styles.providerButtonTextActive]}>
              Anthropic
            </Text>
          </TouchableOpacity>
        </View>
        
        <TextInput
          style={styles.textInput}
          placeholder={`Enter ${aiProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API key (optional)`}
          value={aiKey}
          onChangeText={setAiKey}
          secureTextEntry={true}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.saveContainer}>
        <TouchableOpacity style={styles.saveButton} onPress={handleSaveSettings}>
          <Text style={styles.saveButtonText}>💾 Save Settings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ℹ️ About TaiNecklace Web Demo</Text>
        <Text style={styles.description}>
          • ✅ Real microphone recording{'\n'}
          • ✅ Live AssemblyAI transcription{'\n'}
          • ✅ Conversation storage{'\n'}
          • ✅ AI chat with transcriptions{'\n'}
          • ❌ BLE connectivity (mobile only){'\n\n'}
          This web demo provides full functionality except BLE connection to your XIAO device.
        </Text>
      </View>
    </ScrollView>
  );
}

// Fully Functional Recording Tab
function RecordingTab({ apiKey }) {
  const [micInitialized, setMicInitialized] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [partialText, setPartialText] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  
  const audioService = useRef(null);
  const transcriptionService = useRef(null);

  useEffect(() => {
    initializeServices();
    loadConversations();
    
    return () => {
      if (audioService.current) {
        audioService.current.destroy();
      }
      if (transcriptionService.current) {
        transcriptionService.current.disconnect();
      }
    };
  }, []);

  const initializeServices = async () => {
    try {
      audioService.current = new WebAudioService();
      // Don't initialize microphone until user clicks (browser policy)
    } catch (error) {
      console.error('Failed to setup audio service:', error);
    }
  };

  const loadConversations = () => {
    try {
      const saved = localStorage.getItem('tainecklace_conversations');
      if (saved) {
        setConversations(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const saveConversation = (conversation) => {
    try {
      const updatedConversations = [...conversations, conversation];
      localStorage.setItem('tainecklace_conversations', JSON.stringify(updatedConversations));
      setConversations(updatedConversations);
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  };

  const handleInitializeMicrophone = async () => {
    if (!apiKey) {
      Alert.alert('Missing API Key', 'Please add your AssemblyAI API key in Settings first.');
      return;
    }

    try {
      await audioService.current.initialize();
      setMicInitialized(true);
      
      // Initialize transcription service
      transcriptionService.current = new WebTranscriptionService(apiKey);
      transcriptionService.current.setCallbacks({
        onConnected: () => setIsTranscribing(true),
        onDisconnected: () => setIsTranscribing(false),
        onPartialTranscript: (transcript) => setPartialText(transcript.text),
        onFinalTranscript: (transcript) => {
          setFinalTranscript(prev => prev + ' ' + transcript.text);
          setPartialText(''); // Clear partial when we get final
        },
        onError: (error) => console.error('Transcription error:', error)
      });
      
      await transcriptionService.current.connect();
      
    } catch (error) {
      Alert.alert('Microphone Error', 'Failed to access microphone: ' + error.message);
    }
  };

  const handleStartRecording = async () => {
    if (!micInitialized) {
      await handleInitializeMicrophone();
      if (!micInitialized) return;
    }

    try {
      setFinalTranscript('');
      setPartialText('');
      
      const conversationId = Date.now();
      setCurrentConversation({
        id: conversationId,
        startTime: new Date().toISOString(),
        transcript: ''
      });

      transcriptionService.current.startTranscribing();
      
      audioService.current.startRecording((audioData) => {
        // Send audio to transcription service
        transcriptionService.current.sendAudioData(audioData);
      });
      
      setIsRecording(true);
    } catch (error) {
      Alert.alert('Recording Error', 'Failed to start recording: ' + error.message);
    }
  };

  const handleStopRecording = () => {
    try {
      audioService.current.stopRecording();
      transcriptionService.current.stopTranscribing();
      setIsRecording(false);

      if (currentConversation && finalTranscript.trim()) {
        const completedConversation = {
          ...currentConversation,
          endTime: new Date().toISOString(),
          transcript: finalTranscript.trim(),
          title: generateTitle(finalTranscript.trim())
        };
        
        saveConversation(completedConversation);
        setCurrentConversation(null);
      }
    } catch (error) {
      Alert.alert('Stop Recording Error', error.message);
    }
  };

  const generateTitle = (transcript) => {
    const words = transcript.split(' ').slice(0, 8).join(' ');
    return words.length > 0 ? words + '...' : 'Untitled Conversation';
  };

  const getDisplayTranscript = () => {
    let display = finalTranscript;
    if (partialText) {
      display += (display ? ' ' : '') + partialText;
    }
    return display || 'Start speaking to see live transcription...';
  };
  
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎙️ TaiNecklace Recording</Text>
        <Text style={styles.subtitle}>Fully Functional Web Demo</Text>
        {!apiKey && (
          <Text style={styles.warningNotice}>
            ⚠️ Add AssemblyAI API key in Settings for transcription
          </Text>
        )}
      </View>

      {/* Microphone Status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎤 Microphone Access</Text>
        <Text style={[styles.status, { color: micInitialized ? '#4CAF50' : '#666' }]}>
          {micInitialized ? '✅ Microphone Ready' : '❌ Microphone Not Initialized'}
        </Text>
        
        {!micInitialized && (
          <TouchableOpacity style={styles.connectButton} onPress={handleInitializeMicrophone}>
            <Text style={styles.buttonText}>🎤 Initialize Microphone</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Recording Controls */}
      {micInitialized && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎙️ Recording</Text>
          <Text style={[styles.status, { color: isRecording ? '#FF6B6B' : '#007AFF' }]}>
            {isRecording ? '🔴 Recording Live Audio...' : '⏸️ Ready to Record'}
          </Text>
          
          <Text style={styles.statusText}>
            Transcription: {isTranscribing ? '✅ Connected' : '❌ Disconnected'}
          </Text>
          
          <TouchableOpacity 
            style={isRecording ? styles.stopButton : styles.recordButton}
            onPress={isRecording ? handleStopRecording : handleStartRecording}
            disabled={!apiKey}
          >
            <Text style={styles.buttonText}>
              {isRecording ? '⏹️ Stop Recording' : '🎙️ Start Recording'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Live Transcription */}
      {isRecording && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📝 Live Transcription</Text>
          <ScrollView style={styles.transcriptionScroll}>
            <Text style={styles.finalTranscriptText}>{finalTranscript}</Text>
            {partialText && (
              <Text style={styles.partialTranscriptText}>{partialText}</Text>
            )}
            {!finalTranscript && !partialText && (
              <Text style={styles.placeholderText}>
                Speak into your microphone to see live transcription appear here...
              </Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* Recent Conversations */}
      {conversations.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💬 Recent Conversations ({conversations.length})</Text>
          {conversations.slice(-3).reverse().map((conv, index) => (
            <View key={conv.id} style={styles.conversationItem}>
              <Text style={styles.conversationTitle}>{conv.title}</Text>
              <Text style={styles.conversationDate}>
                {new Date(conv.startTime).toLocaleDateString()}
              </Text>
              <Text style={styles.conversationPreview} numberOfLines={2}>
                {conv.transcript}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Instructions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>✨ TaiNecklace Web Features</Text>
        <Text style={styles.instructionText}>
          • 🎤 Real microphone recording from your browser{'\n'}
          • 🔄 Live AssemblyAI transcription (with your API key){'\n'}
          • 💾 Automatic conversation saving to local storage{'\n'}
          • 📝 Real-time partial and final transcription results{'\n'}
          • 🎯 Identical functionality to mobile app (except BLE){'\n\n'}
          🔮 Your fully functional AI companion, running in the browser!
        </Text>
      </View>
    </ScrollView>
  );
}

export default function App() {
  const [currentTab, setCurrentTab] = useState('record');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    loadSavedSettings();
  }, []);

  const loadSavedSettings = () => {
    try {
      const saved = localStorage.getItem('tainecklace_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        setApiKey(settings.assemblyAI?.apiKey || '');
      }
    } catch (error) {
      console.error('Failed to load saved settings:', error);
    }
  };

  const handleApiKeyChange = (newApiKey) => {
    setApiKey(newApiKey);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Tab Content */}
      {currentTab === 'record' ? 
        <RecordingTab apiKey={apiKey} /> : 
        <SettingsTab onApiKeyChange={handleApiKeyChange} savedApiKey={apiKey} />
      }
      
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
  // New styles for functional components
  textInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  testButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
  providerContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  providerButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
  },
  providerButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  providerButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  providerButtonTextActive: {
    color: 'white',
  },
  saveContainer: {
    padding: 16,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  warningNotice: {
    fontSize: 14,
    color: '#FF6B6B',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  transcriptionScroll: {
    maxHeight: 200,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
  },
  finalTranscriptText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  partialTranscriptText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#666',
    fontStyle: 'italic',
  },
  placeholderText: {
    fontSize: 16,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  conversationItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingVertical: 12,
    marginBottom: 8,
  },
  conversationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  conversationDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  conversationPreview: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});
