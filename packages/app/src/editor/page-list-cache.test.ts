import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  __resetPageListCacheForTests,
  getPageListCache,
  type PageListCacheSnapshot,
  setPageListCache,
  setsEqual,
  snapshotsEqual,
  subscribePageListCache,
} from './page-list-cache';

afterEach(() => {
  __resetPageListCacheForTests();
});

describe('setsEqual', () => {
  it('returns true for same-reference sets', () => {
    const s = new Set(['a', 'b']);
    expect(setsEqual(s, s)).toBe(true);
  });

  it('returns true for same-content sets', () => {
    expect(setsEqual(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
  });

  it('returns false when sizes differ', () => {
    expect(setsEqual(new Set(['a']), new Set(['a', 'b']))).toBe(false);
  });

  it('returns false when contents differ at same size', () => {
    expect(setsEqual(new Set(['a', 'b']), new Set(['a', 'c']))).toBe(false);
  });

  it('returns true for two empty sets', () => {
    expect(setsEqual(new Set(), new Set())).toBe(true);
  });
});

describe('snapshotsEqual', () => {
  it('returns false when prev is null', () => {
    const next: PageListCacheSnapshot = { pages: new Set(), folderPaths: new Set() };
    expect(snapshotsEqual(null, next)).toBe(false);
  });

  it('returns true for same-reference snapshot', () => {
    const snap: PageListCacheSnapshot = {
      pages: new Set(['a']),
      folderPaths: new Set(),
    };
    expect(snapshotsEqual(snap, snap)).toBe(true);
  });

  it('returns true when pages+folderPaths content match across distinct refs', () => {
    const a: PageListCacheSnapshot = {
      pages: new Set(['x', 'y']),
      folderPaths: new Set(['dir']),
    };
    const b: PageListCacheSnapshot = {
      pages: new Set(['y', 'x']),
      folderPaths: new Set(['dir']),
    };
    expect(snapshotsEqual(a, b)).toBe(true);
  });

  it('returns false when pages differ', () => {
    const a: PageListCacheSnapshot = {
      pages: new Set(['x']),
      folderPaths: new Set(),
    };
    const b: PageListCacheSnapshot = {
      pages: new Set(['y']),
      folderPaths: new Set(),
    };
    expect(snapshotsEqual(a, b)).toBe(false);
  });

  it('returns false when folderPaths differ', () => {
    const a: PageListCacheSnapshot = {
      pages: new Set(['x']),
      folderPaths: new Set(['dirA']),
    };
    const b: PageListCacheSnapshot = {
      pages: new Set(['x']),
      folderPaths: new Set(['dirB']),
    };
    expect(snapshotsEqual(a, b)).toBe(false);
  });
});

describe('getPageListCache', () => {
  it('returns null before any setPageListCache call', () => {
    expect(getPageListCache()).toBeNull();
  });

  it('returns the stored snapshot after setPageListCache', () => {
    const snap: PageListCacheSnapshot = {
      pages: new Set(['a']),
      folderPaths: new Set(['dir']),
    };
    setPageListCache(snap);
    expect(getPageListCache()).toBe(snap);
  });
});

describe('setPageListCache', () => {
  it('replaces the stored snapshot on content change', () => {
    setPageListCache({ pages: new Set(['a']), folderPaths: new Set() });
    const next: PageListCacheSnapshot = {
      pages: new Set(['a', 'b']),
      folderPaths: new Set(),
    };
    setPageListCache(next);
    expect(getPageListCache()).toBe(next);
  });

  it('is a no-op when content is equal (identity preserved)', () => {
    const first: PageListCacheSnapshot = {
      pages: new Set(['a']),
      folderPaths: new Set(['dir']),
    };
    setPageListCache(first);
    const equal: PageListCacheSnapshot = {
      pages: new Set(['a']),
      folderPaths: new Set(['dir']),
    };
    setPageListCache(equal);
    expect(getPageListCache()).toBe(first);
  });

  it('is a no-op for repeated identical reference', () => {
    const snap: PageListCacheSnapshot = {
      pages: new Set(['a']),
      folderPaths: new Set(),
    };
    setPageListCache(snap);
    const listener = mock(() => {});
    subscribePageListCache(listener);
    listener.mockClear();
    setPageListCache(snap);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('subscribePageListCache', () => {
  it('fires immediately on subscribe when a snapshot already exists', () => {
    const snap: PageListCacheSnapshot = {
      pages: new Set(['a']),
      folderPaths: new Set(),
    };
    setPageListCache(snap);
    const listener = mock(() => {});
    subscribePageListCache(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(snap);
  });

  it('does NOT fire immediately when cache is null at subscribe time', () => {
    const listener = mock(() => {});
    subscribePageListCache(listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it('fires on subsequent content-changing setPageListCache calls', () => {
    const listener = mock(() => {});
    subscribePageListCache(listener);
    const first: PageListCacheSnapshot = {
      pages: new Set(['a']),
      folderPaths: new Set(),
    };
    setPageListCache(first);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(first);
    const second: PageListCacheSnapshot = {
      pages: new Set(['a', 'b']),
      folderPaths: new Set(),
    };
    setPageListCache(second);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(second);
  });

  it('does NOT fire on content-equal setPageListCache calls', () => {
    const listener = mock(() => {});
    subscribePageListCache(listener);
    setPageListCache({ pages: new Set(['a']), folderPaths: new Set() });
    listener.mockClear();
    setPageListCache({ pages: new Set(['a']), folderPaths: new Set() });
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribe stops subsequent notifications', () => {
    const listener = mock(() => {});
    const unsubscribe = subscribePageListCache(listener);
    unsubscribe();
    setPageListCache({ pages: new Set(['a']), folderPaths: new Set() });
    expect(listener).not.toHaveBeenCalled();
  });

  it('is safe to unsubscribe inside a listener (no double-fire on next change)', () => {
    let unsubscribe: (() => void) | null = null;
    const listener = mock(() => {
      unsubscribe?.();
    });
    unsubscribe = subscribePageListCache(listener);
    setPageListCache({ pages: new Set(['a']), folderPaths: new Set() });
    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockClear();
    setPageListCache({ pages: new Set(['a', 'b']), folderPaths: new Set() });
    expect(listener).not.toHaveBeenCalled();
  });

  it('supports multiple independent subscribers', () => {
    const a = mock(() => {});
    const b = mock(() => {});
    subscribePageListCache(a);
    subscribePageListCache(b);
    setPageListCache({ pages: new Set(['x']), folderPaths: new Set() });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('subscriber throw does NOT abort sibling notifications', () => {
    const original = console.error;
    const captured: unknown[] = [];
    console.error = (...args: unknown[]) => {
      captured.push(args);
    };
    try {
      const bad = mock(() => {
        throw new Error('boom');
      });
      const good = mock(() => {});
      subscribePageListCache(bad);
      subscribePageListCache(good);
      setPageListCache({ pages: new Set(['x']), folderPaths: new Set() });
      expect(good).toHaveBeenCalledTimes(1);
      expect(captured.length).toBe(1);
    } finally {
      console.error = original;
    }
  });
});
