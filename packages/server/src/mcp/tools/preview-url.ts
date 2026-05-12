import { realpathSync } from 'node:fs';
import { resolveContentDir, resolveLockDir } from '../../config/paths.ts';
import { readUiLock } from '../../ui-lock.ts';
import { type ConfigOrResolver, resolveConfig } from './shared.ts';

export const PREVIEW_URL_SOURCES = ['electron-protocol', 'lock'] as const;
export type PreviewUrlSource = (typeof PREVIEW_URL_SOURCES)[number];

interface PreviewUrlResult {
  url: string;
  source: PreviewUrlSource;
}

interface PreviewUrlContext {
  lockDir: string;
  contentDir?: string;
}

const ELECTRON_PROTOCOL_ENV_VAR = 'OK_ELECTRON_PROTOCOL_HOST';

export interface PreviewUrlDeps {
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
}

function encodeDocName(docName: string): string {
  return docName.split('/').map(encodeURIComponent).join('/');
}

export async function resolvePreviewUrlForTool(
  docName: string,
  deps: PreviewUrlDeps,
  cwd?: string,
): Promise<PreviewUrlResult | null> {
  const effectiveCwd = cwd ?? (await deps.resolveCwd());
  const config = await resolveConfig(deps.config, effectiveCwd);
  const contentDir = resolveContentDir(config, effectiveCwd);
  const lockDir = resolveLockDir(effectiveCwd);
  return resolvePreviewUrl(docName, { lockDir, contentDir });
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
  const lockDir = resolveLockDir(effectiveCwd);
  const ctx: PreviewUrlContext = { lockDir, contentDir };
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
      `[preview-url] readUiLock failed at ${ctx.lockDir}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  return null;
}
