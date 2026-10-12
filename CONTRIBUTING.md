# Contributing

Use feature/fix branches and PRs targeting `develop`. Reviewed integration goes
to `main` through a separate PR; pushes and green checks are not releases.

```sh
npm ci
npm run build
npm run test:runtime-tools
npm run test:ci-tools
```

Keep one shared runtime. Use disposable test directories, never a user's active
game installation, saves or Xodus checkout. Keep credentials, raw diagnostics,
prefixes and agent handoffs outside Git. Include redacted reproduction steps,
versions and actual test results in bug reports and PRs.

CI builds candidates. Stable publication requires explicit maintainer approval
for the exact tested artifact, with no rebuild after validation. The approval
record is [release-validation.json](.github/release-validation.json).

Detailed guides are prepared for the [wiki](https://github.com/domsvoboda/xodus-nexus/wiki)
(currently pending). Runtime reconstruction instructions and source/license
locks remain alongside the [build scripts](scripts/SHARED_RUNTIME.md).
