/**
 * `open-knowledge update` (alias: `upgrade`) — update the installed CLI to the
 * latest version from npm.
 *
 * Flow:
 *   1. Read the current version from the CLI's own package.json.
 *   2. Query the npm registry for the `latest` dist-tag of @inkeep/open-knowledge.
 *   3. Compare versions and run the detected package manager's global install
 *      command if an update is available.
 *
 * The package is not yet published. Until it is, the command gracefully reports
 * `not-published` and exits without attempting an install. The scaffolding is
 * here so that once the first release is cut, no CLI changes are needed.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { accent, dim, error, info, success, warning } from '../ui/colors.ts';

const PACKAGE_NAME = '@inkeep/open-knowledge';
const REGISTRY_URL = 'https://registry.npmjs.org';
const SUPPORTED_PMS = ['npm', 'bun', 'pnpm', 'yarn'] as const;

export type PackageManager = (typeof SUPPORTED_PMS)[number];

export interface UpdateCommandOptions {
  /** Check for updates without installing. */
  check?: boolean;
  /** Override the auto-detected package manager. */
  pm?: PackageManager;
  /** Override the registry URL (test seam). */
  registryUrl?: string;
  /** Override the fetch implementation (test seam). */
  fetchImpl?: typeof fetch;
  /** Override the execSync implementation (test seam). */
  execImpl?: (cmd: string) => void;
}

export type UpdateAction = 'checked' | 'installed' | 'up-to-date' | 'not-published' | 'failed';

export interface UpdateCommandResult {
  current: string;
  latest?: string;
  action: UpdateAction;
  packageManager: PackageManager;
  installCommand?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Version source — read from the CLI's own package.json at runtime.
// Works both from source (packages/cli/src/commands/update.ts) and from the
// built artifact (packages/cli/dist/commands/update.mjs), since ../../ lands
// on package.json in both cases.
// ---------------------------------------------------------------------------

export function readCliVersion(): string {
  const pkgUrl = new URL('../../package.json', import.meta.url);
  const raw = readFileSync(fileURLToPath(pkgUrl), 'utf-8');
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== 'string') {
    throw new Error('CLI package.json is missing a "version" field');
  }
  return parsed.version;
}

// ---------------------------------------------------------------------------
// Package manager detection
// ---------------------------------------------------------------------------

export function detectPackageManager(env: NodeJS.ProcessEnv = process.env): PackageManager {
  const ua = env.npm_config_user_agent ?? '';
  if (ua.startsWith('bun')) return 'bun';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  return 'npm';
}

export function getInstallCommand(pm: PackageManager, pkg: string): string {
  switch (pm) {
    case 'bun':
      return `bun add -g ${pkg}@latest`;
    case 'pnpm':
      return `pnpm add -g ${pkg}@latest`;
    case 'yarn':
      return `yarn global add ${pkg}@latest`;
    case 'npm':
      return `npm install -g ${pkg}@latest`;
  }
}

// ---------------------------------------------------------------------------
// Semver compare (stable-release only — prerelease tags are treated as equal
// to their base version for the purposes of "is there something newer").
// ---------------------------------------------------------------------------

export function compareVersions(a: string, b: string): number {
  const parse = (v: string): [number, number, number] => {
    const [core = '0.0.0'] = v.replace(/^v/, '').split('-');
    const [maj = 0, min = 0, pat = 0] = core.split('.').map((n) => Number(n) || 0);
    return [maj, min, pat];
  };
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
}

// ---------------------------------------------------------------------------
// Registry query
// ---------------------------------------------------------------------------

