/**
 * Git-clone subprocess runner — spawns `<cli> clone --json <url> <dir>` and
 * emits structured events.
 *
 * The CLI emits:
 *   {type:'progress', phase, pct}
 *   {type:'complete', dir}     ← CLI's terminal event (just the dir)
 *   {type:'error', message}
 *
 * The HTTP relay (api-extension.ts) intercepts the CLI's `complete` and
 * chains into `startServerAtDirAndGetPort` to add a `port` field before
 * forwarding to the browser. The Electron Navigator IPC path does NOT need
 * a port — main spawns a new editor window directly at `dir` — so it
 * forwards the CLI's `complete` as-is (with `dir`, no `port`).
 *
 * This runner is framing-agnostic: callers receive each parsed event
 * structurally and decide how to forward it.
 */

import { expandTilde, isAllowedGitUrl, isSafeLocalPath } from '../local-op-security.ts';
import { runSubprocess } from './subprocess.ts';

/**
 * Variant of `CloneEvent` emitted directly by the CLI subprocess — the
 * `complete` carries `dir` instead of `port`. The HTTP relay rewrites this
 * to a port-bearing event before forwarding to browsers; the Electron IPC
 * path forwards it as-is.
 */
export type RawCloneEvent =
  | { type: 'progress'; phase: string; pct: number }
  | { type: 'complete'; dir: string }
  | { type: 'error'; message: string };

export interface RunCloneOptions {
  cliArgs: readonly string[];
  url: string;
  /** Tilde-expanded target directory. */
  dir: string;
  /** Wall-clock subprocess timeout. Defaults to 10 minutes. */
  timeoutMs?: number;
  /** Called for every parsed event. Use the controller's `done` to know when the stream ended. */
  onEvent: (event: RawCloneEvent) => void;
}

export interface RunCloneController {
  done: Promise<void>;
  cancel(): void;
}

interface CloneInputValidation {
  ok: boolean;
  /** Populated when `ok === false`; describes which input was invalid. */
  reason?: 'invalid-url' | 'invalid-dir';
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** Validate clone inputs. Returns `{ok:true}` only when both pass. */
export function validateCloneInputs(url: string, dir: string): CloneInputValidation {
  if (!isAllowedGitUrl(url)) return { ok: false, reason: 'invalid-url' };
  if (!isSafeLocalPath(dir)) return { ok: false, reason: 'invalid-dir' };
  return { ok: true };
}

function asRawCloneEvent(parsed: Record<string, unknown>): RawCloneEvent | null {
  const type = parsed.type;
  if (type === 'progress') {
    if (typeof parsed.phase === 'string' && typeof parsed.pct === 'number') {
      return { type: 'progress', phase: parsed.phase, pct: parsed.pct };
    }
    return null;
  }
  if (type === 'complete') {
    if (typeof parsed.dir === 'string') {
      return { type: 'complete', dir: parsed.dir };
    }
    return null;
  }
  if (type === 'error') {
    return {
      type: 'error',
      message: typeof parsed.message === 'string' ? parsed.message : 'Unknown error',
    };
  }
  return null;
}

/**
 * Spawn `ok clone --json <url> <expanded-dir>` and stream events to
 * `onEvent`. Resolves once the subprocess exits.
 *
 * Note: the caller is responsible for any post-clone follow-up. The HTTP
 * relay rewrites the `complete` event into a port-bearing one (after
 * starting the cloned project's server); the Electron Navigator IPC path
 * leaves the `complete` as-is and lets main spawn a new editor window.
 */
export function runCloneSubprocess(opts: RunCloneOptions): RunCloneController {
  const targetDir = expandTilde(opts.dir);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let sawTerminal = false;

  const proc = runSubprocess({
    cliArgs: opts.cliArgs,
    trailingArgs: ['clone', '--json', opts.url, targetDir],
    timeoutMs,
    onLine: ({ parsed }) => {
      if (!parsed) return;
      const event = asRawCloneEvent(parsed);
      if (!event) return;
      if (event.type === 'complete' || event.type === 'error') {
        sawTerminal = true;
      }
      opts.onEvent(event);
    },
  });

  const done = proc.done.then((result) => {
    if (sawTerminal) return;
    if (result.timedOut) {
      opts.onEvent({ type: 'error', message: 'Clone timed out after 10 minutes' });
      return;
    }
    if (result.code !== 0) {
      const detail = result.stderr ? ` — ${result.stderr}` : '';
      opts.onEvent({
        type: 'error',
        message: `Clone process exited with code ${result.code ?? -1}${detail}`,
      });
    }
  });

  return { done, cancel: proc.cancel };
}
/** Re-export the type so callers in IPC main and tests don't need a deep import. */
