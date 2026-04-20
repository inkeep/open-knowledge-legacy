/**
 * Resolve a browser-reachable URL for a given wiki docName, priority:
 *   env (OPEN_KNOWLEDGE_PREVIEW_BASE_URL) → lock (ui.lock) → config (preview.baseUrl)
 *
 * Env wins so per-shell overrides (tunnels, CI) are explicit. Lock wins over
 * config so a local checkout of a cloud-deployed repo resolves to the running
 * local UI, not the prod URL checked into `.open-knowledge/config.yml`.
 *
 * The lock branch reads `ui.lock` (the `ok ui` process), not `server.lock`
 * (the `ok start` collab process), because preview URLs must point at the
 * React app — that's what the preview pane renders. See SPEC.md FR-2.4, D-015.
 *
 * URL shape: `{baseUrl}/#/{docName}` with per-segment encodeURIComponent.
 * Matches the hash-route parser in `packages/app/src/lib/doc-hash.ts`.
 *
 * Returns null (never throws) when no source resolves. Malformed env/config
 * URLs fall through to the next source.
 */
import { readUiLock } from '@inkeep/open-knowledge-server';
import { resolveContentDir, resolveLockDir } from '../../config/paths.ts';
import type { Config } from '../../config/schema.ts';
import { type ConfigOrResolver, resolveConfig } from './shared.ts';

export type PreviewUrlSource = 'env' | 'lock' | 'config';

interface PreviewUrlResult {
  url: string;
  source: PreviewUrlSource;
}

interface PreviewUrlContext {
  config: Config;
  lockDir: string;
}

/**
 * Common deps shape for MCP tool handlers that need to resolve preview URLs.
 * `resolveCwd` is the per-call cwd resolver (see `ResolveCwd` in tools/index.ts);
 * `config` supplies `content.dir` for lockDir derivation plus `preview.baseUrl`
 * fallback.
 */
export interface PreviewUrlDeps {
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
}

const ENV_VAR = 'OPEN_KNOWLEDGE_PREVIEW_BASE_URL';

/** Encode a docName into the hash fragment, per-segment. */
function encodeDocName(docName: string): string {
  return docName.split('/').map(encodeURIComponent).join('/');
}

/** Strip a trailing slash so `base + '/#/' + docName` doesn't produce `//#/`. */
function stripTrailingSlash(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

/** Returns true when the string parses as a URL. Never throws. */
function isValidUrl(candidate: string): boolean {
  try {
    new URL(candidate);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convenience wrapper for MCP tool handlers: resolves cwd via `deps.resolveCwd`,
 * derives lockDir via `resolveContentDir` + `resolveLockDir`, then delegates to
 * `resolvePreviewUrl`. Keeps the "cwd → lockDir → resolve" boilerplate in one
 * place so all single-doc tools (FR-2.1) emit previewUrl the same way.
 */
export async function resolvePreviewUrlForTool(
  docName: string,
  deps: PreviewUrlDeps,
  cwd?: string,
): Promise<PreviewUrlResult | null> {
  const effectiveCwd = cwd ?? (await deps.resolveCwd());
  const config = await resolveConfig(deps.config, effectiveCwd);
  const lockDir = resolveLockDir(resolveContentDir(config, effectiveCwd));
  return resolvePreviewUrl(docName, { config, lockDir });
}

/**
 * Top-level UI info emitted alongside list-producing tool responses per FR-2.6.
 * `baseUrl` is the browser-reachable origin of the `ok ui` process; `port`
 * mirrors the same number for convenience. Both are null when the UI lock is
 * absent / stale / unbound.
 */
export interface UiInfo {
  baseUrl: string | null;
  port: number | null;
}

/**
 * Pure helper: given a resolved lockDir + config, return the UI origin if the
 * lock points at a live, bound UI process. Never throws.
 */
export function resolveUiInfo(ctx: PreviewUrlContext): UiInfo {
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

/**
 * Per-call helper for list-producing tools (FR-2.2). Resolves cwd once, then
 * returns a `resolve(docName)` closure plus the top-level `ui` block for the
 * response. Every row in a list response is enriched by calling `resolve(...)`;
 * the `ui` block is attached once at the top-level.
 *
 * Docs tools call this once per invocation, then thread the returned `resolve`
 * over their result rows. Keeps the cwd/lockDir derivation out of tight loops.
 */
export async function buildListResolver(
  deps: PreviewUrlDeps,
  cwd?: string,
): Promise<{ resolve(docName: string): PreviewUrlResult | null; ui: UiInfo }> {
  const effectiveCwd = cwd ?? (await deps.resolveCwd());
  const config = await resolveConfig(deps.config, effectiveCwd);
  const lockDir = resolveLockDir(resolveContentDir(config, effectiveCwd));
  const ctx: PreviewUrlContext = { config, lockDir };
  return {
    resolve: (docName: string) => resolvePreviewUrl(docName, ctx),
    ui: resolveUiInfo(ctx),
  };
}

/**
 * Normalize a file path (possibly with `.md` / `.mdx`) to an extension-less
 * docName suitable for previewUrl resolution. Falls back to the input
 * unchanged for extension-less paths (matches `normalizeDocName` policy).
 */
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

  // 1. env
  const envBase = process.env[ENV_VAR];
  if (envBase && isValidUrl(envBase)) {
    return { url: `${stripTrailingSlash(envBase)}${hash}`, source: 'env' };
  }

  // 2. lock (always uses localhost — lock.hostname is the OS hostname, not
  //    browser-reachable; see SPEC.md D9). Reads ui.lock (the React app) per
  //    FR-2.4; server.lock points at collab-only in the post-split lifecycle.
  try {
    const lock = readUiLock(ctx.lockDir);
    if (lock && lock.port > 0) {
      return {
        url: `http://localhost:${lock.port}${hash}`,
        source: 'lock',
      };
    }
  } catch (err) {
    // Lock file exists but is corrupt or unreadable. Fall through to config,
    // but surface the error for operators debugging "why won't the preview
    // URL resolve?" — otherwise this path is invisible.
    process.stderr.write(
      `[preview-url] readUiLock failed at ${ctx.lockDir}, falling through to config: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  // 3. config
  const configBase = ctx.config.preview?.baseUrl;
  if (configBase && isValidUrl(configBase)) {
    return { url: `${stripTrailingSlash(configBase)}${hash}`, source: 'config' };
  }

  return null;
}
