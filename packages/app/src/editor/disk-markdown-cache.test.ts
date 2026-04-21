import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  __resetDiskMarkdownCacheForTests,
  __setDiskMarkdownFetcher,
  type DiskMarkdownEntry,
  getDiskMarkdown,
  invalidateDiskMarkdown,
  primeDiskMarkdown,
  subscribeDiskMarkdown,
} from './disk-markdown-cache';

// Backstop for QA-055 in the V2 sprint: failed fetch (500, abort, reject)
// must leave the module in a clean state — no cached entry, no stuck
// in-flight promise, listeners never called — so the Suspense fallback
// falls through to EditorSkeleton and the editor hydration still runs.
// Also covers QA-032's "module-level persistence across HMR": the cache
// is a module singleton and a second concurrent prime() returns the same
// Promise (no dup fetch). Added 2026-04-21 during Phase 7 /qa execution
// when the file had zero coverage.

describe('disk-markdown-cache', () => {
  beforeEach(() => {
    __resetDiskMarkdownCacheForTests();
    __setDiskMarkdownFetcher(null);
  });

  afterEach(() => {
    __resetDiskMarkdownCacheForTests();
    __setDiskMarkdownFetcher(null);
  });

  describe('getDiskMarkdown (synchronous accessor)', () => {
    test('returns null when no fetch has happened', () => {
      expect(getDiskMarkdown('doc-a')).toBeNull();
    });

    test('does NOT trigger a fetch side-effect', () => {
      let calls = 0;
      __setDiskMarkdownFetcher(async () => {
        calls += 1;
        return { markdown: 'x', mtime: 1, sizeBytes: 1 };
      });
      getDiskMarkdown('doc-a');
      getDiskMarkdown('doc-a');
      expect(calls).toBe(0);
    });
  });

  describe('primeDiskMarkdown (happy path)', () => {
    test('fetches, caches, and notifies listeners on first prime', async () => {
      const entry: DiskMarkdownEntry = { markdown: '# hi', mtime: 42, sizeBytes: 4 };
      __setDiskMarkdownFetcher(async () => entry);

      let notifyCount = 0;
      const unsub = subscribeDiskMarkdown(() => {
        notifyCount += 1;
      });

      const result = await primeDiskMarkdown('doc-a');
      expect(result).toEqual(entry);
      expect(getDiskMarkdown('doc-a')).toEqual(entry);
      expect(notifyCount).toBe(1);

      unsub();
    });

    test('is idempotent — concurrent calls share the same in-flight Promise', async () => {
      let calls = 0;
      let resolveInFlight: (v: DiskMarkdownEntry | null) => void = () => {};
      __setDiskMarkdownFetcher(
        () =>
          new Promise<DiskMarkdownEntry | null>((resolve) => {
            calls += 1;
            resolveInFlight = resolve;
          }),
      );

      const p1 = primeDiskMarkdown('doc-a');
      const p2 = primeDiskMarkdown('doc-a');
      expect(p1).toBe(p2); // same Promise reference
      expect(calls).toBe(1);

      resolveInFlight({ markdown: 'x', mtime: 1, sizeBytes: 1 });
      await p1;
    });

    test('post-resolve prime returns resolved value without refetching', async () => {
      let calls = 0;
      __setDiskMarkdownFetcher(async () => {
        calls += 1;
        return { markdown: 'x', mtime: 1, sizeBytes: 1 };
      });

      await primeDiskMarkdown('doc-a');
      expect(calls).toBe(1);

      const second = await primeDiskMarkdown('doc-a');
      expect(second).toEqual({ markdown: 'x', mtime: 1, sizeBytes: 1 });
      expect(calls).toBe(1); // NO second fetch
    });

    test('different docNames fetch independently', async () => {
      const seen: string[] = [];
      __setDiskMarkdownFetcher(async (name) => {
        seen.push(name);
        return { markdown: name, mtime: 1, sizeBytes: name.length };
      });

      await Promise.all([primeDiskMarkdown('doc-a'), primeDiskMarkdown('doc-b')]);
      expect(seen.sort()).toEqual(['doc-a', 'doc-b']);
      expect(getDiskMarkdown('doc-a')?.markdown).toBe('doc-a');
      expect(getDiskMarkdown('doc-b')?.markdown).toBe('doc-b');
    });
  });

  describe('primeDiskMarkdown (failure modes) — QA-055', () => {
    test('fetch reject — resolves null, no cached entry, listeners not called', async () => {
      let notifyCount = 0;
      const unsub = subscribeDiskMarkdown(() => {
        notifyCount += 1;
      });
      __setDiskMarkdownFetcher(async () => {
        throw new Error('network boom');
      });

      const result = await primeDiskMarkdown('doc-a');
      expect(result).toBeNull();
      expect(getDiskMarkdown('doc-a')).toBeNull();
      expect(notifyCount).toBe(0); // fetched=null path MUST NOT notify

      unsub();
    });

    test('fetcher returns null (e.g. 500 response) — no cache, no notify', async () => {
      let notifyCount = 0;
      const unsub = subscribeDiskMarkdown(() => {
        notifyCount += 1;
      });
      __setDiskMarkdownFetcher(async () => null);

      const result = await primeDiskMarkdown('doc-a');
      expect(result).toBeNull();
      expect(getDiskMarkdown('doc-a')).toBeNull();
      expect(notifyCount).toBe(0);

      unsub();
    });

    test('in-flight entry cleared even on reject so retry re-fetches', async () => {
      let calls = 0;
      __setDiskMarkdownFetcher(async () => {
        calls += 1;
        if (calls === 1) throw new Error('transient');
        return { markdown: 'recovered', mtime: 1, sizeBytes: 9 };
      });

      const first = await primeDiskMarkdown('doc-a');
      expect(first).toBeNull();

      const second = await primeDiskMarkdown('doc-a');
      expect(second).toEqual({ markdown: 'recovered', mtime: 1, sizeBytes: 9 });
      expect(calls).toBe(2);
    });
  });

  describe('invalidateDiskMarkdown', () => {
    test('removes cached entry and notifies listeners', async () => {
      __setDiskMarkdownFetcher(async () => ({ markdown: 'x', mtime: 1, sizeBytes: 1 }));
      await primeDiskMarkdown('doc-a');
      expect(getDiskMarkdown('doc-a')).not.toBeNull();

      let notifyCount = 0;
      const unsub = subscribeDiskMarkdown(() => {
        notifyCount += 1;
      });

      invalidateDiskMarkdown('doc-a');
      expect(getDiskMarkdown('doc-a')).toBeNull();
      expect(notifyCount).toBe(1);

      unsub();
    });

    test('invalidate on unknown doc is a no-op (no notify)', () => {
      let notifyCount = 0;
      const unsub = subscribeDiskMarkdown(() => {
        notifyCount += 1;
      });

      invalidateDiskMarkdown('never-cached');
      expect(notifyCount).toBe(0);

      unsub();
    });
  });

  describe('subscribeDiskMarkdown', () => {
    test('unsubscribed listener does not fire on future resolves', async () => {
      __setDiskMarkdownFetcher(async () => ({ markdown: 'x', mtime: 1, sizeBytes: 1 }));

      let notifyCount = 0;
      const unsub = subscribeDiskMarkdown(() => {
        notifyCount += 1;
      });
      unsub();

      await primeDiskMarkdown('doc-a');
      expect(notifyCount).toBe(0);
    });

    test('listener exception does not prevent other listeners from firing', async () => {
      __setDiskMarkdownFetcher(async () => ({ markdown: 'x', mtime: 1, sizeBytes: 1 }));

      // The disk-markdown-cache's `notify()` wraps each listener in try/catch
      // and forwards to console.error so one misbehaving consumer doesn't
      // silently break the chain. Silence the expected log during the
      // assertion so the test output stays clean — we only care about the
      // ordering invariant, not the log side-effect.
      const originalError = console.error;
      console.error = () => {};

      try {
        const order: string[] = [];
        subscribeDiskMarkdown(() => {
          order.push('one');
          throw new Error('boom');
        });
        subscribeDiskMarkdown(() => {
          order.push('two');
        });

        await primeDiskMarkdown('doc-a');
        expect(order).toEqual(['one', 'two']);
      } finally {
        console.error = originalError;
      }
    });
  });
});
