/**
 * ADPCM Decoder - Direct port from web version
 * Handles XIAO ADPCM audio decoding for React Native
 */
export class ADPCMDecoder {
  static STEP_TABLE = [
    7, 8, 9, 10, 11, 12, 13, 14,
    16, 17, 19, 21, 23, 25, 28, 31,
    34, 37, 41, 45, 50, 55, 60, 66,
    73, 80, 88, 97, 107, 118, 130, 143,
    157, 173, 190, 209, 230, 253, 279, 307,
    337, 371, 408, 449, 494, 544, 598, 658,
    724, 796, 876, 963, 1060, 1166, 1282, 1411,
    1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024,
    3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484,
    7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
    15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
  ];

  static INDEX_TABLE = [
    -1, -1, -1, -1, 2, 4, 6, 8,
    -1, -1, -1, -1, 2, 4, 6, 8
  ];

  constructor() {
    this.predictor = 0;
    this.stepIndex = 0;
  }

  decodeSample(adpcmSample) {
    let step = ADPCMDecoder.STEP_TABLE[this.stepIndex];
    let diff = step >> 3;
    
    if (adpcmSample & 1) diff += step >> 2;
    if (adpcmSample & 2) diff += step >> 1;
    if (adpcmSample & 4) diff += step;
    
    if (adpcmSample & 8) {
      this.predictor -= diff;
    } else {
      this.predictor += diff;
    }
    
    // Clamp predictor to 16-bit signed range
    if (this.predictor > 32767) this.predictor = 32767;
    if (this.predictor < -32768) this.predictor = -32768;
    
    // Update step index
    this.stepIndex += ADPCMDecoder.INDEX_TABLE[adpcmSample];
    if (this.stepIndex < 0) this.stepIndex = 0;
    if (this.stepIndex >= ADPCMDecoder.STEP_TABLE.length) this.stepIndex = ADPCMDecoder.STEP_TABLE.length - 1;
    
    return this.predictor;
  }

  decodeBlock(adpcmData) {
    if (!adpcmData || adpcmData.length === 0) {
      return [];
    }
    
    const pcmSamples = new Array(adpcmData.length * 2); // Each ADPCM sample expands to 2 PCM samples
    let pcmIndex = 0;
    
    for (let i = 0; i < adpcmData.length; i++) {
      const byte = adpcmData[i];
      
      // Decode two 4-bit ADPCM samples from each byte
      const sample1 = (byte >> 4) & 0x0F;
      const sample2 = byte & 0x0F;
      
      pcmSamples[pcmIndex++] = this.decodeSample(sample1);
      pcmSamples[pcmIndex++] = this.decodeSample(sample2);
    }
    
    return pcmSamples;
  }

  reset() {
    this.predictor = 0;
    this.stepIndex = 0;
  }
}