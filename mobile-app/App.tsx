import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import NotesScreen from './src/screens/NotesScreen';
import ChatScreen from './src/screens/ChatScreen';

export default function App() {
  const [activeTab, setActiveTab] = useState('Notes');

  return (
    <View style={styles.container}>
      {/* Screen Content */}
      <View style={styles.screenContainer}>
        {activeTab === 'Notes' ? <NotesScreen /> : <ChatScreen />}
      </View>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'Notes' && styles.activeTab]}
          onPress={() => setActiveTab('Notes')}
        >
          <Text style={styles.tabIcon}>
            {activeTab === 'Notes' ? '📝' : '📋'}
          </Text>
          <Text style={[styles.tabLabel, activeTab === 'Notes' && styles.activeLabel]}>
            Notes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'Chat' && styles.activeTab]}
          onPress={() => setActiveTab('Chat')}
        >
          <Text style={styles.tabIcon}>
            {activeTab === 'Chat' ? '💬' : '💭'}
          </Text>
          <Text style={[styles.tabLabel, activeTab === 'Chat' && styles.activeLabel]}>
            Chat
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 8,
    paddingBottom: 34, // Extra padding for home indicator on iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeTab: {
    backgroundColor: 'transparent',
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
  },
  activeLabel: {
    color: '#5A7FFF',
  },
});