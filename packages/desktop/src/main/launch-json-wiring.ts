import { existsSync as fsExistsSync, readFileSync as fsReadFileSync } from 'node:fs';
import { join } from 'node:path';
import { scaffoldLaunchJson } from '@inkeep/open-knowledge';
import { wrapperPathInBundle } from './cli-install.ts';

interface LaunchJsonWiringFsOps {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
}

const defaultFsOps: LaunchJsonWiringFsOps = {
  existsSync: (path) => fsExistsSync(path),
  readFileSync: (path, encoding) => fsReadFileSync(path, encoding),
};

interface LaunchJsonWiringLogger {
  event(payload: { event: string; [key: string]: unknown }): void;
}

const DEFAULT_LOGGER: LaunchJsonWiringLogger = {
  event: (payload) => console.warn(JSON.stringify(payload)),
};

type LaunchJsonRepairResult =
  | { status: 'skipped'; reason: string }
  | { status: 'no-file'; configPath: string }
  | { status: 'no-token'; configPath: string }
  | { status: 'healthy-current'; configPath: string }
  | { status: 'repaired'; configPath: string }
  | { status: 'failed'; configPath: string; error: string };

interface CheckAndRepairLaunchJsonOpts {
  projectDir: string;
  executablePath: string;
  isPackaged: boolean;
  platform: 'darwin' | 'win32' | 'linux' | string;
  forceEnv?: string | null | undefined;
  reclaimDisableEnv?: string | null | undefined;
  fs?: LaunchJsonWiringFsOps;
  logger?: LaunchJsonWiringLogger;
}

const LAUNCH_CONFIG_NAME = 'open-knowledge-ui';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function argsMatch(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((v, i) => v === expected[i])
  );
}

export async function checkAndRepairLaunchJsonOnProjectOpen(
  opts: CheckAndRepairLaunchJsonOpts,
): Promise<LaunchJsonRepairResult> {
  const {
    projectDir,
    executablePath,
    isPackaged,
    platform,
    forceEnv,
    reclaimDisableEnv,
    fs = defaultFsOps,
    logger = DEFAULT_LOGGER,
  } = opts;
  const configPath = join(projectDir, '.claude', 'launch.json');
  if (reclaimDisableEnv === '1') return { status: 'skipped', reason: 'reclaim-disabled' };
  if (platform !== 'darwin') return { status: 'skipped', reason: 'platform' };
  if (!isPackaged && forceEnv !== '1') return { status: 'skipped', reason: 'dev-mode' };
  if (!/\.app\/Contents\/MacOS\/[^/]+$/.test(executablePath)) {
    return { status: 'skipped', reason: 'bad-executable-path' };
  }

  logger.event({ event: 'launch-json-wiring-repair-check-started', configPath });
  try {
    if (!fs.existsSync(configPath)) {
      logger.event({ event: 'launch-json-wiring-repair-no-file', configPath });
      return { status: 'no-file', configPath };
    }

    const raw = fs.readFileSync(configPath, 'utf8');
    let parsed: unknown;
    try {
      parsed = raw.trim() === '' ? {} : JSON.parse(raw);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.event({ event: 'launch-json-wiring-repair-read-failed', configPath, error });
      return { status: 'failed', configPath, error };
    }
    if (!isObject(parsed)) {
      logger.event({
        event: 'launch-json-wiring-repair-read-failed',
        configPath,
        error: 'launch.json root is not an object',
      });
      return { status: 'failed', configPath, error: 'launch.json root is not an object' };
    }
    const configs = Array.isArray(parsed.configurations) ? parsed.configurations : [];
    const existing = configs.find((entry) => isObject(entry) && entry.name === LAUNCH_CONFIG_NAME);
    if (!isObject(existing)) {
      logger.event({ event: 'launch-json-wiring-repair-no-token', configPath });
      return { status: 'no-token', configPath };
    }

    const cliPath = wrapperPathInBundle(executablePath);
    if (existing.runtimeExecutable === cliPath && argsMatch(existing.runtimeArgs, ['ui'])) {
      logger.event({ event: 'launch-json-wiring-repair-healthy-current', configPath });
      return { status: 'healthy-current', configPath };
    }

    const result = scaffoldLaunchJson(projectDir, { mode: 'published', cliPath });
    if (result.action === 'failed') {
      logger.event({
        event: 'launch-json-wiring-repair-write-failed',
        configPath,
        error: result.error ?? 'unknown',
      });
      return { status: 'failed', configPath, error: result.error ?? 'unknown' };
    }
    logger.event({
      event: 'launch-json-wiring-repair-reclaim-existing',
      configPath,
      priorRuntimeExecutable:
        typeof existing.runtimeExecutable === 'string'
          ? existing.runtimeExecutable.slice(0, 200)
          : null,
      priorRuntimeArgs: Array.isArray(existing.runtimeArgs)
        ? existing.runtimeArgs.slice(0, 10)
        : null,
    });
    return { status: 'repaired', configPath };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.event({ event: 'launch-json-wiring-repair-write-failed', configPath, error });
    return { status: 'failed', configPath, error };
  }
}
