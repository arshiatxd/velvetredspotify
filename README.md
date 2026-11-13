<p align="center">
  <img src="assets/logo.png" width="130" height="130" alt="Spotify Velvet Red Logo" />
</p>

<h1 align="center">🍷 Spotify Velvet Red Edition</h1>

<p align="center">
  <strong>An authentic Windows 7 Aero Glass & Windows Media Player 11 Velvet Red overhaul for Spotify Desktop (1.3.9.2055+).</strong><br>
  Includes automatic <strong>SpotX</strong> pre-installation, a 5-model <strong>WMP Visualizer Studio</strong> (`XP Tunnel`, `Spiral Vortex`, `WMC Starburst`, `Scope & Bars`, `Cyber Orb`) powered by Spotify's native 3-band protobuf waveforms &amp; BPM telemetry, an interactive <strong>RGB Color Wheel + RGB Rotation</strong>, Lyrics-screen overlay toggle, and WMP 11 3D Glass Jewel transport controls.
</p>

<p align="center">
  <a href="#-installation-guide"><img src="https://img.shields.io/badge/Spotify-1.3.9.2055-crimson.svg?style=flat-square" alt="Spotify 1.3.9.2055" /></a>
  <a href="#-installation-guide"><img src="https://img.shields.io/badge/Installer-SpotX%20%2B%20Velvet%20Red-darkred.svg?style=flat-square" alt="SpotX + Velvet Red" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-darkred.svg?style=flat-square" alt="License" /></a>
  <a href="https://github.com/arshiatxd/velvetredspotify"><img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-blue.svg?style=flat-square" alt="Windows 10/11" /></a>
</p>

<br>

<p align="center">
  <img src="assets/screenshots/home_view.png" width="100%" alt="Spotify Velvet Red Edition Home View" />
</p>

---

## ✨ Features

- **Windows 7 Aero Glass & Velvet Red Palette**:
  - Deep crimson smoked glass frame with dual-tone Aero reflection highlights.
  - Ruby acrylic sidebar panels, glossy 3D filter capsules, and translucent tracklist selection highlights.
  - Clean, borderless top navigation arrows without distorted oval boundaries.
  
- **WMP 11 3D Glass Jewel Transport Controls (`1.3.9.2055` Fix)**:
  - Centerpiece `42px × 42px` WMP 11 3D Crimson Glass Jewel Play/Pause Orb with crisp `#ffffff` glyphs (bypasses Spotify `1.3.9.2055` Encore inverted-light overlay fill).
  - Circular Smoked Chrome-Ruby Skip Back & Skip Forward spheres (`34px × 34px`).
  - Clean circular hovers, high-contrast active Shuffle/Repeat indicators without icon blur, and sharp playlist/card Play buttons.
  
- **WMP Multi-Model Visualizer Studio (Overhauled Retro Edition)**:
  - **5 High-Energy Beat-Driven Visualizer Models** (powered by kick/snare transient detection, shockwaves, camera shake, kinetic echo feedback, and a 96-particle spark system):
    1. **XP Tunnel**: Aggressive radial sawtooth oscilloscope waves (`XP` Media Player style) with beat-triggered expanding shock rings, laser sparks, and zoom-trailing glow.
    2. **Spiral Vortex**: High-torque jagged lightning spiral arms bursting out of an intense core reactor with radial spark flares.
    3. **WMC Starburst**: Layered concentric multi-lobe harmonic petals expanding outward in full chromatic feedback.
    4. **Scope & Bars**: Mirrored 48-band segmented retro VU spectrum analyzer with sticky peak caps, dual-channel spiked oscilloscope waveforms, and vertical kinetic trails.
    5. **Cyber Orb**: Scrolling retro perspective grid horizon beneath a solar plasma orb, beat-reactive lightning coronas, and dual wave ribbons.
  - **Interactive Color Studio**:
    - **RGB Color Wheel Picker**: Click or drag anywhere on the 2D HSV/RGB color wheel in the Visualizer Surface Studio Bar to set a custom hue and saturation.
    - **RGB Color Rotation Checkbox**: Enable continuous rhythm-driven RGB hue rotation or uncheck to lock in your exact chosen color from the RGB wheel.
  - **Dual Viewing Modes + Seamless Navigation & Fullscreen**:
    1. **Lyrics Screen (with On/Off Toggle)**: Renders directly behind Spotify lyrics (`z-index` layered so lyrics stay bright and legible above the animation) with a non-overlapping **`Visualizer: ON / OFF`** pill in the Lyrics top bar.
    2. **Dedicated Visualizer Surface Screen (+ Fullscreen Mode)**: Toggle via the equalizer icon in the bottom-right player bar (or `Alt+V`) for an unobstructed canvas with model pills, RGB Color Wheel, RGB Rotation toggle, **`Sensitivity`** (`Subtle` / `Balanced` / `Overdrive`), live **BPM / 3-Band badge & Beat LED**, **`Fullscreen`** (`F` / `Esc`), and track HUD. Clicking `Back`, `Forward`, `Home`, `Search`, `Browse`, `Lyrics`, sidebar playlists, or artist/track links seamlessly exits Surface Mode via `Platform.getHistory()`.
  - **Native 3-Band Waveform & BPM Sync (`1.3.9.2055`)**: Decodes Spotify's protobuf `MetadataExtensions` (`THREEBAND_WAVEFORMS`, `AUDIO_ATTRIBUTES_V2`, `BEATS`, `LIST_TUNER_AUDIO_ANALYSIS`) alongside `PlayerAPI` and playback clock synchronization. Tempo and beat pulses start automatically on load without manual seekbar interaction.

