<p align="center">
  <img src="assets/logo.png" width="130" height="130" alt="Spotify Velvet Red Logo" />
</p>

<h1 align="center">🍷 Spotify Velvet Red Edition</h1>

<p align="center">
  <strong>An authentic Windows 7 Aero Glass & Windows Media Player 11 Velvet Red overhaul for Spotify Desktop.</strong><br>
  Featuring a multi-model <strong>WMP Visualizer Studio</strong> (`XP Tunnel`, `Spiral Vortex`, `WMC Starburst`, `Scope & Bars`, `Cyber Orb`) with an interactive <strong>RGB Color Wheel + RGB Color Rotation</strong>, real-time bass & rhythm reactivity, a Lyrics-page Visualizer On/Off toggle, and centered 3D Glass Jewel transport controls.
</p>

<p align="center">
  <a href="#-installation-guide"><img src="https://img.shields.io/badge/Installer-Ready-crimson.svg?style=flat-square" alt="Installer Ready" /></a>
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

- **WMP Multi-Model Visualizer Studio**:
  - **5 Selectable Visualizer Models**:
    1. **XP Tunnel**: Classic Windows XP Media Player 6-strand electric oscilloscope tunnel with crisp radial zoom feedback.
    2. **Spiral Vortex**: Logarithmic multi-arm spiral galaxy with beat-reactive waveform modulation.
    3. **WMC Starburst**: Windows Media Center organic multi-lobe harmonic ribbons with edge palpitation.
    4. **Scope & Bars**: 48-band mirrored spectrum analyzer paired with dual-channel glowing oscilloscope waveforms.
    5. **Cyber Orb**: Concentric plasma rings with 36-spoke radial audio spikes and core bass glow.
  - **Interactive Color Studio**:
    - **RGB Color Wheel Picker**: Click or drag anywhere on the 2D HSV/RGB color wheel in the Visualizer Surface Studio Bar to set a custom hue and saturation.
    - **RGB Color Rotation Checkbox**: Enable continuous rhythm-driven RGB hue rotation or uncheck to lock in your exact chosen color from the RGB wheel.
  - **Dual Viewing Modes + Fullscreen Option**:
    1. **Lyrics Screen (with On/Off Toggle)**: Renders behind high-contrast Spotify lyrics (`z-index` layered so lyrics stay crisp and readable on top) and includes a floating **`Visualizer: ON / OFF`** button in the top-right corner of the Lyrics view.
    2. **Dedicated Visualizer Surface Screen (+ Fullscreen Mode)**: Toggleable via the custom Vortex button in the bottom-right player bar (`Open Visualizer Studio Surface`) for an unobstructed studio view with model selector pills, RGB Color Wheel, RGB Rotation toggle, **`Fullscreen`** toggle (`F11` / `Esc`), and track HUD.
  - **True Bass & Rhythm Reactivity**: Hooks into Spotify's internal `PlayerAPI` and `/audio-attributes/v1/audio-analysis/` telemetry (`segments`, `beats`, `bars`, `loudness_max`, `pitches`, and `timbre`). Quiet passages calm the ring; bass kicks and drops trigger multi-stranded oscilloscope waveform spikes and tunnel zoom surges. Pausing playback settles the visualizer into a calm idle state.

- **Ultra-Low RAM & Utility Optimization**:
  - Fixed `600 × 375` internal canvas buffer (`< 900 KB` RAM) with GPU bilinear upscaling and crisp electric strand rendering.
  - Pre-allocated `Float32Array` geometry and harmonic tables with **zero garbage collection allocations** inside the render loop.
  - **0% Background CPU/GPU**: The rendering timer completely hibernates (`clearTimeout`) and unmounts when neither the Lyrics screen nor the Visualizer Surface screen is active (or when toggled OFF on the Lyrics page).

- **Custom Multi-Resolution Application Icon**:
  - High-fidelity Windows `.ico` containing 16x16, 24x24, 32x32, 48x48, 64x64, 128x128 (32-bit BGRA DIB + 1-bit AND mask), and 256x256 (PNG).
  - Bound to Desktop, Start Menu, and Taskbar shortcuts without modifying `Spotify.exe` (maintains digital signature verification).

