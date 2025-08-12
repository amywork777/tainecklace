import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// AsyncStorage import - with web fallback
let AsyncStorage;
if (typeof window !== 'undefined') {
  // Web environment - use localStorage
  AsyncStorage = {
    getItem: (key) => Promise.resolve(localStorage.getItem(key)),
    setItem: (key, value) => {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
  };
} else {
  // React Native environment
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
}

export default function SettingsScreen({ orchestrator }) {
  const [settings, setSettings] = useState({
    assemblyAI: { apiKey: '' },
    ai: { provider: 'openai', apiKey: '' },
    autoSummarize: true,
    autoGenerateTitle: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await AsyncStorage.getItem('appSettings');
      if (stored) {
        const parsedSettings = JSON.parse(stored);
        setSettings(prevSettings => ({ ...prevSettings, ...parsedSettings }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const updateSetting = (path, value) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      const keys = path.split('.');
      let current = newSettings;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newSettings;
    });
    setHasChanges(true);
  };

  const saveSettings = async () => {
    try {
      setIsSaving(true);
      
      // Save to AsyncStorage
      await AsyncStorage.setItem('appSettings', JSON.stringify(settings));
      
      // Update orchestrator if available
      if (orchestrator) {
        await orchestrator.saveSettings(settings);
      }
      
      setHasChanges(false);
      Alert.alert('Settings Saved', 'Your settings have been saved successfully.');
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      Alert.alert('Save Error', 'Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const testAssemblyAI = async () => {
    if (!settings.assemblyAI.apiKey) {
      Alert.alert('Missing API Key', 'Please enter your AssemblyAI API key first.');
      return;
    }

    Alert.alert(
      'Test AssemblyAI',
      'This would test the AssemblyAI connection. For now, save your settings and try recording.',
      [{ text: 'OK' }]
    );
  };

  const testAI = async () => {
    if (!settings.ai.apiKey) {
      Alert.alert('Missing API Key', 'Please enter your AI API key first.');
      return;
    }

    Alert.alert(
      'Test AI Service',
      'This would test the AI service connection. For now, save your settings and try the chat features.',
      [{ text: 'OK' }]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>⚙️ TaiNecklace Settings</Text>
        <Text style={styles.subtitle}>Configure your API keys and preferences</Text>
      </View>

      {/* AssemblyAI Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AssemblyAI (Required for transcription)</Text>
        <Text style={styles.sectionDescription}>
          Get your API key from https://www.assemblyai.com/
        </Text>
        
        <TextInput
          style={styles.input}
          placeholder="Enter AssemblyAI API Key"
          value={settings.assemblyAI.apiKey}
          onChangeText={(value) => updateSetting('assemblyAI.apiKey', value)}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        
        <TouchableOpacity style={styles.testButton} onPress={testAssemblyAI}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#007AFF" />
          <Text style={styles.testButtonText}>Test Connection</Text>
        </TouchableOpacity>
      </View>

      {/* AI Service Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Service (Optional)</Text>
        <Text style={styles.sectionDescription}>
          For chat, summarization, and insights
        </Text>
        
        {/* Provider Selection */}
        <View style={styles.providerContainer}>
          <TouchableOpacity
            style={[
              styles.providerButton,
              settings.ai.provider === 'openai' && styles.providerButtonActive
            ]}
            onPress={() => updateSetting('ai.provider', 'openai')}
          >
            <Text style={[
              styles.providerButtonText,
              settings.ai.provider === 'openai' && styles.providerButtonTextActive
            ]}>
              OpenAI
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[
              styles.providerButton,
              settings.ai.provider === 'anthropic' && styles.providerButtonActive
            ]}
            onPress={() => updateSetting('ai.provider', 'anthropic')}
          >
            <Text style={[
              styles.providerButtonText,
              settings.ai.provider === 'anthropic' && styles.providerButtonTextActive
            ]}>
              Anthropic
            </Text>
          </TouchableOpacity>
        </View>
        
        <TextInput
          style={styles.input}
          placeholder={`Enter ${settings.ai.provider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key`}
          value={settings.ai.apiKey}
          onChangeText={(value) => updateSetting('ai.apiKey', value)}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        
        <TouchableOpacity style={styles.testButton} onPress={testAI}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#007AFF" />
          <Text style={styles.testButtonText}>Test Connection</Text>
        </TouchableOpacity>
      </View>

      {/* App Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Preferences</Text>
        
        <View style={styles.switchRow}>
          <View style={styles.switchLabel}>
            <Text style={styles.switchLabelText}>Auto-generate titles</Text>
            <Text style={styles.switchLabelDescription}>
              Automatically create titles for conversations
            </Text>
          </View>
          <Switch
            value={settings.autoGenerateTitle}
            onValueChange={(value) => updateSetting('autoGenerateTitle', value)}
            trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
            thumbColor="#FFFFFF"
          />
        </View>
        
        <View style={styles.switchRow}>
          <View style={styles.switchLabel}>
            <Text style={styles.switchLabelText}>Auto-summarize conversations</Text>
            <Text style={styles.switchLabelDescription}>
              Generate AI summaries after recording
            </Text>
          </View>
          <Switch
            value={settings.autoSummarize}
            onValueChange={(value) => updateSetting('autoSummarize', value)}
            trackColor={{ false: '#E5E5EA', true: '#007AFF' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* Save Button */}
      <View style={styles.saveContainer}>
        <TouchableOpacity
          style={[
            styles.saveButton,
            !hasChanges && styles.saveButtonDisabled,
            isSaving && styles.saveButtonDisabled
          ]}
          onPress={saveSettings}
          disabled={!hasChanges || isSaving}
        >
          <Text style={[
            styles.saveButtonText,
            !hasChanges && styles.saveButtonTextDisabled
          ]}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsSection}>
        <Text style={styles.instructionsTitle}>Setup Instructions:</Text>
        <Text style={styles.instructionText}>
          1. Create an AssemblyAI account and get your API key
        </Text>
        <Text style={styles.instructionText}>
          2. (Optional) Get an OpenAI or Anthropic API key for AI features
        </Text>
        <Text style={styles.instructionText}>
          3. Enter your API keys above and save
        </Text>
        <Text style={styles.instructionText}>
          4. Go back to recording to test the connection
        </Text>
      </View>
    </ScrollView>
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
    textAlign: 'center',
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
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FAFAFA',
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
  },
  testButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  providerContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  providerButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
    marginRight: 8,
    borderRadius: 8,
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  switchLabel: {
    flex: 1,
    marginRight: 16,
  },
  switchLabelText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  switchLabelDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  saveContainer: {
    padding: 16,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#E5E5EA',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  saveButtonTextDisabled: {
    color: '#999',
  },
  instructionsSection: {
    margin: 16,
    padding: 20,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
  },
  instructionsTitle: {
    fontSize: 16,
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
});