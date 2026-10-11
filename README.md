<div align="center">

<img src="assets/icon.png" width="120" alt="Xodus Nexus" />

# Xodus Nexus

Open-source Xbox-inspired game launcher for Linux, built on the
[xodus](https://github.com/xodus-gaming/xodus) project.

[![CI](https://github.com/domsvoboda/xodus-nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/domsvoboda/xodus-nexus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

Xodus Nexus browses the Microsoft Store catalog, signs you in to your Xbox
account, downloads PC Game Pass titles and runs them through a managed Wine
build with an open-source Xbox GDK runtime.

---

![Xodus Nexus demo](docs/screenshots/demo.gif)

## Features

- Xbox-app-style UI: Store catalog with search and trending, Library,
  Downloads and Settings
- Real Xbox sign-in through the xodus backend (gamertag, XUID, licenses)
- One-click install and play with managed Xodus Proton runtimes
- Cloud save sync (download) for supported titles
- Per-title runtime configuration (DXVK/vkd3d, environment, overrides)

## Install

One command installs everything — system prerequisites, the latest AppImage
and a desktop entry:

```sh
curl -fsSL https://raw.githubusercontent.com/domsvoboda/xodus-nexus/main/scripts/install.sh | bash
```

On first run the launcher builds its managed backend (needs `git`, `cargo`,
`protoc`), asks you to sign in, and offers a one-click download of the
prebuilt Xodus Nexus runtime — the Wine build with our Xbox GDK patches,
fetched over HTTPS from Releases, no compilation or GitHub login. The full
guide lives in the [wiki](https://github.com/domsvoboda/xodus-nexus/wiki).

<details>
<summary>Manual install</summary>

Download the latest AppImage from
[Releases](https://github.com/domsvoboda/xodus-nexus/releases), then:

```sh
chmod +x Xodus-Nexus-*.AppImage
./Xodus-Nexus-*.AppImage
```

The installer also supports local files and skipping system packages:

```sh
XODUS_NEXUS_APPIMAGE=./Xodus-Nexus-0.5.24-x86_64.AppImage scripts/install.sh
XODUS_NEXUS_SKIP_DEPS=1 scripts/install.sh
```

</details>

## Status (October 2026)

- Catalog browsing, sign-in, downloads and launching work.
- Title compatibility varies; anti-cheat/online play is experimental.
  Some titles crash on launch, some on specific in-game flows.
- Per-title status and known issues: see the wiki's
  [Compatibility](https://github.com/domsvoboda/xodus-nexus/wiki) page.

## How it works

| Piece | Role |
|---|---|
| `src/` (this repo) | Electron + React launcher: catalog, library, downloads, settings |
| [xodus](https://github.com/xodus-gaming/xodus) | Xbox sign-in, licenses, package download and decryption |
| [xodus-gaming/wine](https://github.com/xodus-gaming/wine) + [xgameruntime](https://github.com/xodus-gaming/xgameruntime) | Wine with an open-source Xbox GDK runtime |
| `assets/*.patch` | Compatibility patches developed here, meant for upstream |

Every patch has a documented purpose, upstream status and application path in
[docs/patches.md](docs/patches.md).

No Microsoft binaries are shipped. The launcher downloads managed
components on your machine and tells you what it fetches.

## Development

```sh
npm install
npm run dev      # launcher in dev mode
npm test         # unit tests
npm run dist     # AppImage build
```

Patches in `assets/` are developed against the upstream xodus-gaming
repositories and are intended to be contributed back.

For the complete shared runtime (cloud-save/auth/API additions plus queue,
XAsync and HTTP/2 fixes), use the [pinned clean-build recipe](scripts/SHARED_RUNTIME.md).
It creates a separate development candidate and runs native contract probes;
it never replaces an active runtime or edits games/saves.

## License

[MIT](LICENSE)

Microsoft, Xbox and game titles are trademarks of their respective owners.
