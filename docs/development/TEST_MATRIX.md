# Verification matrix

| Evidence | Result / boundary |
| --- | --- |
| Original async/queue candidate | User explicitly reached Gears online lobby and closed the game; Steam Proton base |
| Clean v3 runtime | Regression: stock JSON DLL led to E_NOTIMPL and missing account/saves; NOT a valid candidate |
| Clean v4 + rebuilt windows.web | 4194 native checks, 14 HTTP/2 checks, 2038 real-account checks passed locally; user confirmed game/saves working |
| Same v4 DLLs on locked Xodus base | Native/auth probes passed; user said game looked good; no explicit played-match claim |
| Launcher before workflow changes | 89 Vitest + 14 node:test, renderer disclosure tests and AppImage boot passed locally |
| Old runtime CI38176544194 | FAILED: JSON probe header missing on Ubuntu; not proof the five DLL builds failed |
| Clean runtime CI38223286437 | SUCCESS: clean component/base build, 4194 native + 14 HTTP/2 checks / 0 failures, source packaging and candidate upload; downloaded checksum manifest verified |
| New launcher CI38223286448 | SUCCESS; exact downloaded AppImage verified and booted in isolated demo smoke mode; not a real game/account test |
| Real Gears with new CI runtime / cloud uploads / all titles | Not yet verified; do not claim compatibility from the rows above |

## Required candidate record

Record kind, exact Git commit, workflow/run ID, artifact name + SHA256/SHA512,
source/base locks, OS/GPU/driver/runtime/backend versions, test steps and actual
user result. Never include tokens/XUIDs/raw HTTP payloads in the public record.
For a runtime candidate: account, existing saves, online lobby, normal exit and
regression checks in isolated prefixes; write down skipped tests explicitly.
UI smoke fixtures are not evidence of a real account or game working.

Runtime changes require the native CI suite; launcher changes require checks and
the small AppImage candidate. Stable promotion needs explicit human approval
after testing the exact artifact. Never rebuild or replace a validated asset.
