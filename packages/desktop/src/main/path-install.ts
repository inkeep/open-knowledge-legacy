import { spawn as nodeSpawn } from 'node:child_process';
import {
  accessSync as fsAccessSync,
  constants as fsConstants,
  existsSync as fsExistsSync,
  lstatSync as fsLstatSync,
  mkdirSync as fsMkdirSync,
  readFileSync as fsReadFileSync,
  readlinkSync as fsReadlinkSync,
  renameSync as fsRenameSync,
  symlinkSync as fsSymlinkSync,
  unlinkSync as fsUnlinkSync,
  writeFileSync as fsWriteFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { wrapperPathInBundle } from './cli-install.ts';

const NAMES = ['ok', 'open-knowledge'] as const;
const BEGIN = '# >>> open-knowledge cli >>>';
const END = '# <<< open-knowledge cli <<<';
const BLOCK_RE = /^# >>> open-knowledge cli >>>\n[\s\S]*?^# <<< open-knowledge cli <<<\n?/m;

interface PathInstallFsOps {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, content: string): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  unlinkSync(path: string): void;
  symlinkSync(target: string, path: string): void;
  renameSync(oldPath: string, newPath: string): void;
  readlinkSync(path: string): string;
  lstatSync(path: string): { isSymbolicLink(): boolean };
  accessSync(path: string, mode?: number): void;
}

const defaultFsOps: PathInstallFsOps = {
  existsSync: (path) => fsExistsSync(path),
  readFileSync: (path, encoding) => fsReadFileSync(path, encoding),
  writeFileSync: (path, content) => fsWriteFileSync(path, content),
  mkdirSync: (path, options) => fsMkdirSync(path, options),
  unlinkSync: (path) => fsUnlinkSync(path),
  symlinkSync: (target, path) => fsSymlinkSync(target, path),
  renameSync: (oldPath, newPath) => fsRenameSync(oldPath, newPath),
  readlinkSync: (path) => fsReadlinkSync(path),
  lstatSync: (path) => fsLstatSync(path),
  accessSync: (path, mode) => fsAccessSync(path, mode),
};

interface PathInstallLogger {
  event(payload: { event: string; [key: string]: unknown }): void;
}

const DEFAULT_LOGGER: PathInstallLogger = {
  event: (payload) => console.warn(JSON.stringify(payload)),
};

interface PathDiscovery {
  capturedAt: string;
  pathEntries: string[];
  shellUsed: string;
  okBinAlreadyOnPath: boolean;
}

interface PathInstallMarker {
  version: 1;
  installedAt: string;
  bundleVersion: string;
  bundleWrapperPath: string;
  binDir: string;
  envShimPath: string;
  rcFiles: string[];
  pathDiscovery: PathDiscovery | null;
  extraSymlinks: Array<{
    path: string;
    target: string;
    createdAt: string;
    kind: 'created' | 'refreshed-our-own';
  }>;
}

export type EnsureCliOnPathResult =
  | { status: 'skipped'; reason: string }
  | { status: 'healthy-current'; marker: PathInstallMarker }
  | { status: 'installed'; marker: PathInstallMarker; summary: string }
  | { status: 'failed-all'; error: string };

interface EnsureCliOnPathOpts {
  executablePath: string;
  isPackaged: boolean;
  platform: 'darwin' | 'win32' | 'linux' | string;
  forceEnv?: string | null | undefined;
  reclaimDisableEnv?: string | null | undefined;
  env?: Record<string, string | undefined>;
  home: string;
  bundleVersion: string;
  fs?: PathInstallFsOps;
  spawn?: (
    command: string,
    args: string[],
    opts: { timeoutMs: number; env: Record<string, string | undefined> },
  ) => Promise<{ code: number | null; stdout: string; stderr: string; timedOut?: boolean }>;
  logger?: PathInstallLogger;
  now?: () => Date;
}

export function pathInstallMarkerPath(home: string): string {
  return join(home, 'Library', 'Application Support', 'OpenKnowledge', 'path-install.json');
}

