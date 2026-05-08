import { describe, expect, mock, test } from 'bun:test';
import { tryCloseNavigator } from '../../src/main/navigator-window.ts';
import type { BrowserWindowLike } from '../../src/main/window-manager.ts';

interface MockNav extends BrowserWindowLike {
  closeMock: ReturnType<typeof mock>;
  setDestroyed: (v: boolean) => void;
}

function makeNav(opts?: { destroyed?: boolean; closeImpl?: () => void }): MockNav {
  let destroyed = opts?.destroyed ?? false;
  const closeMock = mock(() => {
    if (opts?.closeImpl) opts.closeImpl();
  });
  return {
    focus: mock(() => {}),
    isDestroyed: mock(() => destroyed),
    on: mock(() => {}) as BrowserWindowLike['on'],
    once: mock(() => {}) as BrowserWindowLike['once'],
    webContents: {
      send: mock(() => {}),
      once: mock(() => {}),
      setWindowOpenHandler: mock(() => {}),
      on: mock(() => {}),
    },
    loadFile: mock(() => Promise.resolve()),
    loadURL: mock(() => Promise.resolve()),
    close: closeMock,
    closeMock,
    setDestroyed: (v) => {
      destroyed = v;
    },
  };
}

describe('tryCloseNavigator', () => {
  test('no-op when navigator is null', () => {
    const log = mock(() => {});
    tryCloseNavigator(null, { projectPath: '/p' }, log);
    expect(log).not.toHaveBeenCalled();
  });

  test('no-op when window is destroyed', () => {
    const nav = makeNav({ destroyed: true });
    const log = mock(() => {});
    tryCloseNavigator(nav, { projectPath: '/p' }, log);
    expect(nav.closeMock).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  test('calls close() when window is alive', () => {
    const nav = makeNav();
    const log = mock(() => {});
    tryCloseNavigator(nav, { projectPath: '/p' }, log);
    expect(nav.closeMock).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  test('swallows exceptions from close() and logs with projectPath', () => {
    const nav = makeNav({
      closeImpl: () => {
        throw new Error('Object has been destroyed');
      },
    });
    const log = mock(() => {});
    expect(() => tryCloseNavigator(nav, { projectPath: '/path/to/proj' }, log)).not.toThrow();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      'failed to close Navigator after project open',
      expect.objectContaining({
        projectPath: '/path/to/proj',
        err: 'Object has been destroyed',
      }),
    );
  });

  test('stringifies non-Error throws so the log carries diagnostic signal', () => {
    const nav = makeNav({
      closeImpl: () => {
        throw 'native-string-throw';
      },
    });
    const log = mock(() => {});
    tryCloseNavigator(nav, { projectPath: '/p' }, log);
    expect(log).toHaveBeenCalledWith(
      'failed to close Navigator after project open',
      expect.objectContaining({ err: 'native-string-throw' }),
    );
  });
});
