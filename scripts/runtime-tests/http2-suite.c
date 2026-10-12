/* Controlled, unauthenticated WinHTTP regression suite. Test CA may be
 * installed ONLY in the explicitly named disposable suite prefix. */
#include <windows.h>
#include <winhttp.h>
#include <wincrypt.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static unsigned failures, checks;
static INTERNET_PORT port;
static void check(BOOL value, const char *name)
{
    checks++;
    if (!value) { failures++; printf("FAIL %s error=%lu\n", name, GetLastError()); }
}

static BOOL trust_ca(const char *filename)
{
    char prefix[2048];
    DWORD size = GetEnvironmentVariableA("WINEPREFIX", prefix, sizeof(prefix));
    char expected[2048];
    DWORD expected_size = GetEnvironmentVariableA("XODUS_RUNTIME_TEST_PREFIX", expected, sizeof(expected));
    if (!size || size >= sizeof(prefix) || !expected_size || expected_size >= sizeof(expected) ||
        strcmp(prefix, expected) || !strstr(prefix, "/runtime-http2-")) return FALSE;
    FILE *file = fopen(filename, "rb");
    if (!file) return FALSE;
    BYTE data[16384];
    size_t length = fread(data, 1, sizeof(data), file);
    BOOL whole = feof(file);
    fclose(file);
    if (!whole || !length) return FALSE;
    HCERTSTORE store = CertOpenStore(CERT_STORE_PROV_SYSTEM_A, 0, 0, CERT_SYSTEM_STORE_CURRENT_USER, "ROOT");
    if (!store) return FALSE;
    BOOL result = CertAddEncodedCertificateToStore(store, X509_ASN_ENCODING, data, length, CERT_STORE_ADD_REPLACE_EXISTING, NULL);
    CertCloseStore(store, 0);
    return result;
}

static BOOL pattern(const BYTE *buffer, DWORD offset, DWORD length)
{
    for (DWORD i = 0; i < length; i++) if (buffer[i] != (BYTE)('a' + (offset + i) % 26)) return FALSE;
    return TRUE;
}

static void synchronous(const char *name, const WCHAR *verb, const WCHAR *target,
                        BOOL disable_h2, DWORD expected_status, DWORD body_length, BOOL upload, BOOL stream_upload)
{
    HINTERNET session = WinHttpOpen(L"WinHTTP2-Controlled-Test", WINHTTP_ACCESS_TYPE_NO_PROXY, NULL, NULL, 0);
    HINTERNET connection = NULL, request = NULL;
    BYTE buffer[10000], body[200000];
    DWORD code = 0, protocol = 99, length = sizeof(code), count = 0, total = 0;
    BOOL result = FALSE;
    for (DWORD i = 0; i < sizeof(body); i++) body[i] = 'a' + i % 26;
    if (!session) goto done;
    WinHttpSetTimeouts(session, 5000, 5000, 5000, 5000);
    if (disable_h2) {
        DWORD disabled = 0;
        if (!WinHttpSetOption(session, WINHTTP_OPTION_ENABLE_HTTP_PROTOCOL, &disabled, sizeof(disabled))) goto done;
    }
    connection = WinHttpConnect(session, L"localhost", port, 0);
    if (!connection) goto done;
    request = WinHttpOpenRequest(connection, verb, target, NULL, NULL, NULL, WINHTTP_FLAG_SECURE);
    if (!request) goto done;
    if (!WinHttpSendRequest(request, L"X-Controlled-Test: dummy\r\n", (DWORD)-1L,
        upload ? body : NULL, upload ? (stream_upload ? 5 : sizeof(body)) : 0, upload ? sizeof(body) : 0, 0)) goto done;
    if (upload && stream_upload) {
        DWORD offset = 5;
        while (offset < sizeof(body)) {
            DWORD next = min(10000, sizeof(body) - offset), written = 0;
            if (!WinHttpWriteData(request, body + offset, next, &written) || written != next) goto done;
            offset += next;
        }
    }
    if (!WinHttpReceiveResponse(request, NULL)) goto done;
    if (!WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, NULL, &code, &length, NULL)) goto done;
    length = sizeof(protocol);
    if (!WinHttpQueryOption(request, WINHTTP_OPTION_HTTP_PROTOCOL_USED, &protocol, &length)) goto done;
    if (code != expected_status || protocol != (disable_h2 ? 0 : WINHTTP_PROTOCOL_FLAG_HTTP2)) goto done;
    for (;;) {
        if (!WinHttpReadData(request, buffer, sizeof(buffer), &count)) goto done;
        if (!count) break;
        if (!pattern(buffer, total, count)) goto done;
        total += count;
        if (total > body_length) goto done;
    }
    result = total == body_length;
