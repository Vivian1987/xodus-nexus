# Agent working agreement

Applies to Codex, Mistral and other coding agents working in this repository.

## Before work

Read this file, `docs/development/STATUS.md`, `DECISIONS.md` and `TEST_MATRIX.md`.
Inspect `git status`, branch and recent commits; do not assume the last chat is
current. Preserve unfinished work. Only one agent owns a shared working tree at
a time. Use separate branches/checkouts for concurrent work, with human approval.

## Development and handoff

- Work on `feature/*` or `fix/*`, targeting `develop` through a PR. Integration
  goes from `develop` to `main` through a separate PR; never directly push main.
- Small WIP commits may be pushed to working branches, clearly marked as WIP.
  A push is a checkpoint, not a release or a claim of game compatibility.
- After each meaningful step (including a failed experiment), update STATUS:
  owner, branch, commits, changed files, commands/results, facts vs hypotheses,
  remaining work and the exact next safe step. Checkpoint before a long test.
- On takeover, verify STATUS against Git and test outputs before continuing.
  Do not repeat disproven experiments without explaining new evidence.
- Raw logs, dumps, account identifiers/tokens, games, saves and prefixes stay
  OUTSIDE Git in private local diagnostics. Public handoffs must be sanitized.

## Safety and architecture

- One shared runtime for all games; no per-game runtime forks or title switches.
- Never modify the user's original Xodus checkout, active downloads or original
  game executable. Use isolated build directories and disposable test prefixes.
- Never silently switch the production runtime or overwrite saves. Cloud writes
  require user authorization; CI must not use a real Xbox account or game saves.
- Keep pinned source/base locks, checksums, licenses and corresponding source.
  Do not replace an expired/unavailable base with latest without review/testing.
- Keep real CLI capability/prerequisite checks and honest unsupported states.
  Do not fake authentication, ownership, EAC attestation or compatibility.

## Validation and release

Run `npm run build`, `npm run test:runtime-tools` and `npm run test:ci-tools`.
Runtime changes also need the clean runtime CI/native probes. Test the exact CI
candidate locally for real games; automated probes are not an online-match test.
Stable releases require explicit human authorization and successful candidate
validation. Promote the tested artifact, never rebuild it after validation.
Do not mark the runtime source lock release-approved without evidence.
The repository is PRIVATE by the user's decision. Do not change visibility.
GitHub currently rejects private-repository branch protection (HTTP 403); the
PR-only main rule is a working agreement, not an enforced server-side guarantee.
