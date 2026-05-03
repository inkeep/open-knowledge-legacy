import { stripFrontmatter } from '@inkeep/open-knowledge-core';
import { createPatch } from 'diff';
import { useEffect, useRef, useState } from 'react';
import { useDocumentContext } from '@/editor/DocumentContext';
import type { LruStringCache } from '@/lib/lru-string-cache';

export const HISTORICAL_CONTENT_CACHE_LIMIT = 32;

type UseTimelineEntryDiffResult =
  | { status: 'idle'; diff: null }
  | { status: 'loading'; diff: null }
  | { status: 'error'; diff: null }
  | { status: 'ready'; diff: string };

export function timelineEntryCacheKey(docName: string, sha: string): string {
  return `${docName}\u0000${sha}`;
}

export function computeTimelineDiff(
  historicalRaw: string,
  currentRaw: string,
  docName: string,
): string {
  const historical = stripFrontmatter(historicalRaw).body;
  const current = stripFrontmatter(currentRaw).body;
  if (historical === current) return '';
  return createPatch(docName, historical, current, '', '', { context: 3 });
}

export function useTimelineEntryDiff(
  sha: string | null,
  docName: string,
  cache: LruStringCache,
): UseTimelineEntryDiffResult {
  const { activeProvider } = useDocumentContext();
  const [result, setResult] = useState<UseTimelineEntryDiffResult>({ status: 'idle', diff: null });

  const providerRef = useRef(activeProvider);
  useEffect(() => {
    providerRef.current = activeProvider;
  });

  useEffect(() => {
    if (!sha) {
      setResult({ status: 'idle', diff: null });
      return;
    }

    const activeSha = sha;
    let cancelled = false;
    setResult({ status: 'loading', diff: null });

    async function run() {
      try {
        const key = timelineEntryCacheKey(docName, activeSha);
        let historicalRaw = cache.get(key);
        if (historicalRaw === undefined) {
          const res = await fetch(
            `/api/history/${activeSha}?docName=${encodeURIComponent(docName)}`,
          );
          if (cancelled) return;
          if (!res.ok) {
            setResult({ status: 'error', diff: null });
            return;
          }
          const body = (await res.json()) as { content?: string };
          if (cancelled) return;
          historicalRaw = body.content ?? '';
          cache.set(key, historicalRaw);
        }

        if (cancelled) return;

        const currentRaw = providerRef.current?.document.getText('source').toString() ?? '';
        const patchStr = computeTimelineDiff(historicalRaw, currentRaw, docName);

        if (cancelled) return;
        setResult({ status: 'ready', diff: patchStr });
      } catch (err) {
        if (!cancelled) {
          console.error('[timeline-diff] failed to load entry diff', {
            sha: activeSha,
            docName,
            err,
          });
          setResult({ status: 'error', diff: null });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [sha, docName, cache]);

  return result;
}
