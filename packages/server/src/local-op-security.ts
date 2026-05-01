
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';


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

export function isSafeLocalPath(dirPath: string): boolean {
  if (!dirPath || typeof dirPath !== 'string') return false;
  if (dirPath.includes('\0')) return false;
  const home = homedir();
  const resolved = resolve(expandTilde(dirPath));
  return resolved === home || resolved.startsWith(`${home}/`);
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
