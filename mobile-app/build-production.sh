#!/bin/bash

echo "🎯 Building TaiNecklace Production App for XIAO BLE Testing"
echo "=================================================="

echo ""
echo "Step 1: Login to Expo..."
eas login

echo ""
echo "Step 2: Initialize EAS..."
eas init

echo ""
echo "Step 3: Building Android APK..."
echo "⏱️  This will take about 15-20 minutes..."
eas build --platform android --profile preview

echo ""
echo "🎉 Build Complete!"
echo "📱 Install the APK on your Android phone to test with XIAO device"
echo "✅ Full BLE functionality will be available in the production build"