done:
    printf("CASE %s status=%lu protocol=%lu bytes=%lu\n", name, code, protocol, total);
    check(result, name);
    if (request) WinHttpCloseHandle(request);
    if (connection) WinHttpCloseHandle(connection);
    if (session) WinHttpCloseHandle(session);
}

struct asynchronous {
    HANDLE done, closed;
    BYTE buffer[8192];
    DWORD total, send_count, header_count, errors, error_code;
    BOOL cancel;
};

static void CALLBACK callback(HINTERNET handle, DWORD_PTR context, DWORD status, void *info, DWORD length)
{
    struct asynchronous *test = (void *)context;
    if (!test) return;
    switch (status) {
    case WINHTTP_CALLBACK_STATUS_SENDREQUEST_COMPLETE:
        test->send_count++;
        if (!test->cancel && !WinHttpReceiveResponse(handle, NULL)) { test->errors++; SetEvent(test->done); }
        break;
    case WINHTTP_CALLBACK_STATUS_HEADERS_AVAILABLE:
        test->header_count++;
        if (!test->cancel && !WinHttpReadData(handle, test->buffer, sizeof(test->buffer), NULL)) { test->errors++; SetEvent(test->done); }
        break;
    case WINHTTP_CALLBACK_STATUS_READ_COMPLETE:
        if (!length) { SetEvent(test->done); break; }
        if (!pattern(info, test->total, length)) test->errors++;
        test->total += length;
        if (!WinHttpReadData(handle, test->buffer, sizeof(test->buffer), NULL)) { test->errors++; SetEvent(test->done); }
        break;
    case WINHTTP_CALLBACK_STATUS_REQUEST_ERROR:
        test->errors++; test->error_code = ((WINHTTP_ASYNC_RESULT *)info)->dwError;
        if (!test->cancel) SetEvent(test->done);
        break;
    case WINHTTP_CALLBACK_STATUS_HANDLE_CLOSING:
        if (test->cancel) SetEvent(test->done);
        SetEvent(test->closed);
        break;
    }
}

static DWORD WINAPI async_test(void *argument)
{
    BOOL cancel = (BOOL)(UINT_PTR)argument;
    struct asynchronous test = {0};
    test.cancel = cancel;
    test.done = CreateEventW(NULL, TRUE, FALSE, NULL);
    test.closed = CreateEventW(NULL, TRUE, FALSE, NULL);
    HINTERNET session = WinHttpOpen(L"WinHTTP2-Async-Test", WINHTTP_ACCESS_TYPE_NO_PROXY, NULL, NULL, WINHTTP_FLAG_ASYNC);
    HINTERNET connection = NULL, request = NULL;
    BOOL ok = FALSE;
    if (!session) goto done;
    WinHttpSetTimeouts(session, 5000, 5000, 5000, 5000);
    connection = WinHttpConnect(session, L"localhost", port, 0);
    if (!connection) goto done;
    request = WinHttpOpenRequest(connection, L"GET", cancel ? L"/slow" : L"/body", NULL, NULL, NULL, WINHTTP_FLAG_SECURE);
    if (!request) goto done;
    WinHttpSetStatusCallback(request, callback, WINHTTP_CALLBACK_FLAG_ALL_NOTIFICATIONS, 0);
    if (!WinHttpSendRequest(request, NULL, 0, NULL, 0, 0, (DWORD_PTR)&test)) goto done;
    if (cancel) { Sleep(200); WinHttpCloseHandle(request); request = NULL; }
    if (WaitForSingleObject(test.done, 10000) != WAIT_OBJECT_0) goto done;
    ok = cancel ? (test.errors == 1 && test.error_code == ERROR_WINHTTP_OPERATION_CANCELLED) :
        !test.errors && test.send_count == 1 && test.header_count == 1 && test.total == 200000;
done:
    if (request) WinHttpCloseHandle(request);
    if (connection && WaitForSingleObject(test.closed, 10000) != WAIT_OBJECT_0) ok = FALSE;
    if (connection) WinHttpCloseHandle(connection);
    if (session) WinHttpCloseHandle(session);
    CloseHandle(test.done);
    CloseHandle(test.closed);
    printf("ASYNC cancel=%u send=%lu headers=%lu bytes=%lu errors=%lu code=%lu result=%u\n",
           cancel, test.send_count, test.header_count, test.total, test.errors, test.error_code, ok);
    return ok ? 0 : 1;
}

