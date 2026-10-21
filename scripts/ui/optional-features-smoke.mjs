#!/usr/bin/env node
/** Isolated headless Chromium check of optional Nexus renderer components.
 * All launcher/native APIs are synthetic. No account, physical input, host
 * session, native fullscreen, power action or installed app is accessed.
 * Run: node scripts/ui/optional-features-smoke.mjs [output-folder] [mode|optional|settings|main]
 */
import { createServer } from 'vite';
import { createServer as createSocketServer } from 'node:net';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureContentSecurityPolicy, fixtureNetworkBoundary } from './local-network-boundary.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, process.argv[2] ?? 'work/ui-optional-features');
const selection = process.argv[3];
const fixtures = selection === 'mode' ? [['nexus-mode-entry', 'runNexusModeEntryChecks']]
  : selection === 'optional' ? [['nexus-optional', 'runNexusOptionalChecks']]
    : selection === 'settings' ? [['nexus-settings', 'runNexusSettingsChecks']]
      : selection === 'main' ? [['nexus-main', 'runNexusMainChecks']]
        : [['nexus-mode-entry', 'runNexusModeEntryChecks'], ['nexus-optional', 'runNexusOptionalChecks'], ['nexus-settings', 'runNexusSettingsChecks']];
const report = { startedAt: new Date().toISOString(), fixtureOnly: true, realXboxRequests: false, realSystemActions: false,
  realNativeIpc: false, physicalControllerVerified: false, checks: [], screenshots: [], browserErrors: [], blockedRequests: [] };
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'nexus-ui-fixture-'));
const isolatedHome = join(profile, 'home'), isolatedRuntime = join(profile, 'run');
await mkdir(isolatedHome); await mkdir(isolatedRuntime, { mode: 0o700 });
let server, chrome, socket, browserExited, browserError;
try {
  const upstreamSource = fixtures.some(([name]) => name === 'nexus-main') ? execFileSync('git', ['show', 'HEAD:src/renderer/App.tsx'], { cwd: root, encoding: 'utf8' }) : undefined;
  if (upstreamSource) report.baselineGitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const reservation = createSocketServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  server = await createServer({ root, cacheDir: join(profile, 'vite-cache'), logLevel: 'error', server: { host: '127.0.0.1', port, strictPort: true, watch: { ignored: ['**/*'] } }, plugins: [{
    name: 'nexus-upstream-fixture-source', enforce: 'pre', load(id) { if (upstreamSource && id.endsWith('/src/renderer/App.tsx?upstream-fixture')) return upstreamSource; },
  }, {
    name: 'nexus-optional-fixtures', configureServer(vite) {
      for (const [fixture] of fixtures) vite.middlewares.use(`/__${fixture}.html`, async (_request, response) => {
        response.setHeader('Content-Type', 'text/html'); response.setHeader('Content-Security-Policy', fixtureContentSecurityPolicy);
        response.end(await vite.transformIndexHtml(`/__${fixture}.html`, `<!doctype html><html><head><meta charset="utf-8"><title>Nexus isolated component fixture</title></head><body><div id="root"></div><script type="module" src="/scripts/ui/fixtures/${fixture}.tsx"></script></body></html>`));
      });
    },
  }] });
  await server.listen(); const base = `http://127.0.0.1:${port}`;
  chrome = spawn(process.env.CHROME_BIN ?? '/usr/bin/google-chrome', [
    '--headless', '--ozone-platform=headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking',
    '--disable-extensions', '--disable-component-extensions-with-background-pages', '--disable-default-apps', '--disable-features=MediaRouter,OptimizationHints',
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    `--user-data-dir=${join(profile, 'browser')}`, 'about:blank',
  ], { stdio: 'ignore', env: { ...process.env, HOME: isolatedHome, XDG_CONFIG_HOME: join(profile, 'config'), XDG_CACHE_HOME: join(profile, 'cache'),
    XDG_DATA_HOME: join(profile, 'data'), XDG_RUNTIME_DIR: isolatedRuntime, DISPLAY: '', WAYLAND_DISPLAY: '', XAUTHORITY: join(profile, 'no-xauthority'),
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${join(profile, 'no-session-bus')}`, DBUS_SYSTEM_BUS_ADDRESS: `unix:path=${join(profile, 'no-system-bus')}` } });
  browserExited = new Promise(resolve => { chrome.once('exit', resolve); chrome.once('error', error => { browserError = error; resolve(); }); });
  let chromePort;
  for (let attempt = 0; attempt < 100 && !chromePort; attempt++) {
    if (browserError) throw browserError;
    try { chromePort = Number((await readFile(join(profile, 'browser', 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { /* Startup only. */ }
    if (!chromePort) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!chromePort) throw Error('Isolated headless Chromium did not start. Set CHROME_BIN to a supported Chromium executable.');
  const tab = (await (await fetch(`http://127.0.0.1:${chromePort}/json`)).json()).find(value => value.type === 'page');
  socket = new WebSocket(tab.webSocketDebuggerUrl); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id, timeout = setTimeout(() => { pending.delete(current); reject(Error(`CDP timeout: ${method}`)); }, 60_000);
    pending.set(current, message => { clearTimeout(timeout); message.error ? reject(Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket.send(JSON.stringify({ id: current, method, params }));
  });
  const evaluate = async expression => {
    const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
    return value.result.value;
  };
  const capture = async name => {
    try {
      await evaluate('document.fonts.ready');
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(output, `${name}.png`), Buffer.from(data, 'base64'));
      report.screenshots.push(`${name}.png`);
    } catch (error) { report.browserErrors.push(String(error)); }
    finally { await evaluate('window.__pendingFixtureCapture=undefined'); }
  };
  const network = fixtureNetworkBoundary(base, report);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data); network.handle(message);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    else if (message.method === 'Runtime.exceptionThrown') report.browserErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    else if (message.method === 'Runtime.bindingCalled' && message.params.name === 'nexusFixtureCapture') void capture(message.params.payload);
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Runtime.addBinding', { name: 'nexusFixtureCapture' }); await network.install(send);
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__captureFixture=async name=>{window.__pendingFixtureCapture=name;window.nexusFixtureCapture(name);while(window.__pendingFixtureCapture)await new Promise(resolve=>setTimeout(resolve,50));};` });
  for (const [fixture, method] of fixtures) {
    await send('Page.navigate', { url: `${base}/__${fixture}.html` });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(`typeof window.${method}==='function'`)) break;
      if (attempt === 99) throw Error(`${fixture} did not load.`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const result = await evaluate(`window.${method}()`); report[fixture] = result;
    for (const label of result.checks) report.checks.push({ fixture, label, passed: true });
    console.log(`${fixture}: ${result.passed} passed`);
  }
} catch (error) { report.error = error.stack ?? String(error); console.error(report.error); }
finally {
  report.finishedAt = new Date().toISOString(); report.passed = report.checks.length;
  await writeFile(join(output, 'renderer-smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(output, 'README.txt'), 'Actual Nexus React components in isolated headless Chromium with private HOME/XDG and browser profile, inaccessible host session/system D-Bus and a verified fixture-origin-only network boundary. All profiles, native events, battery readings and privileged callbacks are synthetic. Screenshots carry a fixture watermark. No native IPC, physical controller, host fullscreen, restart, account request or microphone is exercised. These checks validate renderer behavior only. Reproduce with node scripts/ui/optional-features-smoke.mjs.\n');
  socket?.close();
  if (chrome) { if (chrome.pid && chrome.exitCode === null) chrome.kill('SIGTERM'); await browserExited; }
  await server?.close(); await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
console.log(`Fixture checks: ${report.passed}; screenshots: ${report.screenshots.length}. Artifacts: ${output}`);
if (report.error || report.browserErrors.length) process.exitCode = 1;
