/**
 * Security utilities for /api/local-op/* endpoints (FR18).
 *
 * All local-op endpoints enforce:
 * 1. Loopback-only — reject remote addresses
 * 2. Origin header check — only localhost/127.0.0.1/[::1]
 * 3. --dir confined to user's home dir (no path traversal)
 * 4. URL protocol allowlist (https/ssh/git/SCP; block file/javascript/ext::)
 * 5. Concurrency=1 per endpoint (see ConcurrencyGuard)
 * 6. 10-min subprocess wall-clock timeout (enforced by callers)
 * 7. Argv-array spawn — no shell interpolation (enforced by callers)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { errorResponse } from './http/error-response.ts';

// ─── Protocol checks ─────────────────────────────────────────────────────────

const ALLOWED_URL_PATTERNS: RegExp[] = [
  /^https?:\/\//i,
  /^ssh:\/\//i,
  /^git:\/\//i,
  /^git@[^:]+:/, // SCP-style: git@github.com:owner/repo
];

const BLOCKED_URL_PATTERNS: RegExp[] = [
  /^file:\/\//i,
  /^javascript:/i,
  /^ext::/i,
  /^data:/i,
  /^vbscript:/i,
];

/**
 * Returns true if the URL uses an allowed git-transport protocol.
 * Rejects file://, javascript:, ext::, data:, and vbscript: explicitly.
 */
export function isAllowedGitUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (BLOCKED_URL_PATTERNS.some((p) => p.test(url))) return false;
  return ALLOWED_URL_PATTERNS.some((p) => p.test(url));
}

// ─── Path safety ─────────────────────────────────────────────────────────────

/** Expand a leading `~` or `~/` to the user's home directory. */
export function expandTilde(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

/**
 * Returns true if `dirPath` is within the user's home directory and contains
 * no null bytes. Resolves relative paths against cwd for a stable comparison.
 *
 * The home-dir confinement prevents the local-op relay from being used to
 * spawn servers or clones at arbitrary system paths (e.g. /etc, /root).
 */
export function isSafeLocalPath(dirPath: string): boolean {
  if (!dirPath || typeof dirPath !== 'string') return false;
  if (dirPath.includes('\0')) return false;
  const home = homedir();
  // Expand tilde before resolving — resolve() alone does not expand `~`.
  const resolved = resolve(expandTilde(dirPath));
  return resolved === home || resolved.startsWith(`${home}/`);
}

// ─── Request security checks ─────────────────────────────────────────────────

/**
 * Returns true if the request comes from a loopback address.
 */
export function isLoopbackRequest(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/**
 * Returns true if the Origin header (when present) is a loopback origin.
 * Absent Origin header is allowed (same-origin browser requests / CLI tools).
 *
 * Parses the URL and compares hostname exactly; a raw `startsWith` would
 * accept crafted origins like `http://127.0.0.1.evil.com` if DNS rebinding
 * ever lined up with the loopback socket check.
 */
export function hasValidLocalOpOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    // WHATWG URL preserves the IPv6 brackets in `hostname` (e.g. `[::1]`), so
    // the comparison set includes the bracketed form alongside the literal.
    const { hostname } = new URL(origin);
    return (
      hostname === '127.0.0.1' ||
      hostname === 'localhost' ||
      hostname === '[::1]' ||
      hostname === '::1'
    );
  } catch {
    return false;
  }
}

/**
 * Convenience wrapper: runs loopback + origin checks, emits an RFC 9457 403
 * problem+json response if either fails (D22), and returns false. Returns
 * true when the request is allowed.
 *
 * The two failure modes use distinct URN tokens so operators can route on
 * the typed `problem.type`: `urn:ok:error:loopback-required` (network-level)
 * vs `urn:ok:error:invalid-origin` (header-level). `handler` is the
 * route-name tag for the `ok.api.error.count{handler}` counter.
 */
export function checkLocalOpSecurity(
  req: IncomingMessage,
  res: ServerResponse,
  options: { handler: string },
): boolean {
  if (!isLoopbackRequest(req)) {
    errorResponse(
      res,
      403,
      'urn:ok:error:loopback-required',
      'Local-op endpoints require a loopback connection.',
      { handler: options.handler },
    );
    return false;
  }
  if (!hasValidLocalOpOrigin(req)) {
    errorResponse(
      res,
      403,
      'urn:ok:error:invalid-origin',
      'Origin header is not a permitted loopback origin.',
      { handler: options.handler },
    );
    return false;
  }
  return true;
}

// ─── Concurrency guard (1 in-flight per endpoint) ────────────────────────────

/**
 * Simple per-key mutex: allows at most one in-flight request per endpoint path.
 * Returns a 429 if a second request arrives while the first is still active.
 *
 * Usage:
 *   const guard = createConcurrencyGuard();
 *   if (!guard.tryAcquire('/api/local-op/clone')) { /* already in flight *\/ }
 *   try { … } finally { guard.release('/api/local-op/clone'); }
 */
interface ConcurrencyGuard {
  tryAcquire(key: string): boolean;
  release(key: string): void;
}

export function createConcurrencyGuard(): ConcurrencyGuard {
  const inFlight = new Set<string>();
  return {
    tryAcquire(key: string): boolean {
      if (inFlight.has(key)) return false;
      inFlight.add(key);
      return true;
    },
    release(key: string): void {
      inFlight.delete(key);
    },
  };
}
