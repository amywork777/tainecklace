import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  transcriptions?: any[];
  savedChats?: any[];
  aiChatService?: any;
}

export default function SettingsModal({ 
  visible, 
  onClose, 
  transcriptions = [], 
  savedChats = [], 
  aiChatService 
}: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState('Ready to connect');
  const [isBackgroundCapable, setIsBackgroundCapable] = useState(false);
  const [backgroundStatus, setBackgroundStatus] = useState('');
  const [storageStatus, setStorageStatus] = useState({ local: 0, cloudEnabled: false });

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible, transcriptions, savedChats]);

  const loadSettings = async () => {
    try {
      // Load API keys
      const savedApiKey = await AsyncStorage.getItem('assemblyai_api_key');
      const savedOpenaiKey = await AsyncStorage.getItem('openai_api_key');
      if (savedApiKey) setApiKey(savedApiKey);
      if (savedOpenaiKey) setOpenaiKey(savedOpenaiKey);

      // Load device and storage status
      setStorageStatus({
        local: transcriptions.length,
        cloudEnabled: false // For now, cloud sync is disabled
      });
      
      // Set default device status - this would normally check for actual BLE connection
      setIsConnected(false);
      setStatus('No device connected');
      setIsBackgroundCapable(false);
      setBackgroundStatus('Background recording disabled');
    } catch (error) {
      console.error('❌ Error loading settings:', error);
    }
  };

  const handleSaveApiKey = async () => {
    try {
      await AsyncStorage.setItem('assemblyai_api_key', apiKey);
      Alert.alert('Success', 'AssemblyAI API key saved successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save AssemblyAI API key');
    }
  };

  const handleSaveOpenaiKey = async () => {
    try {
      await AsyncStorage.setItem('openai_api_key', openaiKey);
      
      // Update the AI service with the new key if available
      if (aiChatService?.current) {
        await aiChatService.current.updateApiKey(openaiKey);
      }
      
      Alert.alert('Success', 'OpenAI API key saved successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save OpenAI API key');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.settingsModalContainer}>
        {/* Settings Header */}
        <View style={styles.settingsHeader}>
          <TouchableOpacity onPress={onClose}>
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
              <TouchableOpacity style={styles.settingsSaveButton} onPress={handleSaveOpenaiKey}>
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
              
              <Text style={[styles.settingsLabel, {marginTop: 16}]}>Background Recording</Text>
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
              
              <Text style={[styles.settingsLabel, {marginTop: 16}]}>Cloud Sync</Text>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  settingsModalContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  settingsHeader: {
    backgroundColor: '#5A7FFF',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsBackText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  settingsTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 60,
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
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  settingsCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  settingsLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  settingsDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  settingsInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
    marginBottom: 16,
  },
  settingsSaveButton: {
    backgroundColor: '#5A7FFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  settingsSaveButtonText: {
    color: '#ffffff',
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
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  connectedBadge: {
    backgroundColor: '#D1FAE5',
    borderColor: '#A7F3D0',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  connectedBadgeText: {
    color: '#059669',
  },
});