<p align="center">
  <img src="assets/logo.png" width="130" height="130" alt="Spotify Velvet Red Logo" />
</p>

<h1 align="center">🍷 Spotify Velvet Red Edition</h1>

<p align="center">
  <strong>An authentic Windows 7 Aero Glass & Windows Media Player 11 Velvet Red overhaul for Spotify Desktop.</strong><br>
  Featuring a low-RAM <strong>Windows XP Media Player Tunnel & Spiral Waveform Visualizer</strong> (viewable on the Lyrics screen or its dedicated Visualizer Surface screen), real-time bass & rhythm reactivity, and centered 3D Glass Jewel transport controls.
</p>

<p align="center">
  <a href="#-installation"><img src="https://img.shields.io/badge/Installer-Ready-crimson.svg?style=flat-square" alt="Installer Ready" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-darkred.svg?style=flat-square" alt="License" /></a>
  <a href="https://github.com/arshiatxd/velvetredspotify"><img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-blue.svg?style=flat-square" alt="Windows 10/11" /></a>
</p>

<br>

---

## ✨ Features

- **Windows 7 Aero Glass & Velvet Red Palette**:
  - Deep crimson smoked glass frame with dual-tone Aero reflection highlights.
  - Ruby acrylic sidebar panels, glossy 3D filter capsules, and translucent tracklist selection highlights.
  - Clean, borderless top navigation arrows without distorted oval boundaries.
  
- **Symmetrically Centered WMP 11 Transport Controls**:
  - Centerpiece 3D Glass Jewel Play/Pause Orb (`40px × 40px`).
  - Circular Ruby Satellite Previous & Next buttons (`34px × 34px`).
  - Flush Shuffle and Repeat controls.
  - All transport buttons share an exact vertical centerline (`centerY = 918px`) and uniform `10px` horizontal spacing.

- **Windows XP Media Player Tunnel & Spiral Waveform Visualizer**:
  - **Dual Viewing Modes (Strictly Scoped)**:
    1. **Lyrics Screen**: Automatically renders behind the Spotify Lyrics view.
    2. **Dedicated Visualizer Surface Screen**: Toggleable via the custom Vortex button in the bottom-right player bar (`Toggle WMP Tunnel Visualizer Surface`) for an unobstructed full-surface view with a floating track title HUD.
  - **True Bass & Rhythm Reactivity**: Hooks into Spotify's internal `PlayerAPI` and `/audio-attributes/v1/audio-analysis/` telemetry (`segments`, `beats`, `bars`, `loudness_max`, `pitches`, and `timbre`). Quiet passages calm the ring; bass kicks and drops trigger multi-stranded oscilloscope waveform spikes and tunnel zoom surges. Pausing playback settles the visualizer into a calm idle state.
  - **Windows Color Shifting**: Smoothly cycles through classic Windows XP Media Player palettes (Emerald Green, Electric Cyan, Sapphire Blue, Neon Violet, Velvet Red, Acid Lime, and Solar Amber) on bar downbeats and vocal transitions.

- **Ultra-Low RAM & Utility Optimization**:
  - Fixed `420 × 260` internal canvas buffer (`< 430 KB` RAM — **95% less memory** than full-HD canvases) with GPU bilinear upscaling.
  - Pre-allocated `Float32Array` geometry and harmonic tables with **zero garbage collection allocations** inside the render loop.
  - **0% Background CPU/GPU**: The rendering timer completely hibernates (`clearTimeout`) and unmounts when neither the Lyrics screen nor the Visualizer Surface screen is open.

- **Custom Multi-Resolution Application Icon**:
  - High-fidelity Windows `.ico` containing 16x16, 24x24, 32x32, 48x48, 64x64, 128x128 (32-bit BGRA DIB + 1-bit AND mask), and 256x256 (PNG).
  - Bound to Desktop, Start Menu, and Taskbar shortcuts without modifying `Spotify.exe` (maintains digital signature verification).

---

## 🚀 Installation

### Option 1: Standalone Setup Installer (Recommended)
1. Download **[`Spotify_VelvetRed_Setup.exe`](Spotify_VelvetRed_Setup.exe)** from this repository.
2. Run `Spotify_VelvetRed_Setup.exe`.
3. Click **Install & Launch Spotify**.
   - The installer closes any running Spotify process, backs up your original `xpui.spa`, installs the Velvet Red theme and WMP Tunnel Visualizer, updates shortcut icons, and launches Spotify automatically.

*Silent installation is also supported via command line:*
```cmd
Spotify_VelvetRed_Setup.exe /S
```

### Option 2: Restore Original Spotify UI
If you ever want to revert back to default Spotify:
1. Run `Spotify_VelvetRed_Setup.exe`.
2. Click **Restore Backup**.

---

## 🔒 Privacy & Account Security

- **Zero Credentials Touched**: This modification operates strictly within Spotify's frontend presentation layer (`xpui.spa`).
- **Local DPAPI Encryption**: All Spotify credentials, OAuth refresh tokens, and session databases are stored separately in `%APPDATA%\Spotify\Users\` and protected by Windows DPAPI. Neither this theme nor the installer transmits any account data externally.
- **100% Open-Source**: The complete installer source (`src/SetupInstaller.cs`), theme (`src/xpui.css`), and visualizer (`src/lyrics-visualizer.js`) are included in this repo.

---

## 🛠️ Technical Details

| Component | Implementation |
| :--- | :--- |
| **Package Target** | `%APPDATA%\Spotify\Apps\xpui.spa` |
| **Theme Engine** | Clean, comment-free CSS injected into `xpui.css` |
| **Visualizer Engine** | Low-RAM `420×260` 2D Canvas Tunnel & Spiral Waveform (`src/lyrics-visualizer.js`) |
| **Icon Resource** | `%APPDATA%\Spotify\spotify-final.ico` |
| **Installer** | Standalone .NET WinForms executable compiled via native `csc.exe` |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
