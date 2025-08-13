import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  SafeAreaView,
} from 'react-native';

export default function App() {
  const [status, setStatus] = useState('Ready to connect');
  const [bleError, setBleError] = useState('');

  const testBLEImport = async () => {
    try {
      setStatus('Testing BLE import...');
      
      // Try to import BLE manager dynamically
      const { XiaoBLEManager } = await import('./src/services/bleManager');
      setStatus('✅ BLE import successful');
      
      // Try to create manager
      try {
        const manager = new XiaoBLEManager();
        setStatus('✅ BLE manager created successfully');
      } catch (error) {
        setBleError(`BLE Manager creation failed: ${error.message}`);
        setStatus('❌ BLE manager creation failed');
      }
      
    } catch (error) {
      setBleError(`BLE import failed: ${error.message}`);
      setStatus('❌ BLE import failed');
    }
  };

  const testTranscriptionImport = async () => {
    try {
      setStatus('Testing Transcription import...');
      
      const { TranscriptionService } = await import('./src/services/TranscriptionService');
      setStatus('✅ Transcription import successful');
      
      try {
        const service = new TranscriptionService('test-key');
        setStatus('✅ Transcription service created successfully');
      } catch (error) {
        setBleError(`Transcription creation failed: ${error.message}`);
        setStatus('❌ Transcription creation failed');
      }
      
    } catch (error) {
      setBleError(`Transcription import failed: ${error.message}`);
      setStatus('❌ Transcription import failed');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>TaiNecklace</Text>
        <Text style={styles.subtitle}>BLE Debug Version</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Import Tests</Text>
          <Text style={styles.status}>{status}</Text>
          
          {bleError ? (
            <Text style={styles.error}>{bleError}</Text>
          ) : null}
          
          <TouchableOpacity style={styles.testButton} onPress={testBLEImport}>
            <Text style={styles.buttonText}>Test BLE Import</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.testButton} onPress={testTranscriptionImport}>
            <Text style={styles.buttonText}>Test Transcription Import</Text>
          </TouchableOpacity>
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
  status: {
    color: '#888',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  error: {
    color: '#dc3545',
    marginBottom: 12,
    fontSize: 12,
  },
  testButton: {
    backgroundColor: '#007bff',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});