static void rejection(const char *name, const WCHAR *host, const WCHAR *target)
{
    HINTERNET session = WinHttpOpen(L"WinHTTP2-Rejection-Test", WINHTTP_ACCESS_TYPE_NO_PROXY, NULL, NULL, 0);
    WinHttpSetTimeouts(session, 5000, 5000, 5000, 5000);
    HINTERNET connection = WinHttpConnect(session, host, port, 0);
    HINTERNET request = WinHttpOpenRequest(connection, L"GET", target, NULL, NULL, NULL, WINHTTP_FLAG_SECURE);
    BOOL result = request && WinHttpSendRequest(request, NULL, 0, NULL, 0, 0, 0) && WinHttpReceiveResponse(request, NULL);
    DWORD error = GetLastError();
    check(!result && (error == ERROR_WINHTTP_SECURE_CHANNEL_ERROR || error == ERROR_WINHTTP_SECURE_FAILURE || error == ERROR_WINHTTP_REDIRECT_FAILED), name);
    printf("REJECT %s result=%u error=%lu\n", name, result, error);
    if (request) WinHttpCloseHandle(request);
    if (connection) WinHttpCloseHandle(connection);
    if (session) WinHttpCloseHandle(session);
}

int main(int argc, char **argv)
{
    if (argc != 3 || !trust_ca(argv[2])) { puts("Test CA import refused/failed"); return 2; }
    port = (INTERNET_PORT)strtoul(argv[1], NULL, 10);
    synchronous("head-h2", L"HEAD", L"/head", FALSE, 405, 0, FALSE, FALSE);
    synchronous("body-h2", L"GET", L"/body", FALSE, 200, 200000, FALSE, FALSE);
    synchronous("post-h2", L"POST", L"/echo", FALSE, 201, 200000, TRUE, FALSE);
    synchronous("stream-post-h2", L"POST", L"/echo", FALSE, 201, 200000, TRUE, TRUE);
    synchronous("fallback-h1", L"GET", L"/body", TRUE, 200, 200000, FALSE, FALSE);
    synchronous("real-http-error", L"GET", L"/error", FALSE, 503, 0, FALSE, FALSE);
    synchronous("redirect-h2", L"GET", L"/redirect", FALSE, 200, 200000, FALSE, FALSE);
    rejection("wrong-host-certificate", L"127.0.0.1", L"/body");
    rejection("https-downgrade", L"localhost", L"/downgrade");
    HANDLE threads[4];
    for (unsigned i = 0; i < 4; i++) threads[i] = CreateThread(NULL, 0, async_test, NULL, 0, NULL);
    WaitForMultipleObjects(4, threads, TRUE, 20000);
    for (unsigned i = 0; i < 4; i++) { DWORD code = 1; GetExitCodeThread(threads[i], &code); check(code == 0, "concurrent-async"); CloseHandle(threads[i]); }
    check(async_test((void *)1) == 0, "cancel-pending");
    printf("SUMMARY checks=%u failures=%u\n", checks, failures);
    return failures ? 1 : 0;
}
