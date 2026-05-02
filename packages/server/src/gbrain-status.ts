import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

export const GBRAIN_STATUS_CACHE_TTL_MS = 30_000;
export const GBRAIN_STATUS_TIMEOUT_MS = 2_000;

export type GBrainStatus =
  | { state: 'not-installed'; message: string }
  | { state: 'not-configured'; message: string; diagnostic?: string }
  | { state: 'not-registered'; projectPath: string; message: string }
  | { state: 'matched'; sourceId: string; sourceName: string; localPath: string }
  | {
      state: 'error';
      code: 'timeout' | 'invalid-json' | 'gbrain-error' | 'realpath-failed';
      message: string;
      diagnostic?: string;
    };

export interface GBrainSource {
  id: string;
  name: string;
  localPath: string | null;
  federated?: boolean;
  pageCount?: number;
  lastSyncAt?: string | null;
}

export interface GBrainCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  signal?: NodeJS.Signals | null;
  errorCode?: string;
  timedOut?: boolean;
}

export type GBrainCommandRunner = (
  args: readonly string[],
  options: { timeoutMs: number },
) => Promise<GBrainCommandResult>;

export type GBrainRealpath = (path: string) => Promise<string>;

export interface GBrainStatusDetector {
  getStatus(projectPath: string, options?: { refresh?: boolean }): Promise<GBrainStatus>;
  clearCache(projectPath?: string): Promise<void>;
}

interface CreateGBrainStatusDetectorOptions {
  run?: GBrainCommandRunner;
  realpath?: GBrainRealpath;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
}

class InvalidGBrainJsonError extends Error {}

export function parseGBrainSourcesJson(stdout: string): GBrainSource[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new InvalidGBrainJsonError(err instanceof Error ? err.message : String(err));
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { sources?: unknown }).sources)
  ) {
    throw new InvalidGBrainJsonError('expected object with sources array');
  }

  const sources: GBrainSource[] = [];
  for (const rawSource of (parsed as { sources: unknown[] }).sources) {
    if (typeof rawSource !== 'object' || rawSource === null) continue;
    const source = rawSource as Record<string, unknown>;
    const id = typeof source.id === 'string' && source.id.trim() !== '' ? source.id : null;
    if (id === null) continue;
    const name = typeof source.name === 'string' && source.name.trim() !== '' ? source.name : id;
    const localPath =
      typeof source.local_path === 'string' && source.local_path.trim() !== ''
        ? source.local_path
        : null;
    const federated = typeof source.federated === 'boolean' ? source.federated : undefined;
    const pageCount = typeof source.page_count === 'number' ? source.page_count : undefined;
    const lastSyncAt =
      typeof source.last_sync_at === 'string' || source.last_sync_at === null
        ? source.last_sync_at
        : undefined;

    sources.push({ id, name, localPath, federated, pageCount, lastSyncAt });
  }

  return sources;
}

export async function createDefaultGBrainCommandRunner(
  args: readonly string[],
  options: { timeoutMs: number },
): Promise<GBrainCommandResult> {
  return new Promise((resolveResult) => {
    let settled = false;
    let timedOut = false;
    let stdout = '';
    let stderr = '';

    const child = spawn('gbrain', [...args], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const settle = (result: GBrainCommandResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveResult(result);
    };

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 100).unref();
    }, options.timeoutMs);
    timeout.unref();

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      settle({
        exitCode: null,
        stdout,
        stderr,
        errorCode: err.code,
        timedOut,
      });
    });
    child.on('close', (exitCode, signal) => {
      settle({ exitCode, signal, stdout, stderr, timedOut });
    });
  });
}

