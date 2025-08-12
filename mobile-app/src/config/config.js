// Configuration for TaiNecklace
// Add your API keys here or set them through the app settings

export const CONFIG = {
  // AssemblyAI API Key for real-time transcription
  // Get your key at: https://www.assemblyai.com/
  ASSEMBLY_AI_API_KEY: 'YOUR_ASSEMBLY_AI_API_KEY_HERE',
  
  // OpenAI API Key for AI chat and summarization
  // Get your key at: https://platform.openai.com/api-keys
  OPENAI_API_KEY: 'YOUR_OPENAI_API_KEY_HERE',
  
  // Alternative: Anthropic Claude API Key
  // Get your key at: https://console.anthropic.com/
  ANTHROPIC_API_KEY: 'YOUR_ANTHROPIC_API_KEY_HERE',
  
  // BLE Device Configuration
  BLE_DEVICE: {
    // Default XIAO device address from your Python code
    ADDRESS: '4946229F-BE14-34B7-1703-3F9292D6BA00',
    NAME: 'XIAO-ADPCM',
    SERVICE_UUID: '6E400001-B5A3-F393-E0A9-E50E24DCCA9E',
    TX_CHAR_UUID: '6E400003-B5A3-F393-E0A9-E50E24DCCA9E',
  },
  
  // Audio Settings
  AUDIO: {
    SAMPLE_RATE: 16000,
    CHUNK_SIZE_MS: 100, // 100ms chunks
    COMPLETION_THRESHOLD: 0.8, // 80% frame completion threshold
  },
  
  // AI Settings
  AI: {
    DEFAULT_PROVIDER: 'openai', // 'openai' or 'anthropic'
    AUTO_SUMMARIZE: true,
    AUTO_GENERATE_TITLES: true,
    MAX_TOKENS: 1500,
  }
};

// Environment-specific overrides
if (__DEV__) {
  // Development settings
  console.log('🔧 Running in development mode');
}

export default CONFIG;