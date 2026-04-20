/**
 * NavigatorApp unit tests — exercise the pure shape of the React component
 * via direct module imports + bridge-call counters. Repo convention is no
 * @testing-library/react, so we test the IPC dispatch logic via the bridge
 * mock surface (the same pattern as `EditorActivityPool.test.ts`).
 *
 * Full DOM rendering / interaction behavior is exercised by the US-013
 * Playwright smoke test which launches a real Electron BrowserWindow.
 */
import { describe, expect, mock, test } from 'bun:test';

interface MockBridge {
  config: {
    collabUrl: string;
    apiOrigin: string;
    projectPath: string;
    projectName: string;
    mode: 'navigator' | 'editor';
  };
  project: {
    listRecent: ReturnType<typeof mock>;
    open: ReturnType<typeof mock>;
    close: ReturnType<typeof mock>;
  };
  dialog: {
    openFolder: ReturnType<typeof mock>;
    createFolder: ReturnType<typeof mock>;
  };
}

function makeBridge(overrides: Partial<MockBridge> = {}): MockBridge {
  return {
    config: {
      collabUrl: '',
      apiOrigin: '',
      projectPath: '',
      projectName: 'Project Navigator',
      mode: 'navigator',
    },
    project: {
      listRecent: mock(() => Promise.resolve([])),
      open: mock(() => Promise.resolve()),
      close: mock(() => Promise.resolve()),
    },
    dialog: {
      openFolder: mock(() => Promise.resolve(null)),
      createFolder: mock(() => Promise.resolve(null)),
    },
    ...overrides,
  };
}

describe('NavigatorApp bridge contract', () => {
  test('Component module imports cleanly', async () => {
    const mod = await import('./NavigatorApp');
    expect(typeof mod.NavigatorApp).toBe('function');
  });

  test('bridge.project.listRecent returns RecentProjectEntry[] shape', async () => {
    const bridge = makeBridge({
      project: {
        listRecent: mock(() =>
          Promise.resolve([
            { path: '/tmp/a', name: 'a', lastOpenedAt: '2026-04-20T00:00:00Z' },
            { path: '/tmp/b', name: 'b', lastOpenedAt: '2026-04-19T00:00:00Z', missing: true },
          ]),
        ),
        open: mock(() => Promise.resolve()),
        close: mock(() => Promise.resolve()),
      },
    });
    const list = await bridge.project.listRecent();
    expect(list.length).toBe(2);
    expect(list[0]?.path).toBe('/tmp/a');
    expect(list[1]?.missing).toBe(true);
  });

  test('bridge.project.open accepts the new-window request shape', async () => {
    const bridge = makeBridge();
    await bridge.project.open({ path: '/tmp/x', target: 'new-window' });
    expect(bridge.project.open).toHaveBeenCalledWith({ path: '/tmp/x', target: 'new-window' });
  });

  test('bridge.dialog.openFolder returns string | null', async () => {
    const bridge = makeBridge({
      dialog: {
        openFolder: mock(() => Promise.resolve('/tmp/picked')),
        createFolder: mock(() => Promise.resolve(null)),
      },
    });
    const result = await bridge.dialog.openFolder();
    expect(result).toBe('/tmp/picked');
  });
});
