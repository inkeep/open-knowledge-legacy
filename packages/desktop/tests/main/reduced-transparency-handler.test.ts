import { describe, expect, mock, test } from 'bun:test';

import {
  applyReducedTransparency,
  type BrowserWindowVibrancyTarget,
  type ReducedTransparencyDeps,
} from '../../src/main/reduced-transparency-handler.ts';

interface WindowFixture {
  win: BrowserWindowVibrancyTarget;
  setVibrancy: ReturnType<typeof mock>;
  isDestroyed: ReturnType<typeof mock>;
}

function makeWindow(opts?: { destroyed?: boolean }): WindowFixture {
  const setVibrancy = mock(() => {});
  const isDestroyed = mock(() => opts?.destroyed === true);
  return {
    win: {
      setVibrancy: setVibrancy as unknown as (mat: 'sidebar' | 'window' | null) => void,
      isDestroyed: isDestroyed as unknown as () => boolean,
    },
    setVibrancy,
    isDestroyed,
  };
}

describe('applyReducedTransparency — disable path (reduced=true)', () => {
  test('sets setVibrancy(null) on every non-destroyed window', () => {
    const a = makeWindow();
    const b = makeWindow();
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [a.win, b.win],
      defaultVibrancy: 'sidebar',
      warn: () => {},
    };

    applyReducedTransparency(deps, true);

    expect(a.setVibrancy).toHaveBeenCalledTimes(1);
    expect(a.setVibrancy.mock.calls[0]).toEqual([null]);
    expect(b.setVibrancy).toHaveBeenCalledTimes(1);
    expect(b.setVibrancy.mock.calls[0]).toEqual([null]);
  });

  test('skips destroyed windows', () => {
    const live = makeWindow();
    const dead = makeWindow({ destroyed: true });
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [live.win, dead.win],
      defaultVibrancy: 'sidebar',
    };

    applyReducedTransparency(deps, true);

    expect(live.setVibrancy).toHaveBeenCalledTimes(1);
    expect(dead.setVibrancy).not.toHaveBeenCalled();
  });
});

describe('applyReducedTransparency — restore path (reduced=false)', () => {
  test('sets setVibrancy(defaultVibrancy) on every non-destroyed window', () => {
    const a = makeWindow();
    const b = makeWindow();
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [a.win, b.win],
      defaultVibrancy: 'sidebar',
    };

    applyReducedTransparency(deps, false);

    expect(a.setVibrancy.mock.calls[0]).toEqual(['sidebar']);
    expect(b.setVibrancy.mock.calls[0]).toEqual(['sidebar']);
  });

  test('honors defaultVibrancy=window (fallback path)', () => {
    const w = makeWindow();
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [w.win],
      defaultVibrancy: 'window',
    };

    applyReducedTransparency(deps, false);

    expect(w.setVibrancy.mock.calls[0]).toEqual(['window']);
  });
});

describe('applyReducedTransparency — diagnostic logging', () => {
  test('emits structured warn with event/reducedTransparency/vibrancy/windowCount on disable', () => {
    const a = makeWindow();
    const b = makeWindow();
    const warn = mock(() => {});
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [a.win, b.win],
      defaultVibrancy: 'sidebar',
      warn,
    };

    applyReducedTransparency(deps, true);

    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]?.[0] as unknown as string;
    expect(typeof line).toBe('string');
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('reduced-transparency-applied');
    expect(parsed.reducedTransparency).toBe(true);
    expect(parsed.vibrancy).toBe(null);
    expect(parsed.windowCount).toBe(2);
  });

  test('emits structured warn with vibrancy=defaultVibrancy on restore', () => {
    const a = makeWindow();
    const warn = mock(() => {});
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [a.win],
      defaultVibrancy: 'sidebar',
      warn,
    };

    applyReducedTransparency(deps, false);

    const line = warn.mock.calls[0]?.[0] as unknown as string;
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('reduced-transparency-applied');
    expect(parsed.reducedTransparency).toBe(false);
    expect(parsed.vibrancy).toBe('sidebar');
    expect(parsed.windowCount).toBe(1);
  });

  test('windowCount counts only non-destroyed windows', () => {
    const live = makeWindow();
    const dead = makeWindow({ destroyed: true });
    const warn = mock(() => {});
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [live.win, dead.win],
      defaultVibrancy: 'sidebar',
      warn,
    };

    applyReducedTransparency(deps, true);

    const parsed = JSON.parse(warn.mock.calls[0]?.[0] as unknown as string);
    expect(parsed.windowCount).toBe(1);
  });

  test('omitting warn dep does not throw (optional sink)', () => {
    const w = makeWindow();
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [w.win],
      defaultVibrancy: 'sidebar',
    };

    expect(() => applyReducedTransparency(deps, true)).not.toThrow();
  });

  test('empty windows array still emits structured warn with windowCount=0', () => {
    const warn = mock(() => {});
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [],
      defaultVibrancy: 'sidebar',
      warn,
    };

    applyReducedTransparency(deps, true);

    expect(warn).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(warn.mock.calls[0]?.[0] as unknown as string);
    expect(parsed.windowCount).toBe(0);
  });
});

