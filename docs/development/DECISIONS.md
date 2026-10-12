# Development decisions

## 2026-10-12: branches and cross-agent state

User approved `feature/* -> develop -> main -> Release`. Checkpoints and WIP
belong on working branches; only reviewed/CI-verified integration reaches main.
Local GPU/account/game testing stays necessary. Both agents read AGENTS and the
same STATUS before work, update it after meaningful steps and use Git/PR comments
as a shared record. No automatic cross-app model handover is claimed.

Repository stays private by explicit user choice. Do not enable public access.
Private GitHub plan currently prevents branch protection; document this limitation
instead of claiming main is protected. Stable download for external users needs
a separately approved public distribution plan or a future visibility decision.

## 2026-10-12: build and distribution

Launcher AppImage does not contain Proton; runtime is versioned separately.
CI creates candidate artifacts with commit identity and checksums. A separate
manual release workflow promotes the exact downloaded/tested artifacts without
rebuilding; runtime lock must also be release-approved. Push/merge does not
publish a release. No automatic update of active games/prefixes/runtime.

## Shared runtime reconstruction

Six locked patches reproduce the complete cloud/auth/API/queue/async/H2/Mono
development line. windows.web.dll comes from the pinned Wine sources and must
be included: stock JSON stubs caused successful HTTP responses followed by
E_NOTIMPL and missing auth/saves. nghttp2 and JSON are provisioned generically.
Use the exact locked Xodus Proton base; an installed Steam Proton is not identical.
Build the JSON probe against generated Wine headers, not the host's MinGW SDK.
Keep limitations and LGPL/MIT attribution; real EAC support is an external tool.
