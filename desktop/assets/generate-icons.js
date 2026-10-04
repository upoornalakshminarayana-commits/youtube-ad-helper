/**
 * Generates valid PNG and ICO icons (256x256 app icon, 32x32 tray icon, and icon.ico)
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

function createIcoFromPng(pngBuffer) {
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Type 1 = ICO
  icoHeader.writeUInt16LE(1, 4); // Number of images = 1

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(0, 0); // Width 256 = 0
  dirEntry.writeUInt8(0, 1); // Height 256 = 0
  dirEntry.writeUInt8(0, 2); // Colors (0 = no palette)
  dirEntry.writeUInt8(0, 3); // Reserved
  dirEntry.writeUInt16LE(1, 4); // Color planes
  dirEntry.writeUInt16LE(32, 6); // Bits per pixel
  dirEntry.writeUInt32LE(pngBuffer.length, 8); // Size of PNG image
  dirEntry.writeUInt32LE(22, 12); // Offset = 6 + 16 = 22

  return Buffer.concat([icoHeader, dirEntry, pngBuffer]);
}

// App Icon (256x256): High-res Red container with Play Triangle and Lightning Bolt
const appIconBuffer = createPng(256, 256, (x, y, w, h) => {
  const cx = w / 2;
  const cy = h / 2;

  // Rounded rectangle distance
  const dx = Math.max(0, Math.abs(x - cx) - (cx - 48));
  const dy = Math.max(0, Math.abs(y - cy) - (cy - 48));
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 36) {
    return [0, 0, 0, 0]; // Transparent outside rounded corner
  }

  // Play triangle: (96, 76) -> (184, 128) -> (96, 180)
  const inTriangle = (x >= 96 && x <= 184 && y >= 76 + (x - 96) * 0.59 && y <= 180 - (x - 96) * 0.59);
  if (inTriangle) {
    // Lightning bolt in center
    if (x >= 116 && x <= 148 && Math.abs(y - (cy + (x - 132) * 1.5)) < 24) {
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

  const inTriangle = (x >= 12 && x <= 22 && y >= 10 + (x - 12) * 0.6 && y <= 22 - (x - 12) * 0.6);
  if (inTriangle) {
    return [255, 255, 255, 255];
  }

  return [230, 16, 16, 255];
});

const assetsDir = path.resolve(__dirname);
fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir, 'icon.png'), appIconBuffer);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), createIcoFromPng(appIconBuffer));
fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), trayIconBuffer);

console.log('[YT Ad Helper] Generated 256x256 icon.png, icon.ico, and tray-icon.png successfully.');
