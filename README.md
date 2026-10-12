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

*Demo UI with a sample library and queue; screenshots are not compatibility claims.*

## Install

On x86_64 Linux, the installer sets up system prerequisites, the latest AppImage
and an application-menu entry:

```sh
curl -fsSL https://raw.githubusercontent.com/domsvoboda/xodus-nexus/main/scripts/install.sh | bash
```

<details>
<summary>Manual AppImage installation</summary>

Download the AppImage from [Releases](https://github.com/domsvoboda/xodus-nexus/releases), then:

```sh
chmod +x Xodus-Nexus-0.1.0-x86_64.AppImage
./Xodus-Nexus-0.1.0-x86_64.AppImage
```

No Rust, Cargo or `protoc` is needed for the prebuilt backend. It requires GTK 3,
WebKitGTK 4.1 and a desktop secret service for sign-in.
Distribution-specific runtime prerequisites are listed in the
[setup guide](https://github.com/domsvoboda/xodus-nexus/wiki).

</details>

On first run, install the prebuilt Nexus backend and Nexus runtime in
Settings, and sign in to your Microsoft account. Both components are downloaded
as verified precompiled packages from Nexus Releases. No local compilation is
needed; neither component is bundled with the AppImage.

[Downloads](https://github.com/domsvoboda/xodus-nexus/releases) ·
[Setup & documentation](https://github.com/domsvoboda/xodus-nexus/wiki) ·
[Report an issue](https://github.com/domsvoboda/xodus-nexus/issues)

## How it works

| Component | Role |
| --- | --- |
| Xodus Nexus | Store browsing, library, installation queue and launch controls. |
| Nexus backend | Patched build of [Xodus](https://github.com/xodus-gaming/xodus) for account sign-in, license checks, package downloads and launch preparation. |
| Nexus runtime | Built on [Xodus Proton](https://github.com/xodus-gaming/Proton) and [Xodus XGameRuntime](https://github.com/xodus-gaming/xgameruntime), with additional Nexus compatibility patches. |

Every game uses the same launch path and shared runtime. Compatibility fixes
belong in the backend/runtime, not in title-specific launcher routes.

## Compatible games

These games have been manually tested. Other games may work, but have not been
verified and may encounter compatibility issues.

| Game | Playable | Status |
| --- | --- | --- |
| Gears of War: E-Day | Yes | Launch, account sign-in, existing saves and online lobby work. |
| Deep Rock Galactic | Yes | Account sign-in and game lobby work; no DRG servers appear in the server browser. |
| Minecraft Dungeons II | No | Stuck at Signing in. |

[Full compatibility list](https://github.com/domsvoboda/xodus-nexus/wiki/Compatibility)

## Screenshots

[Library](docs/screenshots/demo-library.png) ·
[Store](docs/screenshots/demo-store.png) ·
[Install queue](docs/screenshots/demo-downloads.png) ·
[Settings](docs/screenshots/demo-settings.png)

Independent project, not affiliated with Microsoft or Xbox. A valid game license
is required. Launcher: [MIT license](LICENSE). The separate Xodus backend retains
its upstream GPLv3 license and ships with corresponding source.
[Contributing](CONTRIBUTING.md)
