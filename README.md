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

- Store catalog with search and trending, Library, Downloads and Settings
- Xbox sign-in through the xodus backend (gamertag, XUID, licenses)
- One-click install and play with managed Xodus Proton runtimes
- Cloud save sync for supported titles
- Per-title runtime configuration

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/domsvoboda/xodus-nexus/main/scripts/install.sh | bash
```

On first run the launcher builds its managed backend (`git`, `cargo` and
`protoc` required) and offers a one-click download of the prebuilt Xodus
Nexus runtime. More details in the
[wiki](https://github.com/domsvoboda/xodus-nexus/wiki).

The AppImage contains only the launcher, not Wine/Proton. In Settings, install
the shared Nexus runtime from this repository's **published GitHub Releases**.
The launcher verifies the matching SHA-512 file before activation, preserves
previous runtime versions, and refuses changes during active Xodus operations.
Runtime updates are independent of launcher updates; GitHub login is not needed
for these public release downloads. Drafts, prereleases and Actions artifacts
are not used by this stable download path. A runtime release must be published
before a fresh installation can use it; a source push alone is not sufficient.

## Status

Catalog browsing, sign-in, downloads and launching work. Title
compatibility varies; anti-cheat/online play is experimental. No Microsoft
binaries are shipped — managed components are downloaded on your machine.

## Development

Work on feature/fix branches targeting `develop`; reviewed integration targets
`main`. Read [AGENTS.md](AGENTS.md) and the shared
[engineering status](docs/development/STATUS.md) before taking over work.
CI creates test candidates; only separately authorized
[promotion](docs/development/RELEASES.md) publishes tested binaries.

```sh
npm install
npm run dev      # launcher in dev mode
npm test         # unit tests
npm run dist     # AppImage build
```

Patches in `assets/` are developed against the upstream xodus-gaming
repositories and meant to be contributed back; see
[docs/patches.md](docs/patches.md) and the
[pinned clean-build recipe](scripts/SHARED_RUNTIME.md).

## License

[MIT](LICENSE)
