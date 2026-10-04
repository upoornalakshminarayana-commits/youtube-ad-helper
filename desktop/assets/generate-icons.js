/**
 * Generates valid PNG icons (128x128 app icon and 32x32 tray icon)
 * using Node's standard built-in zlib and buffer modules (zero dependencies).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, drawPixelFn) {
  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8 bits per channel
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // Deflate
  ihdrData.writeUInt8(0, 11); // Filter
  ihdrData.writeUInt8(0, 12); // Interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT Chunk (Raw Scanlines)
  const scanlineLength = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * scanlineLength;
    rawData.writeUInt8(0, scanlineOffset); // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pixelOffset = scanlineOffset + 1 + x * 4;
      const [r, g, b, a] = drawPixelFn(x, y, width, height);
      rawData.writeUInt8(r, pixelOffset);
      rawData.writeUInt8(g, pixelOffset + 1);
      rawData.writeUInt8(b, pixelOffset + 2);
      rawData.writeUInt8(a, pixelOffset + 3);
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(8 + length + 4);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crcTarget = chunk.slice(4, 8 + length);
  const crc = crc32(crcTarget);
  chunk.writeUInt32BE(crc, 8 + length);
  return chunk;
}

// Standard CRC32 table
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

// App Icon (128x128): Red rounded container with Play Triangle and Lightning Bolt
const appIconBuffer = createPng(128, 128, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;
  const r = 54;

  // Rounded rectangle distance
  const dx = Math.max(0, Math.abs(x - cx) - (cx - 24));
  const dy = Math.max(0, Math.abs(y - cy) - (cy - 24));
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 18) {
    return [0, 0, 0, 0]; // Transparent outside rounded corner
  }

  // Play triangle: (48, 38) -> (92, 64) -> (48, 90)
  // Lightning bolt accents
  const inTriangle = (x >= 48 && x <= 92 && y >= 38 + (x - 48) * 0.58 && y <= 90 - (x - 48) * 0.58);
  if (inTriangle) {
    // Lightning bolt in center: (60, 42) to (76, 86)
    if (x >= 58 && x <= 74 && Math.abs(y - (cy + (x - 66) * 1.5)) < 12) {
      return [255, 215, 0, 255]; // Golden lightning bolt
    }
    return [255, 255, 255, 255]; // White play symbol
  }

  // Red background gradient
  const redShade = Math.floor(255 - (y / h) * 45);
  return [redShade, 16, 16, 255];
});

// Tray Icon (32x32): Crisp red badge with white play icon
const trayIconBuffer = createPng(32, 32, (x, y, w, h) => {
  const cx = 16;
  const cy = 16;
  const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
  if (dist > 14) return [0, 0, 0, 0];

  // Triangle inside
  const inTriangle = (x >= 12 && x <= 22 && y >= 10 + (x - 12) * 0.6 && y <= 22 - (x - 12) * 0.6);
  if (inTriangle) {
    return [255, 255, 255, 255];
  }

  return [230, 16, 16, 255];
});

const assetsDir = path.resolve(__dirname);
fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir, 'icon.png'), appIconBuffer);
fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), trayIconBuffer);

console.log('[YT Ad Helper] Generated icon.png and tray-icon.png successfully.');
