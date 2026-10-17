<div align="center">

<img src="assets/icon.png" width="96" alt="Xodus Nexus" />

# Xodus Nexus

Your Microsoft Store PC games, on Linux.

[![CI](https://github.com/domsvoboda/xodus-nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/domsvoboda/xodus-nexus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

An Xbox-inspired launcher built on [Xodus](https://github.com/xodus-gaming/xodus),
using our patched Nexus backend and Nexus runtime.
Browse the Store, install games you own or can access through a subscription,
and play with one shared runtime. Xbox sign-in and cloud saves are available
for supported games.

![Xodus Nexus demo](docs/screenshots/demo.gif)

*Preview with sample account data.*

## Install

Download the latest x86_64 Linux AppImage from [Releases](https://github.com/domsvoboda/xodus-nexus/releases), make it executable and open it.

For an application-menu installation on supported distributions:

```sh
curl -fsSL https://raw.githubusercontent.com/domsvoboda/xodus-nexus/main/scripts/install.sh | bash
```

In **Settings**, install the **Nexus backend** and **Nexus runtime**, then sign in
with your Microsoft account. A valid game purchase or subscription is required.

If passkey sign-in gets stuck, choose **Continue in browser** in the sign-in
window. This option requires Google Chrome, either a native installation or the
Flatpak version available through Discover. Other browsers are not supported.

[Setup guide and SteamOS requirements](https://github.com/domsvoboda/xodus-nexus/wiki/Getting-started)

## Use

- **My Library** combines owned, Game Pass and installed games, with Access, Play state and title filters.
- **Store** lets you browse and install supported PC games.
- **Manage content** installs licensed add-ons and campaign packages.
- **Install Queue** downloads games one at a time and lets you add more while downloading or playing another game. Pause and resume are supported, including manual resume after restarting the launcher.
- Right-click an installed game for settings, VC++ prerequisites, shortcuts or removal.
- Game settings offer an optional **DualSense compatibility mode** if a standard DualSense is not detected. It applies only to that game and may disable advanced haptics and adaptive triggers.
- Choose **Add to Steam** in the game menu, or **Add Nexus to Steam** in Settings, to create a Non-Steam shortcut with available artwork. Steam can stay running, including in Game Mode. Requires native Linux Steam; Flatpak Steam is not yet supported.
- Update the launcher, backend and runtime in **Settings**.

[Documentation](https://github.com/domsvoboda/xodus-nexus/wiki) ·
[Report an issue](https://github.com/domsvoboda/xodus-nexus/issues)

## How it works

| Component | Role |
| --- | --- |
| Xodus Nexus | Store browsing, library, installation queue and launch controls. |
| Nexus backend | Patched build of [Xodus](https://github.com/xodus-gaming/xodus) for account sign-in, license checks, package downloads and launch preparation. |
| Nexus runtime | Built on [Xodus Proton](https://github.com/xodus-gaming/Proton) and [Xodus XGameRuntime](https://github.com/xodus-gaming/xgameruntime), with additional Nexus compatibility patches. |

Every game uses the same launch path and shared runtime.

## Compatible games

These results come from manual testing and user reports. Other games may work,
but have not been verified and may encounter compatibility issues.

| Game | Playable | Status |
| --- | --- | --- |
| Gears of War: E-Day | Yes | Playable online. |
| Deep Rock Galactic | Yes | Playable online. |
| Minecraft Dungeons | Yes | Playable online with the unreleased launcher fix. |
| Minecraft Dungeons II | Yes | Playable online. |
| Minecraft for Windows | Yes | Playable online. |
| Minecraft Launcher | Yes | Sign-in, Java download and startup work with the unreleased launcher fix; Java online unverified. |
| No Man's Sky | Yes | Playable online. |
| Valor Mortis | Yes | Fully playable. |
| Forza Horizon 6 | Yes | Playable online. |
| Palworld | Yes | Playable online. |
| DOOM Eternal | Yes | Playable. |
| DOOM: The Dark Ages | Yes | Playable (user report). |
| Fallout 76 | Yes | Playable online. |
| The Outer Worlds 2 | Yes | Playable. |
| Wolfenstein: The Old Blood | Yes | Playable. |
| Wasteland Remastered | Yes | Playable. |
| Danganronpa 2 | Yes | Playable. |
| Neon Abyss 2 | Yes | Playable. |
| Hollow Knight: Voidheart Edition | Yes | Playable. |
| Avowed | Yes | Playable. |
| Mortal Shell: Enhanced Edition | Yes | Playable (user report). |
| Solo Leveling: ARISE OVERDRIVE | Yes | Playable online with the unreleased runtime fix. |
| Sea of Thieves | Yes | Playable online; normal exit requires the unreleased runtime fix. |
| The Witcher 3 | No | Currently crashes on launch. |

[Full compatibility list](https://github.com/domsvoboda/xodus-nexus/wiki/Compatibility)

## Screenshots

[Library](docs/screenshots/demo-library.png) ·
[Store](docs/screenshots/demo-store.png) ·
[Install queue](docs/screenshots/demo-downloads.png) ·
[Settings](docs/screenshots/demo-settings.png)

Independent project, not affiliated with Microsoft or Xbox. A valid game license
is required. Launcher: [MIT license](LICENSE). The separate Xodus backend retains
its upstream GPLv3 license and ships with corresponding source.
The Nexus runtime includes [FFmpeg](https://ffmpeg.org/) shared libraries under
LGPL 2.1 or later; its corresponding pinned source and build recipe accompany
each runtime release.
[Contributing](CONTRIBUTING.md)
