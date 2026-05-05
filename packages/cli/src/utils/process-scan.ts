import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';

const SPAWN_TIMEOUT_MS = 2000;

const OK_PROCESS_PATTERNS: RegExp[] = [
  /cli\.mjs/,
  /(^|[\s/])(open-knowledge|ok)\s+(start|mcp|ui)(\s|$)/,
  /(^|[\s/])bun([\s/]).*?(run dev|packages\/app|vite|hocuspocus)/,
  /(^|[\s/])node([\s/]).*?(packages\/(cli|app)|vite|hocuspocus)/,
];

function isOkProcess(command: string): boolean {
  return OK_PROCESS_PATTERNS.some((re) => re.test(command));
}

export async function findOkProcessPids(): Promise<number[]> {
  const pgrepResult = spawnSync('pgrep', ['-a', '-f', 'cli.mjs'], {
    encoding: 'utf-8',
    timeout: SPAWN_TIMEOUT_MS,
  });

  const pgrepUnavailable =
    pgrepResult.error != null && (pgrepResult.error as NodeJS.ErrnoException).code === 'ENOENT';

  if (!pgrepUnavailable) {
    const output = pgrepResult.stdout ?? '';
    return parsePgrepOutput(output);
  }

  const psResult = spawnSync('ps', ['-axo', 'pid,command'], {
    encoding: 'utf-8',
    timeout: SPAWN_TIMEOUT_MS,
  });

  if (psResult.error != null || !psResult.stdout) {
    return [];
  }

  return parsePsOutput(psResult.stdout);
}

function parsePgrepOutput(output: string): number[] {
  const pids: number[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) continue;
    const pidStr = trimmed.slice(0, spaceIdx);
    const command = trimmed.slice(spaceIdx + 1);
    const pid = Number.parseInt(pidStr, 10);
    if (!Number.isNaN(pid) && isOkProcess(command)) {
      pids.push(pid);
    }
  }
  return pids;
}

function parsePsOutput(output: string): number[] {
  const pids: number[] = [];
  const lines = output.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) continue;
    const pidStr = line.slice(0, spaceIdx);
    const command = line.slice(spaceIdx + 1).trim();
    const pid = Number.parseInt(pidStr, 10);
    if (!Number.isNaN(pid) && isOkProcess(command)) {
      pids.push(pid);
    }
  }
  return pids;
}

export async function pidCwd(pid: number): Promise<string | null> {
  const result = spawnSync('lsof', ['-p', String(pid), '-a', '-d', 'cwd', '-Fn'], {
    encoding: 'utf-8',
    timeout: SPAWN_TIMEOUT_MS,
  });

  if (result.error != null) {
    return null;
  }

  const output = result.stdout ?? '';
  for (const line of output.split('\n')) {
    if (line.startsWith('n') && line.length > 1) {
      return line.slice(1);
    }
  }

  return null;
}

function parseListeningPids(output: string): number[] {
  const pids: number[] = [];
  const lines = output.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const pid = Number.parseInt(parts[1] ?? '', 10);
    if (!Number.isNaN(pid)) {
      pids.push(pid);
    }
  }
  return [...new Set(pids)];
}

export async function discoverLockDirs(): Promise<string[]> {
  const candidateDirs = new Set<string>();

  const okPids = await findOkProcessPids();
  const cwdPromises = okPids.map((pid) => pidCwd(pid));
  const cwds = await Promise.all(cwdPromises);

  for (const cwd of cwds) {
    if (cwd == null) continue;
    const lockDir = join(cwd, '.ok', 'local');
    if (existsSync(lockDir)) {
      candidateDirs.add(lockDir);
    }
  }

  const lsofResult = spawnSync('lsof', ['-iTCP', '-sTCP:LISTEN', '-nP'], {
    encoding: 'utf-8',
    timeout: SPAWN_TIMEOUT_MS,
  });

  if (lsofResult.error == null && lsofResult.stdout) {
    const listeningPids = parseListeningPids(lsofResult.stdout);
    const knownPidSet = new Set(okPids);
    const newPids = listeningPids.filter((p) => !knownPidSet.has(p));
    const portCwdPromises = newPids.map((pid) => pidCwd(pid));
    const portCwds = await Promise.all(portCwdPromises);

    for (const cwd of portCwds) {
      if (cwd == null) continue;
      const lockDir = join(cwd, '.ok', 'local');
      if (existsSync(lockDir)) {
        candidateDirs.add(lockDir);
      }
    }
  }

  const canonical = new Map<string, string>();
  for (const dir of candidateDirs) {
    try {
      const real = await realpath(dir);
      canonical.set(real, real);
    } catch {
      canonical.set(dir, dir);
    }
  }

  return [...canonical.values()];
}