describe('applyReducedTransparency — narrow dep surface (STOP rules)', () => {
  test('deps shape contains getAllWindows + defaultVibrancy + optional warn — no other surface', () => {
    const w = makeWindow();
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [w.win],
      defaultVibrancy: 'sidebar',
      warn: () => {},
    };

    const keys = new Set(Object.keys(deps));
    expect(keys).toEqual(new Set(['getAllWindows', 'defaultVibrancy', 'warn']));
  });
});

describe('applyReducedTransparency — per-window throw isolation', () => {
  function makeThrowingWindow(): WindowFixture {
    const error = new Error('setVibrancy: window destroyed');
    const setVibrancy = mock(() => {
      throw error;
    });
    const isDestroyed = mock(() => false);
    return {
      win: {
        setVibrancy: setVibrancy as unknown as (mat: 'sidebar' | 'window' | null) => void,
        isDestroyed: isDestroyed as unknown as () => boolean,
      },
      setVibrancy,
      isDestroyed,
    };
  }

  test('throw on one window does not abort the loop — later windows still toggled', () => {
    const a = makeWindow();
    const b = makeThrowingWindow();
    const c = makeWindow();
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [a.win, b.win, c.win],
      defaultVibrancy: 'sidebar',
    };

    expect(() => applyReducedTransparency(deps, true)).not.toThrow();

    expect(a.setVibrancy).toHaveBeenCalledTimes(1);
    expect(b.setVibrancy).toHaveBeenCalledTimes(1);
    expect(c.setVibrancy).toHaveBeenCalledTimes(1);
    expect(a.setVibrancy.mock.calls[0]).toEqual([null]);
    expect(c.setVibrancy.mock.calls[0]).toEqual([null]);
  });

  test('throw on one window emits a structured per-window warn', () => {
    const a = makeWindow();
    const b = makeThrowingWindow();
    const warn = mock(() => {});
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [a.win, b.win],
      defaultVibrancy: 'sidebar',
      warn,
    };

    applyReducedTransparency(deps, true);

    const lines = warn.mock.calls.map((call) => JSON.parse(call[0] as unknown as string));
    const failed = lines.find((l) => l.event === 'reduced-transparency-window-failed');
    expect(failed).toBeDefined();
    expect(failed?.error).toContain('setVibrancy');
  });

  test('windowCount counts only successfully-toggled windows when one throws', () => {
    const a = makeWindow();
    const b = makeThrowingWindow();
    const warn = mock(() => {});
    const deps: ReducedTransparencyDeps = {
      getAllWindows: () => [a.win, b.win],
      defaultVibrancy: 'sidebar',
      warn,
    };

    applyReducedTransparency(deps, true);

    const lines = warn.mock.calls.map((call) => JSON.parse(call[0] as unknown as string));
    const summary = lines.find((l) => l.event === 'reduced-transparency-applied');
    expect(summary?.windowCount).toBe(1);
  });
});
