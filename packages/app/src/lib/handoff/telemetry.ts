/**
 * Local-only telemetry counter for the Open-in-Agent dispatch path.
 *
 * Append-only one-line-per-dispatch JSONL writes to `~/.open-knowledge/stats.jsonl`
 * via the Electron main process. Zero phone-home (XQ3 LOCKED, SPEC §15);
 * extends OK's broader local-only-counter Future Work pattern.
 *
 * Host behavior (SPEC 2026-04-21 §13.1):
 *   - **Electron host** (`window.okDesktop` present): forwards `line` to the
 *     `ok:handoff:record` IPC channel. The main-process handler does an
 *     append-only `fs.promises.appendFile(~/.open-knowledge/stats.jsonl, ...)`
 *     and resolves even on EACCES / ENOSPC (warning logged, no throw).
 *   - **Web host** (no `window.okDesktop`): no-op in v0. Diagnostic counters
 *     matter most on the dogfood Electron build; the web fallback path
 *     deliberately ships without telemetry rather than building a server-side
 *     append endpoint that would only be exercised in a non-target use case.
 *
 * Failure semantics: `recordHandoff` NEVER throws. An unwritable HOME, an IPC
 * rejection, or a missing bridge surface all collapse to a logged warning and
 * a resolved void promise. The dispatch path (success / failure toast,
 * dropdown closure, retry action) is therefore decoupled from telemetry.
 */

import type { HandoffFailureReason, HandoffTarget } from '@inkeep/open-knowledge-core';

/** Host the dispatch came from. Used to scope dogfood signal. */
export type HandoffHost = 'electron' | 'web';

/** Outcome status — `error` carries the optional `reason` discriminator. */
export type HandoffOutcomeStatus = 'ok' | 'error';

/**
 * One JSONL line in `~/.open-knowledge/stats.jsonl`. Schema is intentionally
 * narrow — adding fields requires a SPEC amendment so the dogfood signal
 * stays comparable across versions.
 */
export interface HandoffStatsLine {
  readonly target: HandoffTarget;
  readonly host: HandoffHost;
  readonly outcome: HandoffOutcomeStatus;
  /** ISO 8601 — caller-supplied so unit tests can pin a deterministic value. */
  readonly ts: string;
  /** Present only on `outcome:'error'`. Mirrors `HandoffFailureReason`. */
  readonly reason?: HandoffFailureReason;
}

/**
 * Renderer-side dependencies. The `okDesktop` slot is filled from
 * `window.okDesktop` by default; tests inject a fake to avoid touching the
 * real Electron preload.
 */
export interface RecordHandoffDeps {
  readonly okDesktop?: { shell: { recordHandoff(line: HandoffStatsLine): Promise<void> } };
  /** Diagnostic sink — defaults to `console.warn`. */
  readonly warn?: (message: string) => void;
}

/**
 * Append one telemetry line. Resolves to void on every code path:
 *   - Electron + IPC succeeds → resolves
 *   - Electron + IPC rejects → warn, resolves
 *   - Web host (no bridge)   → resolves immediately (no warn — expected path)
 */
export async function recordHandoff(
  line: HandoffStatsLine,
  deps: RecordHandoffDeps = {},
): Promise<void> {
  const okDesktop =
    deps.okDesktop ?? (typeof window !== 'undefined' ? window.okDesktop : undefined);
  if (!okDesktop?.shell?.recordHandoff) {
    // Web host — telemetry is a no-op in v0 per SPEC §13.1. The "no warn"
    // choice is deliberate: every web dispatch would otherwise log noise.
    return;
  }
  try {
    await okDesktop.shell.recordHandoff(line);
  } catch (err) {
    const warn = deps.warn ?? ((m: string) => console.warn(m));
    const reason = err instanceof Error ? err.message : String(err);
    warn(`[handoff] recordHandoff IPC rejected (telemetry skipped): ${reason}`);
  }
}
