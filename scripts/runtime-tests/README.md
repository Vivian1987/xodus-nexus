# Runtime contract regressions

The complete pinned clean-checkout recipe (including all prerequisite API
additions) is now available in [`../SHARED_RUNTIME.md`](../SHARED_RUNTIME.md).
Its source lock applies the foundation before the two increments documented
below. These exports are integrated into that development builder, not deployed
or published. The historic candidate hashes below describe the original test;
new builds record their own hashes in `components/source-manifest.json`.

These are native Windows ABI tests for the external xgameruntime component,
not launcher mocks. They do not use a game, Xbox account, network, or saves.
Run them only in a disposable Wine prefix containing the candidate DLL.
Never copy a candidate DLL into an active or production prefix.

- `taskqueue-teardown-probe.c`: composite queue termination must drain its
  callbacks, mark pending callbacks canceled, preserve independent parent work,
  and deliver termination through the completion port (20 checks).
- `taskqueue-contract-probe.c`: four dispatch modes, serialization, shared-port
  monitor notifications, delayed readiness, monitor removal, pending work after
  handle closure, closure inside termination, synchronous cancellation, and
  concurrent submission/termination (1,302 checks; 40,000 racing submissions).
- `async-provider-contract-probe.c`: Begin setup vs provider errors, pending
  work, work errors, missing completion, first-terminal-result wins, private
  provider block, and deleting the user block during immediate completion
  without premature provider cleanup (58 checks).
- `async-completion-lifetime-probe.c`: 400 completions with block deletion,
  result consumption and block reuse (2,805 checks). Callback changes for a
  reused block are made **before** Begin, matching the native snapshot contract.
- `winrt-json-probe.c`: real WinRT JSON activation, Parse, GetObject and
  nested array/object access (9 checks). Required by XUser endpoint parsing;
  HTTP 200 alone does not establish successful account initialization.

Build with MinGW against the matching xgameruntime source/generated headers:

```sh
x86_64-w64-mingw32-gcc -D__WINESRC__ -O2 -Wall \
  -I "$XGRT_GENERATED_HEADERS" -I "$XGRT_SOURCE" \
  scripts/runtime-tests/taskqueue-teardown-probe.c -o taskqueue-teardown-probe.exe
x86_64-w64-mingw32-gcc -D__WINESRC__ -O2 -Wall \
  -I "$XGRT_GENERATED_HEADERS" -I "$XGRT_SOURCE" \
  scripts/runtime-tests/taskqueue-contract-probe.c -o taskqueue-contract-probe.exe
x86_64-w64-mingw32-gcc -D__WINESRC__ -O2 -Wall \
  -I "$XGRT_GENERATED_HEADERS" -I "$XGRT_SOURCE" \
  scripts/runtime-tests/async-provider-contract-probe.c -o async-provider-contract-probe.exe
x86_64-w64-mingw32-gcc -D__WINESRC__ -O2 -Wall \
  -I "$XGRT_GENERATED_HEADERS" -I "$XGRT_SOURCE" \
  scripts/runtime-tests/async-completion-lifetime-probe.c -o async-completion-lifetime-probe.exe
x86_64-w64-mingw32-gcc -O2 -Wall \
  scripts/runtime-tests/winrt-json-probe.c -o winrt-json-probe.exe -lruntimeobject
```

Use the candidate Wine runner with an explicitly selected disposable prefix.
Each executable returns nonzero on failure. ABI success does **not** establish
game compatibility, Xbox service availability, or an authenticated EAC session.
These tests do not yet cover registered wait handles, resource-exhaustion paths,
or complete XAsync cancellation semantics.

## Experimental lifecycle patch

`assets/xgameruntime-taskqueue-lifecycle-experimental.patch` is a diagnostic
increment against the exported shared foundation, applied by the new clean
development builder. Its `xthreading.c`
preimage SHA-256 is
`f70629357efe3cf6c4dcb553fa46dbed2d811f4b4cb403d388936046cc50d5db`.
Do not apply it to a different upstream revision with fuzz. The development
line's prerequisite changes are exported in `xgameruntime-shared-foundation.patch`.

