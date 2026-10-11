# Xodus Nexus

Open-source Xbox-inspired game launcher for Linux, built on the
[xodus](https://github.com/xodus-gaming/xodus) project.

![Xodus Nexus demo](https://raw.githubusercontent.com/domsvoboda/xodus-nexus/main/docs/screenshots/demo.gif)

Xodus Nexus browses the live Microsoft Store catalog, signs you in to your
Xbox account, downloads PC Game Pass titles and runs them through a managed
Wine build with an open-source Xbox GDK runtime.

> Unofficial hobby project. Not affiliated with or endorsed by Microsoft or
> Xbox. You need an active subscription / owned titles; nothing here bypasses
> licensing. Using Xbox Live from an unofficial client may violate the
> Microsoft Services Agreement — your account, your risk.

## Pages

- [[Getting started]] — first run, prerequisites, first install
- [[Compatibility]] — what works, what is experimental, known issues
- [Patch documentation](https://github.com/domsvoboda/xodus-nexus/blob/main/docs/patches.md) — every Wine/xgameruntime/xodus patch we carry

## Features

- Xbox-app-style UI: Store catalog with live search and trending, Library,
  Downloads and Settings
- Real Xbox sign-in through the xodus backend (gamertag, XUID, licenses)
- One-click install and play with managed Xodus Proton runtimes
- Cloud save sync (download) for supported titles
- Per-title runtime configuration (DXVK/vkd3d, language, launch options)

## Install

Download the latest AppImage from
[Releases](https://github.com/domsvoboda/xodus-nexus/releases), make it
executable and run it. First run asks for sign-in and builds its backend.

Report issues on the [issue tracker](https://github.com/domsvoboda/xodus-nexus/issues).
