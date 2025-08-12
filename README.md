# 🎙️ TaiNecklace - AI Voice Companion

A web-based AI companion that connects directly to your XIAO BLE device for real-time audio recording and transcription.

![TaiNecklace Demo](https://img.shields.io/badge/Status-Working-brightgreen) ![Web Bluetooth](https://img.shields.io/badge/Web%20Bluetooth-Supported-blue) ![AssemblyAI](https://img.shields.io/badge/AssemblyAI-Integrated-orange)

## 🌟 Features

- **📡 Direct BLE Connection** - Connects to XIAO devices via Web Bluetooth
- **🎤 Real-time Audio Recording** - Records ADPCM audio from your necklace device  
- **📊 Live Audio Visualization** - Visual feedback during recording
- **🔄 Smart Transcription** - Uses AssemblyAI for high-quality speech-to-text
- **💾 Conversation Storage** - Saves all recordings with transcripts
- **🎯 No App Required** - Runs entirely in your browser

## 🚀 Quick Start

1. **Open the App**: Open `tainecklace-demo.html` in Chrome or Edge browser
2. **Add API Key**: Go to Settings → Enter your AssemblyAI API key
3. **Connect Device**: Click "Connect to XIAO Device" and pair your necklace
4. **Start Recording**: Click "Start XIAO Stream" and speak into your device
5. **Get Transcript**: Stop recording to automatically transcribe your audio

## 🏗️ Architecture

```
XIAO Chip → BLE → Mobile App → AssemblyAI → Live Transcription
                      ↓              ↓            ↓
                 Frame Buffer → AI Analysis → Conversation Storage
                      ↓              ↓            ↓
                  ADPCM→PCM → Summarization → SQLite Database
```

### Core Components

1. **BLE Audio Manager**: Handles connection, audio streaming, and packet reassembly
2. **ADPCM Decoder**: JavaScript port of your Python decoder
3. **Frame Buffer**: Manages fragmented packet reconstruction
4. **AssemblyAI Service**: Real-time WebSocket transcription
5. **AI Service**: OpenAI/Anthropic integration for chat and analysis
6. **Database Layer**: SQLite for local data persistence
7. **App Orchestrator**: Coordinates all services and manages state

## 🚀 Setup Instructions

### 1. Prerequisites

- Node.js 16+ installed
- React Native development environment
- iOS/Android device or emulator
- Your XIAO BLE audio streaming device

### 2. Install Dependencies

```bash
cd TaiNecklace
npm install
```

### 3. Configure API Keys

Open the app and go to Settings, then enter:

- **AssemblyAI API Key** (Required): Get from [assemblyai.com](https://www.assemblyai.com/)
- **OpenAI API Key** (Optional): Get from [platform.openai.com](https://platform.openai.com/api-keys)
- **Anthropic API Key** (Alternative): Get from [console.anthropic.com](https://console.anthropic.com/)

### 4. Run the App

```bash
npm start
```

Then scan the QR code with Expo Go app or run on simulator.

## 📋 Usage Guide

### Recording a Conversation

1. **Connect Device**: Tap "Connect to Device" on the Record tab
2. **Start Recording**: Once connected, tap "Start Recording"
3. **Live Transcription**: Speak and watch text appear in real-time
4. **Stop Recording**: Tap "Stop Recording" when finished
5. **Auto-Processing**: AI will generate title, summary, and insights

### Chatting with Conversations

1. **Browse Conversations**: View all recordings on the Conversations tab
2. **Select Conversation**: Tap any conversation to view details
3. **Start Chat**: Tap the chat button to ask questions
4. **Natural Queries**: Ask things like:
   - "What were the main topics discussed?"
   - "Were there any action items mentioned?"
   - "What was the mood of this conversation?"
   - "Summarize the key decisions made"

### Searching Conversations

- **Text Search**: Find conversations containing specific words
- **Topic Filter**: Browse by automatically detected topics
- **Date Range**: Filter conversations by time period
- **AI Search**: Ask the AI to find relevant conversations

## 🔧 Technical Details

### BLE Protocol Compatibility

The app uses the exact same protocol as your Python implementation:

- **Service UUID**: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- **TX Characteristic**: `6E400003-B5A3-F393-E0A9-E50E24DCCA9E`
- **Packet Format**: `0xAA 0x55 [seq_lo] [seq_hi] [frag_id] [payload]`
- **ADPCM Decoding**: Same step table and index table as Python version

### Audio Processing Pipeline

1. **BLE Reception**: Receive fragmented ADPCM packets
2. **Frame Assembly**: Reconstruct complete audio frames (80% threshold)
3. **ADPCM Decoding**: Convert to 16-bit PCM samples
4. **Chunk Buffering**: Create 100ms chunks for streaming
5. **Base64 Encoding**: Format for AssemblyAI WebSocket
6. **Real-time Transcription**: Stream to AssemblyAI for live text

### Database Schema

```sql
-- Conversations
conversations (id, title, start_time, end_time, full_transcript, ai_summary, ...)

-- Transcript segments  
transcript_segments (id, conversation_id, text, confidence, audio_start, ...)

-- AI chat messages
chat_messages (id, conversation_id, type, content, timestamp, ...)

-- Insights and analytics
conversation_insights (id, conversation_id, insight_type, value, confidence, ...)
```

## 📁 Project Structure

```
TaiNecklace/
├── App.js                 # Main app with navigation
├── src/
│   ├── services/
│   │   ├── adpcm.js              # ADPCM decoder (ported from Python)
│   │   ├── frameBuffer.js        # Packet reassembly
│   │   ├── bleManager.js         # BLE connection & audio streaming
│   │   ├── assemblyAI.js         # Real-time transcription
│   │   ├── aiService.js          # OpenAI/Anthropic integration
│   │   ├── database.js           # SQLite conversation storage
│   │   └── appOrchestrator.js    # Main service coordinator
│   ├── screens/
│   │   ├── RecordingDemo.js      # Main recording interface
│   │   └── SettingsScreen.js     # API key configuration
│   └── config/
│       └── config.js             # App configuration
└── package.json
```

## 🎯 Next Steps

### Planned Features (Not Yet Implemented)

- **Full Navigation**: Complete conversation timeline UI
- **Advanced Search**: Semantic search across conversations  
- **Background Recording**: Continue recording when app is backgrounded
- **Analytics Dashboard**: Conversation insights and trends
- **Export Options**: Share conversations and summaries
- **Multi-Speaker Detection**: Identify different speakers
- **Custom AI Models**: Support for other transcription services

### Extending the App

To add new features:

1. **New Services**: Add to `src/services/` and integrate with orchestrator
2. **New Screens**: Create in `src/screens/` and add to navigation
3. **Database Changes**: Update schema in `database.js`
4. **AI Integrations**: Extend `aiService.js` for new providers

## 🛠️ Troubleshooting

### Common Issues

1. **BLE Connection Fails**:
   - Check XIAO device is powered and advertising
   - Verify device address matches in config
   - Enable Bluetooth permissions in device settings

2. **Transcription Not Working**:
   - Verify AssemblyAI API key in settings
   - Check internet connection
   - Ensure microphone is working on XIAO device

3. **AI Features Disabled**:
   - Add OpenAI or Anthropic API key in settings
   - Check API key has sufficient credits
   - Verify internet connectivity

### Debug Logs

Check the console for detailed logs from:
- BLE connection events
- Audio packet reception
- Transcription WebSocket messages
- AI API responses
- Database operations

## 📄 License

This project is built for educational and personal use. Please respect the API terms of service for AssemblyAI, OpenAI, and Anthropic.

## 🤝 Contributing

This is your personal AI companion app! Feel free to:
- Add new AI providers
- Improve the UI/UX
- Add conversation export features
- Enhance the search functionality
- Build custom analytics

---

**Built with ❤️ using React Native, AssemblyAI, and your XIAO BLE audio streaming device - your personal TaiNecklace companion!**