- **SpotX-First Lightweight Single-File Installer**:
  - Compact `~229 KB` standalone `.exe` that strips dead stock bundles, installs/updates **SpotX** first when missing or requested, and injects gzip-compressed Velvet Red assets in-place into `xpui.spa`.

- **Ultra-Low RAM & Zero Background Overhead**:
  - DPR-capped 2D Canvas buffers with pre-allocated `Float32Array` geometry & typed spark buffers with zero GC churn inside the render loop.
  - Completely halts rendering (`cancelAnimationFrame`) and hides the canvas outside the Lyrics screen and Visualizer Surface screen (or when toggled `OFF`).

- **Custom Multi-Resolution Application Icon**:
  - Multi-size Windows `.ico` bound directly to Desktop, Start Menu, and Taskbar shortcuts without altering `Spotify.exe` digital signatures.

---

## 📸 Visualizer Studio & Theme Gallery

| **XP Tunnel** | **Spiral Vortex** |
| :---: | :---: |
| <img src="assets/screenshots/xp_tunnel.png" width="100%" alt="XP Tunnel Visualizer" /> | <img src="assets/screenshots/spiral_vortex.png" width="100%" alt="Spiral Vortex Visualizer" /> |

| **WMC Starburst** | **Scope & Bars** |
| :---: | :---: |
| <img src="assets/screenshots/wmc_starburst.png" width="100%" alt="WMC Starburst Visualizer" /> | <img src="assets/screenshots/scope_and_bars.png" width="100%" alt="Scope & Bars Visualizer" /> |

| **Cyber Orb** | **Fullscreen Studio Mode** |
| :---: | :---: |
| <img src="assets/screenshots/cyber_orb.png" width="100%" alt="Cyber Orb Visualizer" /> | <img src="assets/screenshots/fullscreen_visualizer.png" width="100%" alt="Fullscreen Visualizer" /> |

| **Lyrics Screen Integration** | **Artist View & Glass Controls** |
| :---: | :---: |
| <img src="assets/screenshots/lyrics_visualizer.png" width="100%" alt="Lyrics Screen Visualizer" /> | <img src="assets/screenshots/artist_view.png" width="100%" alt="Artist View" /> |

---

## 🚀 Installation Guide

