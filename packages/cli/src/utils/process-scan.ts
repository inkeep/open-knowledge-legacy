import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';

const SPAWN_TIMEOUT_MS = 2000;
const OK_PROCESS_PGREP_QUERY =
  'cli\\.mjs|open-knowledge|(^|[ /])ok[ ]+(start|mcp|ui)([ ]|$)|packages/(cli|app)|hocuspocus|vite';

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
  const pgrepResult = spawnSync('pgrep', ['-a', '-f', OK_PROCESS_PGREP_QUERY], {
    encoding: 'utf-8',
    timeout: SPAWN_TIMEOUT_MS,
  });

  const pgrepUnavailable =
    pgrepResult.error != null && (pgrepResult.error as NodeJS.ErrnoException).code === 'ENOENT';

  if (!pgrepUnavailable) {
    const output = pgrepResult.stdout ?? '';
    const pids = parsePgrepOutput(output);
    if (pids.length > 0 || output.trim() === '') return pids;
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

export function extractOkBinaryPath(command: string): string | null {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token.startsWith('@')) continue;
    const base = basename(token);
    if (base === 'open-knowledge' || base === 'ok') return token;
    if (
      token.endsWith('/packages/cli/src/cli.ts') ||
      token.endsWith('/packages/cli/dist/cli.mjs')
    ) {
      return token;
    }
    if (base === 'cli.mjs' || base === 'cli.ts') return token;
  }
  return null;
}

export function processCommand(pid: number): string | null {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
    encoding: 'utf-8',
    timeout: SPAWN_TIMEOUT_MS,
  });

  if (result.error != null || !result.stdout) return null;
  return result.stdout.trim() || null;
}

export interface ProcessUsage {
  cpuPercent: number;
  memPercent: number;
}

export function processUsage(pid: number): ProcessUsage | null {
  const result = spawnSync('ps', ['-p', String(pid), '-o', '%cpu=,%mem='], {
    encoding: 'utf-8',
    timeout: SPAWN_TIMEOUT_MS,
  });

  if (result.error != null || !result.stdout) return null;
  const [cpuRaw, memRaw] = result.stdout.trim().split(/\s+/);
  const cpuPercent = Number.parseFloat(cpuRaw ?? '');
  const memPercent = Number.parseFloat(memRaw ?? '');
  if (Number.isNaN(cpuPercent) || Number.isNaN(memPercent)) return null;
  return { cpuPercent, memPercent };
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

  const addLockDirsForCwd = (cwd: string): void => {
    for (const lockDir of [
      join(cwd, '.ok', 'local'),
      join(cwd, '.ok'),
      join(cwd, '.open-knowledge'),
      join(cwd, '.openknowledge'),
    ]) {
      if (
        existsSync(lockDir) &&
        (existsSync(join(lockDir, 'server.lock')) || existsSync(join(lockDir, 'ui.lock')))
      ) {
        candidateDirs.add(lockDir);
      }
    }
  };

  const okPids = await findOkProcessPids();
  const cwdPromises = okPids.map((pid) => pidCwd(pid));
  const cwds = await Promise.all(cwdPromises);

  for (const cwd of cwds) {
    if (cwd == null) continue;
    addLockDirsForCwd(cwd);
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
      addLockDirsForCwd(cwd);
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