---

## 🚀 Installation Guide

> **⚠️ Important Prerequisite — Install Official Spotify Desktop First:**
> `Spotify_VelvetRed_Setup.exe` (`~10 MB`) is a **UI & Visualizer Mod Installer** that patches Spotify's frontend package (`%APPDATA%\Spotify\Apps\xpui.spa`). It does **not** bundle the `180+ MB` proprietary Spotify audio engine.
> - You must have the **official Windows Desktop version of Spotify** (downloaded from [spotify.com/download/windows](https://www.spotify.com/download/windows/), **not** the Microsoft Store version) installed on your PC before running this setup.

---

### Step-by-Step Setup (Recommended)

1. **Install Official Spotify (if not already installed)**:
   - Download and install Spotify Desktop from [spotify.com/download/windows](https://www.spotify.com/download/windows/) and log into your account at least once so `%APPDATA%\Spotify\Apps\xpui.spa` is created.
2. **Download the Velvet Red Installer**:
   - Download **[`Spotify_VelvetRed_Setup.exe`](Spotify_VelvetRed_Setup.exe)** from this repository (click on `Spotify_VelvetRed_Setup.exe` in the file list above, then click **Download raw file**).
3. **Run `Spotify_VelvetRed_Setup.exe`**:
   - Double-click `Spotify_VelvetRed_Setup.exe`. *(If Windows SmartScreen appears because the `.exe` is self-compiled, click **More info** → **Run anyway**).*
4. **Click `Install & Launch Spotify`**:
   - The installer will automatically:
     1. Close any running Spotify processes.
     2. Back up your original `xpui.spa` to `%APPDATA%\Spotify\Apps\xpui.spa.bak`.
     3. Install the **Velvet Red Aero Glass theme** and **5-Model WMP Visualizer Studio**.
     4. Apply the custom Velvet Red `.ico` icon to your Desktop, Start Menu, and Taskbar shortcuts and refresh the Windows icon cache.
     5. Relaunch Spotify automatically.

*Silent / unattended installation is also supported via PowerShell or Command Prompt:*
```cmd
Spotify_VelvetRed_Setup.exe /S
```

---

### 🎮 How to Use the Visualizer Studio

- **Dedicated Visualizer Surface Screen**:
  - Click the **Vortex icon** (`◎`) in the bottom-right player bar (right next to the Lyrics microphone icon) to open the full Visualizer Studio Surface.
  - Use the top **Customization Bar** to switch between **`XP Tunnel`**, **`Spiral Vortex`**, **`WMC Starburst`**, **`Scope & Bars`**, and **`Cyber Orb`**.
  - Drag anywhere on the **RGB Color Wheel** to pick a custom color, or check **`RGB Rotation`** to let the colors cycle automatically with the music rhythm.
  - Click **`Fullscreen`** (or press `F11`) for a 100% full-monitor visualizer experience (`Esc` to exit).
- **Lyrics Screen Visualizer (On/Off)**:
  - Open the normal **Lyrics** screen (`🎤` button).
  - Use the **`Visualizer: ON / OFF`** button in the top-right corner to toggle the background visualizer and customization bar on or off while reading lyrics.

---

### 🔄 Restoring Default Spotify / After Spotify Updates

- **To Uninstall / Revert to Default Spotify**:
  1. Run `Spotify_VelvetRed_Setup.exe`.
  2. Click **Restore Backup** — your original `xpui.spa.bak` and default icons are restored immediately.
- **If Spotify Auto-Updates**:
  - When Spotify updates itself in the background, it overwrites `xpui.spa` with the default UI. Simply run `Spotify_VelvetRed_Setup.exe` and click **Install & Launch Spotify** again to re-apply the Velvet Red Edition in 2 seconds.

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
| **Visualizer Engine** | Low-RAM `600×375` 2D Canvas Studio with 5 Models & RGB Wheel (`src/lyrics-visualizer.js`) |
| **Icon Resource** | `%APPDATA%\Spotify\spotify-final.ico` |
| **Installer** | Standalone .NET WinForms executable compiled via native `csc.exe` |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
