# Compatibility

Xodus Nexus is an early Linux compatibility project, not a certified Xbox
client. A verified Store package is **not** a guarantee that a game launches.

## What works

- Live Microsoft Store browsing: search, trending, editions and add-ons
- Xbox sign-in through the xodus backend (credentials stored in your keychain)
- Package download and decryption (MSIXVC streaming install)
- Launching through managed Xodus Proton runtimes with DXVK/vkd3d-proton
- Cloud save download for supported titles (experimental preview)

## Experimental / known limitations

- **Easy Anti-Cheat**: an EAC-free route exists for supported installations,
  but offline transitions can still fail. EAC-protected online play is not
  verified. Bootstrapper success and module loading do not establish client
  attestation. See [EAC diagnostics](../eac-diagnostics.md) and
  [docs/patches.md](https://github.com/domsvoboda/xodus-nexus/blob/main/docs/patches.md)
  for the current state.
- **In-game Xbox services** (XUser sign-in, cloud saves, achievements) run
  through the open-source xgameruntime and PR #28 preview builds; they work
  for tested titles but are not guaranteed for every game.
- **Direct EAppx packages** are not supported; MSIXVC2 is not supported.
- Some titles crash on launch or on specific in-game flows — runtime
  queue/async fixes land regularly in managed runtime releases.
- A **Game Pass badge** on a Store card describes the Store offer only; it is
  never proof that your account owns the product. Xodus checks the real
  entitlement when installation starts.

## Title status reports

When reporting a launch failure, please include:

1. The title and its Store Product ID
2. The per-game log (`<runtime-root>/logs/<game-id>-latest.log`)
3. The active runtime name from **Settings** (e.g. `proton-xodus-…`)
4. Whether the title uses Easy Anti-Cheat (`EasyAntiCheat*/Settings.json`)

Reports go to the
[issue tracker](https://github.com/domsvoboda/xodus-nexus/issues).
