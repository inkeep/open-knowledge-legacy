import { type SpawnOptions, spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir, platform as osPlatform } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type BuildSkillZipResult,
  buildSkillZip,
  resolveBundledSkillDir,
} from './build-skill-zip.ts';

export interface SkillInstallLogger {
  warn: (data: unknown, message: string) => void;
  info?: (data: unknown, message: string) => void;
}

export type SpawnLike = (
  command: string,
  args: readonly string[],
  opts: SpawnOptions,
) => ReturnType<typeof spawn>;

export interface InstallUserSkillOptions {
  home?: string;
  logger?: SkillInstallLogger;
  spawn?: SpawnLike;
  timeoutMs?: number;
}

export type InstallUserSkillResult = 'installed' | 'skip-current' | 'failed';

const SIDECAR_FILENAME = 'skill-installed-version';

const CENTRAL_SKILL_DIR_REL = ['.agents', 'skills', 'open-knowledge'] as const;

const SKILLS_CLI_SPEC = 'skills@~1.5.0';

const DEFAULT_TIMEOUT_MS = 60_000;

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

async function readServerPackageVersion(): Promise<string> {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const raw = await readFile(fileURLToPath(pkgUrl), 'utf-8');
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error('@inkeep/open-knowledge-server/package.json missing version field');
  }
  return parsed.version;
}

function sidecarPath(home: string): string {
  return join(home, '.ok', SIDECAR_FILENAME);
}

