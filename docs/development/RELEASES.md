# Candidate testing and stable promotion

CI/checks builds the small launcher candidate; Nexus runtime build conditionally
builds clean runtime components and native tests. Pushes and PRs never publish.
Candidates carry candidate.json (exact commit, repository, run ID, ref and file
hashes), SHA-512 sidecars and corresponding runtime source. Download the exact
artifact with gh run download; verify its manifest and test it locally.

Artifacts expire: launcher 3 days, runtime 7 days. If a tested artifact expires,
build and TEST a new candidate; never describe a different rebuild as tested.
Do not use an expired base snapshot's absence to silently pick a newer base.

After review/integration into main, test a final main-built candidate. Record an
approval in RELEASE_VALIDATION.json through a reviewed documentation PR:

```json
{
  "kind": "runtime",
  "runId": "ACTUAL_RUN_ID",
  "commit": "ACTUAL_40_CHARACTER_SHA",
  "manifestSha256": "ACTUAL_SHA256_OF_CANDIDATE_JSON",
  "approved": true,
  "approvedBy": "MAINTAINER_GITHUB_LOGIN",
  "evidence": "Actual user-confirmed steps, results and skipped tests"
}
```

The runtime candidate's source lock must already be release-approved. Currently
it is development: stable promotion is deliberately blocked. This approval is
not inferred from green native/unit tests. Do not fill the record speculatively.
The runtime test record must distinguish its backend and genuine EAC dependency.

The maintainer then manually dispatches Promote tested candidate on MAIN, with
kind, run ID and explicit approve_release=true. It requires a successful main
build whose commit is an ancestor of current main and whose exact artifact has
a recorded approval by the dispatch actor. It downloads/verifies those files,
creates a new stable tag/release and never rebuilds or replaces an old release.
No registry/auth/game save secrets are supplied to CI.

Private repo caveats: branch protection is currently unavailable (HTTP403).
Approval records/PR discipline are a working agreement, not a cryptographic
human-signature scheme or server-side branch guarantee. The stable release
remains private; anonymous external launcher downloads will fail until a separate
public distribution plan is explicitly approved. Do not change visibility.
