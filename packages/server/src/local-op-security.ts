import { lstatSync, realpathSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

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

export function isAllowedGitUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (BLOCKED_URL_PATTERNS.some((p) => p.test(url))) return false;
  return ALLOWED_URL_PATTERNS.some((p) => p.test(url));
}

export function expandTilde(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

function tryRealpathSync(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

export function isPathWithinHome(dirPath: string, home: string): boolean {
  if (!dirPath || typeof dirPath !== 'string') return false;
  if (dirPath.includes('\0')) return false;

  const realHome = tryRealpathSync(home);
  if (realHome === null) return false;

  const lexicalAbs = resolve(expandTilde(dirPath));

  const suffix: string[] = [];
  let current = lexicalAbs;
  while (true) {
    let exists = true;
    try {
      lstatSync(current);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        exists = false;
      } else {
        return false;
      }
    }

    if (exists) {
      const real = tryRealpathSync(current);
      if (real === null) return false;
      const canonical = suffix.length === 0 ? real : join(real, ...suffix);
      const rel = relative(realHome, canonical);
      return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    }

    const parent = dirname(current);
    if (parent === current) return false;
    suffix.unshift(basename(current));
    current = parent;
  }
}

export function isSafeLocalPath(dirPath: string): boolean {
  return isPathWithinHome(dirPath, homedir());
}

export function isLoopbackRequest(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

export function hasValidLocalOpOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
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

export function checkLocalOpSecurity(
  req: IncomingMessage,
  res: ServerResponse,
  sendJson: (res: ServerResponse, status: number, data: unknown) => void,
): boolean {
  if (!isLoopbackRequest(req)) {
    sendJson(res, 403, {
      ok: false,
      error: 'Forbidden: local-op endpoints require loopback connection',
    });
    return false;
  }
  if (!hasValidLocalOpOrigin(req)) {
    sendJson(res, 403, { ok: false, error: 'Forbidden: invalid origin for local-op endpoint' });
    return false;
  }
  return true;
}

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
