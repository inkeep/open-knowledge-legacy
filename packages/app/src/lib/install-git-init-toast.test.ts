import { describe, expect, mock, test } from 'bun:test';
import type { OkDesktopBridge, OkDesktopConfig } from './desktop-bridge-types';
import { installGitInitToast } from './install-git-init-toast';

function makeBridge(
  overrides: Partial<OkDesktopBridge> = {},
): OkDesktopBridge & { fireGitInit: (evt: { gitDir: string }) => void } {
  let handler: ((evt: { gitDir: string }) => void) | null = null;
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
    onGitInitNotice: mock((cb: (evt: { gitDir: string }) => void) => {
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
      open: mock(() => Promise.resolve()),
      close: mock(() => Promise.resolve()),
    },
    platform: 'darwin',
    appVersion: '0.0.0',
    ...overrides,
  };
  return Object.assign(base, {
    fireGitInit: (evt: { gitDir: string }) => handler?.(evt),
  });
}

describe('installGitInitToast (US-008)', () => {
  test('no-op when bridge is undefined (web / CLI distribution)', () => {
    const toastImpl = mock(() => {});
    const result = installGitInitToast({ bridge: undefined, toastImpl });
    expect(result).toBeUndefined();
    expect(toastImpl.mock.calls.length).toBe(0);
  });

  test('registers onGitInitNotice when bridge is present', () => {
    const bridge = makeBridge();
    const toastImpl = mock(() => {});
    const unsubscribe = installGitInitToast({ bridge, toastImpl });

    expect(unsubscribe).toBeDefined();
    expect((bridge.onGitInitNotice as ReturnType<typeof mock>).mock.calls.length).toBe(1);
    expect(toastImpl.mock.calls.length).toBe(0);
  });

  test('fires toast.info with the expected message when the bridge event arrives', () => {
    const bridge = makeBridge();
    const toastImpl = mock(() => {});
    installGitInitToast({ bridge, toastImpl });

    bridge.fireGitInit({ gitDir: '/tmp/fresh-project/.git' });

    expect(toastImpl.mock.calls.length).toBe(1);
    expect(toastImpl.mock.calls[0]).toEqual(['Initialized git repo at /tmp/fresh-project/.git']);
  });

  test('returns bridge unsubscribe so callers can detach on teardown', () => {
    const detach = mock(() => {});
    const bridge = makeBridge({
      onGitInitNotice: mock(() => detach),
    });
    const toastImpl = mock(() => {});
    const unsubscribe = installGitInitToast({ bridge, toastImpl });

    unsubscribe?.();
    expect(detach.mock.calls.length).toBe(1);
  });
});
