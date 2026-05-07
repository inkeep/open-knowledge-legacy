import { execFile, spawn as nodeSpawn } from 'node:child_process';
import { access, constants as fsConstants } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { posix as pathPosix, win32 as pathWin32 } from 'node:path';

const SPAWN_CURSOR_WHICH_TIMEOUT_MS = 500;
const SPAWN_CURSOR_SPAWN_TIMEOUT_MS = 2000;
const SPAWN_CURSOR_MAX_BODY_BYTES = 4 * 1024;

export type SpawnCursorOutcome =
  | { ok: true }
  | { ok: false; reason: 'invalid-path' | 'not-installed' | 'timeout' | 'spawn-error' };

export interface HandleSpawnCursorDeps {
  contentDir: string;
  platform: NodeJS.Platform;
  resolveCursorBinary?: (timeoutMs: number) => Promise<string | null>;
  spawnDetached?: (
    exec: string,
    args: ReadonlyArray<string>,
    timeoutMs: number,
  ) => Promise<SpawnCursorOutcome>;
}

export async function handleSpawnCursor(
  req: IncomingMessage,
  res: ServerResponse,
  deps: HandleSpawnCursorDeps,
): Promise<void> {
  if (req.method !== 'POST') {
    writeJson(res, 405, { ok: false, reason: 'method-not-allowed' });
    return;
  }

  let body: Buffer;
  try {
    body = await readBoundedJsonBody(req);
  } catch {
    writeJson(res, 413, { ok: false, reason: 'spawn-error' });
    return;
  }

  let parsed: { path?: unknown };
  try {
    parsed = JSON.parse(body.toString('utf-8')) as { path?: unknown };
  } catch {
    writeJson(res, 400, { ok: false, reason: 'invalid-path' });
    return;
  }

  const userPath = typeof parsed.path === 'string' ? parsed.path : '';
  if (!userPath) {
    writeJson(res, 400, { ok: false, reason: 'invalid-path' });
    return;
  }

  if (!isPathWithinDir(userPath, deps.contentDir, deps.platform)) {
    writeJson(res, 403, { ok: false, reason: 'invalid-path' });
    return;
  }

  const resolveCursorBinary = deps.resolveCursorBinary ?? resolveCursorBinaryDefault;
  const exec = await resolveCursorBinary(SPAWN_CURSOR_WHICH_TIMEOUT_MS);
  if (!exec) {
    writeJson(res, 200, { ok: false, reason: 'not-installed' });
    return;
  }

  const invocation = resolveCursorSpawnInvocation(exec, userPath, deps.platform);
  const spawn = deps.spawnDetached ?? spawnDetachedReal;
  const outcome = await spawn(invocation.exec, invocation.args, SPAWN_CURSOR_SPAWN_TIMEOUT_MS);
  writeJson(res, 200, outcome);
}

export const CURSOR_BUNDLE_PATHS_BY_PLATFORM: Partial<
  Record<NodeJS.Platform, ReadonlyArray<(home: string) => string>>
> = {
  darwin: [
    () => '/Applications/Cursor.app/Contents/Resources/app/bin/cursor',
    (home) => `${home}/Applications/Cursor.app/Contents/Resources/app/bin/cursor`,
  ],
  win32: [
    (home) => `${home}\\AppData\\Local\\Programs\\cursor\\resources\\app\\bin\\cursor.cmd`,
    () => 'C:\\Program Files\\Cursor\\resources\\app\\bin\\cursor.cmd',
  ],
};

export async function resolveCursorBinaryDefault(timeoutMs: number): Promise<string | null> {
  const candidates = CURSOR_BUNDLE_PATHS_BY_PLATFORM[process.platform];
  if (candidates && candidates.length > 0) {
    const home = homedir();
    for (const buildPath of candidates) {
      const candidate = buildPath(home);
      try {
        await access(candidate, fsConstants.X_OK);
        return candidate;
      } catch {}
    }
  }
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execFile(cmd, ['cursor'], { timeout: timeoutMs, encoding: 'utf-8' }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const first = stdout.split(/\r?\n/)[0]?.trim();
      resolve(first && first.length > 0 ? first : null);
    });
  });
}

function spawnDetachedReal(
  exec: string,
  args: ReadonlyArray<string>,
  timeoutMs: number,
): Promise<SpawnCursorOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: SpawnCursorOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const timer = setTimeout(() => settle({ ok: false, reason: 'timeout' }), timeoutMs);
    try {
      const child = nodeSpawn(exec, [...args], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
      child.once('error', (err) => {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        const reason: SpawnCursorOutcome = /ENOENT|EACCES|EPERM/.test(msg)
          ? { ok: false, reason: 'not-installed' }
          : { ok: false, reason: 'spawn-error' };
        settle(reason);
      });
      queueMicrotask(() => {
        if (settled) return;
        try {
          child.unref();
        } catch {}
        clearTimeout(timer);
        settle({ ok: true });
      });
    } catch {
      clearTimeout(timer);
      settle({ ok: false, reason: 'spawn-error' });
    }
  });
}

export function resolveCursorSpawnInvocation(
  resolvedPath: string,
  userPath: string,
  platform: NodeJS.Platform,
): { exec: string; args: ReadonlyArray<string> } {
  if (platform === 'darwin' && /\.app\/?$/.test(resolvedPath)) {
    const bundle = resolvedPath.replace(/\/$/, '');
    return { exec: '/usr/bin/open', args: ['-a', bundle, userPath] };
  }
  return { exec: resolvedPath, args: [userPath] };
}

async function readBoundedJsonBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > SPAWN_CURSOR_MAX_BODY_BYTES) {
      throw new Error('Payload too large');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

export function isPathWithinDir(
  userPath: string,
  contentDir: string,
  platform: NodeJS.Platform,
): boolean {
  if (!userPath || typeof userPath !== 'string') return false;
  if (userPath.includes('\0')) return false;
  if (!contentDir || typeof contentDir !== 'string') return false;
  if (platform === 'win32') {
    if (!/^([a-zA-Z]:[\\/]|\\\\)/.test(userPath)) return false;
    if (!/^([a-zA-Z]:[\\/]|\\\\)/.test(contentDir)) return false;
  } else {
    if (!userPath.startsWith('/')) return false;
    if (!contentDir.startsWith('/')) return false;
  }
  const p = platform === 'win32' ? pathWin32 : pathPosix;
  try {
    const canonicalUser = p.resolve(userPath);
    const canonicalDir = p.resolve(contentDir);
    if (platform === 'win32') {
      const userRoot = p.parse(canonicalUser).root.toLowerCase();
      const dirRoot = p.parse(canonicalDir).root.toLowerCase();
      if (!userRoot || !dirRoot || userRoot !== dirRoot) return false;
    }
    if (canonicalUser === canonicalDir) return true;
    const rel = p.relative(canonicalDir, canonicalUser);
    if (rel === '' || rel === '.') return true;
    if (rel === '..' || rel.startsWith(`..${p.sep}`)) return false;
    if (platform === 'win32' && (/^[a-zA-Z]:[\\/]/.test(rel) || rel.startsWith('\\\\'))) {
      return false;
    }
    if (platform !== 'win32' && rel.startsWith('/')) return false;
    return true;
  } catch {
    return false;
  }
}
