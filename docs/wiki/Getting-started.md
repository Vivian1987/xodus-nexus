# Getting started

## 1. Install

One command installs everything — system prerequisites (build tools, GitHub
CLI, Electron runtime libraries), the latest AppImage and a desktop entry:

```sh
curl -fsSL https://raw.githubusercontent.com/domsvoboda/xodus-nexus/main/scripts/install.sh | bash
```

After it finishes, Xodus Nexus appears in your application menu. Prefer
manual steps, or need to install a local build? See
[the installer's options](https://github.com/domsvoboda/xodus-nexus/blob/main/scripts/install.sh):
`XODUS_NEXUS_APPIMAGE=<file>` installs a local AppImage and
`XODUS_NEXUS_SKIP_DEPS=1` leaves system packages alone.

Games install into `~/Games/Xodus Nexus` by default. Everything the launcher
manages lives under one data root, `~/.local/share/xodus-nexus`:

```
~/.local/share/xodus-nexus/runtimes/
├── current.json                     # which runtime is active
├── releases/
│   └── xodus-nexus-runtime-11.0-20261011-g3fd4ae10/
├── compatdata/<game-id>/            # per-game Wine prefix
└── logs/<game-id>-latest.log        # per-game launch diagnostics
```

Runtime versions follow the upstream Proton snapshot convention
(`<wine>-<yyyymmdd>-g<sha>`): the Wine version of the base snapshot, the day
it was built, and the short commit of this repository carrying the patches —
so a version tells you which Wine you run and which patch state it contains.
Official upstream snapshots install as `xodus-proton-<commit>`. Previous
releases stay in `releases/` for rollback. Both roots can be changed in
**Settings → Storage and launch paths**.

## 2. First run

The launcher builds a managed copy of the
[xodus](https://github.com/xodus-gaming/xodus) backend on first use (needs
`git`, `cargo`/Rust 1.98+, `protoc` and Xodus' GTK/WebKitGTK build
dependencies — the installer sets these up on supported distributions). The
build is shown live in **Settings → Backend**; nothing is applied to any
system-wide installation.

## 3. Install the Xodus Runtime

In **Settings → Xodus Runtime** the launcher offers two runtimes:

**Xodus Nexus runtime (recommended).** A prebuilt package published on this
project's GitHub Releases: the official Proton snapshot plus our `xgameruntime`
compatibility patches, downloaded over plain HTTPS with SHA-512 verification.
Click **Install Nexus runtime** — no GitHub login and no compilation needed;
`tar` and `sha512sum` are enough (the installer sets these up).

**Official snapshot (fallback).** The unpatched upstream
[`xodus-gaming/Proton`](https://github.com/xodus-gaming/Proton) snapshot
straight from GitHub Actions:

1. Click **Check snapshot** — verifies the GitHub artifact.
2. Click **Install official snapshot** — downloads and verifies the archive
   (needs `github-cli` authenticated via `gh auth login`, `tar`, `sha512sum`).

Nexus selects the runtime's `files/bin/wine` automatically.

## 4. Sign in

Use **Sign in via Xodus**. Xodus owns the authentication window and stores
credentials in your system keychain. The account label means *credentials
stored*; it does not re-verify a token on every start.

## 5. Install a game

- Open **Store**, search the live Microsoft Store catalog and press
  **Install** on a verified PC result (MSIXVC package), or
- Enter a Product ID manually, or
- **Library → Import** an existing installation directory.

Watch live progress in **Downloads** — percentage, transfer speed and
estimated time remaining. Failed entries show the real Xodus error and can be
retried.

## 6. Play

Press **Play**. Before the first launch, Nexus asks the selected Proton
distribution to create the game's prefix and install its DXVK/vkd3d-proton
DLLs. Per-game logs live under the runtime root in `logs/<game-id>-latest.log`.

For Easy Anti-Cheat titles, **Play** uses the offline route without EAC —
protected online play is not supported (see [[Compatibility]]).

## Tips

- **Library → ⋯** renames a game, edits launch arguments and language,
  browses files or removes the entry.
- **Settings → Verbose game logs** captures full Wine/vkd3d diagnostics.
- Everything the launcher fetches is named in the UI; no Microsoft binaries
  are bundled in the AppImage.
