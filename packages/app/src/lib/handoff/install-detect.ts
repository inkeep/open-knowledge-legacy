/**
 * Unified install-detection primitive for the Open-in-Agent dropdown.
 *
 * Governing spec: `specs/2026-04-21-open-in-agent-desktop/SPEC.md` §6.4.
 *
 * Two probe strategies (one per host):
 *   - `probeViaElectron` — fans out `window.okDesktop.shell.detectProtocol(scheme)`
 *     IPC calls in parallel, one per unique scheme.
 *   - `probeViaFetch`    — a single `GET /api/installed-agents` whose flat
 *     `{claude,codex,cursor}` response is fanned out to scheme keys.
 *
 * `createProbeCoordinator` wraps either strategy with throttle + inflight dedup
 * so the dropdown can `refresh()` liberally without spamming the OS / server
 * (SQ5 DIRECTED option c). Subscribers are notified only when the state
 * actually differs — identical probe results do NOT cause a re-render cascade.
 *
 * Pure of React. Consumers: the React hook wrapper at
 * `packages/app/src/components/handoff/useInstalledAgents.ts`, and unit tests
 * here that exercise throttle + dedup + host-override semantics directly.
 *
 * Defense-in-depth: web-host Cursor is ALWAYS `installed: false` regardless of
 * probe result (E4 DIRECTED). The UI additionally filters that row on web, so
 * this override is never user-observable in practice — but it means even if
 * the UI forgot to filter, dispatch would still resolve to the conservative
 * disabled state.
 */

import type { HandoffTarget, InstallState } from '@inkeep/open-knowledge-core';
import { KNOWN_TARGETS } from './targets.ts';

/** Unique URL schemes across all known targets. Computed once at module init. */
export const UNIQUE_SCHEMES: ReadonlyArray<string> = [
  ...new Set(KNOWN_TARGETS.flatMap((t) => t.schemes)),
];

/** Per-scheme probe result. `lastChecked` is applied downstream on the target
 *  state, not stored per-scheme — the probe boundary is a pure snapshot. */
export interface SchemeProbeResult {
  readonly installed: boolean;
  readonly displayName?: string;
}

/** Scheme → probe-result map. Partial during boot; fully populated after a probe. */
export type SchemeStates = Readonly<Record<string, SchemeProbeResult>>;

/** Default throttle window (SQ5 DIRECTED option c). */
export const DEFAULT_THROTTLE_MS = 10_000;

/**
 * Pure mapping: per-scheme probe results → per-target `InstallState`.
 *
 * Applies the web-host Cursor override (E4 DIRECTED): on web host, the
 * `cursor` target's `installed` is forced to `false` regardless of the probed
 * scheme state.
 *
 * `lastChecked` is stamped from `opts.now()` on every probed entry — unprobed
 * entries have no `lastChecked`.
 */
export function schemeStatesToTargetStates(
  schemeStates: SchemeStates,
  opts: { isElectronHost: boolean; now?: () => number },
): Record<HandoffTarget, InstallState> {
  const now = opts.now?.() ?? Date.now();
  const out = {} as Record<HandoffTarget, InstallState>;
  for (const target of KNOWN_TARGETS) {
    const forceWebCursorDisabled = !opts.isElectronHost && target.id === 'cursor';
    if (forceWebCursorDisabled) {
      out[target.id] = { installed: false, lastChecked: now };
      continue;
    }
    const scheme = target.schemes[0];
    const probed = scheme !== undefined ? schemeStates[scheme] : undefined;
    if (!probed) {
      out[target.id] = { installed: null };
      continue;
    }
    out[target.id] = {
      installed: probed.installed,
      ...(probed.displayName !== undefined ? { displayName: probed.displayName } : {}),
      lastChecked: now,
    };
  }
  return out;
}

/** Initial `states` snapshot for a fresh hook mount (pre-probe). */
export function initialTargetStates(opts: {
  isElectronHost: boolean;
  now?: () => number;
}): Record<HandoffTarget, InstallState> {
  return schemeStatesToTargetStates({}, opts);
}

/**
 * Electron probe strategy — one IPC call per unique scheme, in parallel.
 * Per-scheme rejection is caught and treated as `installed: false` so one
 * flaky scheme doesn't sink the whole refresh.
 *
 * IPC contract: `detectProtocol` expects the scheme NAME without trailing
 * colon (e.g. `'claude'` not `'claude:'`). The main-process handler's
 * shell-injection sanitizer (`^[a-z][a-z0-9+.-]*$`) rejects any scheme
 * containing a colon before `getApplicationInfoForProtocol` is called —
 * matching the Linux `xdg-mime query default x-scheme-handler/<name>`
 * shell-command form. `KNOWN_TARGETS.schemes` carries the colonful form
 * (matches `URL.protocol` + `ALLOWED_SCHEMES`), so we strip here.
 */
