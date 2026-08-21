(() => {
  'use strict';

  class ByteWriter {
    constructor(initialSize = 1024 * 1024) {
      this.buffer = new Uint8Array(initialSize);
      this.offset = 0;
    }
    ensure(extra) {
      const needed = this.offset + extra;
      if (needed <= this.buffer.length) return;
      let size = this.buffer.length;
      while (size < needed) size *= 2;
      const next = new Uint8Array(size);
      next.set(this.buffer);
      this.buffer = next;
    }
    byte(v) { this.ensure(1); this.buffer[this.offset++] = v & 255; }
    word(v) { this.ensure(2); this.buffer[this.offset++] = v & 255; this.buffer[this.offset++] = (v >> 8) & 255; }
    ascii(text) {
      this.ensure(text.length);
      for (let i = 0; i < text.length; i++) this.buffer[this.offset++] = text.charCodeAt(i) & 255;
    }
    data(arr) { this.ensure(arr.length); this.buffer.set(arr, this.offset); this.offset += arr.length; }
    toUint8Array() { return this.buffer.slice(0, this.offset); }
  }

  class BitWriter {
    constructor(initialSize = 4096) {
      this.buffer = new Uint8Array(initialSize);
      this.offset = 0;
      this.current = 0;
      this.bits = 0;
    }
    pushByte(value) {
      if (this.offset >= this.buffer.length) {
        const next = new Uint8Array(this.buffer.length * 2);
        next.set(this.buffer);
        this.buffer = next;
      }
      this.buffer[this.offset++] = value & 255;
    }
    code(value, width) {
      let v = value;
      let remaining = width;
      while (remaining > 0) {
        const free = 8 - this.bits;
        const take = Math.min(free, remaining);
        const mask = (1 << take) - 1;
        this.current |= (v & mask) << this.bits;
        this.bits += take;
        v >>= take;
        remaining -= take;
        if (this.bits === 8) {
          this.pushByte(this.current);
          this.current = 0;
          this.bits = 0;
        }
      }
    }
    finish() {
      if (this.bits > 0) this.pushByte(this.current);
      return this.buffer.slice(0, this.offset);
    }
  }

  function lzwEncode(indexedPixels, minCodeSize = 8) {
    // A deliberately simple, robust GIF LZW stream. We emit literal palette
    // indexes and reset the dictionary before the 9-bit code width needs to
    // grow. This trades a little file size for predictable browser decoding.
    const clear = 1 << minCodeSize;
    const end = clear + 1;
    const codeSize = minCodeSize + 1;
    const bits = new BitWriter();
    const CHUNK = 200;

    bits.code(clear, codeSize);
    let sinceClear = 0;
    for (let i = 0; i < indexedPixels.length; i++) {
      bits.code(indexedPixels[i], codeSize);
      sinceClear++;
      if (sinceClear >= CHUNK && i !== indexedPixels.length - 1) {
        bits.code(clear, codeSize);
        sinceClear = 0;
      }
    }
    bits.code(end, codeSize);
    return bits.finish();
  }

  function palette332() {
    const palette = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
      const r = (i >> 5) & 7;
      const g = (i >> 2) & 7;
      const b = i & 3;
      palette[i * 3] = Math.round(r * 255 / 7);
      palette[i * 3 + 1] = Math.round(g * 255 / 7);
      palette[i * 3 + 2] = Math.round(b * 255 / 3);
    }
    return palette;
  }

  function rgbaTo332(rgba) {
    const indexed = new Uint8Array(rgba.length / 4);
    for (let src = 0, dst = 0; src < rgba.length; src += 4, dst++) {
      indexed[dst] = ((rgba[src] >> 5) << 5) | ((rgba[src + 1] >> 5) << 2) | (rgba[src + 2] >> 6);
    }
    return indexed;
  }

  function writeSubBlocks(writer, data) {
    let offset = 0;
    while (offset < data.length) {
      const size = Math.min(255, data.length - offset);
      writer.byte(size);
      for (let i = 0; i < size; i++) writer.byte(data[offset + i]);
      offset += size;
    }
    writer.byte(0);
  }

  function encodeGif({ width, height, frames, delayCs = 10, loop = 0 }) {
    if (!width || !height || !Array.isArray(frames) || !frames.length) throw new Error('GIF requires at least one frame.');
    const writer = new ByteWriter();
    writer.ascii('GIF89a');
    writer.word(width);
    writer.word(height);
    writer.byte(0xF7); // Global palette, 8-bit color resolution, 256 entries.
    writer.byte(0);
    writer.byte(0);
    writer.data(palette332());

    // Netscape loop extension.
    writer.byte(0x21); writer.byte(0xFF); writer.byte(0x0B); writer.ascii('NETSCAPE2.0');
    writer.byte(0x03); writer.byte(0x01); writer.word(loop); writer.byte(0x00);

    for (const frame of frames) {
      const indexed = frame instanceof Uint8Array && frame.length === width * height ? frame : rgbaTo332(frame);
      writer.byte(0x21); writer.byte(0xF9); writer.byte(0x04);
      writer.byte(0x04); // Restore-to-background disabled; disposal method 1.
      writer.word(Math.max(1, Math.round(frame.delayCs ?? delayCs)));
      writer.byte(0); writer.byte(0);

      writer.byte(0x2C);
      writer.word(0); writer.word(0); writer.word(width); writer.word(height);
      writer.byte(0x00);
      writer.byte(8);
      writeSubBlocks(writer, lzwEncode(indexed, 8));
    }

    writer.byte(0x3B);
    return writer.toUint8Array();
  }

  self.XMDGifEncoder = { encodeGif, rgbaTo332 };
})();
