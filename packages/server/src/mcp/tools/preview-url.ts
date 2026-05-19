import { resolveLockDir } from '../../config/paths.ts';
import { readUiLock } from '../../ui-lock.ts';
import type { ConfigOrResolver } from './shared.ts';

export const PREVIEW_URL_SOURCES = ['lock'] as const;
export type PreviewUrlSource = (typeof PREVIEW_URL_SOURCES)[number];

interface PreviewUrlResult {
  url: string;
  source: PreviewUrlSource;
}

interface PreviewUrlContext {
  lockDir: string;
}

export interface PreviewUrlDeps {
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
}

function encodeDocName(docName: string): string {
  return docName.split('/').map(encodeURIComponent).join('/');
}

type PreviewAttachWarning =
  | {
      action: 'attach-preview-once';
      previewUrl: string;
      message: string;
    }
  | {
      action: 'start-ui';
      previewUrl: null;
      message: string;
    };

const START_UI_MESSAGE =
  'No UI is running for this project. Start one to see the preview: `open-knowledge ui` (terminal), `preview_start("open-knowledge-ui")` (Claude Code Desktop), or open the project in OK Electron.';
const ATTACH_PREVIEW_ONCE_MESSAGE = 'Open the previewUrl in your preview browser.';

export function buildPreviewAttachWarning(preview: { url: string } | null): PreviewAttachWarning {
  if (preview) {
    return {
      action: 'attach-preview-once',
      previewUrl: preview.url,
      message: ATTACH_PREVIEW_ONCE_MESSAGE,
    };
  }
  return {
    action: 'start-ui',
    previewUrl: null,
    message: START_UI_MESSAGE,
  };
}

export const START_UI_TEXT_HINT = START_UI_MESSAGE;

export async function resolvePreviewUrlForTool(
  docName: string,
  deps: PreviewUrlDeps,
  cwd?: string,
): Promise<PreviewUrlResult | null> {
  const effectiveCwd = cwd ?? (await deps.resolveCwd());
  const lockDir = resolveLockDir(effectiveCwd);
  return resolvePreviewUrl(docName, { lockDir });
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
  const lockDir = resolveLockDir(effectiveCwd);
  const ctx: PreviewUrlContext = { lockDir };
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
