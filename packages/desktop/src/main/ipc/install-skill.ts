/**
 * IPC handler implementations for the Cowork skill install dialog (SPEC
 * 2026-04-24 Ship 1e).
 *
 * Exposes two channels to the renderer:
 *   - `ok:skill:detect-claude-desktop` — boolean, via `detectClaudeDesktopPresence`
 *   - `ok:skill:download-and-open`     — fetch + save + invoke OS file association
 *
 * Follows the same pure-injectable shape as `ipc/seed.ts`: each function takes
 * an explicit `deps` object and returns the channel result. Registration
 * (binding to `ipcMain.handle` via `createHandler`) happens in `main/index.ts`
 * per D19.
 *
 * The download-and-open handler is what unlocks the 2-click install UX:
 *   User clicks Install → we download the .skill → shell.openPath invokes
 *   Claude.app via its CFBundleDocumentType registration → Claude's native
 *   install dialog appears → user clicks Install → done.
 *
 * We deliberately do NOT show a progress bar or status updates — the download
 * is 10 KB and the handoff to Claude happens in <1s. Any UI latency would be
 * slower than the actual operation.
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { detectClaudeDesktopPresence } from '@inkeep/open-knowledge-server';
import type { App, Shell } from 'electron';

export type DownloadAndOpenResult =
  | { ok: true; path: string }
  | {
      ok: false;
      reason:
        | 'invalid-url'
        | 'download-failed'
        | 'write-failed'
        | 'open-failed'
        | 'no-downloads-dir';
      message?: string;
    };

interface InstallSkillIpcDeps {
  /** Inject `electron.app` so tests can supply a fake downloads path. */
  app: Pick<App, 'getPath'>;
  /** Inject `electron.shell` so tests can assert on `openPath` calls. */
  shell: Pick<Shell, 'openPath'>;
  /** Inject `fetch` for tests. Defaults to global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * `ok:skill:detect-claude-desktop` handler — returns true when Claude Desktop's
 * config directory is present. Reuses the shared helper from the server
 * package so init's Cowork-hint logic and the Electron dialog gate on the
 * same signal.
 */
export async function handleDetectClaudeDesktop(): Promise<boolean> {
  return detectClaudeDesktopPresence();
}

/**
 * `ok:skill:download-and-open` handler — fetches `url` to the user's Downloads
 * directory and invokes the OS file association. A successful resolve means
 * Claude Desktop has taken over; the install flow continues inside Claude's
 * own native install dialog.
 *
 * URL validation: we only accept `https://github.com/inkeep/open-knowledge/releases/`
 * URLs to prevent a malicious renderer (or prompt-injection) from abusing this
 * channel to download arbitrary files. The renderer has no business fetching
 * anything else via this channel.
 */
export async function handleDownloadAndOpen(
  deps: InstallSkillIpcDeps,
  url: string,
): Promise<DownloadAndOpenResult> {
  const fetchFn = deps.fetch ?? globalThis.fetch;

  // Scheme + host allowlist — only our own GitHub Releases.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid-url', message: 'Not a valid URL' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'invalid-url', message: 'Only https:// URLs are accepted' };
  }
  if (parsed.host !== 'github.com') {
    return { ok: false, reason: 'invalid-url', message: 'Only github.com URLs are accepted' };
  }
  if (!parsed.pathname.startsWith('/inkeep/open-knowledge/releases/')) {
    return {
      ok: false,
      reason: 'invalid-url',
      message: 'Only inkeep/open-knowledge releases are accepted',
    };
  }
  if (!parsed.pathname.endsWith('.skill')) {
    return {
      ok: false,
      reason: 'invalid-url',
      message: 'URL must end with .skill',
    };
  }

  let downloadsDir: string;
  try {
    downloadsDir = deps.app.getPath('downloads');
  } catch (err) {
    return {
      ok: false,
      reason: 'no-downloads-dir',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const filename = basename(parsed.pathname); // e.g. "openknowledge.skill"
  const targetPath = `${downloadsDir}/${filename}`;

  let response: Response;
  try {
    response = await fetchFn(url);
  } catch (err) {
    return {
      ok: false,
      reason: 'download-failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: 'download-failed',
      message: `HTTP ${response.status}`,
    };
  }
  if (!response.body) {
    return { ok: false, reason: 'download-failed', message: 'Empty response body' };
  }

  try {
    await mkdir(dirname(targetPath), { recursive: true });
    const writer = createWriteStream(targetPath);
    // @ts-expect-error — Node's stream/promises.pipeline accepts a WHATWG
    // ReadableStream, but the @types don't yet reflect it. Runtime supports
    // it since Node 18. Casting via expect-error keeps the contract clean.
    await pipeline(response.body, writer);
  } catch (err) {
    return {
      ok: false,
      reason: 'write-failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // shell.openPath returns a string — empty on success, error description
  // on failure (Electron convention).
  let openError: string;
  try {
    openError = await deps.shell.openPath(targetPath);
  } catch (err) {
    return {
      ok: false,
      reason: 'open-failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
  if (openError !== '') {
    // OS returned an error — most likely "no default handler for .skill"
    // if Claude Desktop isn't installed, or "file not found" (shouldn't
    // happen since we just wrote it). Surface the OS message.
    return { ok: false, reason: 'open-failed', message: openError };
  }

  return { ok: true, path: targetPath };
}