export async function probeViaElectron(deps: {
  detectProtocol: (schemeName: string) => Promise<SchemeProbeResult>;
  schemes?: ReadonlyArray<string>;
}): Promise<SchemeStates> {
  const schemes = deps.schemes ?? UNIQUE_SCHEMES;
  const entries = await Promise.all(
    schemes.map(async (scheme) => {
      const schemeName = scheme.replace(/:$/, '');
      try {
        const result = await deps.detectProtocol(schemeName);
        return [scheme, result] as const;
      } catch {
        return [scheme, { installed: false } as SchemeProbeResult] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

const CONSERVATIVE_FALSE: SchemeStates = Object.fromEntries(
  UNIQUE_SCHEMES.map((s) => [s, { installed: false } as SchemeProbeResult]),
);

/**
 * Web probe strategy — single `GET /api/installed-agents`. The server response
 * is flat `{claude: bool, codex: bool, cursor: bool}` (no colon on keys); we
 * translate each key back to the colon-suffixed scheme for internal state.
 * Any failure (network, non-200, malformed body) resolves to all-false
 * conservative default — matches SPEC §6.4 "conservative default" policy.
 *
 * AbortError propagates so callers can cancel in-flight fetches.
 */
export async function probeViaFetch(deps: {
  fetch: typeof globalThis.fetch;
  signal?: AbortSignal;
}): Promise<SchemeStates> {
  let res: Response;
  try {
    res = await deps.fetch('/api/installed-agents', {
      signal: deps.signal,
      headers: { Accept: 'application/json' },
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') throw err;
    return CONSERVATIVE_FALSE;
  }
  if (!res.ok) return CONSERVATIVE_FALSE;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return CONSERVATIVE_FALSE;
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return CONSERVATIVE_FALSE;
  }
  const obj = body as Record<string, unknown>;
  const out: Record<string, SchemeProbeResult> = {};
  for (const scheme of UNIQUE_SCHEMES) {
    const key = scheme.replace(/:$/, '');
    out[scheme] = { installed: obj[key] === true };
  }
  return out;
}

/** Coordinator dependencies. Everything I/O-shaped is injected for testability. */
export interface ProbeDeps {
  /** One-shot probe — returns `SchemeStates` for every unique scheme.
   *  Strategies (`probeViaElectron`, `probeViaFetch`) satisfy this shape. */
  probe: () => Promise<SchemeStates>;
  /** Host classifier — true when Electron preload populated `window.okDesktop`. */
  isElectronHost: () => boolean;
  /** Clock reading. Production: `Date.now`. Tests: virtual. */
  now: () => number;
  /** Throttle window. Default `DEFAULT_THROTTLE_MS`. */
  throttleMs?: number;
}

export interface ProbeHandle {
  /** Trigger a probe. Subject to throttle + inflight dedup. Resolves when the
   *  probe completes, or immediately if throttled / already inflight. */
  probe(): Promise<void>;
  /** Read the current target-state snapshot (synchronous). */
  getTargetStates(): Record<HandoffTarget, InstallState>;
  /** Subscribe to state-change notifications. Returns an unsubscribe. */
  subscribe(cb: (states: Record<HandoffTarget, InstallState>) => void): () => void;
  /** Stop the coordinator — cancels subscriptions. A pending probe resolves
   *  without notifying. Idempotent. */
  cancel(): void;
}

/** Deep-equal check for the per-scheme probe map — avoids a re-render when the
 *  probe returns the same answer twice in a row (common case under throttle). */
function schemeStatesEqual(a: SchemeStates, b: SchemeStates): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    const av = a[k];
    const bv = b[k];
    if (!av || !bv) return false;
    if (av.installed !== bv.installed) return false;
    if (av.displayName !== bv.displayName) return false;
  }
  return true;
}

export function createProbeCoordinator(deps: ProbeDeps): ProbeHandle {
  const throttleMs = deps.throttleMs ?? DEFAULT_THROTTLE_MS;
  let cancelled = false;
  let lastProbedAt: number | null = null;
  let inflight: Promise<void> | null = null;
  let schemeStates: SchemeStates = {};
  let cachedTargetStates: Record<HandoffTarget, InstallState> = initialTargetStates({
    isElectronHost: deps.isElectronHost(),
    now: deps.now,
  });
  const subscribers = new Set<(s: Record<HandoffTarget, InstallState>) => void>();

  const notifyAll = (): void => {
    if (cancelled) return;
    for (const cb of subscribers) cb(cachedTargetStates);
  };

  const refreshCachedSnapshot = (): void => {
    cachedTargetStates = schemeStatesToTargetStates(schemeStates, {
      isElectronHost: deps.isElectronHost(),
      now: deps.now,
    });
  };

  const probe = async (): Promise<void> => {
    if (cancelled) return;
    if (inflight) return inflight;
    if (lastProbedAt !== null && deps.now() - lastProbedAt < throttleMs) {
      return; // throttled — silent no-op
    }
    const run = (async () => {
      try {
        const next = await deps.probe();
        if (cancelled) return;
        const changed = !schemeStatesEqual(schemeStates, next);
        schemeStates = next;
        if (changed) {
          refreshCachedSnapshot();
          notifyAll();
        }
        lastProbedAt = deps.now();
      } catch {
        // Don't ratchet lastProbedAt on error — a transient flake can retry
        // immediately on the next refresh() without waiting for the throttle
        // window (conservative-false, not conservative-hide per SPEC §6.4).
      } finally {
        inflight = null;
      }
    })();
    inflight = run;
    return run;
  };

  return {
    probe,
    getTargetStates: () => cachedTargetStates,
    subscribe: (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    cancel: () => {
      cancelled = true;
      subscribers.clear();
    },
  };
}
