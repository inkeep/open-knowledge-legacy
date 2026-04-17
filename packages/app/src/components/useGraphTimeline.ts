/**
 * State + fetch orchestration for the Stage 7 graph timeline.
 *
 * Owns three fetch channels through TanStack Query:
 *   (a) GET /api/checkpoints            → list of save_version snapshots
 *   (b) GET /api/graph-at?sha=<sha>     → historical graph at a specific SHA
 *   (c) GET /api/graph-diff?from&to     → node/edge delta between two SHAs
 *
 * And returns a single derived payload matching `GraphView`'s time-travel
 * props (`overrideGraph`, `overrideLoading`, `overrideError`, `diffMarks`)
 * so `GraphPanel` can wire it through without knowing about the API shape.
 *
 * When both `viewSha` and `compareFromSha` are set AND differ, we produce a
 * **union** graph (from + to) so removed nodes stay visible with a "removed"
 * halo, per SPEC §Stage 7 "added nodes glow green, removed nodes glow red".
 */

import type {
  CheckpointEntry,
  CheckpointsResponse,
  GraphAtResponse,
  GraphDiffResponse,
} from '@inkeep/open-knowledge-core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { GraphDiffMarks } from './graph-diff-marks';
import { EMPTY_DIFF_MARKS, linkKey, mergeGraphsWithDiff } from './graph-diff-marks';
import { normalizeHistoricalLinks, normalizeHistoricalNodes } from './graph-timeline-util';
import type { GraphLink, GraphNode } from './graph-view-utils';

const REPLAY_STEP_MS = 1500;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Server error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (data.ok === false) {
    throw new Error(data.error ?? `Request failed: ${url}`);
  }
  return data;
}

async function fetchCheckpoints(): Promise<CheckpointEntry[]> {
  const data = await fetchJson<CheckpointsResponse>('/api/checkpoints');
  return data.entries;
}

async function fetchGraphAt(sha: string): Promise<GraphAtResponse> {
  return fetchJson<GraphAtResponse>(`/api/graph-at?sha=${encodeURIComponent(sha)}`);
}

