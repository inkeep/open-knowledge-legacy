import { describe, expect, mock, test } from 'bun:test';
import { createInvoker } from '../../src/shared/ipc-invoke.ts';

/**
 * Preload bridge unit tests.
 *
 * The bridge module itself imports `electron` (`contextBridge`, `ipcRenderer`)
 * which only works inside a real Electron preload context — Bun's test runner
 * can't load it. So the test exercises the BUILDING BLOCKS the preload uses
 * (`createInvoker` typed-IPC factory) against a mock ipcRenderer surface.
 *
 * Full end-to-end preload behavior is verified in US-013's Playwright smoke
 * test (`tests/integration/m1-smoke.test.ts`) which launches a real Electron
 * BrowserWindow.
 */

describe('createInvoker (typed IPC factory)', () => {
  test('forwards channel + args to ipcRenderer.invoke verbatim', async () => {
    const invoke = mock((channel: string, ...args: unknown[]) =>
      Promise.resolve({ channel, args }),
    );
    // biome-ignore lint/suspicious/noExplicitAny: minimal IpcRenderer-compatible mock
    const fakeIpc = { invoke } as any;
    const typedInvoker = createInvoker(fakeIpc);
    const result = await typedInvoker('ok:dialog:open-folder');
    expect(invoke).toHaveBeenCalledWith('ok:dialog:open-folder');
    expect(result).toEqual({ channel: 'ok:dialog:open-folder', args: [] });
  });

  test('passes positional args through (e.g., shell.openExternal URL)', async () => {
    const invoke = mock((channel: string, ...args: unknown[]) =>
      Promise.resolve({ channel, args }),
    );
    // biome-ignore lint/suspicious/noExplicitAny: minimal IpcRenderer-compatible mock
    const fakeIpc = { invoke } as any;
    const typedInvoker = createInvoker(fakeIpc);
    await typedInvoker('ok:shell:open-external', 'https://example.com');
    expect(invoke).toHaveBeenCalledWith('ok:shell:open-external', 'https://example.com');
  });

  test('return type is awaited from invoke', async () => {
    const invoke = mock(() => Promise.resolve('/Users/test/picked-folder'));
    // biome-ignore lint/suspicious/noExplicitAny: minimal IpcRenderer-compatible mock
    const fakeIpc = { invoke } as any;
    const typedInvoker = createInvoker(fakeIpc);
    const result = await typedInvoker('ok:dialog:open-folder');
    expect(result).toBe('/Users/test/picked-folder');
  });
});
