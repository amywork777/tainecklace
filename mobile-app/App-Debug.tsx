import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';

export default function App() {
  const [status, setStatus] = React.useState('App loaded successfully');

  React.useEffect(() => {
    console.log('🔄 App starting...');
    
    // Test each import individually
    try {
      console.log('✅ React Native imports working');
      setStatus('Basic app working');
    } catch (error) {
      console.error('❌ Basic app error:', error);
      setStatus(`Error: ${error.message}`);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>TaiNecklace Debug</Text>
        <Text style={styles.status}>{status}</Text>
        <Text style={styles.info}>
          If you see this, the app loads successfully.{'\n'}
          Crash must be in BLE or service imports.
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
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 20,
  },
  status: {
    fontSize: 16,
    color: '#007bff',
    marginBottom: 20,
    textAlign: 'center',
  },
  info: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
});