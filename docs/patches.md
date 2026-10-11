# Compatibility patches

Xodus Nexus builds on three upstream projects: the [xodus](https://github.com/xodus-gaming/xodus)
CLI, [xodus-gaming/wine](https://github.com/xodus-gaming/wine) and
[xgameruntime](https://github.com/xodus-gaming/xgameruntime). Every behavioral
difference we need lives in a versioned patch file in [`assets/`](../assets) —
nothing is applied by editing upstream checkouts in place, and the launcher
records in `XODUS_NEXUS_PATCH.json` which patches (and upstream commits) each
managed build contains.

All patches are developed with upstream contribution in mind. Where an
upstream issue or PR exists it is linked below.

| Patch | Component | Fixes | Upstream |
|---|---|---|---|
| `wine-memfd-filename.patch` | Wine | Memfd-backed executables lose their filename | — |
| `wine-mscoree-mono-path-bounds.patch` | Wine | Stack overflow in Mono discovery | — |
| `xgameruntime-xnetworking-offline.patch` | xgameruntime | `XNetworking` hints return `E_NOTIMPL` | [issue #25](https://github.com/xodus-gaming/xgameruntime/issues/25) |
| `xgameruntime-offline-taskqueue.patch` | xgameruntime | `XTaskQueue`/`XAsync` return `E_NOTIMPL` | [issue #21](https://github.com/xodus-gaming/xgameruntime/issues/21), [issue #12](https://github.com/xodus-gaming/xgameruntime/issues/12) |
| `xgameruntime-async-completion-lifetime.patch` | xgameruntime | Use-after-free in async completion callbacks | — |
| `xgameruntime-xuser-contract.patch` | xgameruntime | `XUserAdd`/handle contract violations | related to [PR #28](https://github.com/xodus-gaming/xgameruntime/pull/28) |
| `xgameruntime-tcp-bridge.patch` | xgameruntime | Wine cannot reach the service over `AF_UNIX` | based on [PR #28](https://github.com/xodus-gaming/xgameruntime/pull/28) |
| `xgameruntime-rta-endpoint-fallback.patch` | xgameruntime | Tokens for services outside the sign-in endpoint table fail | — |
| `xgameruntime-package-locale.patch` | xgameruntime | `XPackageGetUserLocale` returns `E_NOTIMPL` | — |
| `xgameruntime-xuser-state.patch` | xgameruntime | `XUserGetState` (research, not shipped) | — |
| `xgameruntime-xuser-guest.patch` | xgameruntime | `XUserGetIsGuest` (research, not shipped) | — |
| `xodus-linux-run.patch` | xodus | `run` does not support Unix launches | — |
| `xodus-launch-chain.patch` | xodus | Nested/child executables cannot start | — |
| `xodus-offline-mirror.patch` | xodus | Offline launches need a writable launch view | — |
| `xodus-memfd-path.patch` | xodus | Exe map entries need Unix names; signal exits reported as 0 | — |
| `xodus-streaming-cache-flush.patch` | xodus | Race in the streaming cache panics large installs | — |
| `xodus-account-status.patch` | xodus | GUI cannot show the stored account name | — |

## Wine patches

### `wine-memfd-filename.patch`

Xodus hands decrypted game executables to Wine through inherited anonymous
memfd descriptors instead of writing plaintext to disk. Wine's
`open_unix_file`/`open_mapped_dll_file` treated those files as anonymous, so a
game asking for its own executable path got a misleading `/memfd:` style
name. The patch threads an optional NT name for memory-backed images through
the wineserver file map, so modules loaded from memfds keep their logical
filename (`GameDir/Binaries/WinGDK/Game.exe`).

### `wine-mscoree-mono-path-bounds.patch`

`mscoree`'s Mono discovery writes `path + "\bin\libmono-2.0-*.dll"` into a
`MAX_PATH` buffer supplied by the caller. With a managed runtime installed
under a long release directory, the concatenation ran past the buffer and
corrupted the stack. The patch fails discovery cleanly when the composed path
would not fit.

## xgameruntime patches

### `xgameruntime-xnetworking-offline.patch`

Upstream `xgameruntime` returns `E_NOTIMPL` from the `XNetworking`
connectivity-hint methods. Unreal GDK titles that use XCurl check the hint
during initialization and stop with
`Could not initialize libcurl (result=2)`. The patch implements the three
hint calls and reports internet connectivity, so the title's HTTP layer can
start. Tracked upstream as
[xgameruntime issue #25](https://github.com/xodus-gaming/xgameruntime/issues/25).

### `xgameruntime-offline-taskqueue.patch`

Upstream `XTaskQueueCreate` and `XUserAddAsync` return `E_NOTIMPL`, and
`XTaskQueueDispatch(..., INFINITE)` returns immediately — titles that follow
the documented wait loop spin forever before their first window. The patch
adds a thread-safe callback queue, blocking dispatch, termination wakeup,
basic async completion and a local offline user. The queue semantics were
cross-checked against Microsoft GDK documentation and the LGPL implementation
in `nocts-software/xgameruntime`. Tracked upstream as
[issue #21](https://github.com/xodus-gaming/xgameruntime/issues/21) and
[issue #12](https://github.com/xodus-gaming/xgameruntime/issues/12).

### `xgameruntime-async-completion-lifetime.patch`

Async completion callbacks could read freed memory: the queue's cleanup
dropped the provider state while a late completion callback still dereferenced
it (observed as a page fault inside `async_completion_callback` with the
`0xfeeefeee` free pattern). The patch splits cleanup so a callback either
observes valid state or does not run. This fixed a deterministic crash of a
tested title on its "Play offline" choice and a random fatal error at launch.

### `xgameruntime-xuser-contract.patch`

Corrects the `XUserAdd`/handle contract against the Microsoft GDK
specification: out handles are always initialized, `XUserDuplicateHandle`
does not alias unexpectedly, `SignedIn` describes platform identity (not
network connectivity), initial sign-in is reported through
`XUserAddResult` instead of a fabricated `SignedInAgain` event, and the
provider does not invent account-change events or start background polling.
The patch keeps the real identity/token data from
[PR #28](https://github.com/xodus-gaming/xgameruntime/pull/28).

### `xgameruntime-tcp-bridge.patch`

[PR #28](https://github.com/xodus-gaming/xgameruntime/pull/28) forwards
in-game Xbox requests from Wine to `xodus-service` over an `AF_UNIX` socket.
Wine's Winsock returns `0x8007273f` (`WSAEAFNOSUPPORT`) for that address
family, so the service is unreachable. The patch adds an authenticated
loopback TCP transport as an alternative; Nexus starts `xodus-service` with
its own per-launch socket directory and a random-key-protected local TCP
bridge that stops with the game.

### `xgameruntime-rta-endpoint-fallback.patch`

The PR #28 endpoint table only covers the service endpoints returned at
sign-in. Titles also request tokens for other Xbox Live services — for
example the Real-Time Activity websocket at `wss://rta.xboxlive.com/connect`.
Requests for unlisted partners previously failed; the patch resolves them
through the same XSTS flow instead of giving up.

### `xgameruntime-package-locale.patch`

Implements `XPackageGetUserLocale` by reading the `XODUS_PACKAGE_LOCALE`
environment variable, which Xodus Nexus sets per title from its language
setting. Without it, titles that query the API fall back to English.
Build and install instructions live in
[`scripts/LOCALE_RUNTIME.md`](../scripts/LOCALE_RUNTIME.md).

### `xgameruntime-xuser-state.patch` / `xgameruntime-xuser-guest.patch`

Research patches for `XUserGetState` and `XUserGetIsGuest`. They are **not
part of shipped runtime builds**: the runtime installer rejects DLLs that
carry them, after the state patch crashed a tested title at its in-game
offline choice. Kept for upstream discussion only.

## xodus CLI patches

### `xodus-linux-run.patch`

Implements launching on Unix. The CLI stages a small launch stub, hands the
decrypted executable to Wine through the `WINE_DLL_FILE_MAP` memfd mapping and
execs the Wine binary directly — a Python-style wrapper process would close
the inherited memfd descriptors before Wine could read them. A PlayFab
authorization header is injected when available, and the target market is
passed through. The patch version in the active managed backend is recorded
as `linuxRunPatch` (currently `linux-run-v7`) in the launcher's backend
status.

### `xodus-launch-chain.patch`

Titles frequently start child executables (launchers, anti-cheat setup,
crash reporters) from inside the package. With encrypted siblings these
children cannot be found or decrypted on demand. The patch materializes the
whole launch chain: it builds a temporary launch view for the nested
executables, rejects path components that would escape the package
(`../`), and removes the view after the game exits. The original
installation is never modified.

### `xodus-offline-mirror.patch`

For the EAC-offline launch route, the CLI creates a temporary mirrored
directory tree, materializes the target under its original filename, maps
encrypted sibling PE files to their decrypted memfds, launches the target and
removes the mirror after Wine exits. The route is metadata-driven
(EasyAntiCheat `Settings.json`) and contains no game title or Store ID.

### `xodus-memfd-path.patch`

Aligns the CLI's exe map with the Wine-side memfd naming: entries carry Unix
paths, which is what the wineserver file map matches against. It also
preserves conventional shell exit status — a signal termination no longer
reports success (`0`) to the launcher.

### `xodus-streaming-cache-flush.patch`

Upstream `PrefixCacheFile` could publish `cached_len` after Tokio queued a
file write but before a separate reader could see those bytes, so large
streaming installs panicked with `cache ended before cached_len`. The patch
flushes each pending chunk before publishing its cached length. A versioned
backend without the patch remains available for rollback.

### `xodus-account-status.patch`

Adds a read-only subcommand that reports whether Xodus has stored credentials
and the stored username. It lets the launcher restore the account label
after an application restart without touching tokens or the keychain.

## In development

- **WinHTTP HTTP/2 support (Wine `winhttp`)**: a native HTTP/2 implementation
  for Wine's `winhttp`, developed and tested against the real Microsoft
  title services (regression suite: 14 checks). Not yet finalized as an
  `assets/*.patch` file; will be added here once the remaining transport gaps
  (chunked upload, multiplexing, proxy CONNECT, client certificates) are
  closed.
- **Easy Anti-Cheat online play**: the EAC client module currently loads as a
  mapped image without an initialized bridge, which blocks online
  attestation on at least one title. Under investigation; no fix is claimed.

## Applying the patches

Nothing needs to be applied by hand:

- The **xodus** patches are applied by the launcher's managed backend build
  (`Settings → Backend`), which clones upstream `xodus`, applies the patch
  set and records the result in `XODUS_NEXUS_PATCH.json`. If upstream changes
  so a patch no longer fits, the update refuses to run and the previous
  backend stays active — a user can never end up with an unpatched backend.
- The **xgameruntime/Wine** patches ship in the **Xodus Nexus runtime**: a
  prebuilt release published from this repository's CI
  (`.github/workflows/runtime.yml`). It is the official Xodus Proton snapshot
  with the patched `xgameruntime.dll`, downloaded and verified by the
  launcher from `Settings → Xodus Runtime → Install Nexus runtime` — no
  local compilation, no GitHub CLI authentication. The launcher automatically
  offers it whenever a published release exists.
- The official upstream snapshot (without our patches) remains available as
  an alternative in Settings, and the local `scripts/` builds
  (`build-cloud-save-preview.sh`, `build-locale-runtime.sh`, `install-*.mjs`)
  remain for development and custom builds. Each script validates the
  upstream commit and the produced binary, installs into a separate
  versioned runtime directory and switches the single active runtime pointer
  atomically. The downloaded upstream snapshot is never overwritten.
