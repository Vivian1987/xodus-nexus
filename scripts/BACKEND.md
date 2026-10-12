# Shared Nexus backend

`assets/backend-source.lock.json` pins the upstream Git commit, Cargo.lock hash,
Rust toolchain, backend package version and ordered SHA-256 patch set. Launcher
and CI use the same recipe. Updating upstream is an explicit reviewed change;
the normal install path never clones moving `main` or silently compiles.

The backend workflow builds CLI + service on Ubuntu 22.04, runs the account-free
launch-chain tests and CLI capability checks, then packages:

- `xodus-nexus-backend-<version>-linux-x86_64.tar.xz` and SHA-512
- matching `.manifest.json` (recipe/source identity and per-file hashes)
- matching `-source.tar.xz` and SHA-512 (patched upstream, vendored dependencies,
  offline Cargo configuration, recipe, build instructions and retained licenses)
- `candidate.json` binding all five assets to the Nexus commit and workflow run

Native build dependencies: Git, Rust from the lock, Node 22, Cargo, pkg-config,
C/C++ toolchain, OpenSSL, protoc, GTK 3/WebKitGTK 4.1/libsoup 3 development headers,
tar/xz. For a clean build:

```sh
node scripts/build-backend.mjs --work ./backend-build --output ./backend-release
```

Directories must not already exist. The source archive can also be built
offline with the locked Rust toolchain: from `source/`, run
`cargo build --locked --offline --release -p xodus-cli -p xodus-service`.

Promotion is manual: select `backend` in the existing release workflow after
recording exact-candidate approval. It verifies provenance/checksums and creates
`backend-v<version>` without rebuilding, and does not replace the latest launcher
release. Never overwrite a version's published assets; bump backend version and
ship a matching launcher recipe for a changed backend. Versions are independent
of launcher and Wine runtime versions.

Launcher uses only stable releases from this repository, the exact pinned
recipe, matching source assets, checksum verification, a strict regular-file
archive layout, ELF architecture and CLI feature validation. Installation swaps
the active pointer atomically only while idle; older builds remain available.
An unavailable/private release, incompatible system libraries or failed checksum
never causes automatic compilation or a production backend replacement.

Default install needs no Git/Cargo/protoc/GitHub authentication. Linux x86_64,
glibc compatible with Ubuntu 22.04, GTK 3, WebKitGTK 4.1, tar/xz and the desktop's
secret service are needed. Other architectures/musl and other distributions
have not been validated. Missing-library failures are shown in Settings.

Advanced / Diagnostics retains an explicit local build from the same source
and patches, for developers only. It does not build the Wine runtime. No probe
runs `xodus-service --help`: that upstream binary starts device authentication
instead of parsing a help option. Service identity is checked by its ELF/header
and hashes; account/cloud/game functionality requires separate manual testing.

The Electron launcher is MIT-licensed. The separately distributed Xodus backend
retains its upstream GPLv3 license; dependency licenses and corresponding source
are included with every candidate. No proprietary game files, credentials or
saves are packaged.
