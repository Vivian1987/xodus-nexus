# Current engineering status

Updated: 2026-10-12. Owner: Codex. Branch: `feature/development-workflow`.
Use `git log -5 --oneline` and `git status --short` for the exact checkpoint;
this file cannot contain the hash of its own commit. Next agent: Mistral or Codex.

## Objective

Establish feature -> develop -> main development, durable cross-agent handoff,
CI candidates and separate manually authorized promotion of tested artifacts.
No stable release, repository visibility change or production runtime switch.

## Known facts

- Existing runtime export is commit `7689386`. Six patches reconstruct 23
  XGameRuntime source files; five DLLs include the essential windows.web JSON
  dependency. Source/base locks and private known-good backups survived cleanup.
- Previous real Gears test succeeded; the clean v4 test restored auth/saves.
  See TEST_MATRIX for the different confirmations and their limits.
- Latest launcher changes simplify Settings, hide diagnostics by default and
  download matching stable Nexus release archives/checksums instead of bundling.
  Previous verification: 89 Vitest + 14 node:test passed.
- Old CI run38176544194 failed compiling the JSON probe: Ubuntu MinGW lacked
  windows.data.json.h. Fixed compilation uses generated pinned Wine headers.
  Fresh remote run38223286437 is SUCCESS: clean components, exact base, all native
  checks, packaging, manifest/checksums, upload and runtime-gate passed.
- Repository remains PRIVATE. Anonymous release download is NOT available to
  other users while private; there is no published stable runtime release.
- GitHub branch-protection API returns HTTP403: upgrade to Pro or make public.
  Visibility must remain private. PR-only main is not technically enforced yet.

## In progress / exact next step

Implementation checkpoint (ready for human-directed takeover): AGENTS/state/decision/test documents, PR template,
conditional runtime gate, small AppImage candidates with manifests, and separate
manual promotion workflow are implemented. Candidate tooling now has 6 passing
node:test cases; workflow YAML/shell steps and JavaScript syntax validated.
Stable approval record is intentionally EMPTY; no release is authorized.
Branches develop and feature/development-workflow are pushed. Draft PR:
https://github.com/domsvoboda/xodus-nexus/pull/1 (base develop; no merge).
Checkpoint d91c996: local 89 Vitest + 14 runtime-tool + 5 CI-tool checks passed.
Launcher CI38223286448 is SUCCESS, artifact downloaded/verified and booted in
isolated demo smoke mode. Its build commit is PR merge SHA
6c1d379f394699586d6203fb9a6d9c76a3e06d24, not the feature head SHA; candidate.json
records this distinction. AppImage SHA256:
d4748df26db811daae9caab9dffcbdba535f2a42b2631795031dde33caf17e44.
Runtime CI38223286437 is SUCCESS, 4194 native checks + 14 HTTP/2 checks / zero
failures/timeouts. Its candidate and corresponding source were downloaded and
their complete manifest/SHA256/SHA512 pairs verified. Runtime archive SHA256:
d736a36548cd54720810d30073aff3d41f9a63f2305bb5af74a7d6f1fec6f42d.
Both candidates are from PR merge commit 6c1d379f394699586d6203fb9a6d9c76a3e06d24.
Follow-up checkpoint changes only handoff documentation, safe NUL-separated path
selection/its unit test, and two-thread archive compression; no runtime C/DLL
source/base changes. Its new CI runs may still be pending: inspect the PR's
LATEST checks before integration, not just these earlier successful runs.

NEXT: fetch/inspect this branch and PR, confirm latest CI, then test the exact
downloaded runtime candidate in an isolated game prefix with the user. Do not
replace the known-good or production runtime. Its manual Gears/auth/cloud/lobby
verification is NOT completed yet. Keep RELEASE_VALIDATION approvals empty.
Do not merge main or publish a release just because the unit checks are green.

## Local-only evidence

Use the local workspace inventory outside this Git tree for the known-good
runtime, source archive, diagnostic backend, prior reports and rollback.
Do not publish these raw artifacts or include machine/account paths here.
The game test used a separate diagnostic backend; the runtime recipe alone
does not reproduce that backend. Do not silently swap the installed service.

## Remaining risks

Private distribution/protected-branch limitations; pending real-game CI-candidate confirmation;
expired base artifact risk; partial GDK APIs and HTTP/2 limitations; unresolved
Wine assertion after an earlier manual exit. No all-title/cloud-upload/match claim.
