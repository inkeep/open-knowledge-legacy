import { type SpawnOptions, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBundledSkillDir } from './build-skill-zip.ts';

/**
 * Minimal logger duck-type accepted by `installUserSkill`. Compatible with
 * `PinoLogger` (`warn(data, message)`) and ad-hoc console-style shims.
 */
export interface SkillInstallLogger {
  warn: (data: unknown, message: string) => void;
  info?: (data: unknown, message: string) => void;
}

/**
 * Minimal signature of `node:child_process`'s `spawn` — the subset this
 * module actually calls. Injectable so unit tests can replace with a
 * deterministic fake subprocess.
 */
export type SpawnLike = (
  command: string,
  args: readonly string[],
  opts: SpawnOptions,
) => ReturnType<typeof spawn>;

export interface InstallUserSkillOptions {
  /**
   * Override `$HOME`. Sidecar path becomes `${home}/.open-knowledge/skill-installed-version`
   * and `HOME` env var is overridden for the `npx skills` subprocess so it writes
   * per-host skill copies under the overridden home. Tests pass a tmpdir here.
   */
  home?: string;
  /** Optional logger. Falls back to `console.warn` / `console.info`. */
  logger?: SkillInstallLogger;
  /**
   * Inject a `spawn`-like function for unit tests. Defaults to `node:child_process#spawn`.
   * Production callers never pass this.
   */
  spawn?: SpawnLike;
  /**
   * Subprocess timeout in milliseconds. Defaults to 60_000 (60 s) per SPEC FR6.
   * Tests may lower this for faster coverage.
   */
  timeoutMs?: number;
}

export type InstallUserSkillResult = 'installed' | 'skip-current' | 'failed';

/** Sidecar filename — plain version string + trailing newline. SPEC D5/FR7. */
const SIDECAR_FILENAME = 'skill-installed-version';

/** Pinned patch-range for the `skills` CLI. SPEC D16. */
const SKILLS_CLI_SPEC = 'skills@~1.5.0';

/** Subprocess timeout default. SPEC FR6. */
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Match a plain semver-ish version string (digits + dots + optional prerelease).
 * Empty / malformed sidecar content falls through the test and is treated as
 * "fresh install" per SPEC FR7.
 */
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
  return join(home, '.open-knowledge', SIDECAR_FILENAME);
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
      // ENOENT on `npx` itself surfaces here.
      settle({ kind: 'spawn-error', stderr, error: err });
    });

    child.on('exit', (code) => {
      if (code === 0) settle({ kind: 'ok', exitCode: code, stderr });
      else settle({ kind: 'nonzero', exitCode: code, stderr });
    });

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already exited */
      }
      settle({ kind: 'timeout', stderr });
    }, timeoutMs);
  });
}

/**
 * Install Open Knowledge's user-global Agent Skill to every detected agent host
 * via `npx skills@~1.5.0 add <bundled-path> --agent '*' -g -y --copy`.
 *
 * Idempotency: a plain version-string sidecar at
 * `${home}/.open-knowledge/skill-installed-version` gates re-install. If the
 * sidecar matches the current `@inkeep/open-knowledge-server` package version,
 * the subprocess is NOT invoked and `'skip-current'` is returned.
 *
 * Always resolves (never throws). Non-zero exit, timeout, or spawn error logs
 * a warning via `opts.logger` (or `console.warn`) and returns `'failed'`.
 *
 * See SPEC `specs/2026-04-22-mcp-guidance-no-project-pollution/SPEC.md` §6
 * (FR5-FR9) and §10 (D4-D6, D15-D19) for the full contract.
 */
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
    logger.info?.(
      { event: 'skill-install.skip-current', version: currentVersion },
      'Open Knowledge skill already installed at current version; skipping.',
    );
    return 'skip-current';
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

  // nonzero
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
