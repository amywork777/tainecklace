/**
 * ADPCM Decoder - Direct port from Python implementation
 */
export class ADPCMDecoder {
  static STEP_TABLE = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31,
    34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143,
    157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658,
    724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024,
    3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
    15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
  ];

  static INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];

  constructor() {
    this.predictor = 0;
    this.index = 0;
  }

  decodeNibble(code) {
    const step = ADPCMDecoder.STEP_TABLE[this.index];
    let vpdiff = step >> 3;
    
    if (code & 4) vpdiff += step;
    if (code & 2) vpdiff += step >> 1;
    if (code & 1) vpdiff += step >> 2;
    
    if (code & 8) {
      this.predictor -= vpdiff;
    } else {
      this.predictor += vpdiff;
    }
    
    this.predictor = Math.max(-32768, Math.min(32767, this.predictor));
    this.index = Math.max(0, Math.min(88, this.index + ADPCMDecoder.INDEX_TABLE[code]));
    
    return this.predictor;
  }

  decodeBlock(adpcmData) {
    const pcm = [];
    
    for (let i = 0; i < adpcmData.length; i++) {
      const byte = adpcmData[i];
      const hi = (byte >> 4) & 0x0F;
      const lo = byte & 0x0F;
      
      pcm.push(this.decodeNibble(hi));
      pcm.push(this.decodeNibble(lo));
    }
    
    return pcm;
  }

  reset() {
    this.predictor = 0;
    this.index = 0;
  }
}