The patch changes queue scheduling/lifetime, not identity tokens, entitlement,
game binaries, or anti-cheat responses. It retains the existing XAsync behavior,
including its unimplemented cancellation; it is not a complete GDK replacement.
Delayed submissions currently wait on the cancellation event in a thread-pool
worker, so timer scaling and allocation/thread-pool failure handling need further
work before release. Keep the known-good runtime available for rollback.

## Experimental XAsync provider patch

`assets/xgameruntime-async-provider-experimental.patch` follows the queue
increment above. Its exact `xthreading.c` preimage SHA-256 is
`f60d1102b9289999ef4198b7ae415d48c7eb8065766982a7b4fbe414823c1c4d`.
It is integrated into the clean development builder, not deployed to production.

The patch reports provider Begin failures through asynchronous completion,
propagates terminal DoWork failures, ignores Complete(E_PENDING), accepts only
the first terminal completion, and supplies runtime-owned provider blocks.
Provider cleanup is deferred until active provider calls return, so the
application can safely delete/reuse its user block inside completion.
These contracts follow Microsoft's libHttpClient `Source/Task/AsyncLib.cpp`.

Known limitations remain: explicit XAsyncCancel is not implemented; state/event
reclamation, full result-identity validation, scheduling guards, and all native
wait/cleanup timing semantics still need work. Passing these focused tests is
not proof of complete XAsync support.

## Applying the exported fix pair

Both patches use paths relative to the **Wine source root**, not the
`dlls/xgameruntime` subdirectory. Apply them in this order, in a separate
development checkout with the prerequisite development changes already present:

1. `assets/xgameruntime-taskqueue-lifecycle-experimental.patch`
2. `assets/xgameruntime-async-provider-experimental.patch`

The exact starting `dlls/xgameruntime/xthreading.c` SHA-256 must be
`f70629357efe3cf6c4dcb553fa46dbed2d811f4b4cb403d388936046cc50d5db`.
After patch 1 it must be
`f60d1102b9289999ef4198b7ae415d48c7eb8065766982a7b4fbe414823c1c4d`;
after patch 2 it must be
`6679fa0c92e40821f53d86037ce7a053e78f5f687c6e80a6d1e0d47c9b8e871b`.
Check these hashes in addition to `git apply --check`. A clean upstream clone
is **not** the required preimage: this pair exports only these two increments.
The source lock separately applies the shared foundation and HTTP/2 changes.
Do not force
application or assume the pair alone reproduces the complete working runtime.

For each patch, with `PATCH` set to its absolute path and the current directory
set to the matching Wine source root:

```sh
git apply --check "$PATCH"
git apply "$PATCH"
sha256sum dlls/xgameruntime/xthreading.c
```

The pair has been replayed against a disposable copy of the exact starting
source and byte-compared with both the intermediate and final source snapshots.
Neither patch changes a game executable, identity token, entitlement, or EAC
attestation response.

## Observed validation and release status

The final candidate DLL SHA-256 is
`ba0c6979ca1eada15d47239d79e7d31925582a0acf03eaee447ee1042e03df6a`.
The four probes above passed 4,185 checks; separate authenticated XUser/Store
tests passed 2,071 checks (6,256 total). The user additionally confirmed entry
into the Gears online lobby and then manually closed the game. No multiplayer
match, long-session stability, cloud-save upload, or other-title compatibility
is established by that test.

The game provider returned E_PENDING from Begin and DoWork. Returning that
failed HRESULT directly from XAsyncBegin was a concrete contract violation:
successful setup must return S_OK while the operation remains pending. This
is the strongest observed explanation for the original Play crash, but the
two increments were tested together, not in a single-change game A/B test.

A separate Wine assertion (`0x80000101`) was recorded after manual exit; its
cause and user-visible impact remain unresolved. It is not the earlier Play
access violation. The pair remains labeled experimental because of this
finding and the incomplete API semantics above. The full clean build integration
is now available; no production deployment, Git commit or push has occurred.
