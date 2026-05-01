import { realpathSync } from 'node:fs';
import { resolveContentDir, resolveLockDir } from '../../config/paths.ts';
import type { Config } from '../../config/schema.ts';
import { readUiLock } from '../../ui-lock.ts';
import { type ConfigOrResolver, resolveConfig } from './shared.ts';

export type PreviewUrlSource = 'electron-protocol' | 'env' | 'lock' | 'config';

interface PreviewUrlResult {
  url: string;
  source: PreviewUrlSource;
}

interface PreviewUrlContext {
  config: Config;
  lockDir: string;
  contentDir?: string;
}

const ELECTRON_PROTOCOL_ENV_VAR = 'OK_ELECTRON_PROTOCOL_HOST';

export interface PreviewUrlDeps {
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
}

const ENV_VAR = 'OPEN_KNOWLEDGE_PREVIEW_BASE_URL';

function encodeDocName(docName: string): string {
  return docName.split('/').map(encodeURIComponent).join('/');
}

function stripTrailingSlash(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function isValidUrl(candidate: string): boolean {
  try {
    new URL(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePreviewUrlForTool(
  docName: string,
  deps: PreviewUrlDeps,
  cwd?: string,
): Promise<PreviewUrlResult | null> {
  const effectiveCwd = cwd ?? (await deps.resolveCwd());
  const config = await resolveConfig(deps.config, effectiveCwd);
  const contentDir = resolveContentDir(config, effectiveCwd);
  const lockDir = resolveLockDir(contentDir);
  return resolvePreviewUrl(docName, { config, lockDir, contentDir });
}

export interface UiInfo {
  baseUrl: string | null;
  port: number | null;
}

function resolveUiInfo(ctx: PreviewUrlContext): UiInfo {
  try {
    const lock = readUiLock(ctx.lockDir);
    if (lock && lock.port > 0) {
      return { baseUrl: `http://localhost:${lock.port}`, port: lock.port };
    }
  } catch (err) {
    process.stderr.write(
      `[preview-url] readUiLock failed at ${ctx.lockDir} while building ui block: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  return { baseUrl: null, port: null };
}

export async function buildListResolver(
  deps: PreviewUrlDeps,
  cwd?: string,
): Promise<{ resolve(docName: string): PreviewUrlResult | null; ui: UiInfo }> {
  const effectiveCwd = cwd ?? (await deps.resolveCwd());
  const config = await resolveConfig(deps.config, effectiveCwd);
  const contentDir = resolveContentDir(config, effectiveCwd);
  const lockDir = resolveLockDir(contentDir);
  const ctx: PreviewUrlContext = { config, lockDir, contentDir };
  return {
    resolve: (docName: string) => resolvePreviewUrl(docName, ctx),
    ui: resolveUiInfo(ctx),
  };
}

export function docNameFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.md')) return path.slice(0, -3);
  if (lower.endsWith('.mdx')) return path.slice(0, -4);
  return path;
}

export function resolvePreviewUrl(
  docName: string,
  ctx: PreviewUrlContext,
): PreviewUrlResult | null {
  const hash = `/#/${encodeDocName(docName)}`;

  if (process.env[ELECTRON_PROTOCOL_ENV_VAR] === '1' && ctx.contentDir) {
    try {
      const projectRealpath = realpathSync(ctx.contentDir);
      const url = `openknowledge://open?project=${encodeURIComponent(projectRealpath)}&doc=${encodeURIComponent(docName)}`;
      return { url, source: 'electron-protocol' };
    } catch (err) {
      process.stderr.write(
        `[preview-url] realpathSync failed for ${ctx.contentDir}, falling through to http sources: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  const envBase = process.env[ENV_VAR];
  if (envBase && isValidUrl(envBase)) {
    return { url: `${stripTrailingSlash(envBase)}${hash}`, source: 'env' };
  }

  try {
    const lock = readUiLock(ctx.lockDir);
    if (lock && lock.port > 0) {
      return {
        url: `http://localhost:${lock.port}${hash}`,
        source: 'lock',
      };
    }
  } catch (err) {
    process.stderr.write(
      `[preview-url] readUiLock failed at ${ctx.lockDir}, falling through to config: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  const configBase = ctx.config.preview?.baseUrl;
  if (configBase && isValidUrl(configBase)) {
    return { url: `${stripTrailingSlash(configBase)}${hash}`, source: 'config' };
  }

  return null;
}
