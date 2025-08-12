# 📱 Mobile App Version - TaiNecklace

The web version works great on desktop Chrome/Edge, but mobile browsers have limited Web Bluetooth support. Here's how to create a native mobile app:

## 🚀 Quick Mobile App Setup

### 1. Install React Native CLI
```bash
npm install -g @react-native-community/cli
npx react-native init TaiNecklaceMobile
cd TaiNecklaceMobile
```

### 2. Add BLE Library
```bash
npm install react-native-ble-plx
npx react-native link react-native-ble-plx
```

### 3. Copy Core Logic
Copy these from our web app:
- ADPCM decoder logic
- Packet reassembly logic  
- AssemblyAI integration
- Audio visualization

### 4. Add Permissions

**Android (android/app/src/main/AndroidManifest.xml):**
```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

**iOS (ios/TaiNecklace/Info.plist):**
```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>TaiNecklace needs Bluetooth to connect to your XIAO device</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>TaiNecklace needs Bluetooth to connect to your XIAO device</string>
```

## 🎯 Alternative: Progressive Web App (PWA)

Add PWA support to make the web app feel more native:

### 1. Add manifest.json
```json
{
  "name": "TaiNecklace",
  "short_name": "TaiNecklace",
  "description": "AI Voice Companion for XIAO BLE Devices",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#667eea",
  "theme_color": "#667eea",
  "icons": [
    {
      "src": "icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```

### 2. Add service worker for offline support
```javascript
// sw.js
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('tainecklace-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/tainecklace-demo.html',
        '/index.html'
      ]);
    })
  );
});
```

## 📱 Current Recommendations

**For Now:**
1. **Desktop**: Use the web app (works perfectly!)
2. **Mobile**: Consider building React Native version
3. **Quick Fix**: Try Android Chrome with experimental flags

**Long Term:**
1. Build proper React Native mobile app
2. Publish to App Store/Play Store
3. Keep web version for desktop users

The web app is amazing for desktop - mobile BLE is just a platform limitation we need to work around with native development.