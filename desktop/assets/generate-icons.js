/**
 * Generates valid PNG and ICO icons (512x512 app icon, 32x32 tray icon, and multi-size icon.ico)
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

// App Icon Drawer
function drawAppIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;

  // Rounded rectangle distance
  const pad = Math.floor(w * 0.1875);
  const dx = Math.max(0, Math.abs(x - cx) - (cx - pad));
  const dy = Math.max(0, Math.abs(y - cy) - (cy - pad));
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > Math.floor(w * 0.14)) {
    return [0, 0, 0, 0]; // Transparent outside rounded corner
  }

  // Play triangle: roughly 37.5% from left to 72%
  const triLeft = Math.floor(w * 0.375);
  const triRight = Math.floor(w * 0.72);
  const triTop = Math.floor(h * 0.297);
  const triBottom = Math.floor(h * 0.703);

  const inTriangle = (x >= triLeft && x <= triRight &&
    y >= triTop + (x - triLeft) * 0.59 &&
    y <= triBottom - (x - triLeft) * 0.59);

  if (inTriangle) {
    // Lightning bolt in center
    const boltLeft = Math.floor(w * 0.45);
    const boltRight = Math.floor(w * 0.58);
    if (x >= boltLeft && x <= boltRight && Math.abs(y - (cy + (x - Math.floor(w * 0.515)) * 1.5)) < Math.floor(h * 0.09)) {
      return [255, 215, 0, 255]; // Golden lightning bolt
    }
    return [255, 255, 255, 255]; // White play symbol
  }

  // Red background gradient
  const redShade = Math.floor(255 - (y / h) * 45);
  return [redShade, 16, 16, 255];
}

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

// App Icons: 512x512 and 256x256
const appIcon512 = createPng(512, 512, drawAppIcon);
const appIcon256 = createPng(256, 256, drawAppIcon);

// Standard Windows ICO containing 256x256 PNG
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

const assetsDir = path.resolve(__dirname);
fs.mkdirSync(assetsDir, { recursive: true });
fs.writeFileSync(path.join(assetsDir, 'icon.png'), appIcon512);
fs.writeFileSync(path.join(assetsDir, 'icon-256.png'), appIcon256);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), createIcoFromPng(appIcon256));
fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), trayIconBuffer);

console.log('[YT Ad Helper] Generated 512x512 icon.png, icon.ico, and tray-icon.png successfully.');
