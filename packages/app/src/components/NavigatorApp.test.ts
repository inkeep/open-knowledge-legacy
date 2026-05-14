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
    getSessionState: ReturnType<typeof mock>;
    setSessionState: ReturnType<typeof mock>;
    open: ReturnType<typeof mock>;
    createNew: ReturnType<typeof mock>;
    recordCreateNewBannerShown: ReturnType<typeof mock>;
    close: ReturnType<typeof mock>;
  };
  dialog: {
    openFolder: ReturnType<typeof mock>;
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
      getSessionState: mock(() =>
        Promise.resolve({
          openTabs: [],
          pinnedTabIds: [],
          activeDocName: null,
          activeTabId: null,
          updatedAt: null,
        }),
      ),
      setSessionState: mock(() => Promise.resolve()),
      open: mock(() => Promise.resolve()),
      createNew: mock(() => Promise.resolve()),
      recordCreateNewBannerShown: mock(() => Promise.resolve()),
      close: mock(() => Promise.resolve()),
    },
    dialog: {
      openFolder: mock(() => Promise.resolve(null)),
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
        getSessionState: mock(() =>
          Promise.resolve({
            openTabs: [],
            pinnedTabIds: [],
            activeDocName: null,
            activeTabId: null,
            updatedAt: null,
          }),
        ),
        setSessionState: mock(() => Promise.resolve()),
        open: mock(() => Promise.resolve()),
        createNew: mock(() => Promise.resolve()),
        recordCreateNewBannerShown: mock(() => Promise.resolve()),
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
    await bridge.project.open({
      path: '/tmp/x',
      target: 'new-window',
      entryPoint: 'pick-existing',
    });
    expect(bridge.project.open).toHaveBeenCalledWith({
      path: '/tmp/x',
      target: 'new-window',
      entryPoint: 'pick-existing',
    });
  });

  test('bridge.dialog.openFolder returns string | null', async () => {
    const bridge = makeBridge({
      dialog: {
        openFolder: mock(() => Promise.resolve('/tmp/picked')),
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

  test('subscribes to channel state via useUpdateChannel for the channel badge', () => {
    expect(NAVIGATOR_SRC).toMatch(/from\s+['"]@\/hooks\/use-update-channel['"]/);
    expect(NAVIGATOR_SRC).toContain('useUpdateChannel(');
  });

  test('Channel badge hides while channel is null (loading / no desktop bridge)', () => {
    expect(NAVIGATOR_SRC).toMatch(/channel\s*!==\s*null/);
  });

  test('Channel badge renders "Beta" / "Stable" via the shared Badge component', () => {
    expect(NAVIGATOR_SRC).toMatch(
      /channel\s*===\s*['"]beta['"]\s*\?\s*['"]Beta['"]\s*:\s*['"]Stable['"]/,
    );
    expect(NAVIGATOR_SRC).toMatch(/<Badge\b[^>]*>\s*\{\s*channel\s*===\s*['"]beta['"]/);
  });

  test('BetaBadge sits in the title row, not below the version line (chrome-level signal, not About-row info)', () => {
    const titleMatch = NAVIGATOR_SRC.match(/<h1[^>]*>Open Knowledge<\/h1>\s*<BetaBadge/);
    expect(titleMatch).not.toBeNull();
  });
});

describe('NavigatorApp — Electron theme bridge wiring', () => {
  test('imports useTheme from next-themes for the user-intent value', () => {
    expect(NAVIGATOR_SRC).toMatch(
      /import\s*\{[^}]*\buseTheme\b[^}]*\}\s*from\s*['"]next-themes['"]/,
    );
    expect(NAVIGATOR_SRC).toMatch(/useTheme\(\)/);
  });

  test('delegates the theme bridge wiring to the shared useThemeBridge hook', () => {
    expect(NAVIGATOR_SRC).toMatch(
      /import\s*\{\s*useThemeBridge\s*\}\s*from\s*['"]@\/hooks\/use-theme-bridge['"]/,
    );
    expect(NAVIGATOR_SRC).toMatch(/useThemeBridge\(\s*bridge\s*,\s*themeValue/);
  });

  test('falls back to "system" for symmetry with ConfigProvider', () => {
    expect(NAVIGATOR_SRC).toMatch(/themeValue\s*\?\?\s*['"]system['"]/);
  });
});

describe('NavigatorApp launcher window drag region', () => {
  test('detects Electron host via the canonical window.okDesktop != null idiom', () => {
    expect(NAVIGATOR_SRC).toMatch(
      /typeof\s+window\s*!==\s*['"]undefined['"]\s*&&\s*window\.okDesktop\s*!=\s*null/,
    );
    expect(NAVIGATOR_SRC).toContain('const isElectronHost');
  });

  test('chrome row spans full window width and is draggable in Electron mode', () => {
    expect(NAVIGATOR_SRC).toMatch(
      /data-testid=['"]nav-chrome-row['"][\s\S]*?isElectronHost\s*\?\s*['"]\[-webkit-app-region:drag\]['"]|isElectronHost\s*\?\s*['"]\[-webkit-app-region:drag\]['"][\s\S]*?data-testid=['"]nav-chrome-row['"]/,
    );
  });

  test('header element itself does NOT carry drag (chrome row owns it)', () => {
    expect(NAVIGATOR_SRC).not.toMatch(
      /<header\b[^>]*\[-webkit-app-region:drag\]|<header\b[\s\S]{0,200}?isElectronHost\s*\?\s*['"]\[-webkit-app-region:drag\]/,
    );
  });

  test('outer container is NOT draggable (drag is scoped to the chrome row)', () => {
    expect(NAVIGATOR_SRC).not.toMatch(
      /h-screen\s+w-screen[^"`']*\[-webkit-app-region:drag\]|className=\{`flex h-screen[\s\S]*?\[-webkit-app-region:drag\]/,
    );
  });

  test('NavigatorCard does NOT carry a no-drag opt-out (no drag ancestor)', () => {
    const cardFnMatch = NAVIGATOR_SRC.match(/function\s+NavigatorCard\b[\s\S]*?^}/m);
    expect(cardFnMatch).not.toBeNull();
    expect(cardFnMatch?.[0] ?? '').not.toMatch(/\[-webkit-app-region:no-drag\]/);
  });

  test('RecentRow does NOT carry a no-drag opt-out (no drag ancestor)', () => {
    const rowFnMatch = NAVIGATOR_SRC.match(/function\s+RecentRow\b[\s\S]*?^}/m);
    expect(rowFnMatch).not.toBeNull();
    expect(rowFnMatch?.[0] ?? '').not.toMatch(/\[-webkit-app-region:no-drag\]/);
  });
});

describe('NavigatorApp entry-point propagation', () => {
  test('Open folder on disk → openProject(..., "pick-existing")', () => {
    expect(NAVIGATOR_SRC).toMatch(/onOpenFolder\s*=[\s\S]*?openProject\([^)]*,\s*'pick-existing'/);
  });

  test('Create new project card opens CreateProjectDialog (no direct openProject dispatch)', () => {
    expect(NAVIGATOR_SRC).toMatch(/const\s+onCreate\s*=\s*\(\)\s*=>\s*setCreateDialogOpen\(true\)/);
    expect(NAVIGATOR_SRC).toMatch(/<CreateProjectDialog\b[\s\S]*?bridge=\{bridge\}/);
    expect(NAVIGATOR_SRC).toMatch(
      /data-testid=['"]nav-create-new['"]|dataTestId=['"]nav-create-new['"]/,
    );
  });

  test('Open Recent row → openProject(..., "recents")', () => {
    expect(NAVIGATOR_SRC).toMatch(/onOpenRecent\s*=[\s\S]*?openProject\([^)]*,\s*'recents'/);
  });

  test('Clone-complete → openProject(..., "pick-existing")', () => {
    expect(NAVIGATOR_SRC).toMatch(/onCloneComplete[\s\S]*?openProject\([^)]*,\s*'pick-existing'/);
  });

  test('local openProject helper threads an EntryPoint argument into bridge.project.open', () => {
    expect(NAVIGATOR_SRC).toMatch(/entryPoint:\s*OkProjectEntryPoint/);
    expect(NAVIGATOR_SRC).toMatch(/bridge\.project\.open\(\{[^}]*entryPoint(\s*,|\s*\})/);
  });
});