function readMarker(
  home: string,
  fs: PathInstallFsOps,
  logger: PathInstallLogger,
): PathInstallMarker | null {
  const path = pathInstallMarkerPath(home);
  if (!fs.existsSync(path)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(path, 'utf8')) as PathInstallMarker;
    return parsed?.version === 1 ? parsed : null;
  } catch (err) {
    logger.event({
      event: 'path-install-marker-read-failed',
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function writeMarker(home: string, marker: PathInstallMarker, fs: PathInstallFsOps): void {
  const path = pathInstallMarkerPath(home);
  fs.mkdirSync(dirname(path), { recursive: true });
  fs.writeFileSync(path, `${JSON.stringify(marker, null, 2)}\n`);
}

function okBin(home: string): string {
  return join(home, '.ok', 'bin');
}

function envShim(home: string): string {
  return join(home, '.ok', 'env.sh');
}

function block(): string {
  return `${BEGIN}\n# ! Contents within this block are managed by Open Knowledge. Do not edit.\n[ -f "$HOME/.ok/env.sh" ] && . "$HOME/.ok/env.sh"\n${END}\n`;
}

function fishBlock(): string {
  return `${BEGIN}\n# ! Contents within this block are managed by Open Knowledge. Do not edit.\nif test -d "$HOME/.ok/bin"\n  if not contains "$HOME/.ok/bin" $PATH\n    set -gx PATH "$HOME/.ok/bin" $PATH\n  end\nend\n${END}\n`;
}

function rcTargets(
  home: string,
  shell: string | undefined,
  fs: PathInstallFsOps,
): Array<{ path: string; create: boolean; content: string }> {
  const base = [
    { path: join(home, '.zshrc'), create: shell?.endsWith('/zsh') ?? false, content: block() },
    { path: join(home, '.bash_profile'), create: false, content: block() },
    {
      path: join(home, '.config', 'fish', 'conf.d', 'open-knowledge.fish'),
      create: true,
      content: fishBlock(),
    },
  ];
  return base.filter((t) => t.create || fs.existsSync(t.path));
}

function upsertBlock(path: string, content: string, fs: PathInstallFsOps): boolean {
  const prior = fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '';
  if (prior.includes(BEGIN) && prior.includes(END)) {
    const next = prior.replace(BLOCK_RE, content);
    if (next !== prior) fs.writeFileSync(path, next.endsWith('\n') ? next : `${next}\n`);
    return next !== prior;
  }
  fs.mkdirSync(dirname(path), { recursive: true });
  fs.writeFileSync(path, `${prior}${prior && !prior.endsWith('\n') ? '\n' : ''}${content}`);
  return true;
}

function rcBlockHealthy(path: string, fs: PathInstallFsOps): boolean {
  if (!fs.existsSync(path)) return false;
  const text = fs.readFileSync(path, 'utf8');
  return text.includes(BEGIN) && text.includes(END);
}

function linkPointsTo(path: string, target: string, fs: PathInstallFsOps): boolean {
  try {
    return fs.readlinkSync(path) === target;
  } catch {
    return false;
  }
}

function canonicalHealthy(home: string, wrapper: string, fs: PathInstallFsOps): boolean {
  return NAMES.every((name) => linkPointsTo(join(okBin(home), name), wrapper, fs));
}

function replaceSymlinkAtomic(link: string, wrapper: string, fs: PathInstallFsOps): void {
  const tmp = `${link}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.unlinkSync(tmp);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  fs.symlinkSync(wrapper, tmp);
  try {
    fs.renameSync(tmp, link);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {}
    throw err;
  }
}

function installCanonical(home: string, wrapper: string, fs: PathInstallFsOps): void {
  const bin = okBin(home);
  fs.mkdirSync(bin, { recursive: true });
  for (const name of NAMES) {
    replaceSymlinkAtomic(join(bin, name), wrapper, fs);
  }
}

async function defaultSpawn(
  command: string,
  args: string[],
  opts: { timeoutMs: number; env: Record<string, string | undefined> },
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; timedOut?: boolean }>(
    (resolve) => {
      const child = nodeSpawn(command, args, {
        env: opts.env as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        resolve({ code: null, stdout, stderr, timedOut: true });
      }, opts.timeoutMs);
      child.stdout.on('data', (d) => {
        stdout += String(d);
      });
      child.stderr.on('data', (d) => {
        stderr += String(d);
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ code: 1, stdout, stderr: err.message });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    },
  );
}

async function discoverRealInteractivePath(
  opts: EnsureCliOnPathOpts,
): Promise<PathDiscovery | null> {
  const env = opts.env ?? process.env;
  const shell = env.SHELL ?? '/bin/zsh';
  const spawn = opts.spawn ?? defaultSpawn;
  const logger = opts.logger ?? DEFAULT_LOGGER;
  try {
    const result = await spawn(shell, ['-ilc', 'printf %s "$PATH"'], { timeoutMs: 2000, env });
    if (result.code !== 0 || result.timedOut || !result.stdout) {
      logger.event({
        event: 'path-discovery-failed',
        shell,
        code: result.code,
        timedOut: result.timedOut ?? false,
      });
      return null;
    }
    const pathEntries = result.stdout.split(':').filter(Boolean);
    const binDir = okBin(opts.home);
    return {
      capturedAt: (opts.now?.() ?? new Date()).toISOString(),
      pathEntries,
      shellUsed: shell,
      okBinAlreadyOnPath: pathEntries.includes(binDir),
    };
  } catch (err) {
    logger.event({
      event: 'path-discovery-failed',
      shell,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function isSystemPathDir(dir: string): boolean {
  return /^\/usr\/(local\/)?s?bin$|^\/s?bin$|^\/opt\/homebrew\/s?bin$/.test(dir);
}

function isWritable(dir: string, fs: PathInstallFsOps): boolean {
  try {
    fs.accessSync(dir, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function classifyLink(
  path: string,
  currentWrapper: string,
  fs: PathInstallFsOps,
): 'empty' | 'our-current' | 'our-stale' | 'foreign' {
  try {
    const stat = fs.lstatSync(path);
    if (!stat.isSymbolicLink()) return 'foreign';
    const target = fs.readlinkSync(path);
    if (target === currentWrapper) return 'our-current';
    if (target.endsWith('.app/Contents/Resources/cli/bin/ok.sh')) return 'our-stale';
    return 'foreign';
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'empty' : 'foreign';
  }
}

function dropExtraSymlinks(
  opts: EnsureCliOnPathOpts,
  discovery: PathDiscovery,
  prior: PathInstallMarker | null,
  wrapper: string,
  fs: PathInstallFsOps,
  logger: PathInstallLogger,
) {
  const binDir = okBin(opts.home);
  const out: PathInstallMarker['extraSymlinks'] = [];
  const binIndex = discovery.pathEntries.indexOf(binDir);
  for (const dir of discovery.pathEntries) {
    if (dir === binDir || isSystemPathDir(dir) || !isWritable(dir, fs)) continue;
    for (const name of NAMES) {
      const link = join(dir, name);
      const kind = classifyLink(link, wrapper, fs);
      if (kind === 'empty' || kind === 'our-stale') {
        try {
          replaceSymlinkAtomic(link, wrapper, fs);
          out.push({
            path: link,
            target: wrapper,
            createdAt: (opts.now?.() ?? new Date()).toISOString(),
            kind: kind === 'empty' ? 'created' : 'refreshed-our-own',
          });
        } catch (err) {
          logger.event({
            event: 'path-install-extra-symlink-failed',
            path: link,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else if (
        kind === 'foreign' &&
        (binIndex === -1 || discovery.pathEntries.indexOf(dir) < binIndex)
      ) {
        logger.event({ event: 'path-install-foreign-shadows-ours', path: link });
      }
    }
  }
  for (const extra of prior?.extraSymlinks ?? []) {
    if (linkPointsTo(extra.path, extra.target, fs) && !out.some((e) => e.path === extra.path))
      out.push(extra);
  }
  return out;
}

function markerHealthy(
  marker: PathInstallMarker,
  home: string,
  wrapper: string,
  fs: PathInstallFsOps,
): boolean {
  if (marker.bundleWrapperPath !== wrapper) return false;
  if (!canonicalHealthy(home, wrapper, fs)) return false;
  if (!marker.rcFiles.every((file) => rcBlockHealthy(file, fs))) return false;
  if (!marker.extraSymlinks.every((s) => linkPointsTo(s.path, s.target, fs))) return false;
  return true;
}

export async function ensureCliOnPath(opts: EnsureCliOnPathOpts): Promise<EnsureCliOnPathResult> {
  const {
    executablePath,
    isPackaged,
    platform,
    forceEnv,
    reclaimDisableEnv,
    home,
    bundleVersion,
    fs = defaultFsOps,
    logger = DEFAULT_LOGGER,
  } = opts;
  if (reclaimDisableEnv === '1') return { status: 'skipped', reason: 'reclaim-disabled' };
  if (platform !== 'darwin') return { status: 'skipped', reason: 'platform' };
  if (!isPackaged && forceEnv !== '1') return { status: 'skipped', reason: 'dev-mode' };
  if (!/\.app\/Contents\/MacOS\/[^/]+$/.test(executablePath))
    return { status: 'skipped', reason: 'bad-executable-path' };

  const wrapper = wrapperPathInBundle(executablePath);
  const prior = readMarker(home, fs, logger);
  if (prior && markerHealthy(prior, home, wrapper, fs)) {
    logger.event({ event: 'path-install-healthy-current', binDir: prior.binDir });
    return { status: 'healthy-current', marker: prior };
  }

  let phase:
    | 'installCanonical'
    | 'writeEnvShim'
    | 'discoverPath'
    | 'upsertRcBlocks'
    | 'dropExtraSymlinks'
    | 'writeMarker' = 'installCanonical';
  try {
    logger.event({ event: 'path-install-check-started' });
    installCanonical(home, wrapper, fs);
    phase = 'writeEnvShim';
    const shim = envShim(home);
    fs.mkdirSync(dirname(shim), { recursive: true });
    fs.writeFileSync(
      shim,
      '# Open Knowledge CLI environment — managed file, do not edit.\ncase ":$' +
        '{PATH}:" in\n  *:"$' +
        '{HOME}/.ok/bin":*) ;;\n  *) export PATH="$' +
        '{HOME}/.ok/bin:$' +
        '{PATH}" ;;\nesac\n',
    );

    phase = 'discoverPath';
    const discovery = await discoverRealInteractivePath(opts);
    const targets = rcTargets(home, (opts.env ?? process.env).SHELL, fs);
    const canSkipRc =
      discovery?.okBinAlreadyOnPath === true &&
      prior?.rcFiles.every((file) => rcBlockHealthy(file, fs));
    phase = 'upsertRcBlocks';
    const rcFiles: string[] = [];
    if (canSkipRc && prior) {
      rcFiles.push(...prior.rcFiles);
    } else {
      for (const target of targets) {
        upsertBlock(target.path, target.content, fs);
        rcFiles.push(target.path);
      }
    }
    phase = 'dropExtraSymlinks';
    const extraSymlinks = discovery
      ? dropExtraSymlinks(opts, discovery, prior, wrapper, fs, logger)
      : [];
    phase = 'writeMarker';
    const marker: PathInstallMarker = {
      version: 1,
      installedAt: (opts.now?.() ?? new Date()).toISOString(),
      bundleVersion,
      bundleWrapperPath: wrapper,
      binDir: okBin(home),
      envShimPath: shim,
      rcFiles,
      pathDiscovery: discovery,
      extraSymlinks,
    };
    writeMarker(home, marker, fs);
    logger.event({ event: 'path-install-symlink-success', binDir: marker.binDir });
    if (rcFiles.length > 0) logger.event({ event: 'path-install-rc-append-success', rcFiles });
    return {
      status: 'installed',
      marker,
      summary:
        rcFiles.length > 0
          ? `Installed CLI shims and updated ${rcFiles.length} shell rc file(s).`
          : 'Installed CLI shims.',
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.event({ event: 'path-install-failed-all', phase, error });
    return { status: 'failed-all', error };
  }
}
