/**
 * Resolve a browser-reachable URL for a given wiki docName, priority:
 *   env (OPEN_KNOWLEDGE_PREVIEW_BASE_URL) → lock (server.lock) → config (preview.baseUrl)
 *
 * Env wins so per-shell overrides (tunnels, CI) are explicit. Lock wins over
 * config so a local checkout of a cloud-deployed repo resolves to the running
 * local server, not the prod URL checked into `.open-knowledge/config.yml`.
 *
 * URL shape: `{baseUrl}/#/{docName}` with per-segment encodeURIComponent.
 * Matches the hash-route parser in `packages/app/src/lib/doc-hash.ts`.
 *
 * Returns null (never throws) when no source resolves. Malformed env/config
 * URLs fall through to the next source.
 */
import { readServerLock } from '@inkeep/open-knowledge-server';
import type { Config } from '../../config/schema.ts';

export type PreviewUrlSource = 'env' | 'lock' | 'config';

export interface PreviewUrlResult {
  url: string;
  source: PreviewUrlSource;
}

export interface PreviewUrlContext {
  config: Config;
  lockDir: string;
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
  //    browser-reachable; see SPEC.md D9)
  try {
    const lock = readServerLock(ctx.lockDir);
    if (lock && lock.port > 0) {
      return {
        url: `http://localhost:${lock.port}${hash}`,
        source: 'lock',
      };
    }
  } catch {
    // malformed / missing lock → fall through
  }

  // 3. config
  const configBase = ctx.config.preview?.baseUrl;
  if (configBase && isValidUrl(configBase)) {
    return { url: `${stripTrailingSlash(configBase)}${hash}`, source: 'config' };
  }

  return null;
}
