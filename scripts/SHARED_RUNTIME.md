# Shared runtime clean build

Nexus runtime builds on [Xodus Proton](https://github.com/xodus-gaming/Proton)
and Xodus's [Wine](https://github.com/xodus-gaming/wine) /
[XGameRuntime](https://github.com/xodus-gaming/xgameruntime), with additional
Nexus compatibility patches. It is not an independent Wine implementation.

This recipe reconstructs the single shared **development** runtime from clean,
pinned Git checkouts. It includes the PR #28/cloud-save line, subsequent
XUser/Store/license/receipt work, Mistral's package/network/event/system API
additions, the queue and XAsync fixes, HTTP/2 WinHTTP, nghttp2, WinRT JSON,
and the Mono path-bounds fix. No game-specific runtime selection is introduced.

## Build

Requirements: Linux x86-64, Node 22+, Git, GCC/Make, MinGW-w64 x86-64,
CMake, autoconf, flex, bison, Perl, Python 3, file, and Wine build prerequisites
(including freetype/GnuTLS development packages). See the workflow's apt list.
Native tests additionally require pgrep, OpenSSL, a working Proton loader and
its host libraries. CI uses Xvfb; desktop tests can use the current display.

```sh
node scripts/build-shared-runtime.mjs \
  --work /absolute/path/to/new-build-directory --jobs 4 \
  --base-runtime /absolute/path/to/pristine-proton-directory
```

The work directory **must not already exist**. Without `--base-runtime`, the
script builds components and probes only. A base is an extracted official
Proton distribution containing `proton`, `files/bin/wine` and its default
prefix, not a game prefix. The script does not download or install games,
authenticate, switch the active runtime, or edit the base distribution.

The source lock is [`runtime-patches.lock.json`](runtime-patches.lock.json).
It pins Wine b1dd3273, xgameruntime 64aebcab, and nghttp2 85e300c7/v1.70.0,
plus SHA-256 for every applied patch and all 23 modified/added XGameRuntime
source files. After patching, those files must byte-match the online-tested
development tree. No fuzz or automatic latest-upstream fallback is allowed.

Optional `--wine-mirror`, `--xgameruntime-mirror`, and `--nghttp2-mirror`
arguments supply local Git object repositories for offline builds. They do
**not** copy dirty working-tree files, headers, DLLs, or build directories.
The same pinned commits are fetched into fresh empty checkouts and verified.

For CI parity, use the exact Xodus Proton archive pinned in
[`runtime-base.lock.json`](runtime-base.lock.json), not an arbitrary installed
Steam Proton. Its SHA-512, version and Wine/wineserver hashes are locked.
After extracting the verified archive, check the base before assembly:

```sh
node scripts/verify-runtime-base.mjs /absolute/path/to/extracted-proton
```

GitHub uses the same locked archive. There is no `latest` or alternate-base
fallback; changing it requires a reviewed lock update and new verification.
The supplied-base option remains available for isolated development tests,
but those results are not automatically evidence for the CI distribution.

Output:

- `components/`: newly built xgameruntime, winhttp, mscoree, libnghttp2, windows.web,
  licenses and a source/patch/toolchain/component checksum manifest.
- `tests/`: four newly compiled native ABI probes and a WinRT JSON dependency probe.
- `runtime/`: a **new copy** of the supplied Proton base with the five DLLs
  installed in both runtime and default-prefix locations, plus provenance.

The base Wine/Unix loader and other Proton components are supplied by that
distribution, not rebuilt here. Pin/checksum the base archive as well when
distributing a complete runtime. Reproducible source reconstruction does not
claim byte-identical DLLs across paths or toolchain versions; DWARF paths,
toolchains, and PE timestamps/build IDs can differ. Tool versions and output
hashes are recorded. The original working candidate stays available.

## Patch sequence

1. `xgameruntime-shared-foundation.patch`: complete development-line delta
   from pinned xgameruntime 64aebcab, **before** the last two threading fixes.
   This incorporates PR #28 and the additional cloud-save/auth/Store/API work.
2. `xgameruntime-taskqueue-lifecycle-experimental.patch`.
3. `xgameruntime-async-provider-experimental.patch`.
4. `wine-winhttp-http2.patch`: transport plus portable header paths.
5. `wine-winhttp-private-diagnostics-disabled.patch`: disables activation of
   the legacy body-fragment scanner, which could expose token fragments.
6. `wine-mscoree-mono-path-bounds.patch`.

`windows.web.dll` is built from the pinned Wine sources without an additional
patch. This is required: the supplied stock Proton can have a stub JSON parser
which returns E_NOTIMPL after a successful HTTP response, preventing XUser
authentication and cloud-save synchronization. Do not rely on a dependency
DLL left in a previous runtime or on old absolute prefix symlinks.

The foundation supersedes the older piecemeal XGameRuntime preview patches
**for this recipe only**. Do not apply those again on top. They remain in
assets for historical builders/upstream discussions. Preserve attribution
and LGPL notices in sources; nghttp2 is MIT-licensed. The EAC bridge remains
an external official Steam tool discovered via `PROTON_EAC_RUNTIME`; it is
not replaced, fabricated, or redistributed by this recipe. Real Xodus account
and license service functionality is a separate backend requirement.

## Verification

Close any games/downloads before running stress tests. These commands make
fresh private prefixes and stop only their own wineservers. They never copy
credentials or saves. The HTTP/2 suite binds a loopback TLS server and trusts
its temporary test CA only in its own disposable prefix.

```sh
node scripts/runtime-tests/run-contract-probes.mjs \
  /absolute/build/runtime /absolute/build/tests /absolute/build
node scripts/runtime-tests/run-http2-suite.mjs \
  /absolute/build/runtime /absolute/build
npm run typecheck
npm test
npm run test:runtime-tools
```

Expected contract checks: queue teardown 20, queue stress 1,302, XAsync
provider 58, completion lifetime 2,805 (4,185 total), plus 9 WinRT JSON checks
and 14 HTTP/2 checks. The JSON probe exercises real activation, parsing,
object access and nested array/object access without account data or network.
ABI/transport tests are not a substitute for a game test: test the clean-build
candidate in a separate prefix before promotion, without overwriting the
known-working runtime. The previous development candidate reached the Gears
online lobby; that user confirmation must not be misattributed to a newly
built DLL before testing it in-game.

The corrected five-component clean build has now passed the isolated Gears
game test according to the user, after restoring the WinRT JSON dependency.
The game log confirms ten cloud-save files downloaded and none uploaded by
that synchronization pass. This does not establish cloud-upload correctness,
multiplayer-match stability or universal game compatibility. The installed
production runtime was not switched as part of verification.

Launcher provisioning installs checksum-verified nghttp2 and windows.web DLLs
into existing prefix system32 locations when their runtime capabilities are
present, and selects the builtin WinHTTP transport. All component checksums
are checked before replacing any entries. This is generic provisioning, not
a per-game rule.

## Limits and publication

Some package/event APIs are partial accept registrations; absence of
E_NOTIMPL does not mean full GDK semantics. XAsyncCancel/resource reclamation
remain incomplete. Some existing privilege/package answers are assumptions,
not verified account grants or support for partial/chunk installations.
HTTP/2 uses one stream per connection and has gaps for chunked uploads,
multiplexing, proxies and client certificates. The assertion observed after
manual game exit (`0x80000101`) remains unresolved. No universal game support,
multiplayer-match stability or cloud-save upload is claimed by these probes.

The workflow now uses this clean recipe, verifies the assembled candidate,
and includes corresponding source, checksums and licenses. It uses an exact
Proton snapshot archive from the base lock; expired official artifacts fail
rather than silently changing the base. Component artifacts are uploaded before snapshot lookup,
so a missing base does not lose the clean build. Default publication is off;
`publish=true` is rejected while the lock is marked `development`. Local
verification does not claim that a remote GitHub Actions run has succeeded.
