/**
 * Frame Buffer - Handles fragmented audio packets from BLE
 * Direct port from Python implementation
 */
export class FrameBuffer {
  constructor() {
    this.frames = new Map();
    this.completedFrames = [];
    this.stats = {
      notifications: 0,
      completeFrames: 0,
      partialFrames: 0,
      missingFrames: 0,
      seqMin: null,
      seqMax: null
    };
    this.completionThreshold = 0.8; // Accept frames with 80% of data
  }

  addFragment(seq, fragId, formatChar, totalLen, data) {
    this.stats.notifications++;
    
    if (this.stats.seqMin === null || seq < this.stats.seqMin) {
      this.stats.seqMin = seq;
    }
    if (this.stats.seqMax === null || seq > this.stats.seqMax) {
      this.stats.seqMax = seq;
    }

    if (!this.frames.has(seq)) {
      this.frames.set(seq, {
        fragments: new Map(),
        totalLen: null,
        format: null
      });
    }

    const frame = this.frames.get(seq);

    // Set metadata from first fragment
    if (fragId === 0) {
      frame.totalLen = totalLen;
      frame.format = formatChar;
    }

    // Store fragment data
    if (frame.fragments.has(fragId)) {
      return; // Duplicate
    }
    frame.fragments.set(fragId, data);

    // Check completion (with tolerance for missing fragments)
    if (this.isFrameAcceptable(seq)) {
      this.completeFrame(seq);
    }
  }

  isFrameAcceptable(seq) {
    if (!this.frames.has(seq)) {
      return false;
    }

    const frame = this.frames.get(seq);

    // Must have first fragment with metadata
    if (!frame.fragments.has(0) || frame.totalLen === null) {
      return false;
    }

    // Calculate total received data
    let totalDataLen = 0;
    for (const data of frame.fragments.values()) {
      totalDataLen += data.length;
    }

    // Accept if we have at least 80% of expected data
    return totalDataLen >= (frame.totalLen * this.completionThreshold);
  }

  completeFrame(seq) {
    const frame = this.frames.get(seq);
    const fragments = frame.fragments;

    // Reconstruct data in fragment order, filling gaps with zeros
    let completeData = new Uint8Array(frame.totalLen);
    const expectedFragments = this.calculateExpectedFragments(frame.totalLen);
    
    let offset = 0;
    for (let fragId = 0; fragId < expectedFragments; fragId++) {
      if (fragments.has(fragId)) {
        const fragData = fragments.get(fragId);
        completeData.set(fragData, offset);
        offset += fragData.length;
      } else {
        // Fill missing fragment with zeros (silence)
        const fragSize = fragId === 0 ? 236 : 239;
        const remaining = Math.min(fragSize, frame.totalLen - offset);
        // completeData is already zero-filled by default
        offset += remaining;
      }
    }

    this.completedFrames.push({
      seq: seq,
      format: frame.format,
      data: completeData
    });

    this.stats.completeFrames++;
    this.frames.delete(seq);
  }

  calculateExpectedFragments(totalLen) {
    // First fragment: 236 bytes, subsequent: 239 bytes each
    if (totalLen <= 236) {
      return 1;
    }
    const remaining = totalLen - 236;
    return 1 + Math.ceil(remaining / 239);
  }

  finalizeStats() {
    // Complete remaining partial frames if they meet threshold
    const framesToComplete = [];
    for (const [seq, frame] of this.frames) {
      if (this.isFrameAcceptable(seq)) {
        framesToComplete.push(seq);
      }
    }

    for (const seq of framesToComplete) {
      this.completeFrame(seq);
    }

    this.stats.partialFrames = Array.from(this.frames.values())
      .filter(frame => frame.fragments.size > 0).length;

    if (this.stats.seqMin !== null && this.stats.seqMax !== null) {
      const expectedFrames = this.stats.seqMax - this.stats.seqMin + 1;
      const receivedFrames = this.stats.completeFrames + this.stats.partialFrames;
      this.stats.missingFrames = Math.max(0, expectedFrames - receivedFrames);
    }
  }

  getCompletedFrames() {
    return [...this.completedFrames];
  }

  clearCompleted() {
    this.completedFrames = [];
  }

  getStats() {
    return { ...this.stats };
  }
}