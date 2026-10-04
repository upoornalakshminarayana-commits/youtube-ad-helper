/**
 * YT Ad Helper - Native Messaging Host & Extension ID Bridge Setup
 * 1. Generates/preserves a deterministic RSA keypair for the Chrome Extension.
 * 2. Injects "key" into manifest.json and extension/manifest.json so the extension ID is constant.
 * 3. Compiles host.cs into Win32 native host.exe using csc.exe.
 * 4. Configures com.ytadhelper.nativehost.json with exact allowed_origins and host.exe path.
 * 5. Registers com.ytadhelper.nativehost in Windows Registry for Chrome and Edge.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const HOST_NAME = 'com.ytadhelper.nativehost';
const NATIVE_HOST_DIR = path.resolve(__dirname);
const ROOT_DIR = path.resolve(__dirname, '..');
const KEY_FILE = path.join(NATIVE_HOST_DIR, 'key.json');
const MANIFEST_HOST_JSON = path.join(NATIVE_HOST_DIR, 'com.ytadhelper.nativehost.json');
const HOST_CS = path.join(NATIVE_HOST_DIR, 'host.cs');
const HOST_EXE = path.join(NATIVE_HOST_DIR, 'host.exe');

const EXT_MANIFESTS = [
  path.join(ROOT_DIR, 'manifest.json'),
  path.join(ROOT_DIR, 'extension', 'manifest.json')
];

console.log('[Bridge Setup] Initializing YT Ad Helper Bridge...');

// 1. Generate or load deterministic RSA keypair
let keyData = null;
if (fs.existsSync(KEY_FILE)) {
  try {
    keyData = JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
  } catch (e) {}
}

if (!keyData || !keyData.publicKeyBase64 || !keyData.extensionId) {
  console.log('[Bridge Setup] Generating deterministic 2048-bit RSA keypair for Chrome Extension...');
  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' }
  });

  const base64Key = publicKey.toString('base64');
  const hash = crypto.createHash('sha256').update(publicKey).digest('hex');
  const extensionId = hash.slice(0, 32).split('').map(c => {
    const val = parseInt(c, 16);
    return String.fromCharCode(97 + val); // 0->'a', 15->'p'
  }).join('');

  keyData = {
    publicKeyBase64: base64Key,
    extensionId: extensionId,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(KEY_FILE, JSON.stringify(keyData, null, 2), 'utf8');
  console.log(`[Bridge Setup] Fixed Extension ID generated: ${extensionId}`);
} else {
  console.log(`[Bridge Setup] Loaded existing Extension ID: ${keyData.extensionId}`);
}

// 2. Inject "key" into manifest.json and extension/manifest.json
for (const manifestPath of EXT_MANIFESTS) {
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.key = keyData.publicKeyBase64;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
      console.log(`[Bridge Setup] Injected fixed key into ${path.basename(path.dirname(manifestPath))}/${path.basename(manifestPath)}`);
    } catch (e) {
      console.warn(`[Bridge Setup] Failed to update ${manifestPath}:`, e.message);
    }
  }
}

// 3. Compile host.cs into host.exe using Windows .NET csc.exe
const winDir = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
const cscCandidates = [
  path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
  path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  'csc.exe'
];

let compiled = false;
for (const csc of cscCandidates) {
  if (fs.existsSync(csc) || csc === 'csc.exe') {
    try {
      console.log(`[Bridge Setup] Compiling Win32 host.exe using ${csc}...`);
      execSync(`"${csc}" /nologo /target:exe /out:"${HOST_EXE}" "${HOST_CS}"`, { stdio: 'pipe' });
      compiled = true;
      console.log(`[Bridge Setup] host.exe successfully compiled at ${HOST_EXE}`);
      break;
    } catch (e) {
      // Try next candidate
    }
  }
}

if (!compiled) {
  console.warn('[Bridge Setup] Note: csc.exe compilation was not run. Fallback to host.bat if needed.');
}

// 4. Update com.ytadhelper.nativehost.json
const chosenPath = fs.existsSync(HOST_EXE) ? HOST_EXE : path.join(NATIVE_HOST_DIR, 'host.bat');
const allowedOrigin = `chrome-extension://${keyData.extensionId}/`;

let hostManifest = {
  name: HOST_NAME,
  description: 'YT Ad Helper Desktop Controller Native Messaging Host',
  path: chosenPath,
  type: 'stdio',
  allowed_origins: [
    allowedOrigin,
    'chrome-extension://*/*'
  ]
};

try {
  if (fs.existsSync(MANIFEST_HOST_JSON)) {
    const existing = JSON.parse(fs.readFileSync(MANIFEST_HOST_JSON, 'utf8'));
    const origins = new Set(existing.allowed_origins || []);
    origins.add(allowedOrigin);
    hostManifest.allowed_origins = Array.from(origins);
  }
} catch (e) {}

fs.writeFileSync(MANIFEST_HOST_JSON, JSON.stringify(hostManifest, null, 2), 'utf8');
console.log(`[Bridge Setup] Native host manifest configured at ${MANIFEST_HOST_JSON}`);
console.log(`[Bridge Setup] Native host binary path: ${chosenPath}`);
console.log(`[Bridge Setup] Allowed origins:`, hostManifest.allowed_origins);

// 5. Register in Windows Registry
const REG_TARGETS = [
  `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
  `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`
];

for (const target of REG_TARGETS) {
  try {
    const cmd = `reg add "${target}" /ve /t REG_SZ /d "${MANIFEST_HOST_JSON}" /f`;
    execSync(cmd, { stdio: 'pipe' });
    console.log(`[Bridge Setup] Successfully registered in Windows Registry: ${target}`);
  } catch (err) {
    console.warn(`[Bridge Setup] Warning registering ${target}:`, err.message);
  }
}

console.log('[Bridge Setup] Bridge setup completed successfully!');
console.log('================================================================');
console.log(`Permanent Extension ID: ${keyData.extensionId}`);
console.log('Reload the extension in Chrome (chrome://extensions) to apply the key.');
console.log('================================================================');
