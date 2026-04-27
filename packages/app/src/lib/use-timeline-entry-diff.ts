/**
 * `useTimelineEntryDiff` — data layer for the inline diff in the Timeline
 * tab's expanded entry rows. Mirrors the cache + cancellation shape of
 * `useActivityPanel`'s `fetchBurstDiff`, but the diff is computed
 * client-side (no server endpoint synthesizes it) so the live Y.Text WIP is
 * always part of the comparison.
 *
 * Responsibilities:
 *   1. On `sha` set: fetch `GET /api/history/<sha>?docName=<>`. Cache the
 *      response.content keyed by sha — sha is git-immutable per content, so
 *      a cache hit means the historical side is fixed.
 *   2. Read `current` from `activeProvider.document.getText('source')`,
 *      strip frontmatter from both sides, and compute the diff via
 *      `diff.createPatch(docName, historical, current, '', '', { context: 3 })`.
 *      The diff is recomputed every effect run — never cached, because the
 *      `current` side is mutable (user types, agents write, the doc gets
 *      rolled back).
 *   3. Cancellation: an in-flight fetch that completes after `sha` swapped
 *      or the host component unmounted must not produce stale state.
 *
 * Inert mode: `sha === null` → no fetch, `{ diff: null, status: 'idle' }`.
 *
 * Cache scope: `HistoricalContentCache` is owned by the consuming component
 * (lifted via `useRef` in `TimelineContent`) and passed in. Lifetime matches
 * the host component's mount; `TimelinePanel` re-mounts on document
 * navigation, which clears the cache without explicit invalidation.
 */
import { stripFrontmatter } from '@inkeep/open-knowledge-core';
import { createPatch } from 'diff';
import { useEffect, useState } from 'react';
import { useDocumentContext } from '@/editor/DocumentContext';

// ---------------------------------------------------------------
// Cache
// ---------------------------------------------------------------

export const HISTORICAL_CONTENT_CACHE_LIMIT = 32;

/**
 * LRU-bounded cache for historical document content keyed by git sha.
 * Historical content is immutable per sha (git guarantee), so only the diff
 * against `current` needs recomputing each expand.
 * Map-insertion-order LRU: get re-inserts to MRU; set evicts oldest entry
 * when the limit is exceeded.
 */
export class HistoricalContentCache {
  private readonly map = new Map<string, string>();

  get(key: string): string | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > HISTORICAL_CONTENT_CACHE_LIMIT) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this.map.delete(oldestKey);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

// ---------------------------------------------------------------
// Hook
// ---------------------------------------------------------------

type TimelineEntryDiffStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseTimelineEntryDiffResult {
  diff: string | null;
  status: TimelineEntryDiffStatus;
}

/**
 * Fetches historical document content for a timeline entry, caches it by sha,
 * and computes a unified diff against the live Y.Text source.
 *
 * Cache is passed in (component-scoped via useRef in TimelineContent) so
 * multiple EntryRow instances share a single cache per TimelinePanel mount.
 *
 * When sha is null, returns idle state immediately with no fetches.
 */
export function useTimelineEntryDiff(
  sha: string | null,
  docName: string,
  cache: HistoricalContentCache,
): UseTimelineEntryDiffResult {
  const { activeProvider } = useDocumentContext();
  const [diff, setDiff] = useState<string | null>(null);
  const [status, setStatus] = useState<TimelineEntryDiffStatus>('idle');

  useEffect(() => {
    if (!sha) {
      setDiff(null);
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('loading');
    setDiff(null);

    async function run() {
      // sha is non-null here but TypeScript needs the local check
      if (!sha) return;

      try {
        let historicalRaw: string;
        const cached = cache.get(sha);
        if (cached !== undefined) {
          historicalRaw = cached;
        } else {
          const res = await fetch(`/api/history/${sha}?docName=${encodeURIComponent(docName)}`);
          if (cancelled) return;
          if (!res.ok) {
            if (!cancelled) setStatus('error');
            return;
          }
          const body = (await res.json()) as { content: string };
          if (cancelled) return;
          historicalRaw = body.content ?? '';
          cache.set(sha, historicalRaw);
        }

        if (cancelled) return;

        const historical = stripFrontmatter(historicalRaw).body;
        const current = stripFrontmatter(
          activeProvider?.document.getText('source').toString() ?? '',
        ).body;

        const patchStr = createPatch(docName, historical, current, '', '', { context: 3 });

        if (!cancelled) {
          setDiff(patchStr);
          setStatus('ready');
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [sha, docName, cache, activeProvider]);

  return { diff, status };
}
