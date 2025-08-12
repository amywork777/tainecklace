// SQLite import - with web fallback
let SQLite;
if (typeof window !== 'undefined') {
  // Web environment - mock SQLite
  SQLite = {
    openDatabaseAsync: () => Promise.resolve({
      execAsync: () => Promise.resolve(),
      runAsync: () => Promise.resolve({ lastInsertRowId: 1 }),
      getFirstAsync: () => Promise.resolve(null),
      getAllAsync: () => Promise.resolve([]),
      closeAsync: () => Promise.resolve()
    })
  };
} else {
  // React Native environment
  SQLite = require('expo-sqlite');
}

export class ConversationDatabase {
  constructor() {
    this.db = null;
  }

  async initialize() {
    try {
      this.db = await SQLite.openDatabaseAsync('conversations.db');
      await this.createTables();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  async createTables() {
    // Conversations table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER,
        full_transcript TEXT,
        summary TEXT,
        ai_summary TEXT,
        key_topics TEXT, -- JSON array
        participants INTEGER DEFAULT 1,
        location TEXT,
        confidence_score REAL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);

    // Transcript segments table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS transcript_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        confidence REAL,
        audio_start INTEGER,
        audio_end INTEGER,
        speaker_id INTEGER DEFAULT 0,
        is_final BOOLEAN DEFAULT 1,
        timestamp INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
    `);

    // AI chat messages table  
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER,
        type TEXT NOT NULL, -- 'user' or 'assistant'
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT, -- JSON for additional data
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
    `);

    // Search/insights table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS conversation_insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        insight_type TEXT NOT NULL, -- 'topic', 'keyword', 'sentiment', etc.
        value TEXT NOT NULL,
        confidence REAL,
        metadata TEXT, -- JSON
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
    `);

    // Create indexes for performance
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_conversations_start_time ON conversations(start_time);
      CREATE INDEX IF NOT EXISTS idx_transcript_segments_conversation ON transcript_segments(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_insights_conversation ON conversation_insights(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_insights_type ON conversation_insights(insight_type);
    `);
  }

  // Conversation CRUD operations
  async createConversation(startTime, title = null, location = null) {
    const result = await this.db.runAsync(
      `INSERT INTO conversations (title, start_time, location) VALUES (?, ?, ?)`,
      [title, startTime, location]
    );
    return result.lastInsertRowId;
  }

  async updateConversation(conversationId, updates) {
    const setClause = Object.keys(updates)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const values = [...Object.values(updates), Date.now(), conversationId];
    
    await this.db.runAsync(
      `UPDATE conversations SET ${setClause}, updated_at = ? WHERE id = ?`,
      values
    );
  }

  async finishConversation(conversationId, endTime, fullTranscript, summary = null) {
    const duration = endTime - (await this.getConversationStartTime(conversationId));
    
    await this.updateConversation(conversationId, {
      end_time: endTime,
      duration,
      full_transcript: fullTranscript,
      summary
    });
  }

  async getConversationStartTime(conversationId) {
    const result = await this.db.getFirstAsync(
      `SELECT start_time FROM conversations WHERE id = ?`,
      [conversationId]
    );
    return result?.start_time;
  }

  async getConversation(conversationId) {
    return await this.db.getFirstAsync(
      `SELECT * FROM conversations WHERE id = ?`,
      [conversationId]
    );
  }

  async getAllConversations(limit = 50, offset = 0) {
    return await this.db.getAllAsync(
      `SELECT * FROM conversations ORDER BY start_time DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }

  async searchConversations(searchTerm, limit = 50) {
    const term = `%${searchTerm}%`;
    return await this.db.getAllAsync(`
      SELECT DISTINCT c.* FROM conversations c
      LEFT JOIN transcript_segments ts ON c.id = ts.conversation_id
      WHERE c.title LIKE ? OR c.full_transcript LIKE ? OR c.summary LIKE ? OR ts.text LIKE ?
      ORDER BY c.start_time DESC LIMIT ?
    `, [term, term, term, term, limit]);
  }

  // Transcript segments
  async addTranscriptSegment(conversationId, segment) {
    return await this.db.runAsync(`
      INSERT INTO transcript_segments 
      (conversation_id, text, confidence, audio_start, audio_end, speaker_id, is_final, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      conversationId,
      segment.text,
      segment.confidence || 0,
      segment.audioStart || 0,
      segment.audioEnd || 0,
      segment.speakerId || 0,
      segment.isFinal ? 1 : 0,
      segment.timestamp
    ]);
  }

  async getTranscriptSegments(conversationId) {
    return await this.db.getAllAsync(
      `SELECT * FROM transcript_segments WHERE conversation_id = ? ORDER BY audio_start ASC`,
      [conversationId]
    );
  }

  // Chat messages
  async addChatMessage(conversationId, type, content, metadata = null) {
    return await this.db.runAsync(`
      INSERT INTO chat_messages (conversation_id, type, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?)
    `, [conversationId, type, content, Date.now(), metadata ? JSON.stringify(metadata) : null]);
  }

  async getChatMessages(conversationId, limit = 50) {
    const messages = await this.db.getAllAsync(`
      SELECT * FROM chat_messages 
      WHERE conversation_id = ? OR conversation_id IS NULL
      ORDER BY timestamp ASC LIMIT ?
    `, [conversationId, limit]);

    return messages.map(msg => ({
      ...msg,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : null
    }));
  }

  async getAllChatMessages(limit = 100) {
    const messages = await this.db.getAllAsync(`
      SELECT cm.*, c.title as conversation_title
      FROM chat_messages cm
      LEFT JOIN conversations c ON cm.conversation_id = c.id
      ORDER BY cm.timestamp DESC LIMIT ?
    `, [limit]);

    return messages.map(msg => ({
      ...msg,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : null
    }));
  }

  // Insights
  async addInsight(conversationId, insightType, value, confidence = null, metadata = null) {
    return await this.db.runAsync(`
      INSERT INTO conversation_insights (conversation_id, insight_type, value, confidence, metadata)
      VALUES (?, ?, ?, ?, ?)
    `, [conversationId, insightType, value, confidence, metadata ? JSON.stringify(metadata) : null]);
  }

  async getInsights(conversationId, insightType = null) {
    let query = `SELECT * FROM conversation_insights WHERE conversation_id = ?`;
    let params = [conversationId];

    if (insightType) {
      query += ` AND insight_type = ?`;
      params.push(insightType);
    }

    query += ` ORDER BY created_at DESC`;

    const insights = await this.db.getAllAsync(query, params);
    return insights.map(insight => ({
      ...insight,
      metadata: insight.metadata ? JSON.parse(insight.metadata) : null
    }));
  }

  // Statistics and analytics
  async getConversationStats() {
    const totalConversations = await this.db.getFirstAsync(
      `SELECT COUNT(*) as count FROM conversations`
    );

    const totalDuration = await this.db.getFirstAsync(
      `SELECT SUM(duration) as total FROM conversations WHERE duration IS NOT NULL`
    );

    const avgDuration = await this.db.getFirstAsync(
      `SELECT AVG(duration) as avg FROM conversations WHERE duration IS NOT NULL`
    );

    const recentConversations = await this.db.getFirstAsync(
      `SELECT COUNT(*) as count FROM conversations WHERE start_time > ?`,
      [Date.now() - (7 * 24 * 60 * 60 * 1000)] // Last 7 days
    );

    return {
      totalConversations: totalConversations.count,
      totalDurationMs: totalDuration.total || 0,
      averageDurationMs: avgDuration.avg || 0,
      recentConversations: recentConversations.count
    };
  }

  async getPopularTopics(limit = 10) {
    return await this.db.getAllAsync(`
      SELECT value, COUNT(*) as count
      FROM conversation_insights
      WHERE insight_type = 'topic'
      GROUP BY value
      ORDER BY count DESC
      LIMIT ?
    `, [limit]);
  }

  // Cleanup and maintenance
  async deleteConversation(conversationId) {
    await this.db.runAsync(`DELETE FROM conversations WHERE id = ?`, [conversationId]);
  }

  async deleteOldConversations(daysOld = 30) {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    await this.db.runAsync(
      `DELETE FROM conversations WHERE start_time < ?`,
      [cutoffTime]
    );
  }

  async close() {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
  }
}