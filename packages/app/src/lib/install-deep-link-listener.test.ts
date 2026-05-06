import { describe, expect, mock, test } from 'bun:test';
import type { OkDesktopBridge, OkDesktopConfig } from './desktop-bridge-types';
import { installDeepLinkListener } from './install-deep-link-listener';

function makeBridge(
  overrides: Partial<OkDesktopBridge> = {},
): OkDesktopBridge & { fireDeepLink: (evt: { doc: string }) => void } {
  let handler: ((evt: { doc: string }) => void) | null = null;
  const base: OkDesktopBridge = {
    config: {
      collabUrl: 'ws://localhost:52000/collab',
      apiOrigin: 'http://localhost:52000',
      projectPath: '/tmp/project',
      projectName: 'project',
      mode: 'editor',
    } as OkDesktopConfig,
    onProjectSwitched: mock(() => () => {}),
    onMenuAction: mock(() => () => {}),
    onDeepLink: mock((cb: (evt: { doc: string }) => void) => {
      handler = cb;
      return mock(() => {
        handler = null;
      });
    }),
    dialog: {
      openFolder: mock(() => Promise.resolve(null)),
      createFolder: mock(() => Promise.resolve(null)),
    },
    shell: {
      openExternal: mock(() => Promise.resolve()),
    },
    clipboard: {
      writeText: mock(() => Promise.resolve()),
    },
    project: {
      listRecent: mock(() => Promise.resolve([])),
      getSessionState: mock(() =>
        Promise.resolve({ openTabs: [], activeDocName: null, updatedAt: null }),
      ),
      setSessionState: mock(() => Promise.resolve()),
      open: mock(() => Promise.resolve()),
      close: mock(() => Promise.resolve()),
    },
    platform: 'darwin',
    appVersion: '0.0.0',
    ...overrides,
  };
  return Object.assign(base, {
    fireDeepLink: (evt: { doc: string }) => handler?.(evt),
  });
}

describe('installDeepLinkListener (M4 US-007)', () => {
  test('no-op when bridge is undefined (web / CLI distribution)', () => {
    const setHash = mock(() => {});
    const result = installDeepLinkListener({ bridge: undefined, setHash });
    expect(result).toBeUndefined();
    expect(setHash.mock.calls.length).toBe(0);
  });

  test('registers onDeepLink when bridge is present', () => {
    const bridge = makeBridge();
    const setHash = mock(() => {});
    const unsubscribe = installDeepLinkListener({ bridge, setHash });
    expect(unsubscribe).toBeDefined();
    expect((bridge.onDeepLink as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    expect(setHash.mock.calls.length).toBe(0);
  });

  test('updates hash to #/<doc> on deep-link event', () => {
    const bridge = makeBridge();
    const setHash = mock(() => {});
    installDeepLinkListener({ bridge, setHash });
    bridge.fireDeepLink({ doc: 'intro.md' });
    expect(setHash.mock.calls[0]).toEqual(['#/intro.md']);
  });

  test('URL-encodes doc names with spaces / unicode', () => {
    const bridge = makeBridge();
    const setHash = mock(() => {});
    installDeepLinkListener({ bridge, setHash });
    bridge.fireDeepLink({ doc: 'My Doc — 2026.md' });
    expect(setHash.mock.calls[0]?.[0]).toBe('#/My%20Doc%20%E2%80%94%202026.md');
  });

  test('URL-encodes nested doc names (round-trips via docNameFromHash)', () => {
    const bridge = makeBridge();
    const setHash = mock(() => {});
    installDeepLinkListener({ bridge, setHash });
    bridge.fireDeepLink({ doc: 'notes/meeting-2026' });
    expect(setHash.mock.calls[0]?.[0]).toBe('#/notes%2Fmeeting-2026');
  });

  test('returns bridge unsubscribe so callers can detach on teardown', () => {
    const detach = mock(() => {});
    const bridge = makeBridge({
      onDeepLink: mock(() => detach),
    });
    const setHash = mock(() => {});
    const unsubscribe = installDeepLinkListener({ bridge, setHash });
    unsubscribe?.();
    expect(detach.mock.calls.length).toBe(1);
  });
});
