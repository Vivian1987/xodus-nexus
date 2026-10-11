# Xodus Nexus

Open-source Electron launcher for CachyOS and other Linux distributions. The interface is inspired by the information architecture of the Xbox PC app, while the backend remains the original, external [xodus-gaming/xodus](https://github.com/xodus-gaming/xodus) project.

The launcher does not contain a fork of Xodus, a private catalog API, game files, Microsoft credentials, or fabricated store data.

This is an early Linux compatibility project, not an official Xbox client. The AppImage packages the launcher UI, **not** the Xodus CLI, Xodus Proton, games, or Microsoft credentials. First run still needs Git/Cargo/protoc to build a managed backend, GitHub CLI authentication to fetch the Xodus Proton snapshot, and Xodus sign-in. Some titles will remain unsupported; a verified Store package is not a guarantee that the game launches.

New installations use `~/Games/Xodus Nexus` for games and `~/.local/share/xodus-nexus/runtimes` for the managed runtime. Existing settings are preserved, including custom disks and imported game paths. Set an external Xodus checkout in Settings only if you want to use one; it is read-only.

## Verified upstream scope (8 October 2026)

The implementation was verified against Xodus `main` commit `53ea781dcd073e31d7ea68e894134e9c959bff04` and its advertised CLI help. The GUI dynamically checks the active binary instead of assuming that these commands exist:

- `login` and `logout`
- `download`
- `streaming <product> <destination>`
- `run <source> <wine>` on Unix
- `license`, `extract`, `extract-eappx`, `clep`, and `sp-license`

Xodus can resolve a known Product/Store ID, check the owned package, obtain a license and stream/extract an MSIXVC package. It does **not** currently expose a CLI command to list the user's library or browse/search the complete Game Pass catalog. MSIXVC2 is not supported. A downloaded GDK/MSIXVC title is not automatically guaranteed to work with Wine, xgameruntime, anti-cheat, DXVK, or vkd3d-proton.

Nexus 0.4 adds live, paginated game search using the public Microsoft Store web catalog and enriches each result with Microsoft Display Catalog package metadata. The Store page also loads Microsoft's live regional **Top Trending games** collection on entry; there are no fabricated featured titles. Search is not restricted to Game Pass: purchased products, subscription offers, editions, bundles, and add-ons can all appear. A Game Pass badge describes a Store offer only; it is never treated as proof that the signed-in account owns the product.

**Install** is enabled when the catalog exposes a `Windows.Desktop` package in the `MSIXVC` format. Nexus 0.4.1 also resolves Store editions whose SKU names exactly one primary product through `BundledSkus`, and passes that package Product ID to Xodus. Ambiguous multi-product bundles are not guessed, direct EAppx packages remain unsupported, and optional add-ons in an edition are not automatically installed with the primary game. Xodus remains the authority for account entitlement and package access when installation starts. The Store web endpoints are not a stable, documented launcher API and may require maintenance if Microsoft changes their response format.

Nexus inspects local Easy Anti-Cheat metadata in `EasyAntiCheat/Settings.json` or `EasyAntiCheat_EOS/Settings.json`. When it finds a target executable in an installed game, **Play** uses the offline route without EAC; protected online play is not supported. It sets Epic's documented `EOS_USE_ANTICHEATCLIENTNULL=1` only for that process. The managed Linux backend creates a temporary mirrored directory tree, materializes the target under its original filename, maps encrypted sibling PE files to their decrypted memfds, launches the target directly, and removes the temporary view after Wine exits. The original installation is never modified. This path is metadata-driven and contains no game title or Store ID. Missing metadata does not prove that a game lacks anti-cheat.

Before the first game launch, Nexus asks the selected Proton distribution to create its complete per-game prefix and install the bundled DXVK/vkd3d-proton DLLs. It then gives Xodus a generated shell wrapper which `exec`s `files/bin/wine` directly with that prefix and Proton's `WINEDLLPATH`, library paths and DLL overrides. The direct final `exec` is important: Xodus passes decrypted executables through inherited memfd descriptors, which a Python Proton process would otherwise close before Wine starts. Compatibility data lives beside the configured runtime under `compatdata/<game-id>`. Older raw-Wine prefixes are retained under `prefixes/` and are not deleted or overwritten.

When the selected Xodus Proton changes, Nexus rebases only the absolute prefix symlinks that point into an older sibling runtime release and have a matching file in the selected release. This prevents an existing prefix from silently continuing to load stale Wine DLLs while preserving ordinary files and unrelated user symlinks.

Every launch also overwrites a per-game diagnostic file beside the configured runtime under `logs/<game-id>-latest.log`. The Library operation panel links to it. Nexus disables default Wine `fixme` and vkd3d-proton informational output for game launches, without overriding user-supplied debug settings. Remaining repetitive verbose messages are summarized even when different threads interleave them; errors, warnings, Xodus messages and cloud-save results stay in the log. Game and download output updates the UI at most four times per second instead of once per line. To capture full Wine/vkd3d diagnostics temporarily, enable **Settings → Verbose game logs** (or launch Nexus with `XODUS_NEXUS_VERBOSE_LOGS=1`); this also disables log coalescing. The launcher does not erase existing logs or shader caches.

For `streaming`, Nexus gives Xodus a pseudo-terminal via util-linux `script` because Xodus' `indicatif` progress bars are silent over pipes. The Downloads page reads the aggregate transfer bar (not a single file bar), shows bytes and speed, and keeps a compact milestone log. The title's install folder can grow before Xodus knows the full extract size; percentages may adjust as metadata arrives.

The managed Linux backend v5 also applies `assets/xodus-streaming-cache-flush.patch`. Upstream `PrefixCacheFile` could publish `cached_len` after Tokio queued a file write but before a separate reader could see those bytes. Large streaming installs could panic with `cache ended before cached_len`. The patch flushes each pending chunk before publishing its cached length. A versioned v4 backend remains available for rollback. Failed entries show the actual Xodus error and can be retried from Downloads; retry may download data again because upstream truncates its temporary cache at startup.

## Safety model

- A configured external Xodus checkout is read-only. Nexus never runs `git pull`, `git checkout`, or `cargo build` there.
- Managed updates clone the official upstream into Electron `userData`, compile in a staging directory and validate `xodus-cli --help`.
- On Linux, the managed build applies a version-checked fix for [upstream issue #150](https://github.com/xodus-gaming/xodus/issues/150): Wine receives a temporary sparse PE-header launch stub mapped to the decrypted memfd instead of an unlaunchable NT path. The patch also forwards a PlayFab-scoped Xbox token. The implementation is based on the issue author's [`feat/linux-gdk-run`](https://github.com/CrissZollo/xodus/tree/feat/linux-gdk-run) branch.
- A managed build is activated atomically only after a successful build and capability check.
- Previous managed binaries remain in versioned `releases/<commit>` directories.
- Updates are rejected while a Nexus operation is active or an external `xodus-cli streaming/download` process is detected.
- Product IDs are validated before use. Downloads use direct child processes; streaming alone uses util-linux `script` to expose progress, with every argument shell-quoted.
- Games launch directly under Xodus without a separate systemd user service. Nexus monitors output and exit status and can stop the process. Launcher-specific startup variables and AppImage `APPDIR`/`APPIMAGE` are stripped; KDE's task manager reads `APPDIR` from a window process and can otherwise associate Wine with Nexus. Actual taskbar grouping must be checked in a desktop session.
- My Library offers **Check for updates** for completed installations with a verified Store ID. Xodus `streaming` compares installed content with the current package and downloads changed data into the existing directory. This is a manual, in-place update, not an atomic rollback-safe upgrade; close the game first and keep a backup of important local files.
- Renderer code has no Node.js access. IPC is exposed through a context-isolated, sandboxed preload.
- Store search is performed in the main process. Artwork URLs are restricted by both parsing and Content Security Policy to Microsoft Store image hosts, and results are cached in memory for ten minutes.
- The managed backend adds a read-only `account --json` command that returns only the username Xodus already stores under `user-DA`. It never prints or copies authentication tokens. External Xodus checkouts remain untouched.

## Xodus Runtime

Nexus 0.5.24 adds the backend v7 memfd-path fix and complete media environment for direct Wine launches. A local shared Wine candidate also preserves logical filenames for memory-backed image sections. See [the compatibility audit](docs/MEMFD_RUNTIME_AUDIT.md) for evidence, reproducible patch order, tests and limitations. Minecraft reaches sign-in; Forza still has a later unresolved access violation. The host-built candidate requires CachyOS's GStreamer libraries/codecs and remains 64-bit-only; it is not advertised as a portable all-game runtime.

Standard CachyOS, GE-Proton and upstream Proton builds do not contain the Xodus Wine patches and `xgameruntime` integration. Xodus Nexus 0.2 therefore includes a separate runtime manager for the official [`xodus-gaming/Proton`](https://github.com/xodus-gaming/Proton) `xodus/bleeding-edge` snapshots.

- **Settings → Xodus Runtime** resolves the current upstream commit and its successful `Snapshot` GitHub Actions run.
- Nexus downloads the official x86_64 archive and its separate SHA-512 artifact with `gh`, verifies the checksum, rejects unsafe archive paths and validates `files/bin/wine --version`.
- The archive is installed under the configured `runtimes/releases/<version>` directory. It does not modify Steam compatibility tools or any external Xodus checkout.
- Activation uses an atomic `current.json` pointer. A failed update leaves the previous runtime intact.
- Runtime installation and backend updates are blocked while Xodus is downloading, authenticating or launching a game.
- Every imported game gets an isolated 64-bit Wine prefix beside the configured runtime under `compatdata/<game-id>`.

### Unreal XCurl connectivity patch

The upstream `xgameruntime` implementation at commit `64aebcabb8c66121eae25d3bf0ace4b582ebb0da` returns `E_NOTIMPL` from its XNetworking connectivity-hint methods. Unreal Engine GDK titles using XCurl can consequently stop with `Could not initialize libcurl (result=2)`. This is tracked by [xgameruntime issue #25](https://github.com/xodus-gaming/xgameruntime/issues/25).

`assets/xgameruntime-xnetworking-offline.patch` implements the three connectivity-hint calls needed for XCurl initialization. The local patched runtime is kept in a separate versioned directory ending in `-xnetworking-v1`; the downloaded upstream runtime is not overwritten. Its `XODUS_NEXUS_PATCH.json` records the exact Proton, Wine and xgameruntime commits and the patched DLL checksum. This patch reports internet connectivity to the title so its HTTP layer can initialize; it does not implement multiplayer, Easy Anti-Cheat or Xbox network services.

### Offline WinGDK task queue and user patch

After XCurl initialization, some WinGDK titles require `XTaskQueue` and `XAsync` before they create their first window. Upstream commit `64aebcabb8c66121eae25d3bf0ace4b582ebb0da` still returns `E_NOTIMPL` from `XTaskQueueCreate` and `XUserAddAsync`, while `XTaskQueueDispatch(..., INFINITE)` returns immediately. This exact busy-loop is tracked by [xgameruntime issue #21](https://github.com/xodus-gaming/xgameruntime/issues/21); the broader implementation remains [issue #12](https://github.com/xodus-gaming/xgameruntime/issues/12).

`assets/xgameruntime-offline-taskqueue.patch` adds a thread-safe callback queue, blocking dispatch and termination wakeup, basic async completion, and a local offline user. The queue design was cross-checked against Microsoft GDK semantics and the LGPL implementation in `nocts-software/xgameruntime@f1d172b1180d45fff3e3f2b0abad517460023d0f`. The resulting runtime lives in a separate `-xnetworking-xtaskqueue-offline-v2` directory, preserving both the official snapshot and the previous connectivity-only build. It deliberately does not implement Xbox Live, multiplayer, or EAC.

### Experimental Xbox sign-in and cloud saves (xgameruntime PR #28)

The unmerged [xgameruntime PR #28](https://github.com/xodus-gaming/xgameruntime/pull/28) adds XUser sign-in, XTaskQueue/XAsync, and XGameSave local/cloud storage. Nexus can use a separately built runtime containing that DLL. For such a runtime, the launcher starts the original managed `xodus-service` in a private per-launch socket directory. A per-launch, random-key-protected TCP bridge on `127.0.0.1` forwards Wine's requests to its private Unix socket, then both processes stop after the game exits. Neither an external Xodus checkout nor the game installation is modified. This code is manifest-driven rather than tied to a specific game.

This is a two-way preview: the game may download existing saves and upload or delete cloud saves. Back up local prefixes and review the upstream PR before enabling it. The Store account label only proves that Xodus has stored credentials; it does not prove in-game sign-in or save sync. EAC-protected online play and achievements are not claimed.

On one tested Proton build, PR #28's Wine `AF_UNIX` connection to `xodus-service` fails with Winsock error `0x8007273f` (`WSAEAFNOSUPPORT`). The optional `assets/xgameruntime-tcp-bridge.patch` adds an authenticated loopback TCP option to that DLL. Experimental patches for `XUserGetState` and guest status remain in `assets/` for research, but the preview build deliberately excludes them after they crashed a tested title at its in-game offline choice; `install-cloud-save-preview.sh` rejects a DLL that carries them. Every game uses the same active runtime. **Play** automatically starts `xodus-service` when that runtime has the bridge; for an EAC title, Play still bypasses EAC for offline gameplay. This does not prove that a given game uses XGameSave or that its own sign-in works.

To reproduce this experimental build, use a prepared Wine tree at commit `b1dd32734a34472a28eb5be9922df06e07ac0834` with its generated `configure` script. The build script copies that tree and pins PR #28 to `3fd4ae1091339ef07d6f2d53fda8e15541f96ad3`; it never edits the source argument. It needs Git, rsync, Make, MinGW-W64 and the Wine build dependencies. Example with user-selected paths:

```bash
scripts/build-cloud-save-preview.sh /path/to/pristine/wine-b1dd /path/to/build-output
scripts/install-cloud-save-preview.sh /path/to/build-output/build/dlls/xgameruntime/x86_64-windows/xgameruntime.dll /path/to/runtimes 3fd4ae1091339ef07d6f2d53fda8e15541f96ad3
```

The installer copies the preserved base Proton release into a new versioned release, replaces only `xgameruntime.dll` there, validates the binary, and atomically switches `current.json`. It refuses to run while Xodus or Wine is active. Older releases remain as rollback backups, not per-game alternatives. **Settings → Use previous runtime** switches the single active runtime for all games after validation. The launcher follows the active managed-runtime pointer even if an older Wine path remains in settings. Legacy per-game Wine overrides are ignored.

One title has been observed loading a downloaded save with the TCP-bridge preview and then continuing from its in-game offline choice. The later XUser patches regressed that flow, so the default preview runtime now ships without them (release suffix `-bridge-v1-locale-v1`). This is anecdotal compatibility evidence, not certification for other games. `scripts/use-previous-cloud-runtime.sh` can restore the earlier bridge-only runtime pointer for all games after every game closes. `cloud 1` confirms cloud storage was enabled, not that online play or every in-game sign-in feature works.

Runtime-manager prerequisites on CachyOS:

```bash
sudo pacman -S --needed github-cli git tar xz coreutils
gh auth login
```

The current official snapshot is about 288 MB compressed and 1.4 GB extracted. GitHub Actions artifacts expire; Nexus reports that clearly instead of silently substituting standard Proton. A completely local Proton build remains an advanced upstream workflow and requires Podman plus substantially more temporary disk space.

## Development

Prerequisites: Node.js, npm, Git, Rust 1.98+, Cargo, protoc and Xodus' GTK/WebKitGTK build dependencies.

```bash
npm install
npm run dev
```

Validation and production build:

```bash
npm run typecheck
npm test
npm run build
npm run pack
```

Create AppImage and tar.gz artifacts with `npm run dist`.

## First use

1. Open **Settings** and verify the external backend or build a managed copy.
2. In **Xodus Runtime**, click **Check snapshot** and **Install Xodus Runtime**. Nexus selects its verified `files/bin/wine` automatically.
3. Use **Sign in via Xodus**. Xodus owns the authentication window and system-keychain credentials.
4. Search the live Microsoft Store catalog and click **Install** on a verified PC/MSIXVC result, import an existing installation from **Library**, or use the manual Product ID fallback.
5. Inspect live output in **Downloads**. The launcher uses util-linux `script` to capture Xodus' terminal-only progress display; an indeterminate bar means the CLI has not yet exposed a reliable aggregate percentage.

In **My Library**, right-click a game (or use its `⋯` button) to browse files, change its display name, or remove it. **Keep files** removes only the library entry. **Move files to Trash** first shows the exact installation path, checks that the directory has a game manifest and does not contain another library game or protected launcher data, then asks the desktop Trash service to move it; there is no permanent-delete fallback. Active Xodus operations block removal. In **Install Queue**, individual finished/failed entries and **Clear finished** remove queue history only, never game files.

Xodus credentials are persistent in the operating system keychain. The managed backend's read-only status command lets Nexus restore the stored username after an application restart. The label intentionally says **credentials stored**, not **online verified**: it does not refresh a token. The default xgameruntime still lacks in-game Xbox `XUser` sign-in; the optional PR #28 preview can attempt it, but it remains experimental.

Nexus has no hard-coded game import. Every title is discovered from `MicrosoftGame.config`, `appxmanifest.xml`, the Xodus streaming container, and optional Easy Anti-Cheat metadata. A ready installation only means the files required by `xodus-cli run` are present—it is not a compatibility guarantee.

Library offers **Install / update VC++** for every ready game using a full Xodus Proton distribution. Nexus downloads the official Microsoft x64 redistributable into its own prerequisite cache, verifies a pinned SHA-256, and installs it only into that game's Proton prefix. When a local package declares a VC14 dependency and its bundled installer is encrypted, **Play** verifies the registered VC++ version before starting the original executable through Xodus. For encrypted child executables, the managed backend creates a temporary decrypted launch view and removes it when the game exits; original game files stay unchanged. Update the managed backend in Settings to enable this feature. The Microsoft installer is not bundled or redistributed with the AppImage. This does not guarantee that every game will run.

## License and trademarks

Xodus Nexus is MIT licensed. Xodus is an independent upstream project. Microsoft, Xbox, game titles, logos, and product names are trademarks of their respective owners. This project is not affiliated with or endorsed by Microsoft or Xbox.