> **Important Prerequisite — Install Official Spotify Desktop First:**
> `Spotify_VelvetRed_Setup.exe` (`~229 KB`) runs **SpotX** and patches Spotify's frontend (`%APPDATA%\Spotify\Apps\xpui.spa`) in-place. It does **not** redistribute Spotify's desktop runtime binaries.
> - Install the **official Windows Desktop version of Spotify** (`1.3.9.2055`, downloaded from [spotify.com/download/windows](https://www.spotify.com/download/windows/), not the Microsoft Store edition) before running setup.

---

### Step-by-Step Setup (Recommended)

1. **Install Official Spotify (if not already installed)**:
   - Download and install Spotify Desktop from [spotify.com/download/windows](https://www.spotify.com/download/windows/) and sign in once so `%APPDATA%\Spotify\Apps\xpui.spa` exists.
2. **Download the Velvet Red Installer**:
   - Download **[`Spotify_VelvetRed_Setup.exe`](Spotify_VelvetRed_Setup.exe)** from this repository (**Download raw file**).
3. **Run `Spotify_VelvetRed_Setup.exe`**:
   - Double-click `Spotify_VelvetRed_Setup.exe`. *(If Windows SmartScreen prompts for an unsigned executable, click **More info** → **Run anyway**).*
4. **Install SpotX + Velvet Red**:
   - Keep **Install / Update SpotX first** checked and click **`Install & Launch Spotify`**.
   - The installer automatically closes Spotify, runs SpotX safely (`podcasts_on`, `block_update_on`, `new_theme`), injects `/velvet-red.css` and `/lyrics-visualizer.js` into `xpui.spa`, installs `velvet_red.ico` on shortcuts, clears stale CEF cache, and launches Spotify.

*Silent / unattended CLI switches are supported via PowerShell or Command Prompt:*
```cmd
Spotify_VelvetRed_Setup.exe /S
Spotify_VelvetRed_Setup.exe /S /SPOTX
Spotify_VelvetRed_Setup.exe /S /RESTORE
```
*(Optional `/START` flag relaunches Spotify automatically after a silent `/S` install.)*

---

### 🎮 How to Use the Visualizer Studio

- **Dedicated Visualizer Surface Screen**:
  - Click the **Equalizer icon** in the bottom-right player bar (left of Lyrics) or press **`Alt+V`** to open the Visualizer Studio Surface.
  - Switch between **`XP Tunnel`**, **`Spiral Vortex`**, **`WMC Starburst`**, **`Scope & Bars`**, and **`Cyber Orb`**.
  - Drag the **RGB Color Wheel** to set hue/saturation, toggle **`RGB Rotation`**, and choose **`Subtle`**, **`Balanced`**, or **`Overdrive`** sensitivity.
  - Click **`Fullscreen`** (or press **`F`**; **`Esc`** exits).
- **Lyrics Screen Visualizer (On/Off)**:
  - Open **Lyrics** (`🎤` button). Opening Lyrics from Surface Mode exits Surface Mode automatically.
  - Toggle **`Visualizer: ON / OFF`** in the top-right bar to enable or disable the behind-lyrics visualizer.

---

### 🔄 Restoring Default Spotify / After Spotify Updates

- **To Uninstall Velvet Red (keeping SpotX)**:
  - Run `Spotify_VelvetRed_Setup.exe` and click **Restore Backup** (or pass `/S /RESTORE`). Velvet Red stylesheets, scripts, and shortcut icons are removed cleanly while SpotX remains intact.
- **If Spotify Updates**:
  - Run `Spotify_VelvetRed_Setup.exe` with **Install / Update SpotX first** checked to patch SpotX and re-apply Velvet Red cleanly.

---

## 📋 Patch Notes — v1.3.9.2055 Update

- **Full Spotify `1.3.9.2055` Compatibility**: Updated CSS selectors and Lyrics stacking context (`.R1kU6b2KxZc8FWfbYf3m`, `.f42lbbUT05gjuREF86Hw`, `.ISEJ4fISQcRgNTF5dVAA`, `.wYWhVPZoG93lR7ogMIug`, `.Ii0P5lvVrAzHgsutQTVz`) for Spotify Desktop `1.3.9.2055`.
- **Playback Button Contrast & Alignment Fix (`1.3.9.2055`)**: Fixed the Encore `invertedLight` inner span overlay (`button[data-testid="control-button-playpause"]`) that obscured the Play/Pause glyph, styled Skip Back/Forward as `34px × 34px` smoked crimson glass spheres, restored white SVG contrast on primary play buttons, and cleanly separated active Shuffle/Repeat indicators.
- **Seamless Visualizer Surface Navigation**: Connected `Platform.getHistory()` listener and capture-phase click/focus guards so clicking `Back`, `Forward`, `Home`, `Search`, `Browse`, `Lyrics`, Left Sidebar items, or now-playing links immediately exits Visualizer Surface Mode and Fullscreen without getting stuck behind the canvas.
- **Aggressive Retro WMP Visualizer Overhaul**: Overhauled all 5 models (`XP Tunnel`, `Spiral Vortex`, `WMC Starburst`, `Scope & Bars`, `Cyber Orb`) with kick/snare transient shockwaves, beat-driven camera shake, shared zoom/motion feedback trails, and zero-GC `Float32Array` 96-particle radial spark bursts.
- **SpotX-First Installer Overhaul**: Added automatic SpotX pre-installation (`/SPOTX`), non-interactive execution guards, and safe in-place `xpui.spa` patching (`233,984 bytes`).
- **Native 3-Band Waveform & Auto-Tempo Engine**: Migrated to Spotify `1.3.9.2055` protobuf `MetadataExtensions` (`THREEBAND_WAVEFORMS`, `AUDIO_ATTRIBUTES_V2`, `BEATS`, `LIST_TUNER_AUDIO_ANALYSIS`) with `PlayerAPI` + DOM clock sync so BPM and reactivity engage automatically without seekbar clicks.

---

## 🔒 Privacy & Account Security

- **Zero Credentials Touched**: Operates strictly within Spotify's local presentation layer (`xpui.spa`).
- **Local DPAPI Encryption**: Credentials and session tokens stay untouched in `%APPDATA%\Spotify\Users\`.
- **Open-Source**: Full comment-free source lives in [`src/SetupInstaller.cs`](src/SetupInstaller.cs), [`src/xpui.css`](src/xpui.css), and [`src/lyrics-visualizer.js`](src/lyrics-visualizer.js).

---

## 🛠️ Technical Details

| Component | Implementation |
| :--- | :--- |
| **Target Client** | Spotify Desktop `1.3.9.2055` (`%APPDATA%\Spotify\Apps\xpui.spa`) |
| **Theme Layer** | Aero Glass & Velvet Red CSS (`src/xpui.css` → `/velvet-red.css`) |
| **Visualizer Engine** | 5-Model 2D Canvas Studio with Protobuf `MetadataExtensions` (`src/lyrics-visualizer.js` → `/lyrics-visualizer.js`) |
| **Icon Resource** | Multi-res `.ico` (`assets/spotify-final.ico` → `%APPDATA%\Spotify\velvet_red.ico`) |
| **Installer** | Standalone C# WinForms single-file executable (`233,984 bytes`) |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
