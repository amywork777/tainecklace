# TaiNecklace - XIAO BLE Audio Transcription

AI-powered voice companion that connects to XIAO BLE devices for real-time audio streaming and transcription using AssemblyAI.

## 📁 Project Structure

### 🌐 [Web App](./web-app/)
- **Live Demo**: Fully functional web application  
- **Features**: Web Bluetooth, ADPCM decoding, AssemblyAI transcription
- **Access**: Works in Chrome/Edge browsers with Web Bluetooth support
- **Limitations**: Limited mobile browser support

### 📱 [Mobile App](./mobile-app/) 
- **Production Ready**: React Native app with native BLE support
- **Features**: Full XIAO BLE connection, audio streaming, transcription
- **Platforms**: iOS and Android with proper BLE permissions  
- **Advantage**: Works on mobile devices where Web Bluetooth doesn't

## 🎯 Quick Start

### Web Version (Immediate Testing)
```bash
# Open the web demo
open web-app/tainecklace-demo.html
```

### Mobile Version (Full XIAO Functionality)
```bash
cd mobile-app
eas build --platform ios --profile preview
```

## 🔧 XIAO Device Requirements

- **Service**: Nordic UART Service (NUS)
- **Audio Format**: ADPCM compression
- **Packet Format**: 0xAA 0x55 header + sequence + fragment + audio data
- **Sample Rate**: 16kHz, 16-bit PCM output

## 📊 Features Comparison

| Feature | Web App | Mobile App |
|---------|---------|------------|
| BLE Support | Limited (Chrome/Edge only) | ✅ Native support |
| Mobile Devices | ❌ Poor compatibility | ✅ Full compatibility |
| XIAO Connection | ⚠️ Desktop only | ✅ Works everywhere |
| Audio Processing | ✅ Real-time | ✅ Real-time |
| Transcription | ✅ AssemblyAI | ✅ AssemblyAI |

---

🎙️ **Ready to test with your XIAO device\!**
