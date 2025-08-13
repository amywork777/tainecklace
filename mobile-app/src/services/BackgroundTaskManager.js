/**
 * Background Task Manager for TaiNecklace
 * Handles background recording and BLE connection maintenance
 */
// Try to import with fallbacks for missing native modules
let TaskManager, BackgroundFetch;
try {
  TaskManager = require('expo-task-manager');
  BackgroundFetch = require('expo-background-fetch');
} catch (error) {
  console.log('⚠️ Background task modules not available in this build');
  TaskManager = null;
  BackgroundFetch = null;
}
import { AppState } from 'react-native';

const BACKGROUND_RECORDING_TASK = 'background-recording-task';
const BACKGROUND_BLE_TASK = 'background-ble-task';

export class BackgroundTaskManager {
  constructor() {
    this.isBackgroundRecording = false;
    this.backgroundStartTime = null;
    this.backgroundAudioBuffer = [];
    this.callbacks = {};
    this.registeredTasks = new Set(); // Track successfully registered tasks
    
    // Register background tasks
    this.registerBackgroundTasks();
    
    // Listen for app state changes
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange.bind(this));
  }

  registerBackgroundTasks() {
    // Check if background modules are available
    if (!TaskManager || !BackgroundFetch) {
      console.log('⚠️ Background tasks not available - using AppState only');
      return;
    }

    // Background recording task
    TaskManager.defineTask(BACKGROUND_RECORDING_TASK, ({ data, error, executionInfo }) => {
      console.log('🔄 Background recording task executed');
      
      if (error) {
        console.error('❌ Background recording error:', error);
        return;
      }

      try {
        // This would be called periodically in the background
        this.maintainBackgroundRecording();
      } catch (err) {
        console.error('❌ Background task execution error:', err);
      }
    });

    // Background BLE maintenance task
    TaskManager.defineTask(BACKGROUND_BLE_TASK, ({ data, error, executionInfo }) => {
      console.log('🔄 Background BLE maintenance task executed');
      
      if (error) {
        console.error('❌ Background BLE error:', error);
        return;
      }

      try {
        // Maintain BLE connection health
        this.maintainBLEConnection();
      } catch (err) {
        console.error('❌ Background BLE task error:', err);
      }
    });
  }

  async startBackgroundRecording(bleManager, audioBuffer) {
    try {
      console.log('🎵 Starting background recording capability...');
      
      this.bleManager = bleManager;
      this.mainAudioBuffer = audioBuffer;
      this.isBackgroundRecording = true;
      
      // Check if background modules are available
      if (!BackgroundFetch || !TaskManager) {
        console.log('⚠️ Background tasks not available - using basic app state monitoring');
        console.log('✅ Basic background monitoring enabled');
        return;
      }
      
      // Register background fetch
      try {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_RECORDING_TASK, {
          minimumInterval: 1000, // 1 second minimum interval
          stopOnTerminate: false,
          startOnBoot: false,
        });
        this.registeredTasks.add(BACKGROUND_RECORDING_TASK);
        console.log('✅ Background recording task registered');
      } catch (error) {
        console.log('⚠️ Failed to register background recording task:', error.message);
      }
      
      // Register BLE maintenance task
      try {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_BLE_TASK, {
          minimumInterval: 5000, // 5 seconds for BLE maintenance
          stopOnTerminate: false,
          startOnBoot: false,
        });
        this.registeredTasks.add(BACKGROUND_BLE_TASK);
        console.log('✅ Background BLE task registered');
      } catch (error) {
        console.log('⚠️ Failed to register background BLE task:', error.message);
      }
      
      if (this.registeredTasks.size > 0) {
        console.log('✅ Full background recording enabled');
      } else {
        console.log('⚠️ No background tasks registered - using basic monitoring only');
      }
      
    } catch (error) {
      console.error('❌ Failed to start background recording:', error);
      // Don't throw error - fall back to basic monitoring
      console.log('📱 Falling back to basic app state monitoring');
    }
  }

  async stopBackgroundRecording() {
    try {
      console.log('⏹️ Stopping background recording...');
      
      this.isBackgroundRecording = false;
      this.backgroundStartTime = null;
      this.backgroundAudioBuffer = [];
      
      // Only unregister tasks that were successfully registered
      if (BackgroundFetch && TaskManager) {
        if (this.registeredTasks.has(BACKGROUND_RECORDING_TASK)) {
          try {
            await BackgroundFetch.unregisterTaskAsync(BACKGROUND_RECORDING_TASK);
            this.registeredTasks.delete(BACKGROUND_RECORDING_TASK);
            console.log('✅ Background recording task unregistered');
          } catch (error) {
            console.error('❌ Failed to unregister background recording task:', error.message);
          }
        }
        
        if (this.registeredTasks.has(BACKGROUND_BLE_TASK)) {
          try {
            await BackgroundFetch.unregisterTaskAsync(BACKGROUND_BLE_TASK);
            this.registeredTasks.delete(BACKGROUND_BLE_TASK);
            console.log('✅ Background BLE task unregistered');
          } catch (error) {
            console.error('❌ Failed to unregister background BLE task:', error.message);
          }
        }
      }
      
      console.log('✅ Background recording stopped');
      
    } catch (error) {
      console.error('❌ Failed to stop background recording:', error);
    }
  }

  handleAppStateChange(nextAppState) {
    console.log(`📱 App state changed to: ${nextAppState}`);
    
    if (nextAppState === 'background' && this.isBackgroundRecording) {
      console.log('🎵 App backgrounded during recording - maintaining connection...');
      this.backgroundStartTime = Date.now();
      
      // Notify callbacks about background state
      if (this.callbacks.onBackgroundStateChange) {
        this.callbacks.onBackgroundStateChange('background');
      }
      
    } else if (nextAppState === 'active' && this.backgroundStartTime) {
      const backgroundDuration = (Date.now() - this.backgroundStartTime) / 1000;
      console.log(`🎵 App foregrounded after ${backgroundDuration.toFixed(1)}s in background`);
      
      this.backgroundStartTime = null;
      
      // Notify callbacks about foreground state
      if (this.callbacks.onBackgroundStateChange) {
        this.callbacks.onBackgroundStateChange('active', backgroundDuration);
      }
    }
  }

  maintainBackgroundRecording() {
    if (!this.isBackgroundRecording) return;
    
    // Log background activity (limited logging to avoid spam)
    if (Math.random() < 0.1) { // 10% of the time
      console.log('🔄 Background recording active');
    }
    
    // Maintain audio buffer reference
    if (this.mainAudioBuffer && this.backgroundAudioBuffer.length > 0) {
      this.mainAudioBuffer.current.push(...this.backgroundAudioBuffer);
      this.backgroundAudioBuffer = [];
    }
  }

  maintainBLEConnection() {
    if (!this.bleManager) return;
    
    // Check connection health
    try {
      const stats = this.bleManager.getStats();
      
      // Log connection health occasionally
      if (Math.random() < 0.2) { // 20% of the time
        console.log(`🔵 BLE Health: ${stats.packetsReceived} packets, ${Math.floor(stats.audioSamplesGenerated / 1000)}k samples`);
      }
      
    } catch (error) {
      console.error('❌ BLE health check failed:', error);
    }
  }

  setCallbacks(callbacks) {
    this.callbacks = { ...callbacks };
  }

  async getBackgroundPermissionStatus() {
    try {
      if (!BackgroundFetch) {
        console.log('📋 Background fetch not available in this build');
        return 1; // Return "Denied" equivalent
      }
      
      const status = await BackgroundFetch.getStatusAsync();
      console.log('📋 Background fetch status:', status);
      return status;
    } catch (error) {
      console.error('❌ Failed to get background permission status:', error);
      return 1; // Return "Denied" equivalent
    }
  }

  destroy() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
    
    this.stopBackgroundRecording();
  }
}