export function createGBrainStatusDetector(
  options: CreateGBrainStatusDetectorOptions = {},
): GBrainStatusDetector {
  const run = options.run ?? createDefaultGBrainCommandRunner;
  const resolveRealpath = options.realpath ?? realpath;
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? GBRAIN_STATUS_CACHE_TTL_MS;
  const timeoutMs = options.timeoutMs ?? GBRAIN_STATUS_TIMEOUT_MS;
  const cache = new Map<string, { expiresAt: number; status: GBrainStatus }>();

  const normalizePath = async (path: string): Promise<string> =>
    resolve(await resolveRealpath(resolve(path)));

  const safeNormalizePath = async (path: string): Promise<string | null> => {
    try {
      return await normalizePath(path);
    } catch {
      return null;
    }
  };

  const detect = async (
    projectPath: string,
    normalizedProjectPath: string,
  ): Promise<GBrainStatus> => {
    const version = await run(['--version'], { timeoutMs });
    const versionFailure = classifyCommandFailure(version);
    if (versionFailure === 'timeout') return timeoutStatus();
    if (versionFailure === 'not-installed') return notInstalledStatus();
    if (versionFailure !== null) {
      return gbrainErrorStatus('gbrain version probe failed', version);
    }

    const sourcesResult = await run(['sources', 'list', '--json'], { timeoutMs });
    const sourcesFailure = classifyCommandFailure(sourcesResult);
    if (sourcesFailure === 'timeout') return timeoutStatus();
    if (sourcesFailure === 'not-installed') return notInstalledStatus();
    if (sourcesFailure !== null) {
      if (isNotConfiguredFailure(sourcesResult)) {
        return {
          state: 'not-configured',
          message: 'gbrain is installed, but sources are not configured.',
          diagnostic: compactDiagnostic(sourcesResult),
        };
      }
      return gbrainErrorStatus('gbrain source detection failed.', sourcesResult);
    }

    let sources: GBrainSource[];
    try {
      sources = parseGBrainSourcesJson(sourcesResult.stdout);
    } catch (err) {
      return {
        state: 'error',
        code: 'invalid-json',
        message: 'gbrain returned an unexpected sources response.',
        diagnostic: err instanceof Error ? err.message : String(err),
      };
    }

    for (const source of sources) {
      if (source.localPath === null) continue;
      const normalizedSourcePath = await safeNormalizePath(source.localPath);
      if (normalizedSourcePath === normalizedProjectPath) {
        return {
          state: 'matched',
          sourceId: source.id,
          sourceName: source.name,
          localPath: normalizedSourcePath,
        };
      }
    }

    const legacyResult = await run(['config', 'get', 'sync.repo_path'], { timeoutMs });
    const legacyFailure = classifyCommandFailure(legacyResult);
    if (legacyFailure === 'timeout') return timeoutStatus();
    if (legacyFailure === null) {
      const legacyPath = legacyResult.stdout.trim();
      const normalizedLegacyPath = legacyPath === '' ? null : await safeNormalizePath(legacyPath);
      if (normalizedLegacyPath === normalizedProjectPath) {
        return {
          state: 'matched',
          sourceId: 'default',
          sourceName: 'default',
          localPath: normalizedLegacyPath,
        };
      }
    }

    return {
      state: 'not-registered',
      projectPath: normalizedProjectPath || projectPath,
      message: 'This folder is not registered as a gbrain source.',
    };
  };

  return {
    async getStatus(projectPath, requestOptions = {}) {
      let normalizedProjectPath: string;
      try {
        normalizedProjectPath = await normalizePath(projectPath);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        return {
          state: 'error',
          code: 'realpath-failed',
          message: 'Could not resolve the current project path.',
          diagnostic: code ?? (err instanceof Error ? err.message : String(err)),
        };
      }

      const cached = cache.get(normalizedProjectPath);
      if (requestOptions.refresh !== true && cached !== undefined && cached.expiresAt > now()) {
        return cached.status;
      }

      const status = await detect(projectPath, normalizedProjectPath);
      cache.set(normalizedProjectPath, { expiresAt: now() + ttlMs, status });
      return status;
    },

    async clearCache(projectPath) {
      if (projectPath === undefined) {
        cache.clear();
        return;
      }
      const normalizedProjectPath = await safeNormalizePath(projectPath);
      if (normalizedProjectPath !== null) cache.delete(normalizedProjectPath);
    },
  };
}

function classifyCommandFailure(
  result: GBrainCommandResult,
): 'timeout' | 'not-installed' | 'failed' | null {
  if (result.timedOut === true) return 'timeout';
  if (result.errorCode === 'ENOENT') return 'not-installed';
  if (result.errorCode !== undefined) return 'failed';
  if (result.exitCode !== 0) return 'failed';
  return null;
}

function notInstalledStatus(): GBrainStatus {
  return {
    state: 'not-installed',
    message: 'gbrain is not installed.',
  };
}

function timeoutStatus(): GBrainStatus {
  return {
    state: 'error',
    code: 'timeout',
    message: 'gbrain did not respond in time.',
  };
}

function gbrainErrorStatus(message: string, result: GBrainCommandResult): GBrainStatus {
  return {
    state: 'error',
    code: 'gbrain-error',
    message,
    diagnostic: compactDiagnostic(result),
  };
}

function isNotConfiguredFailure(result: GBrainCommandResult): boolean {
  const diagnostic = `${result.stderr}\n${result.stdout}`.toLowerCase();
  return (
    diagnostic.includes('no brain configured') ||
    diagnostic.includes('not configured') ||
    diagnostic.includes('not initialized') ||
    diagnostic.includes('run: gbrain init')
  );
}

function compactDiagnostic(result: GBrainCommandResult): string | undefined {
  const stderr = result.stderr.trim();
  if (stderr !== '') return stderr;
  const stdout = result.stdout.trim();
  if (stdout !== '') return stdout;
  if (result.errorCode !== undefined) return result.errorCode;
  if (result.exitCode !== null) return `exit ${result.exitCode}`;
  return undefined;
}
