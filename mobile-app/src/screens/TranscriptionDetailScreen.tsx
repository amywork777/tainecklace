import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Share,
  Alert,
} from 'react-native';

export default function TranscriptionDetailScreen({ route, navigation }) {
  const { transcription } = route.params;

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      })
    };
  };

  const handleShare = async () => {
    try {
      const shareContent = `🎤 Voice Recording
📅 ${formatTimestamp(transcription.timestamp).date}
⏰ ${formatTimestamp(transcription.timestamp).time}

${transcription.aiSummary ? `🤖 AI Summary:
${transcription.aiSummary}

` : ''}📝 Full Transcription:
${transcription.text || '[No text]'}

Duration: ${formatDuration(transcription.duration || 0)}
${transcription.confidence ? `Confidence: ${(transcription.confidence * 100).toFixed(1)}%` : ''}

Generated with TaiNecklace AI Voice Companion`;

      await Share.share({
        message: shareContent,
        title: 'Voice Recording Transcription'
      });
    } catch (error) {
      Alert.alert('Share Error', 'Unable to share transcription');
    }
  };

  const formattedTime = transcription.timestamp ? formatTimestamp(transcription.timestamp) : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareButtonText}>Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={true}>
        {/* Timestamp Section */}
        {formattedTime && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Recording Details</Text>
            <View style={styles.timestampContainer}>
              <Text style={styles.dateText}>{formattedTime.date}</Text>
              <Text style={styles.timeText}>{formattedTime.time}</Text>
            </View>
          </View>
        )}

        {/* AI Summary Section */}
        {transcription.aiSummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🤖 AI Summary</Text>
            <View style={styles.aiSummaryBox}>
              <Text style={styles.aiSummaryText}>{transcription.aiSummary}</Text>
              {transcription.aiSummaryMeta && (
                <View style={styles.aiSummaryMeta}>
                  <Text style={styles.aiMetaText}>
                    Type: {transcription.aiSummaryMeta.summaryType || 'concise'} | 
                    Tokens: {transcription.aiSummaryMeta.tokensUsed || 0}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Full Transcription Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 Full Transcription</Text>
          <View style={styles.transcriptionBox}>
            <Text style={styles.transcriptionText}>
              {transcription.text || '[No transcription available]'}
            </Text>
          </View>
          
          {/* Word count */}
          <Text style={styles.wordCount}>
            {(transcription.text || '').split(/\s+/).filter(word => word.length > 0).length} words, {(transcription.text || '').length} characters
          </Text>
        </View>

        {/* Technical Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Technical Details</Text>
          <View style={styles.detailsGrid}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Duration</Text>
              <Text style={styles.detailValue}>{formatDuration(transcription.duration || 0)}</Text>
            </View>

            {transcription.confidence && (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Confidence</Text>
                <Text style={[styles.detailValue, { color: transcription.confidence > 0.8 ? '#28a745' : transcription.confidence > 0.6 ? '#ffc107' : '#dc3545' }]}>
                  {(transcription.confidence * 100).toFixed(1)}%
                </Text>
              </View>
            )}

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Recording ID</Text>
              <Text style={styles.detailValue}>{transcription.id || 'N/A'}</Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Text Length</Text>
              <Text style={styles.detailValue}>{(transcription.text || '').length}</Text>
            </View>

            {transcription.aiSummary && (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>AI Summary</Text>
                <Text style={styles.detailValue}>
                  {transcription.aiSummaryMeta?.tokensUsed || 0} tokens
                </Text>
              </View>
            )}

            {transcription.aiSummaryMeta?.summaryTimestamp && (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>AI Generated</Text>
                <Text style={styles.detailValue}>
                  {new Date(transcription.aiSummaryMeta.summaryTimestamp).toLocaleTimeString()}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Actions</Text>
          <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
            <Text style={styles.actionButtonText}>📤 Share Transcription</Text>
          </TouchableOpacity>
          
          {/* Future actions can be added here */}
          {/* <TouchableOpacity style={[styles.actionButton, styles.actionButtonSecondary]}>
            <Text style={styles.actionButtonText}>🗑️ Delete Recording</Text>
          </TouchableOpacity> */}
        </View>

        {/* Bottom spacing */}
        <View style={styles.bottomSpacing} />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    backgroundColor: '#2d2d2d',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#007bff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  shareButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  shareButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
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
  timestampContainer: {
    alignItems: 'center',
  },
  dateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  timeText: {
    fontSize: 14,
    color: '#888',
  },
  aiSummaryBox: {
    backgroundColor: '#2a4d3a',
    borderRadius: 4,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#28a745',
  },
  aiSummaryText: {
    color: '#e8f5e8',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
  aiSummaryMeta: {
    borderTopWidth: 1,
    borderTopColor: '#357a42',
    paddingTop: 8,
  },
  aiMetaText: {
    color: '#a8d5aa',
    fontSize: 12,
    fontStyle: 'italic',
  },
  transcriptionBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    padding: 16,
    borderWidth: 1,
    borderColor: '#444',
    marginBottom: 8,
  },
  transcriptionText: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 24,
  },
  wordCount: {
    color: '#888',
    fontSize: 12,
    textAlign: 'right',
    fontStyle: 'italic',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  detailItem: {
    width: '48%',
    backgroundColor: '#333',
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  detailLabel: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 4,
  },
  detailValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionButton: {
    backgroundColor: '#007bff',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonSecondary: {
    backgroundColor: '#dc3545',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomSpacing: {
    height: 32,
  },
});