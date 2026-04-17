/**
 * Centralized `pageerror` / `console` noise filters for E2E tests.
 *
 * Every E2E test that attaches `page.on('console', ...)` + `page.on('pageerror', ...)`
 * accumulates a log array like `{ type, text, url?, line? }[]`. This module
 * isolates the shared "benign noise" filter — dev-server HMR chatter, Vite
 * pre-bundle 404s, the by-design `/api/config` 404 fallthrough — from the
 * per-test critical-error assertion.
 *
 * Consumers pass their `logs` array to {@link filterCriticalErrors}. The
 * returned array contains only errors that are NOT benign dev-server noise;
 * the caller's assertion is typically `expect(critical).toEqual([])`.
 *
 * Adding a new filter entry: add a predicate below and include the reason
 * in a comment. NEVER add a bare `Failed to load resource` filter — that
 * masks genuine 404s. Always filter by URL pattern or specific marker text.
 */

export interface LogEntry {
  type: string;
  text: string;
  url?: string;
  line?: number;
}

/**
 * Benign-error predicates. An error matched by ANY predicate is filtered OUT
 * of the critical-errors set.
 */
const BENIGN_PREDICATES: Array<(e: LogEntry) => boolean> = [
  // Dev-server noise: favicon / HMR / Vite chatter.
  (e) => e.text.includes('favicon'),
  (e) => e.text.includes('HMR'),
  (e) => e.text.includes('[vite]'),
  (e) => !!e.url?.includes('/favicon'),
  (e) => !!e.url?.endsWith('.map'),
  (e) => !!e.url?.includes('.hot-update.'),

  // Vite HMR / dev-server pre-bundling requests occasionally 404 during
  // heavy pages (on-demand dep re-optimize). Dev-only; not in prod.
  (e) => !!e.url?.includes('/@vite/'),
  (e) => !!e.url?.includes('/@fs/'),
  (e) => !!e.url?.includes('/@id/'),
  (e) => !!e.url?.includes('/node_modules/.vite/'),

  // WebSocket / ws://.../collab reconnect noise: benign race during
  // `/api/test-reset` — the Hocuspocus WebSocket is closed by the server
  // mid-handshake as state is torn down and reconnected by the client
  // automatically. Chromium logs at `debug` (doesn't reach our stream);
  // WebKit/Firefox log at `error`. The subsequent assertions verify actual
  // CRDT convergence — if the reconnect didn't heal, ytext/fragment state
  // would be wrong, not just the transient log line.
  (e) => e.text.includes('WebSocket'),
  (e) => e.text.includes('ws://'),
  (e) => e.text.includes("can't establish a connection"),
  (e) => e.text.includes('can’t establish a connection'),

  // `/api/config` is intentionally absent in `bun run dev` mode (see
  // `src/lib/api-config.ts` header). The app classifies the 404 as
  // `{status: 'absent'}` and falls back to same-origin WebSocket — the
  // network 404 is a by-design signal, not a failure mode.
  (e) => !!e.url?.endsWith('/api/config'),
];

/**
 * Return the subset of `logs` that represents a genuine critical error.
 *
 * Input: logs collected from `page.on('console', ...)` + `page.on('pageerror', ...)`,
 * typically filtered to `type === 'error' || type === 'uncaught'` before being
 * passed here.
 *
 * Output: entries that did NOT match any benign predicate. The caller should
 * assert the returned array is empty, e.g.
 *   `expect(filterCriticalErrors(errors)).toEqual([])`.
 */
export function filterCriticalErrors(logs: LogEntry[]): LogEntry[] {
  return logs.filter((e) => !BENIGN_PREDICATES.some((pred) => pred(e)));
}
