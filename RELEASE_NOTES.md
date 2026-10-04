# YT Ad Helper v1.0.0

A Windows desktop controller + Chromium extension for automatic YouTube ad handling.

---

### Features
- **Pre-roll Ad Handling**: Detects and dismisses pre-roll advertisements before the main content begins.
- **Mid-roll Sponsored Ad Handling**: Automatically handles mid-roll sponsored advertisements appearing mid-video without skipping or ending the user's content playback.
- **Official YouTube Skip Button Handling**: Clicks official skip buttons as soon as YouTube renders them eligible.
- **`movie_player.skipAd()` Integration**: Communicates via isolated world / main world bridge to trigger official player skip handlers safely.
- **16x Acceleration Fallback**: Applies 16x playback acceleration only to confirmed video advertisements when immediate skipping is pending.
- **Audio Mute/Unmute State Preservation**: Restores user volume and mute status to exact pre-ad levels upon ad completion.
- **Ad-Pod Handling**: Smoothly traverses multi-ad sequences (e.g. Ad 1 of 2 -> Ad 2 of 2) without losing track of main content playback.
- **SPA Navigation Support**: Reacts to YouTube Single Page Application transitions (`yt-navigate-finish`, `yt-page-data-updated`, and History API updates).
- **Desktop ON/OFF Controller**: Electron desktop companion provides live status monitoring and global toggle controls.
- **Native Messaging Integration**: Low-latency stdin/stdout Native Messaging host (`com.ytadhelper.nativehost`) connecting Chrome/Edge with the desktop controller.
- **Windows Installer**: Automated NSIS installer configuring application files, desktop shortcuts, and Native Messaging registry entries.
- **Local-First Architecture**: Zero external network telemetry, zero third-party cloud dependencies, 100% local operation.

---

### Verification
- **Automated CI Tests**: **36/36 passed (100%)**
- **Automated Browser Test Suite**: **67/67 passed (100%)**
- **GitHub Actions Windows Build**: **Passed (Green)**
- **Installer**: Generated successfully (`YT-Ad-Helper-Setup.exe`)

---

### Installation Instructions
1. Download **`YT-Ad-Helper-Setup.exe`** from the Assets below.
2. Run the installer and complete setup.
3. Launch **YT Ad Helper** from your Start Menu or Desktop.
4. Follow the application's Chrome extension setup instructions:
   - Open Chrome (or Edge/Brave) and go to `chrome://extensions/`.
   - Enable **Developer mode** (top-right toggle).
   - Click **Load unpacked** and select the `extension` directory (located in the installation directory under `resources/extension` or your cloned workspace).
5. Open [YouTube](https://www.youtube.com).
6. Verify Protection is **ON** in the desktop companion or extension popup.
7. Enjoy uninterrupted playback across normal videos, pre-rolls, and mid-roll sponsored ads.

---

### Safety Guarantees
The verified release strictly preserves user playback position. The extension engine **never** manipulates the content video timeline:
- Zero `video.currentTime = video.duration`
- Zero `movie_player.seekTo()`
- No skipping to the end of actual content videos
- No restarting normal playback to 0:00

---

### Known Limitations
1. **Unpacked Extension**: Because this is an independent open-source release not published on the Chrome Web Store, the browser extension must be loaded as an unpacked extension via Developer Mode.
2. **Platform Support**: Native Messaging auto-installer is tailored for Microsoft Windows (x64) and Chromium-based browsers (Google Chrome, Microsoft Edge, Brave).
3. **YouTube Layout Evolution**: Detection relies on current YouTube DOM selectors and HTML5 video element properties; future breaking YouTube UI overhauls may require selector updates.