export async function fetchLatestVersion(params: {
  packageName: string;
  registryUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<string | undefined> {
  const { packageName, registryUrl = REGISTRY_URL, fetchImpl = fetch } = params;
  // Scoped packages keep the `@` but the `/` is a path separator — do not
  // URL-encode the whole name.
  const url = `${registryUrl}/${packageName}/latest`;
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json' },
  });
  if (res.status === 404) return undefined;
  if (!res.ok) {
    throw new Error(`Registry returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { version?: unknown };
  if (typeof data.version !== 'string') {
    throw new Error('Registry response is missing a "version" field');
  }
  return data.version;
}

// ---------------------------------------------------------------------------
// Core update logic
// ---------------------------------------------------------------------------

export async function runUpdate(options: UpdateCommandOptions = {}): Promise<UpdateCommandResult> {
  const pm = options.pm ?? detectPackageManager();
  const installCommand = getInstallCommand(pm, PACKAGE_NAME);

  let current: string;
  try {
    current = readCliVersion();
  } catch (err) {
    return {
      current: '0.0.0',
      action: 'failed',
      packageManager: pm,
      installCommand,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  let latest: string | undefined;
  try {
    latest = await fetchLatestVersion({
      packageName: PACKAGE_NAME,
      registryUrl: options.registryUrl,
      fetchImpl: options.fetchImpl,
    });
  } catch (err) {
    return {
      current,
      action: 'failed',
      packageManager: pm,
      installCommand,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (latest === undefined) {
    return {
      current,
      action: 'not-published',
      packageManager: pm,
      installCommand,
    };
  }

  const upToDate = compareVersions(current, latest) >= 0;

  if (upToDate) {
    return {
      current,
      latest,
      action: 'up-to-date',
      packageManager: pm,
      installCommand,
    };
  }

  if (options.check) {
    return {
      current,
      latest,
      action: 'checked',
      packageManager: pm,
      installCommand,
    };
  }

  try {
    const exec = options.execImpl ?? ((cmd: string) => execSync(cmd, { stdio: 'inherit' }));
    exec(installCommand);
    return {
      current,
      latest,
      action: 'installed',
      packageManager: pm,
      installCommand,
    };
  } catch (err) {
    return {
      current,
      latest,
      action: 'failed',
      packageManager: pm,
      installCommand,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatUpdateResult(result: UpdateCommandResult): string {
  const lines: string[] = [];
  lines.push(`${dim('Installed:')} ${accent(result.current)}`);

  switch (result.action) {
    case 'not-published':
      lines.push(warning(`${PACKAGE_NAME} is not yet published to npm.`));
      lines.push(dim('Re-run this command once the first release is available.'));
      break;
    case 'up-to-date':
      lines.push(`${dim('Latest:   ')} ${accent(result.latest ?? '')}`);
      lines.push(success('Already up to date.'));
      break;
    case 'checked':
      lines.push(`${dim('Latest:   ')} ${accent(result.latest ?? '')}`);
      lines.push(warning('A newer version is available.'));
      if (result.installCommand) {
        lines.push(`Run: ${info(result.installCommand)}`);
      }
      break;
    case 'installed':
      lines.push(`${dim('Latest:   ')} ${accent(result.latest ?? '')}`);
      lines.push(success(`Updated via ${result.packageManager}.`));
      break;
    case 'failed':
      lines.push(error(`Update failed: ${result.error ?? 'unknown error'}`));
      if (result.installCommand) {
        lines.push(dim(`You can retry manually: ${result.installCommand}`));
      }
      break;
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Commander wiring
// ---------------------------------------------------------------------------

function parsePmFlag(value: string): PackageManager {
  if ((SUPPORTED_PMS as readonly string[]).includes(value)) {
    return value as PackageManager;
  }
  throw new Error(
    `Unknown package manager: ${value}. Expected one of: ${SUPPORTED_PMS.join(', ')}.`,
  );
}

export function updateCommand(): Command {
  return new Command('update')
    .alias('upgrade')
    .description('Update open-knowledge to the latest version from npm')
    .option('--check', 'Check for a newer version without installing')
    .option(
      '--pm <manager>',
      `Package manager to use (${SUPPORTED_PMS.join(' | ')}). Auto-detected if omitted.`,
    )
    .action(async (opts: { check?: boolean; pm?: string }) => {
      let pm: PackageManager | undefined;
      if (opts.pm !== undefined) {
        try {
          pm = parsePmFlag(opts.pm);
        } catch (err) {
          process.stderr.write(`${error(err instanceof Error ? err.message : String(err))}\n`);
          process.exitCode = 1;
          return;
        }
      }

      const result = await runUpdate({ check: opts.check, pm });
      process.stdout.write(`${formatUpdateResult(result)}\n`);
      if (result.action === 'failed') {
        process.exitCode = 1;
      }
    });
}
