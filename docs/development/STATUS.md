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
  windows.data.json.h. Compiling with generated headers from pinned Wine succeeds
  locally; new remote clean-build result still needs verification.
- Repository remains PRIVATE. Anonymous release download is NOT available to
  other users while private; there is no published stable runtime release.
- GitHub branch-protection API returns HTTP403: upgrade to Pro or make public.
  Visibility must remain private. PR-only main is not technically enforced yet.

## In progress / exact next step

Implementation checkpoint: AGENTS/state/decision/test documents, PR template,
conditional runtime gate, small AppImage candidates with manifests, and separate
manual promotion workflow are implemented. Candidate tooling has 5 passing
node:test cases; workflow YAML/shell steps and JavaScript syntax validated.
Stable approval record is intentionally EMPTY; no release is authorized.
Run final build checks; push ONLY feature and develop and open a draft PR targeting
develop. Inspect new CI/native results; do not substitute an older successful run.
Update this section with results/PR URL.
Then test the exact runtime candidate in an isolated game prefix with user help.
Do not merge main or publish a release just because the unit checks are green.

## Local-only evidence

Use the local workspace inventory outside this Git tree for the known-good
runtime, source archive, diagnostic backend, prior reports and rollback.
Do not publish these raw artifacts or include machine/account paths here.
The game test used a separate diagnostic backend; the runtime recipe alone
does not reproduce that backend. Do not silently swap the installed service.

## Remaining risks

Private distribution/protected-branch limitations; pending clean CI confirmation;
expired base artifact risk; partial GDK APIs and HTTP/2 limitations; unresolved
Wine assertion after an earlier manual exit. No all-title/cloud-upload/match claim.
