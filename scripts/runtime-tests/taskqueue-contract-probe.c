/* Generic queue ABI checks; no identity, title, service, network or saves. */
#define COBJMACROS
#define INITGUID
#include <windows.h>
#include <stdio.h>
#include "xtaskqueue.h"
#include "xasyncprovider.h"

static IXThreadingImpl *api;
static LONG checks, failures;
#define CHECK(x, label) do { ++checks; if (!(x)) { ++failures; printf("FAIL %s\n", label); } } while (0)
struct state {
    HANDLE done, started, release;
    LONG count, active, max_active, canceled, notifications, work, completion;
    XTaskQueueHandle queue;
    XTaskQueueRegistrationToken token;
    DWORD callback_thread;
};
static void WINAPI task(void *context, BOOLEAN canceled)
{
    struct state *s = context;
    LONG active = InterlockedIncrement(&s->active), prior;
    do { prior = s->max_active; } while (active > prior && InterlockedCompareExchange(&s->max_active, active, prior) != prior);
    if (canceled) InterlockedIncrement(&s->canceled);
    Sleep(1);
    InterlockedDecrement(&s->active);
    if (InterlockedIncrement(&s->count) == 200) SetEvent(s->done);
}
static void WINAPI once(void *context, BOOLEAN canceled)
{
    struct state *s = context;
    InterlockedIncrement(&s->count);
    if (canceled) InterlockedIncrement(&s->canceled);
    s->callback_thread = GetCurrentThreadId();
    SetEvent(s->done);
}
static void WINAPI block(void *context, BOOLEAN canceled)
{
    struct state *s = context;
    SetEvent(s->started);
    WaitForSingleObject(s->release, 5000);
    InterlockedIncrement(&s->count);
}
static void WINAPI finish(void *context)
{
    struct state *s = context;
    if (s->active) InterlockedIncrement(&s->canceled);
    SetEvent(s->done);
}
static void WINAPI close_on_finish(void *context)
{
    struct state *s = context;
    IXThreadingImpl_XTaskQueueCloseHandle(api, s->queue);
    s->queue = NULL;
    SetEvent(s->done);
}
static void WINAPI monitor(void *context, XTaskQueueHandle queue, XTaskQueuePort port)
{
    struct state *s = context;
    InterlockedIncrement(&s->notifications);
    if (port == XTaskQueuePort_Work) InterlockedIncrement(&s->work);
    else if (port == XTaskQueuePort_Completion) InterlockedIncrement(&s->completion);
    SetEvent(s->started);
}
static struct state init(void)
{
    struct state s = {0};
    s.done = CreateEventW(NULL, TRUE, FALSE, NULL);
    s.started = CreateEventW(NULL, TRUE, FALSE, NULL);
    s.release = CreateEventW(NULL, TRUE, FALSE, NULL);
    return s;
}
static void destroy(struct state *s)
{
    CloseHandle(s->done); CloseHandle(s->started); CloseHandle(s->release);
}
static void modes(void)
{
    XTaskQueueDispatchMode modes[] = {XTaskQueueDispatchMode_Manual, XTaskQueueDispatchMode_ThreadPool,
        XTaskQueueDispatchMode_SerializedThreadPool, XTaskQueueDispatchMode_Immediate};
    for (unsigned m = 0; m < 4; ++m)
    {
        struct state s = init();
        CHECK(IXThreadingImpl_XTaskQueueCreate(api, modes[m], modes[m], &s.queue) == S_OK, "mode-create");
        for (unsigned i = 0; i < 200; ++i)
            CHECK(IXThreadingImpl_XTaskQueueSubmitCallback(api, s.queue, XTaskQueuePort_Work, &s, task) == S_OK, "mode-submit");
        if (modes[m] == XTaskQueueDispatchMode_Manual)
            for (unsigned i = 0; i < 200; ++i) CHECK(IXThreadingImpl_XTaskQueueDispatch(api, s.queue, XTaskQueuePort_Work, 1000), "manual-dispatch");
        CHECK(WaitForSingleObject(s.done, 5000) == WAIT_OBJECT_0, "mode-drained");
        CHECK(s.count == 200 && s.canceled == 0, "mode-exactly-once");
        if (modes[m] == XTaskQueueDispatchMode_SerializedThreadPool) CHECK(s.max_active == 1, "serialized-not-concurrent");
        ResetEvent(s.done);
        CHECK(IXThreadingImpl_XTaskQueueTerminate(api, s.queue, FALSE, &s, finish) == S_OK, "mode-terminate");
        if (modes[m] == XTaskQueueDispatchMode_Manual) IXThreadingImpl_XTaskQueueDispatch(api, s.queue, XTaskQueuePort_Completion, 1000);
        CHECK(WaitForSingleObject(s.done, 5000) == WAIT_OBJECT_0, "mode-terminated");
        IXThreadingImpl_XTaskQueueCloseHandle(api, s.queue);
        destroy(&s);
    }
}
static void monitors(void)
{
    struct state s = init();
    XTaskQueueHandle child;
    XTaskQueuePortHandle work, completion;
    CHECK(IXThreadingImpl_XTaskQueueCreate(api, XTaskQueueDispatchMode_Manual, XTaskQueueDispatchMode_Manual, &s.queue) == S_OK, "monitor-create");
    CHECK(IXThreadingImpl_XTaskQueueRegisterMonitor(api, s.queue, &s, monitor, &s.token) == S_OK, "monitor-register");
    IXThreadingImpl_XTaskQueueGetPort(api, s.queue, XTaskQueuePort_Work, &work);
    IXThreadingImpl_XTaskQueueGetPort(api, s.queue, XTaskQueuePort_Completion, &completion);
    CHECK(IXThreadingImpl_XTaskQueueCreateComposite(api, work, completion, &child) == S_OK, "monitor-composite");
    CHECK(IXThreadingImpl_XTaskQueueSubmitCallback(api, child, XTaskQueuePort_Completion, &s, once) == S_OK, "monitor-submit-child");
    CHECK(s.completion == 1 && s.work == 0, "parent-monitor-woken-logical-port");
    CHECK(s.count == 0, "monitor-before-manual-dispatch");
    IXThreadingImpl_XTaskQueueDispatch(api, s.queue, XTaskQueuePort_Completion, 0);
    ResetEvent(s.started); ResetEvent(s.done);
    CHECK(IXThreadingImpl_XTaskQueueSubmitDelayedCallback(api, child, XTaskQueuePort_Work, 100, &s, once) == S_OK, "delayed-submit");
    CHECK(!IXThreadingImpl_XTaskQueueDispatch(api, s.queue, XTaskQueuePort_Work, 0), "delay-not-early");
    CHECK(WaitForSingleObject(s.started, 2000) == WAIT_OBJECT_0, "delayed-monitor-wakes-when-ready");
    CHECK(IXThreadingImpl_XTaskQueueDispatch(api, s.queue, XTaskQueuePort_Work, 0), "delayed-ready-after-notification");
    ResetEvent(s.done); ResetEvent(s.started);
    CHECK(IXThreadingImpl_XTaskQueueTerminate(api, child, FALSE, &s, finish) == S_OK, "monitor-terminate-child");
    CHECK(WaitForSingleObject(s.started, 1000) == WAIT_OBJECT_0, "termination-wakes-parent-monitor");
    CHECK(IXThreadingImpl_XTaskQueueDispatch(api, s.queue, XTaskQueuePort_Completion, 0), "parent-dispatch-final-notification");
    CHECK(WaitForSingleObject(s.done, 1000) == WAIT_OBJECT_0, "monitor-termination-finished");
    IXThreadingImpl_XTaskQueueCloseHandle(api, child);
    IXThreadingImpl_XTaskQueueUnregisterMonitor(api, s.queue, s.token);
    LONG notified = s.notifications;
    IXThreadingImpl_XTaskQueueSubmitCallback(api, s.queue, XTaskQueuePort_Work, &s, once);
    CHECK(s.notifications == notified, "unregistered-monitor-not-invoked");
    IXThreadingImpl_XTaskQueueDispatch(api, s.queue, XTaskQueuePort_Work, 0);
    IXThreadingImpl_XTaskQueueCloseHandle(api, s.queue);
    destroy(&s);
}
static void lifetimes(void)
{
    for (unsigned i = 0; i < 100; ++i)
    {
        struct state s = init();
        IXThreadingImpl_XTaskQueueCreate(api, XTaskQueueDispatchMode_ThreadPool, XTaskQueueDispatchMode_ThreadPool, &s.queue);
        CHECK(IXThreadingImpl_XTaskQueueSubmitDelayedCallback(api, s.queue, XTaskQueuePort_Work, 10, &s, once) == S_OK, "lifetime-submit");
        IXThreadingImpl_XTaskQueueCloseHandle(api, s.queue);
        CHECK(WaitForSingleObject(s.done, 3000) == WAIT_OBJECT_0 && s.count == 1 && !s.canceled, "close-does-not-cancel-pending");
        destroy(&s);
    }
    struct state s = init();
    IXThreadingImpl_XTaskQueueCreate(api, XTaskQueueDispatchMode_ThreadPool, XTaskQueueDispatchMode_Manual, &s.queue);
    IXThreadingImpl_XTaskQueueSubmitCallback(api, s.queue, XTaskQueuePort_Work, &s, block);
    CHECK(WaitForSingleObject(s.started, 2000) == WAIT_OBJECT_0, "running-started");
    IXThreadingImpl_XTaskQueueTerminate(api, s.queue, FALSE, &s, close_on_finish);
    CHECK(!IXThreadingImpl_XTaskQueueDispatch(api, s.queue, XTaskQueuePort_Completion, 0), "running-not-terminated-prematurely");
    SetEvent(s.release);
    CHECK(IXThreadingImpl_XTaskQueueDispatch(api, s.queue, XTaskQueuePort_Completion, 2000), "running-finish-dispatched");
    CHECK(s.count == 1 && s.queue == NULL, "last-handle-closed-in-termination");
    destroy(&s);
    s = init();
    IXThreadingImpl_XTaskQueueCreate(api, XTaskQueueDispatchMode_ThreadPool, XTaskQueueDispatchMode_ThreadPool, &s.queue);
    IXThreadingImpl_XTaskQueueSubmitDelayedCallback(api, s.queue, XTaskQueuePort_Work, 60000, &s, once);
    ULONGLONG start = GetTickCount64();
    CHECK(IXThreadingImpl_XTaskQueueTerminate(api, s.queue, TRUE, &s, finish) == S_OK, "synchronous-terminate");
    CHECK(GetTickCount64() - start < 2000 && s.count == 1 && s.canceled == 1, "delay-canceled-without-waiting-for-timer");
    IXThreadingImpl_XTaskQueueCloseHandle(api, s.queue);
    destroy(&s);
}
struct race_state { XTaskQueueHandle queue; LONG accepted, called, rejected, bad; };
static void WINAPI race_task(void *context, BOOLEAN canceled)
{
    struct race_state *s = context;
    InterlockedIncrement(&s->called);
}
static DWORD WINAPI producer(void *context)
{
    struct race_state *s = context;
    for (unsigned i = 0; i < 500; ++i)
    {
        HRESULT hr = IXThreadingImpl_XTaskQueueSubmitCallback(api, s->queue, XTaskQueuePort_Work, s, race_task);
        if (hr == S_OK) InterlockedIncrement(&s->accepted);
        else if (hr == E_ABORT) InterlockedIncrement(&s->rejected);
        else InterlockedIncrement(&s->bad);
        if (!(i % 10)) Sleep(0);
    }
    return 0;
}
static void race(void)
{
    for (unsigned round = 0; round < 20; ++round)
    {
        struct race_state s = {0};
        HANDLE workers[4];
        IXThreadingImpl_XTaskQueueCreate(api, XTaskQueueDispatchMode_ThreadPool, XTaskQueueDispatchMode_ThreadPool, &s.queue);
        for (unsigned i = 0; i < 4; ++i) workers[i] = CreateThread(NULL, 0, producer, &s, 0, NULL);
        Sleep(1);
        CHECK(IXThreadingImpl_XTaskQueueTerminate(api, s.queue, TRUE, NULL, NULL) == S_OK, "concurrent-termination");
        CHECK(WaitForMultipleObjects(4, workers, TRUE, 5000) == WAIT_OBJECT_0, "concurrent-producers-finished");
        CHECK(!s.bad && s.called == s.accepted && s.accepted + s.rejected == 2000, "concurrent-no-lost-or-duplicate-callbacks");
        for (unsigned i = 0; i < 4; ++i) CloseHandle(workers[i]);
        IXThreadingImpl_XTaskQueueCloseHandle(api, s.queue);
    }
}
int main(void)
{
    HMODULE dll = LoadLibraryA("xgameruntime.dll");
    HRESULT (WINAPI *query)(const GUID *, REFIID, void **) = (void *)GetProcAddress(dll, "QueryApiImpl");
    if (!query || FAILED(query(&CLSID_XThreadingImpl, &IID_IXThreadingImpl, (void **)&api))) return 2;
    modes(); monitors(); lifetimes(); race();
    IXThreadingImpl_Release(api);
    printf("QUEUE CHECKS %ld FAILURES %ld\n", checks, failures);
    return failures ? 1 : 0;
}