async function readSidecarVersion(home: string): Promise<string | null> {
  try {
    const raw = await readFile(sidecarPath(home), 'utf-8');
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (!VERSION_RE.test(trimmed)) return null;
    return trimmed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function writeSidecarVersion(home: string, version: string): Promise<void> {
  const path = sidecarPath(home);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${version}\n`, 'utf-8');
}

function centralSkillDir(home: string): string {
  return join(home, ...CENTRAL_SKILL_DIR_REL);
}

async function centralSkillExists(home: string): Promise<boolean> {
  try {
    const info = await stat(centralSkillDir(home));
    return info.isDirectory();
  } catch {
    return false;
  }
}

interface SpawnOutcome {
  kind: 'ok' | 'nonzero' | 'timeout' | 'spawn-error';
  exitCode?: number | null;
  stderr: string;
  error?: Error;
}

function runSpawn(
  spawnFn: SpawnLike,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<SpawnOutcome> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawnFn(command, args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ kind: 'spawn-error', stderr: '', error: err as Error });
      return;
    }

    let stderr = '';
    let settled = false;
    const settle = (outcome: SpawnOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      settle({ kind: 'spawn-error', stderr, error: err });
    });

    child.on('exit', (code) => {
      if (code === 0) settle({ kind: 'ok', exitCode: code, stderr });
      else settle({ kind: 'nonzero', exitCode: code, stderr });
    });

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {}
      settle({ kind: 'timeout', stderr });
    }, timeoutMs);
  });
}

export async function installUserSkill(
  opts: InstallUserSkillOptions = {},
): Promise<InstallUserSkillResult> {
  const home = opts.home ?? homedir();
  const logger: SkillInstallLogger = opts.logger ?? {
    warn: (data, message) => console.warn(message, data),
    info: (data, message) => console.info(message, data),
  };
  const spawnFn = opts.spawn ?? (spawn as SpawnLike);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let currentVersion: string;
  try {
    currentVersion = await readServerPackageVersion();
  } catch (err) {
    logger.warn(
      { event: 'skill-install.failed', reason: 'version-read-failed', error: String(err) },
      'Skill install aborted — could not read @inkeep/open-knowledge-server version.',
    );
    return 'failed';
  }

  const existingVersion = await readSidecarVersion(home).catch(() => null);
  if (existingVersion !== null && existingVersion === currentVersion) {
    if (await centralSkillExists(home)) {
      logger.info?.(
        { event: 'skill-install.skip-current', version: currentVersion },
        'Open Knowledge skill already installed at current version; skipping.',
      );
      return 'skip-current';
    }
    logger.info?.(
      {
        event: 'skill-install.reinstall-missing',
        version: currentVersion,
        path: centralSkillDir(home),
      },
      'Sidecar matches current version but skill files are missing; reinstalling.',
    );
  }

  let bundledDir: string;
  try {
    bundledDir = resolveBundledSkillDir();
  } catch (err) {
    logger.warn(
      {
        event: 'skill-install.failed',
        reason: 'bundled-asset-missing',
        error: String(err),
      },
      'Skill install aborted — bundled SKILL.md asset not found.',
    );
    return 'failed';
  }
  const args = ['-y', SKILLS_CLI_SPEC, 'add', bundledDir, '--agent', '*', '-g', '-y', '--copy'];
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };

  const outcome = await runSpawn(spawnFn, 'npx', args, env, timeoutMs);

  if (outcome.kind === 'ok') {
    try {
      await writeSidecarVersion(home, currentVersion);
    } catch (err) {
      logger.warn(
        { event: 'skill-install.failed', reason: 'sidecar-write-failed', error: String(err) },
        'Skill install succeeded but sidecar write failed.',
      );
      return 'failed';
    }
    logger.info?.(
      { event: 'skill-install.installed', version: currentVersion },
      'Open Knowledge skill installed to detected agent hosts.',
    );
    return 'installed';
  }

  if (outcome.kind === 'timeout') {
    logger.warn(
      { event: 'skill-install.failed', reason: 'timeout', timeoutMs, stderr: outcome.stderr },
      'Skill install subprocess timed out. Run manually: npx ' +
        `${SKILLS_CLI_SPEC} add ${bundledDir} --agent '*' -g -y --copy`,
    );
    return 'failed';
  }

  if (outcome.kind === 'spawn-error') {
    logger.warn(
      {
        event: 'skill-install.failed',
        reason: 'spawn-error',
        error: String(outcome.error),
        stderr: outcome.stderr,
      },
      'Skill install failed — `npx` unavailable or spawn errored. Run manually: npx ' +
        `${SKILLS_CLI_SPEC} add ${bundledDir} --agent '*' -g -y --copy`,
    );
    return 'failed';
  }

  logger.warn(
    {
      event: 'skill-install.failed',
      reason: 'nonzero-exit',
      exitCode: outcome.exitCode,
      stderr: outcome.stderr,
    },
    'Skill install subprocess exited non-zero. Run manually: npx ' +
      `${SKILLS_CLI_SPEC} add ${bundledDir} --agent '*' -g -y --copy`,
  );
  return 'failed';
}

const DOWNLOADS_DIR = 'Downloads';
const SKILL_FILENAME = 'openknowledge.skill';

export interface BuildAndOpenSkillOptions {
  out?: string;
  noOpen?: boolean;
  spawnFn?: SpawnLike;
  platformName?: NodeJS.Platform;
  homeDir?: string;
}

export type BuildAndOpenSkillStatus = 'installed' | 'built' | 'failed';

export interface BuildAndOpenSkillResult {
  status: BuildAndOpenSkillStatus;
  outputPath?: string;
  size?: number;
  sha256?: string;
  cliVersion?: string;
  skillVersion?: string;
  handoffError?: { reason: 'unsupported-platform' | 'spawn-error'; message: string };
  buildError?: string;
}

function defaultDownloadsPath(home: string): string {
  return join(home, DOWNLOADS_DIR, SKILL_FILENAME);
}

function invokeFileAssociation(
  skillPath: string,
  platformName: NodeJS.Platform,
  spawnFn: SpawnLike,
): { ok: true } | { ok: false; reason: 'unsupported-platform' | 'spawn-error'; message: string } {
  const detached: SpawnOptions = { detached: true, stdio: 'ignore' };
  try {
    if (platformName === 'darwin') {
      spawnFn('open', [skillPath], detached).unref();
      return { ok: true };
    }
    if (platformName === 'win32') {
      spawnFn('cmd', ['/c', 'start', '""', skillPath], detached).unref();
      return { ok: true };
    }
    if (platformName === 'linux') {
      spawnFn('xdg-open', [skillPath], detached).unref();
      return { ok: true };
    }
    return {
      ok: false,
      reason: 'unsupported-platform',
      message: `Platform '${platformName}' has no file-association invocation wired.`,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'spawn-error',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function buildAndOpenSkill(
  opts: BuildAndOpenSkillOptions = {},
): Promise<BuildAndOpenSkillResult> {
  const home = opts.homeDir ?? homedir();
  const outputPath = resolvePath(opts.out ?? defaultDownloadsPath(home));
  const platformName = opts.platformName ?? osPlatform();
  const spawnFn = opts.spawnFn ?? spawn;

  try {
    await mkdir(dirname(outputPath), { recursive: true });
  } catch (err) {
    return {
      status: 'failed',
      buildError: `could not create output directory: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let build: BuildSkillZipResult;
  try {
    build = await buildSkillZip({ outputPath, skipVersionCheck: true });
  } catch (err) {
    return {
      status: 'failed',
      buildError: err instanceof Error ? err.message : String(err),
    };
  }

  const baseResult: BuildAndOpenSkillResult = {
    status: 'built',
    outputPath: build.outputPath,
    size: build.size,
    sha256: build.sha256,
    cliVersion: build.cliVersion,
    skillVersion: build.skillVersion,
  };

  if (opts.noOpen) {
    return baseResult;
  }

  const invocation = invokeFileAssociation(build.outputPath, platformName, spawnFn);
  if (!invocation.ok) {
    return {
      ...baseResult,
      handoffError: { reason: invocation.reason, message: invocation.message },
    };
  }

  return { ...baseResult, status: 'installed' };
}
