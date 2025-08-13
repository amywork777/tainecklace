import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';

export default function App() {
  const [status, setStatus] = useState('App loaded successfully!');

  const testFunction = () => {
    setStatus('Test button works!');
    Alert.alert('Success', 'App is running correctly');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TaiNecklace Debug</Text>
        <Text style={styles.subtitle}>Crash Test Version</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.status}>{status}</Text>
        
        <TouchableOpacity style={styles.testButton} onPress={testFunction}>
          <Text style={styles.buttonText}>Test App</Text>
        </TouchableOpacity>
        
        <Text style={styles.info}>
          If you can see this and tap the button, the app is not crashing.
          The crash is likely from BLE or transcription service imports.
        </Text>
      </View>
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
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  status: {
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
  },
  testButton: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 30,
    minWidth: 150,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  info: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});