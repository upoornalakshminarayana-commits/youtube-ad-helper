# YT Ad Helper

[![Build YT Ad Helper Installer](https://github.com/upoornalakshminarayana-commits/youtube-ad-helper/actions/workflows/build.yml/badge.svg)](https://github.com/upoornalakshminarayana-commits/youtube-ad-helper/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Repository](https://img.shields.io/badge/GitHub-youtube--ad--helper-red.svg)](https://github.com/upoornalakshminarayana-commits/youtube-ad-helper)

> High-performance Windows Desktop Controller & Chrome Native Messaging Bridge for YouTube Ad Skip & Acceleration.

GitHub Repository: [https://github.com/upoornalakshminarayana-commits/youtube-ad-helper](https://github.com/upoornalakshminarayana-commits/youtube-ad-helper)

---

## 📖 Project Overview

**YT Ad Helper** is a dual-tier YouTube protection suite consisting of:
1. A **Chromium Manifest V3 browser extension** with a frozen, battle-tested ad handling engine that instantly skips skippable ads, accelerates unskippable bumper/mid-roll ads at 16x speed with automatic audio muting, and cleans overlay banners while strictly preserving your playback position and playback speed.
2. A **Windows desktop application (Electron)** providing real-time telemetry, master control switches, live counters, system tray integration, and seamless IPC communication over the official Chromium Native Messaging standard via Windows Named Pipes.

---

## 🌟 Features

- **🎛️ Dedicated Windows Desktop Controller**: Modern dark YouTube-inspired dashboard (Electron) with live protection telemetry, status toggles, and statistics monitoring.
- **⚡ Manifest V3 Compliant Chrome Extension**: Native in-browser engine executing with zero remote servers, zero account sign-ins, and zero analytics (100% local-first).
- **🚀 Multi-Tiered Ad Handling**:
  - **Skippable Ads**: Instant skip button clicking & `movie_player.skipAd()` API hook.
  - **Unskippable Ads**: Direct ad duration seek & 16x acceleration fallback with automatic audio muting, reducing a 15-second ad to under 1 second.
  - **Mid-Roll Sponsored Ads**: Safe acceleration and immediate return to normal video playback without jumping to the end or restarting to 0:00.
  - **In-Player Banners & Overlays**: Automated detection and dismissal of overlay banner popups.
- **🔒 Non-Destructive State Restoration**: Automatically captures and cleanly restores the viewer's original playback speed (1.0x, 1.25x, 1.5x, 2.0x) and unmutes audio the instant an ad finishes.
- **🔌 Chromium Native Messaging**: Official 4-byte framed stdin/stdout protocol connecting the browser extension with the desktop application via a secure Windows Named Pipe (`\\.\pipe\yt_ad_helper_pipe`).
- **🪟 Windows System Tray & Startup**: Minimizes to the Windows System Tray on close to keep protection running smoothly in the background; optional "Start with Windows" setting.
- **🧪 Comprehensive Test Suites**: 36 automated headless tests in Node.js CI + 67 automated browser-based tests in `test_suite.html` (100% PASS).

---

## 🏗️ Architecture

```
                    ┌────────────────────────┐
                    │    YT Ad Helper.exe    │
                    │   (Electron Controller)│
                    │                        │
                    │ Protection ON / OFF    │
                    │ Extension Status       │
                    │ Live Statistics        │
                    │ Settings & Tray        │
                    └───────────┬────────────┘
                                │ Windows Named Pipe
                                │ (\\.\pipe\yt_ad_helper_pipe)
                    ┌───────────▼────────────┐
                    │  Native Messaging Host │
                    │   (host.js / host.exe) │
                    └───────────┬────────────┘
                                │ Chrome Native Messaging (4-byte framed stdio)
                    ┌───────────▼────────────┐
                    │ Chrome Extension (MV3) │
                    │ Ad Engine & Telemetry  │
                    └───────────┬────────────┘
                                │ DOM & In-Player Hooks
                             YouTube
```

---

## 📁 Repository Structure

```
youtube-ad-helper/
├── extension/                       # Complete Chromium Manifest V3 Extension
│   ├── manifest.json                # Fixed key & host permissions
│   ├── background.js                # Service worker with dual-channel bridge
│   ├── content.js                   # Content script coordinator & telemetry
│   ├── main-world.js                # Main-world player API hook & fallback
│   ├── core/
│   │   ├── detector.js              # Multi-signal ad detection & selector registry
│   │   ├── player.js                # Skip button interaction, 16x speedup & state restoration
│   │   ├── navigation.js            # SPA navigation coordinator (videos & Shorts)
│   │   ├── observer.js              # Low-overhead debounced MutationObserver
│   │   ├── storage.js               # Chrome local storage engine
│   │   └── logger.js                # Tagged logging engine
│   ├── popup/                       # In-browser popup menu (HTML, CSS, JS)
│   └── icons/                       # Scalable vector branding
│
├── desktop/                         # Electron Desktop Application (Controller)
│   ├── main/main.js                 # Named Pipe server, Tray, Sync server
│   ├── preload/preload.js           # Secure ContextBridge API
│   ├── renderer/                    # Modern YouTube Dark UI Dashboard
│   └── assets/                      # App icon & tray assets
│
├── native-host/                     # Chromium Native Messaging Host
│   ├── host.js                      # Buffered 4-byte framed stdio host
│   ├── host.cs                      # C# source for native Win32 host.exe wrapper
│   ├── host.bat                     # Windows execution wrapper
│   ├── setup-bridge.js              # Dynamic registry & manifest configurator
│   ├── register-host.js             # CLI registration delegate
│   ├── register-host.bat            # One-click Windows registration batch
│   ├── key.json                     # Deterministic public key for stable extension ID
│   └── com.ytadhelper.nativehost.json # Dynamic host manifest template
│
├── installer/
│   └── installer.nsh                # NSIS script with $INSTDIR registry registration
│
├── scripts/
│   └── test-runner.js               # Automated CI & headless test runner
│
├── .github/workflows/
│   └── build.yml                    # Automated Windows CI/CD workflow
│
├── test_suite.html                  # 67/67 automated in-browser test runner
├── package.json                     # Portable scripts & electron-builder config
├── package-lock.json                # Locked dependency tree
├── .gitignore                       # Node, Electron, dist, and Windows filters
└── README.md
```

---

## 💻 Requirements

- **Operating System**: Windows 10 or Windows 11 (64-bit).
- **Node.js**: Node.js 18+ (LTS recommended).
- **Browser**: Google Chrome 110+, Microsoft Edge, Brave, or any Chromium browser.

---

## 🚀 Local Development

### 1. Clone the Repository
```bash
git clone https://github.com/upoornalakshminarayana-commits/youtube-ad-helper.git
cd youtube-ad-helper
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Automated Tests
```bash
npm test
```
To run the full 67-test browser suite, simply open `test_suite.html` in Chrome or Edge.

### 4. Launch Desktop Controller
```bash
npm start
```

---

## 🧩 Chrome Extension Installation

1. Open Google Chrome (or Edge / Brave) and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the upper-right corner.
3. Click **Load unpacked** in the top-left toolbar.
4. Select the `extension/` folder inside this repository (or `%ProgramFiles%\YT Ad Helper\resources\extension` if installed via Setup installer).
5. The desktop dashboard will display:
   - **Protection Status**: `● ACTIVE`
   - **Chrome Extension**: `✓ Connected`

---

## 🔌 Native Messaging Setup

The application communicates with Chromium via the native messaging host `com.ytadhelper.nativehost`.

### Manual CLI Setup:
```bash
npm run register-host
```
*(Or double-click `native-host\register-host.bat`)*

This script automatically:
1. Ensures the deterministic RSA public key matches `extension/manifest.json`.
2. Compiles `host.cs` into `host.exe` via Windows built-in `csc.exe` (with fallback to `host.bat`).
3. Writes the host manifest to Windows Registry under:
   - `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ytadhelper.nativehost`
   - `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ytadhelper.nativehost`

---

## 📦 Windows Build & Installer Creation

To create the production standalone Windows installer:

```bash
npm run build
```

This compiles and packages the Electron desktop controller, native messaging host, and unpacked extension into a single executable:
```
dist/YT-Ad-Helper-Setup.exe
```

### What the Installer Does:
1. Installs the application to `%LOCALAPPDATA%\Programs\YT Ad Helper` (or user-chosen directory).
2. Deploys the Chrome Native Messaging host and unpacked extension into `resources/`.
3. Registers Chrome and Microsoft Edge `NativeMessagingHosts` registry keys dynamically to `$INSTDIR`.
4. Creates Desktop and Start Menu shortcuts.
5. Provides a clean uninstaller that removes all files and unregisters registry keys.

---

## 🔐 Security

- **Strict Command Allowlist**: Only predefined commands are handled (`SET_ENABLED`, `GET_STATUS`, `GET_STATS`, `RESET_STATS`).
- **No Remote Telemetry**: Zero external web requests, analytics, or remote API endpoints.
- **Sandboxed Messaging**: Chrome native messaging requires exact extension ID match defined in `com.ytadhelper.nativehost.json`.
- **Zero Secrets**: No private keys, credentials, or machine-specific tokens are stored or transmitted.

---

## 🛠️ Troubleshooting

### 1. Extension Shows "Disconnected" or "Waiting"
- Run `npm run register-host` to ensure the registry key points to your local folder.
- Go to `chrome://extensions/` and click the **↻ Reload icon** on **YouTube Ad Helper**.
- Ensure the desktop application is running (`npm start` or the installed `.exe`).

### 2. Native Host Not Found
- Verify the registry entry exists in PowerShell:
  ```powershell
  Get-ItemProperty "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.ytadhelper.nativehost"
  ```
- If missing, run `npm run register-host`.

### 3. Ads Are Accelerated Instead of Immediately Skipped
- Certain YouTube sponsored ads are classified as **unskippable in-stream ads** (15s or 6s bumper ads). For these formats, YouTube disables `skipAd()`.
- **Expected Behavior**: The engine automatically falls back to 16x acceleration and audio muting, concluding a 15-second ad in under 1 second without disturbing playback.

---

## ⚖️ Known Limitations

1. **Unskippable Ads**: YouTube enforces server-side controls on non-skippable advertisements. While skippable ads terminate instantly, unskippable formats are safely accelerated to 16x speed and muted.
2. **Third-Party Anti-Adblock Scripts**: Other aggressive ad-blocking extensions that inject non-standard video DOM elements may occasionally collide with playback acceleration. Running YT Ad Helper alongside standard extensions is supported.
3. **Local-First Scope**: All counters, preferences, and detection models remain completely local to your computer. No cloud synchronization or account login is provided.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