async function fetchGraphDiff(from: string, to: string): Promise<GraphDiffResponse> {
  return fetchJson<GraphDiffResponse>(
    `/api/graph-diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
}

export interface GraphTimelineController {
  /** Checkpoints oldest→newest. Empty while loading or on error. */
  checkpoints: CheckpointEntry[];
  checkpointsLoading: boolean;
  checkpointsError: string | null;

  /**
   * `null` means live ("Now"). Any other value is a commit SHA and the graph
   * is being rendered from the historical snapshot instead of the live fetch.
   */
  viewSha: string | null;
  setViewSha(sha: string | null): void;

  /**
   * When set AND distinct from `viewSha`, enables diff mode — added nodes
   * glow green, removed nodes glow red on the union graph.
   */
  compareFromSha: string | null;
  setCompareFromSha(sha: string | null): void;

  isPlaying: boolean;
  togglePlay(): void;
  stepPrev(): void;
  stepNext(): void;

  /**
   * When non-null, `GraphView` disables its own fetch and renders this
   * snapshot. Mirrors the SPEC requirement that the timeline scrubber changes
   * the graph substrate, not just an overlay.
   */
  overrideGraph: { nodes: GraphNode[]; links: GraphLink[] } | null;
  overrideLoading: boolean;
  overrideError: string | null;
  diffMarks: GraphDiffMarks | null;
}

/**
 * Hook: manages all state + fetching for the timeline. Safe to call from
 * within a rendered `GraphPanel` — when `enabled=false` it skips all network
 * work and returns a quiet controller so the caller doesn't have to special-
 * case the collapsed / not-open timeline state.
 */
export function useGraphTimeline(options?: { enabled?: boolean }): GraphTimelineController {
  const enabled = options?.enabled ?? true;

  const [viewSha, setViewShaState] = useState<string | null>(null);
  const [compareFromSha, setCompareFromShaState] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const {
    data: checkpoints = [],
    isLoading: checkpointsLoading,
    error: checkpointsQueryError,
  } = useQuery({
    queryKey: ['graph-timeline', 'checkpoints'],
    queryFn: fetchCheckpoints,
    enabled,
    // Checkpoints are append-only (save_version); safe to cache with a short
    // stale time to avoid re-fetching on every open of fullscreen.
    staleTime: 60_000,
  });

  const checkpointsError = checkpointsQueryError
    ? checkpointsQueryError instanceof Error
      ? checkpointsQueryError.message
      : String(checkpointsQueryError)
    : null;

  // Clear selections if they fall outside the known checkpoint set (e.g. a
  // checkpoint was pruned between sessions).
  useEffect(() => {
    if (!enabled) return;
    if (checkpoints.length === 0) return;
    const known = new Set(checkpoints.map((c) => c.sha));
    if (viewSha && !known.has(viewSha)) setViewShaState(null);
    if (compareFromSha && !known.has(compareFromSha)) setCompareFromShaState(null);
  }, [enabled, checkpoints, viewSha, compareFromSha]);

  const viewQuery = useQuery({
    queryKey: ['graph-timeline', 'graph-at', viewSha],
    queryFn: () => {
      if (!viewSha) throw new Error('no view SHA');
      return fetchGraphAt(viewSha);
    },
    enabled: enabled && viewSha !== null,
    staleTime: Number.POSITIVE_INFINITY, // immutable — keyed by git SHA
  });

  const diffActive = viewSha !== null && compareFromSha !== null && compareFromSha !== viewSha;

  const fromQuery = useQuery({
    queryKey: ['graph-timeline', 'graph-at', compareFromSha],
    queryFn: () => {
      if (!compareFromSha) throw new Error('no from SHA');
      return fetchGraphAt(compareFromSha);
    },
    enabled: enabled && diffActive,
    staleTime: Number.POSITIVE_INFINITY,
  });

  // We ALSO fetch the authoritative diff from the server so we don't
  // re-derive it client-side from two graph snapshots. The server's diff
  // endpoint is the single source of truth for what changed.
  const diffQuery = useQuery({
    queryKey: ['graph-timeline', 'graph-diff', compareFromSha, viewSha],
    queryFn: () => {
      if (!compareFromSha || !viewSha) throw new Error('diff endpoints missing');
      return fetchGraphDiff(compareFromSha, viewSha);
    },
    enabled: enabled && diffActive,
    staleTime: Number.POSITIVE_INFINITY,
  });

  // Compose the override payload + diff marks. Three cases:
  //   (1) viewSha null  → no override, live fetch runs.
  //   (2) viewSha set, no diff → plain historical snapshot.
  //   (3) viewSha set AND diff active → union graph + diff marks derived
  //       from the authoritative server diff response.
  // React Compiler handles memoization automatically; no useMemo needed.
  const derived = computeDerived({ viewSha, diffActive, viewQuery, fromQuery, diffQuery });

  // Replay loop. Stepping to null (before-earliest) auto-stops playback.
  // Using a ref for checkpoints inside the timeout callback avoids reset
  // when the tick runs against a stale closure.
  useEffect(() => {
    if (!isPlaying) return;
    if (!enabled) return;
    if (checkpoints.length === 0) return;
    const handle = window.setInterval(() => {
      setViewShaState((current) => {
        const sorted = checkpoints;
        if (sorted.length === 0) return current;
        if (current === null) {
          // Starting playback from "Now" snaps to the earliest checkpoint
          // to kick off the evolution replay.
          return sorted[0]?.sha ?? null;
        }
        const idx = sorted.findIndex((c) => c.sha === current);
        if (idx < 0) return sorted[0]?.sha ?? null;
        if (idx >= sorted.length - 1) {
          setIsPlaying(false);
          return null; // Reached end → jump back to Now.
        }
        return sorted[idx + 1]?.sha ?? null;
      });
    }, REPLAY_STEP_MS);
    return () => window.clearInterval(handle);
  }, [isPlaying, enabled, checkpoints]);

  // Handlers are regular functions — React Compiler handles memoization.
  const setViewSha = (sha: string | null) => {
    setViewShaState(sha);
    // Manual selection stops playback so we don't fight the user.
    setIsPlaying(false);
  };

  const setCompareFromSha = (sha: string | null) => {
    setCompareFromShaState(sha);
  };

  const togglePlay = () => {
    setIsPlaying((p) => !p);
  };

  const stepPrev = () => {
    setViewShaState((current) => {
      if (checkpoints.length === 0) return current;
      if (current === null) return checkpoints[checkpoints.length - 1]?.sha ?? null;
      const idx = checkpoints.findIndex((c) => c.sha === current);
      if (idx <= 0) return null; // back before earliest → Now-no-wait.
      return checkpoints[idx - 1]?.sha ?? null;
    });
    setIsPlaying(false);
  };

  const stepNext = () => {
    setViewShaState((current) => {
      if (checkpoints.length === 0) return current;
      if (current === null) return checkpoints[0]?.sha ?? null;
      const idx = checkpoints.findIndex((c) => c.sha === current);
      if (idx < 0) return checkpoints[0]?.sha ?? null;
      if (idx >= checkpoints.length - 1) return null; // past latest → Now.
      return checkpoints[idx + 1]?.sha ?? null;
    });
    setIsPlaying(false);
  };

  // When timeline is disabled, ensure we never flash stale overrides.
  if (!enabled) {
    return {
      checkpoints: [],
      checkpointsLoading: false,
      checkpointsError: null,
      viewSha: null,
      setViewSha,
      compareFromSha: null,
      setCompareFromSha,
      isPlaying: false,
      togglePlay,
      stepPrev,
      stepNext,
      overrideGraph: null,
      overrideLoading: false,
      overrideError: null,
      diffMarks: null,
    };
  }

  return {
    checkpoints,
    checkpointsLoading,
    checkpointsError,
    viewSha,
    setViewSha,
    compareFromSha,
    setCompareFromSha,
    isPlaying,
    togglePlay,
    stepPrev,
    stepNext,
    overrideGraph: derived.overrideGraph,
    overrideLoading: derived.overrideLoading,
    overrideError: derived.overrideError,
    diffMarks: derived.diffMarks ?? (diffActive ? EMPTY_DIFF_MARKS : null),
  };
}

function errorMessage(err: unknown): string | null {
  if (!err) return null;
  if (err instanceof Error) return err.message;
  return String(err);
}

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  error: unknown;
}

interface DerivedTimelinePayload {
  overrideGraph: { nodes: GraphNode[]; links: GraphLink[] } | null;
  overrideLoading: boolean;
  overrideError: string | null;
  diffMarks: GraphDiffMarks | null;
}

/**
 * Pure derivation of the timeline's override payload from the three query
 * results. Extracted so React Compiler can memoize the hook without a manual
 * useMemo, and so the logic is trivially unit-testable (no hooks required).
 */
function computeDerived(args: {
  viewSha: string | null;
  diffActive: boolean;
  viewQuery: QueryLike<GraphAtResponse>;
  fromQuery: QueryLike<GraphAtResponse>;
  diffQuery: QueryLike<GraphDiffResponse>;
}): DerivedTimelinePayload {
  const { viewSha, diffActive, viewQuery, fromQuery, diffQuery } = args;

  if (!viewSha) {
    return {
      overrideGraph: null,
      overrideLoading: false,
      overrideError: null,
      diffMarks: null,
    };
  }

  if (!diffActive) {
    const overrideLoading = viewQuery.isLoading;
    const overrideError = errorMessage(viewQuery.error);
    if (!viewQuery.data) {
      return { overrideGraph: null, overrideLoading, overrideError, diffMarks: null };
    }
    return {
      overrideGraph: {
        nodes: normalizeHistoricalNodes(viewQuery.data.nodes),
        links: normalizeHistoricalLinks(viewQuery.data.links),
      },
      overrideLoading,
      overrideError,
      diffMarks: null,
    };
  }

  // Diff mode — need both snapshots AND the server's authoritative diff
  // to render added-green / removed-red rings correctly on a union graph.
  const overrideLoading = viewQuery.isLoading || fromQuery.isLoading || diffQuery.isLoading;
  const overrideError =
    errorMessage(viewQuery.error) ?? errorMessage(fromQuery.error) ?? errorMessage(diffQuery.error);

  if (!viewQuery.data || !fromQuery.data) {
    return { overrideGraph: null, overrideLoading, overrideError, diffMarks: null };
  }

  const to = {
    nodes: normalizeHistoricalNodes(viewQuery.data.nodes),
    links: normalizeHistoricalLinks(viewQuery.data.links),
  };
  const from = {
    nodes: normalizeHistoricalNodes(fromQuery.data.nodes),
    links: normalizeHistoricalLinks(fromQuery.data.links),
  };
  const unionResult = mergeGraphsWithDiff(from, to);

  // Prefer the server's diff when available — it is the authoritative answer
  // for "what changed" and keeps rendering consistent with MCP responses.
  if (diffQuery.data) {
    const marks: GraphDiffMarks = {
      addedNodeIds: new Set(diffQuery.data.addedNodes.map((n) => n.id)),
      removedNodeIds: new Set(diffQuery.data.removedNodes.map((n) => n.id)),
      addedLinkKeys: new Set(diffQuery.data.addedLinks.map(linkKey)),
      removedLinkKeys: new Set(diffQuery.data.removedLinks.map(linkKey)),
    };
    return {
      overrideGraph: { nodes: unionResult.nodes, links: unionResult.links },
      overrideLoading,
      overrideError,
      diffMarks: marks,
    };
  }

  return {
    overrideGraph: { nodes: unionResult.nodes, links: unionResult.links },
    overrideLoading,
    overrideError,
    diffMarks: unionResult.marks,
  };
}
