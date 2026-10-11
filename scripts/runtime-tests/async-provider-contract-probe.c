/* Provider return/completion contract. No identity, network, games or saves. */
#define COBJMACROS
#define INITGUID
#include <windows.h>
#include <stdio.h>
#include "xtaskqueue.h"
#include "xasyncprovider.h"

static IXThreadingImpl *threads;
static XTaskQueueHandle queue;
static LONG checks, failures;
#define CHECK(name, x) do { ++checks; if (!(x)) { ++failures; printf("FAIL %s\n", name); } } while (0)
struct test_context {
    XAsyncBlock block;
    HRESULT begin_result, work_result, expected;
    LONG callbacks, cleanup, work;
    BOOL schedule, complete_work, complete_pending, provider_copy, check_deferred_cleanup;
};
static void WINAPI completed(XAsyncBlock *block)
{
    struct test_context *test = block->context;
    ++test->callbacks;
    CHECK("callback-status", IXThreadingImpl_XAsyncGetStatus(threads, block, FALSE) == test->expected);
}
static HRESULT WINAPI provider(XAsyncOp op, const XAsyncProviderData *data)
{
    struct test_context *test = data->context;
    if (data->async != &test->block) test->provider_copy = TRUE;
    switch (op) {
    case XAsyncOp_Begin:
        if (test->schedule) CHECK("schedule", IXThreadingImpl_XAsyncSchedule(threads, data->async, 0) == S_OK);
        return test->begin_result;
    case XAsyncOp_DoWork:
        ++test->work;
        if (test->complete_pending) IXThreadingImpl_XAsyncComplete(threads, data->async, E_PENDING, 7);
        if (test->complete_work) {
            IXThreadingImpl_XAsyncComplete(threads, data->async, test->expected, 0);
            if (test->check_deferred_cleanup) CHECK("cleanup-waits-for-provider-return", test->cleanup == 0);
        }
        return test->work_result;
    case XAsyncOp_Cleanup: ++test->cleanup; break;
    default: break;
    }
    return S_OK;
}
static void init(struct test_context *test)
{
    ZeroMemory(test, sizeof(*test));
    test->block.queue = queue;
    test->block.context = test;
    test->block.callback = completed;
    test->begin_result = S_OK;
    test->work_result = E_PENDING;
}
static void drain(void)
{
    while (IXThreadingImpl_XTaskQueueDispatch(threads, queue, XTaskQueuePort_Completion, 0));
}
static void WINAPI free_completed(XAsyncBlock *block)
{
    struct test_context *test = block->context;
    ++test->callbacks;
    CHECK("free-callback-status", IXThreadingImpl_XAsyncGetStatus(threads, block, FALSE) == S_OK);
    CHECK("free-user-block-inside-completion", VirtualFree(block, 0, MEM_RELEASE));
}
int main(void)
{
    HRESULT (WINAPI *query)(const GUID *, REFIID, void **);
    HMODULE dll = LoadLibraryA("xgameruntime.dll");
    struct test_context test;
    const HRESULT failures_to_test[] = { E_FAIL, E_NOTIMPL, E_ABORT };
    UINT i;
    if (!dll) { printf("FAIL load %lu\n", GetLastError()); return 1; }
    query = (void *)GetProcAddress(dll, "QueryApiImpl");
    if (!query || FAILED(query(&CLSID_XThreadingImpl, &IID_IXThreadingImpl, (void **)&threads))) return 1;
    CHECK("queue", IXThreadingImpl_XTaskQueueCreate(threads, XTaskQueueDispatchMode_Manual, XTaskQueueDispatchMode_Manual, &queue) == S_OK);
    for (i = 0; i < ARRAYSIZE(failures_to_test); ++i) {
        init(&test);
        test.begin_result = test.expected = failures_to_test[i];
        CHECK("begin-setup-succeeds-provider-error-is-async", IXThreadingImpl_XAsyncBegin(threads, &test.block, &test, NULL, "contract", provider) == S_OK);
        CHECK("provider-receives-private-block", test.provider_copy);
        drain();
        CHECK("begin-error-completes", test.callbacks == 1);
        CHECK("begin-error-cleanup-once", test.cleanup == 1);
        /* Clean up a pending baseline implementation without hanging. */
        if (!test.callbacks) { IXThreadingImpl_XAsyncComplete(threads, &test.block, test.expected, 0); drain(); }
    }
    init(&test);
    test.begin_result = E_PENDING;
    test.expected = S_OK;
    CHECK("pending-begin-setup-succeeds", IXThreadingImpl_XAsyncBegin(threads, &test.block, &test, NULL, "contract", provider) == S_OK);
    drain();
    CHECK("pending-begin-not-completed", test.callbacks == 0 && test.cleanup == 0);
    IXThreadingImpl_XAsyncComplete(threads, &test.block, S_OK, 0); drain();
    CHECK("pending-begin-can-complete", test.callbacks == 1 && test.cleanup == 1);

    for (i = 0; i < 4; ++i) {
        init(&test); test.schedule = TRUE;
        test.work_result = i == 0 ? E_FAIL : i == 1 || i == 3 ? S_OK : E_PENDING;
        test.expected = i == 0 ? E_FAIL : i == 1 ? E_UNEXPECTED : S_OK;
        test.complete_work = i >= 2;
        CHECK("work-begin", IXThreadingImpl_XAsyncBegin(threads, &test.block, &test, NULL, "contract", provider) == S_OK);
        CHECK("work-dispatch", IXThreadingImpl_XTaskQueueDispatch(threads, queue, XTaskQueuePort_Work, 0));
        drain();
        CHECK("work-terminal-return-completes", test.callbacks == 1 && test.cleanup == 1);
        CHECK("work-invoked-once", test.work == 1);
        if (!test.callbacks) { IXThreadingImpl_XAsyncComplete(threads, &test.block, test.expected, 0); drain(); }
    }
    init(&test); test.expected = S_OK;
    CHECK("first-complete-begin", IXThreadingImpl_XAsyncBegin(threads, &test.block, &test, NULL, "contract", provider) == S_OK);
    IXThreadingImpl_XAsyncComplete(threads, &test.block, E_PENDING, 42); drain();
    CHECK("complete-pending-is-no-op", !test.callbacks && !test.cleanup && IXThreadingImpl_XAsyncGetStatus(threads, &test.block, FALSE) == E_PENDING);
    IXThreadingImpl_XAsyncComplete(threads, &test.block, S_OK, 0);
    IXThreadingImpl_XAsyncComplete(threads, &test.block, E_FAIL, 0);
    drain();
    CHECK("first-terminal-result-wins", IXThreadingImpl_XAsyncGetStatus(threads, &test.block, FALSE) == S_OK);
    CHECK("completion-once", test.callbacks == 1 && test.cleanup == 1);
    IXThreadingImpl_XTaskQueueCloseHandle(threads, queue);
    /* Immediate completion can free the user block while DoWork is still
     * running. Runtime post-provider handling must not touch freed memory. */
    CHECK("immediate-completion-queue", IXThreadingImpl_XTaskQueueCreate(threads, XTaskQueueDispatchMode_Manual, XTaskQueueDispatchMode_Immediate, &queue) == S_OK);
    init(&test); test.expected = S_OK; test.schedule = TRUE;
    test.complete_work = TRUE; test.work_result = S_OK;
    test.check_deferred_cleanup = TRUE;
    {
        XAsyncBlock *block = VirtualAlloc(NULL, 4096, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        CHECK("allocate-user-block", block != NULL);
        if (!block) return 1;
        block->queue = queue; block->context = &test; block->callback = free_completed;
        CHECK("immediate-begin", IXThreadingImpl_XAsyncBegin(threads, block, &test, NULL, "free-user", provider) == S_OK);
        CHECK("immediate-work-dispatch", IXThreadingImpl_XTaskQueueDispatch(threads, queue, XTaskQueuePort_Work, 0));
        CHECK("immediate-completion-and-cleanup-once", test.callbacks == 1 && test.cleanup == 1);
    }
    IXThreadingImpl_XTaskQueueCloseHandle(threads, queue);
    IXThreadingImpl_Release(threads);
    printf("ASYNC PROVIDER CHECKS %ld FAILURES %ld\n", checks, failures);
    return failures ? 1 : 0;
}
