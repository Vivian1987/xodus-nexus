import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ModuleKind, transpileModule } from 'typescript';

it('delivers automatic wallet status and removes exactly its own preload listener', () => {
  let api: any;
  const on = vi.fn(), removeListener = vi.fn(), invoke = vi.fn();
  const electron = { contextBridge: { exposeInMainWorld: (name: string, value: unknown) => { if (name === 'launcher') api = value; } }, ipcRenderer: { on, removeListener, invoke } };
  const js = transpileModule(readFileSync('src/preload/index.cts', 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS } }).outputText;
  runInNewContext(js, { exports: {}, require: (name: string) => { expect(name).toBe('electron'); return electron; } });
  const callback = vi.fn(), dispose = api.onKeyringStatus(callback);
  const [channel, listener] = on.mock.calls.find(([name]) => name === 'keyring-state')!;
  expect(channel).toBe('keyring-state');
  const status = { state: 'ready', canStart: false, gameMode: true, message: 'Ready' };
  listener({ sender: 'not exposed' }, status);
  expect(callback).toHaveBeenCalledWith(status);
  dispose(); expect(removeListener).toHaveBeenCalledWith('keyring-state', listener);
  api.createKeyringCollection(); expect(invoke).toHaveBeenCalledWith('keyring-create');
});
