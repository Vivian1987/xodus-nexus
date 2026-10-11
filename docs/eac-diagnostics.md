# Easy Anti-Cheat compatibility diagnostics

Nexus uses the game's original EAC bootstrapper and the genuine Proton
compatibility components. It does not fabricate attestation, change integrity
results, or turn an unsupported deployment into a supported one.

## Launcher environment

- An online launch clears inherited `EOS_USE_ANTICHEATCLIENTNULL` and
  `PROTON_EAC_LAUNCHER_PROCESS`. The latter is a Wine-managed marker for the
  bootstrapper, not a global game preference.
- The Null Client is enabled only for an explicitly EAC-free launch.
- If installed, the official **Proton EasyAntiCheat Runtime** is discovered in
  Steam's default library and the libraries listed in `libraryfolders.vdf`.
  Both the 64-bit bridge DLL and its Unix companion must exist. Nexus sets
  `PROTON_EAC_RUNTIME` only when the user has not supplied a value.
- Discovery does not download, redistribute, replace or inject EAC files.
  This is an optional compatibility component, not another per-game Wine
  runtime. The game's deployment still needs developer-enabled Linux support.

## Do not overinterpret the evidence

1. Bootstrapper result **301** proves a successful bootstrapper operation,
   not successful server attestation or online login.
2. Loading `EOSSDK-Win64-Shipping.dll` proves the SDK was mapped, not that
   `EOS_AntiCheatClient_BeginSession` succeeded.
3. Absence of a legacy `easyanticheat_x64.dll` bridge is not, by itself, proof
   that an EOS client module is inactive. Establish which integration the
   title uses and obtain the client/session result first.
4. A server claim requesting a hardware challenge does not identify which
   component must answer it. EAC, platform identity, and title-specific
   authentication remain distinct hypotheses until the relevant API result
   or a working reference trace is available.
5. TCP-only connection snapshots omit UDP and local IPC. Even combined
   snapshots cannot prove that no request occurred between samples.
6. Wine module/relay tracing can change timing and startup behavior. Compare
   with a light-logging control before treating a traced failure as the
   original failure. Export lookup traces prove resolution, not invocation.

## Maintainer test discipline

For a safe, read-only summary of an existing private trace:

```sh
node scripts/eac-trace-summary.mjs /path/to/private-wine.log /path/to/anticheatlauncher.log
node --test scripts/eac-trace-summary.test.mjs
```

This tool emits only fixed module flags, bootstrapper codes and allowlisted
EOS export lookup counts. It cannot measure the result of calling those exports.
Missing return lines may indicate a truncated trace, not a failed lookup.

The limited relay experiment used `HKCU\Software\Wine\Debug` →
`RelayInclude` in a **disposable prefix only**, with this value:

```text
kernelbase.GetProcAddress;kernel32.GetProcAddress;kernelbase.LoadLibraryExW;kernelbase.OpenFileMappingW;kernel32.OpenFileMappingA;kernelbase.CreateFileMappingW;kernelbase.OpenEventW
```

Its debug channels were `-all,err+all,trace+loaddll,trace+relay,trace+winhttp`.
Exclude window-procedure call/return spam before writing a trace, retain API
call/return pairs, cap both output and run duration, and strip HTTP headers and
bodies. The initial test's trace hit its cap, so absence of later lookups is
not reliable negative evidence. Do not enable unrestricted relay logging in
the normal launcher or distribute a debug-configured prefix.

Use a disposable copy of the prefix, preserve previous evidence, and stop
only that prefix's wineserver. Never perform runtime updates during a game
or download. Do not patch the game's EXE or EAC module to diagnose online
authentication. A launcher exit code of zero is not an online-play test.

Keep Wine traces, HTTP diagnostics and prefix copies private: paths can contain
account IDs, and SDK logs can contain credentials or session identifiers.
Do not commit raw logs, saves, game files, private keys, or internal handoffs.
Commit the source changes, tests, patches and sanitized findings instead.

## Current development finding (2026-10-11)

In isolated Gears tests with experimental HTTP/2 WinHTTP, light loader tracing
and a limited relay run reproduced `elias-gutpuncher` after the EOS SDK loaded.
The relay run resolved `EOS_Platform_GetAntiCheatClientInterface` to a non-null
function address. This is export resolution, not the interface/session result.
A heavier module-tracing
run stopped before SDK loading and was terminated separately. No successful
EAC client-session/attestation result has been established. The environment
hardening above is independently tested; it is **not** claimed to fix that
identity failure. The experimental HTTP/2 runtime is not yet in release CI.

## Official references

- [Steamworks: Proton anti-cheat support](https://partner.steamgames.com/doc/steamhardware/proton)
- [Epic: Anti-Cheat Interfaces](https://dev.epicgames.com/docs/epic-online-services/trust-and-safety/anti-cheat-interfaces/anti-cheat-interfaces)
- [Epic: Anti-Cheat Integration Checklist](https://dev.epicgames.com/docs/epic-online-services/trust-and-safety/anti-cheat-interfaces/anti-cheat-integration-check-list)
