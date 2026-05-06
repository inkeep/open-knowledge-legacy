import { describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    expect(typeof mod.resolveErrorMessage).toBe('function');
    expect(typeof mod.runWithErrorStatePure).toBe('function');
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

describe('NavigatorApp error-state helpers', () => {
  test('resolveErrorMessage prefers Error.message', async () => {
    const { resolveErrorMessage } = await import('./NavigatorApp');
    expect(resolveErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  test('resolveErrorMessage falls back when message is empty', async () => {
    const { resolveErrorMessage } = await import('./NavigatorApp');
    expect(resolveErrorMessage(new Error(''), 'fallback')).toBe('fallback');
  });

  test('resolveErrorMessage falls back for non-Error throws (string, undefined, object)', async () => {
    const { resolveErrorMessage } = await import('./NavigatorApp');
    expect(resolveErrorMessage('plain-string', 'fallback')).toBe('fallback');
    expect(resolveErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(resolveErrorMessage({ weird: 'object' }, 'fallback')).toBe('fallback');
    expect(resolveErrorMessage(null, 'fallback')).toBe('fallback');
  });

  test('runWithErrorStatePure clears error state then awaits the wrapped fn', async () => {
    const { runWithErrorStatePure } = await import('./NavigatorApp');
    const setError = mock(() => {});
    const fn = mock(() => Promise.resolve());
    await runWithErrorStatePure(fn, 'fallback', setError);
    expect(setError).toHaveBeenCalledWith(null);
    expect(fn).toHaveBeenCalled();
  });

  test('runWithErrorStatePure surfaces rejections via setError with Error.message', async () => {
    const { runWithErrorStatePure } = await import('./NavigatorApp');
    const setErrorCalls: Array<string | null> = [];
    const setError = (msg: string | null) => {
      setErrorCalls.push(msg);
    };
    await runWithErrorStatePure(
      () => Promise.reject(new Error('boot failed')),
      'Failed to open project.',
      setError,
    );
    expect(setErrorCalls).toEqual([null, 'boot failed']);
  });

  test('runWithErrorStatePure falls back when rejection has no usable message', async () => {
    const { runWithErrorStatePure } = await import('./NavigatorApp');
    const setErrorCalls: Array<string | null> = [];
    const setError = (msg: string | null) => {
      setErrorCalls.push(msg);
    };
    await runWithErrorStatePure(
      () => Promise.reject('network dropped'),
      'Failed to open project.',
      setError,
    );
    expect(setErrorCalls).toEqual([null, 'Failed to open project.']);
  });

  test('runWithErrorStatePure does NOT re-throw on rejection (caller continues)', async () => {
    const { runWithErrorStatePure } = await import('./NavigatorApp');
    let afterAwait = false;
    await runWithErrorStatePure(
      () => Promise.reject(new Error('x')),
      'fallback',
      () => {},
    );
    afterAwait = true;
    expect(afterAwait).toBe(true);
  });
});

const NAVIGATOR_SRC = readFileSync(join(__dirname, 'NavigatorApp.tsx'), 'utf8');

describe('NavigatorApp launcher-header channel surface', () => {
  test('imports BetaBadge from the sibling component (cross-window subscription centralized via the hook)', () => {
    expect(NAVIGATOR_SRC).toMatch(/from\s+['"]\.\/BetaBadge['"]/);
    expect(NAVIGATOR_SRC).toMatch(/<BetaBadge\b/);
  });

  test('subscribes to channel state via useUpdateChannel for the About-style row', () => {
    expect(NAVIGATOR_SRC).toMatch(/from\s+['"]@\/hooks\/use-update-channel['"]/);
    expect(NAVIGATOR_SRC).toContain('useUpdateChannel(');
  });

  test('Channel row hides while channel is null (loading / no desktop bridge)', () => {
    expect(NAVIGATOR_SRC).toMatch(/channel\s*!==\s*null/);
  });

  test('Channel row text matches the spec wording exactly ("Channel: Stable" / "Channel: Beta")', () => {
    expect(NAVIGATOR_SRC).toContain('Channel:');
    expect(NAVIGATOR_SRC).toMatch(
      /channel\s*===\s*['"]beta['"]\s*\?\s*['"]Beta['"]\s*:\s*['"]Stable['"]/,
    );
  });

  test('Channel row carries a stable test seam for cross-window verification', () => {
    expect(NAVIGATOR_SRC).toContain('data-testid="navigator-channel-row"');
  });

  test('BetaBadge sits in the title row, not below the version line (chrome-level signal, not About-row info)', () => {
    const titleMatch = NAVIGATOR_SRC.match(/<h1[^>]*>Open Knowledge<\/h1>\s*<BetaBadge/);
    expect(titleMatch).not.toBeNull();
  });
});
