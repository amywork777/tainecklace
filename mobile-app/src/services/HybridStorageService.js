/**
 * Hybrid Storage Service for TaiNecklace
 * Manages local storage + Supabase cloud sync with smart thresholds
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

const LOCAL_STORAGE_KEY = 'transcriptions';
const MAX_LOCAL_TRANSCRIPTIONS = 50;
const SYNC_QUEUE_KEY = 'sync_queue';

export class HybridStorageService {
  constructor() {
    this.isSupabaseEnabled = false;
    this.syncInProgress = false;
    this.initializeSupabase();
  }

  async initializeSupabase() {
    try {
      // Test Supabase connection
      const { data, error } = await supabase.from('transcriptions').select('count').limit(1);
      if (!error) {
        this.isSupabaseEnabled = true;
        console.log('✅ Supabase connected successfully');
        // Process any queued syncs
        this.processSyncQueue();
      } else {
        console.log('⚠️ Supabase not configured or offline, using local-only mode');
      }
    } catch (error) {
      console.log('⚠️ Supabase connection failed, using local-only mode:', error.message);
    }
  }

  /**
   * Save transcription with hybrid approach
   */
  async saveTranscription(transcription) {
    try {
      // 1. Always save to local storage first (instant UI)
      const localTranscriptions = await this.getLocalTranscriptions();
      const updatedTranscriptions = [transcription, ...localTranscriptions];
      
      await AsyncStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedTranscriptions));
      console.log(`💾 Saved transcription locally (${updatedTranscriptions.length} total)`);

      // 2. Check if we need to sync to cloud
      if (updatedTranscriptions.length >= MAX_LOCAL_TRANSCRIPTIONS) {
        console.log(`📤 Threshold reached (${MAX_LOCAL_TRANSCRIPTIONS}+), initiating cloud sync...`);
        await this.syncToCloud(updatedTranscriptions);
      } else if (this.isSupabaseEnabled) {
        // 3. Or just sync this new transcription to cloud
        await this.syncSingleTranscription(transcription);
      }

      return updatedTranscriptions;
    } catch (error) {
      console.error('❌ Error saving transcription:', error);
      throw error;
    }
  }

  /**
   * Get all transcriptions (local + cloud if needed)
   */
  async getAllTranscriptions() {
    try {
      const localTranscriptions = await this.getLocalTranscriptions();
      
      // If we have less than max local, return local only
      if (localTranscriptions.length < MAX_LOCAL_TRANSCRIPTIONS || !this.isSupabaseEnabled) {
        return localTranscriptions;
      }

      // Otherwise, get recent local + older from cloud
      return await this.getHybridTranscriptions();
    } catch (error) {
      console.error('❌ Error getting transcriptions:', error);
      // Fallback to local storage
      return await this.getLocalTranscriptions();
    }
  }

  /**
   * Get local transcriptions
   */
  async getLocalTranscriptions() {
    try {
      const stored = await AsyncStorage.getItem(LOCAL_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('❌ Error reading local storage:', error);
      return [];
    }
  }

  /**
   * Sync single transcription to cloud (background)
   */
  async syncSingleTranscription(transcription) {
    if (!this.isSupabaseEnabled) {
      return this.queueForSync([transcription]);
    }

    try {
      const { error } = await supabase
        .from('transcriptions')
        .insert([{
          id: transcription.id,
          text: transcription.text,
          confidence: transcription.confidence,
          timestamp: transcription.timestamp,
          duration: transcription.duration,
          created_at: new Date().toISOString()
        }]);

      if (error) {
        console.warn('⚠️ Failed to sync to cloud, queuing for later:', error.message);
        await this.queueForSync([transcription]);
      } else {
        console.log('☁️ Transcription synced to cloud');
      }
    } catch (error) {
      console.warn('⚠️ Cloud sync failed, queuing for later:', error.message);
      await this.queueForSync([transcription]);
    }
  }

  /**
   * Sync all transcriptions to cloud and optimize local storage
   */
  async syncToCloud(transcriptions) {
    if (this.syncInProgress) {
      console.log('🔄 Sync already in progress, skipping...');
      return;
    }

    this.syncInProgress = true;
    console.log(`📤 Starting cloud sync for ${transcriptions.length} transcriptions...`);

    try {
      if (!this.isSupabaseEnabled) {
        await this.queueForSync(transcriptions);
        return;
      }

      // Separate new vs existing transcriptions
      const { data: existingIds } = await supabase
        .from('transcriptions')
        .select('id')
        .in('id', transcriptions.map(t => t.id));

      const existingIdSet = new Set(existingIds?.map(item => item.id) || []);
      const newTranscriptions = transcriptions.filter(t => !existingIdSet.has(t.id));

      if (newTranscriptions.length > 0) {
        const { error } = await supabase
          .from('transcriptions')
          .insert(newTranscriptions.map(t => ({
            id: t.id,
            text: t.text,
            confidence: t.confidence,
            timestamp: t.timestamp,
            duration: t.duration,
            created_at: new Date(t.timestamp).toISOString()
          })));

        if (error) throw error;
        
        console.log(`☁️ Synced ${newTranscriptions.length} new transcriptions to cloud`);
      }

      // Keep only recent transcriptions locally (optimize storage)
      const recentTranscriptions = transcriptions.slice(0, 30); // Keep 30 most recent locally
      await AsyncStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(recentTranscriptions));
      
      console.log(`🗂️ Optimized local storage: ${recentTranscriptions.length} transcriptions kept locally`);
      
    } catch (error) {
      console.error('❌ Cloud sync failed:', error);
      await this.queueForSync(transcriptions);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get hybrid transcriptions (local + cloud)
   */
  async getHybridTranscriptions() {
    try {
      // Get recent local transcriptions
      const localTranscriptions = await this.getLocalTranscriptions();
      
      // Get older transcriptions from cloud
      const { data: cloudTranscriptions, error } = await supabase
        .from('transcriptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200); // Reasonable limit

      if (error) throw error;

      // Merge and deduplicate
      const allTranscriptions = [...localTranscriptions];
      const localIds = new Set(localTranscriptions.map(t => t.id));
      
      cloudTranscriptions?.forEach(cloudItem => {
        if (!localIds.has(cloudItem.id)) {
          allTranscriptions.push({
            id: cloudItem.id,
            text: cloudItem.text,
            confidence: cloudItem.confidence,
            timestamp: cloudItem.timestamp,
            duration: cloudItem.duration
          });
        }
      });

      // Sort by timestamp
      allTranscriptions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      console.log(`📱☁️ Hybrid view: ${localTranscriptions.length} local + ${cloudTranscriptions?.length || 0} cloud = ${allTranscriptions.length} total`);
      
      return allTranscriptions;
    } catch (error) {
      console.error('❌ Error getting hybrid transcriptions:', error);
      return await this.getLocalTranscriptions();
    }
  }

  /**
   * Queue transcriptions for later sync
   */
  async queueForSync(transcriptions) {
    try {
      const existingQueue = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      const queue = existingQueue ? JSON.parse(existingQueue) : [];
      
      const updatedQueue = [...queue, ...transcriptions];
      await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(updatedQueue));
      
      console.log(`📋 Queued ${transcriptions.length} transcriptions for sync (${updatedQueue.length} total in queue)`);
    } catch (error) {
      console.error('❌ Error queuing for sync:', error);
    }
  }

  /**
   * Process queued sync items when connection is available
   */
  async processSyncQueue() {
    try {
      const queueData = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
      if (!queueData) return;

      const queue = JSON.parse(queueData);
      if (queue.length === 0) return;

      console.log(`🔄 Processing sync queue: ${queue.length} items`);
      
      await this.syncToCloud(queue);
      
      // Clear the queue on successful sync
      await AsyncStorage.removeItem(SYNC_QUEUE_KEY);
      console.log('✅ Sync queue processed and cleared');
      
    } catch (error) {
      console.error('❌ Error processing sync queue:', error);
    }
  }

  /**
   * Get storage status for debugging
   */
  async getStorageStatus() {
    const localCount = (await this.getLocalTranscriptions()).length;
    const queueData = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
    const queueCount = queueData ? JSON.parse(queueData).length : 0;
    
    return {
      local: localCount,
      queued: queueCount,
      cloudEnabled: this.isSupabaseEnabled,
      threshold: MAX_LOCAL_TRANSCRIPTIONS
    };
  }

  /**
   * Check if transcriptions are suitable for AI summary
   */
  async shouldGenerateAISummary() {
    const transcriptions = await this.getLocalTranscriptions();
    
    // Generate summary if we have 3+ transcriptions
    return transcriptions.length >= 3;
  }

  /**
   * Save AI summary with transcriptions
   */
  async saveAISummary(summary, transcriptionIds) {
    try {
      const summaryData = {
        id: Date.now(),
        summary: summary.summary,
        transcriptionCount: summary.transcriptionCount,
        summaryType: summary.summaryType || 'conversation',
        transcriptionIds: transcriptionIds,
        timestamp: summary.timestamp || new Date().toISOString(),
        tokensUsed: summary.tokensUsed || 0
      };

      // Save to local storage
      const existingSummaries = await AsyncStorage.getItem('ai_summaries');
      const summaries = existingSummaries ? JSON.parse(existingSummaries) : [];
      summaries.unshift(summaryData);
      
      // Keep only last 20 summaries locally
      const limitedSummaries = summaries.slice(0, 20);
      await AsyncStorage.setItem('ai_summaries', JSON.stringify(limitedSummaries));

      // If Supabase is enabled, save to cloud too
      if (this.isSupabaseEnabled) {
        try {
          const { error } = await supabase
            .from('ai_summaries')
            .insert([summaryData]);

          if (error) {
            console.warn('⚠️ Failed to save AI summary to cloud:', error.message);
          } else {
            console.log('☁️ AI summary saved to cloud');
          }
        } catch (error) {
          console.warn('⚠️ Cloud save failed for AI summary:', error.message);
        }
      }

      console.log(`💾 AI summary saved (${limitedSummaries.length} total summaries)`);
      return summaryData;

    } catch (error) {
      console.error('❌ Error saving AI summary:', error);
      throw error;
    }
  }

  /**
   * Get recent AI summaries
   */
  async getAISummaries(limit = 10) {
    try {
      const summaries = await AsyncStorage.getItem('ai_summaries');
      const parsedSummaries = summaries ? JSON.parse(summaries) : [];
      return parsedSummaries.slice(0, limit);
    } catch (error) {
      console.error('❌ Error getting AI summaries:', error);
      return [];
    }
  }
}