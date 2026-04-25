/**
 * IPC handler implementations for the Claude Chat & Cowork skill install
 * dialog (SPEC 2026-04-24 Ship 1e, simplified in Ship 1j).
 *
 * Exposes two channels to the renderer:
 *   - `ok:skill:detect-claude-desktop` — boolean, via `detectClaudeDesktopPresence`
 *   - `ok:skill:build-and-open`        — build .skill locally + invoke OS file association
 *
 * Builds the `.skill` artifact from the bundled skill source via
 * `buildSkillZip` in `@inkeep/open-knowledge-server`. No network round-trip,
 * no GitHub Releases dependency — the same SKILL.md that ships with the
 * Electron app's bundled CLI becomes the `.skill` file we hand off. Version
 * is guaranteed to match whatever the user has installed.
 *
 * The download-and-open handler is what unlocks the 2-click install UX:
 *   User clicks Install → we build .skill → shell.openPath invokes
 *   Claude Desktop via its CFBundleDocumentType registration → Claude's
 *   native install dialog appears → user clicks Install → done.
 */

import { join } from 'node:path';
import { buildSkillZip } from '@inkeep/open-knowledge-server';
import type { App, Shell } from 'electron';

export type BuildAndOpenResult =
  | { ok: true; path: string }
  | {
      ok: false;
      reason: 'build-failed' | 'open-failed' | 'no-downloads-dir';
      message?: string;
    };

interface InstallSkillIpcDeps {
  /** Inject `electron.app` so tests can supply a fake downloads path. */
  app: Pick<App, 'getPath'>;
  /** Inject `electron.shell` so tests can assert on `openPath` calls. */
  shell: Pick<Shell, 'openPath'>;
}

export { detectClaudeDesktopPresence as handleDetectClaudeDesktop } from '@inkeep/open-knowledge-server';

/**
 * `ok:skill:build-and-open` handler — builds `openknowledge.skill` from the
 * bundled SKILL.md source, writes it to the user's Downloads folder, and
 * invokes the OS file association. A successful resolve means Claude Desktop
 * has taken over; the install flow continues inside Claude's own native
 * install dialog.
 */
export async function handleBuildAndOpen(deps: InstallSkillIpcDeps): Promise<BuildAndOpenResult> {
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

  const outputPath = join(downloadsDir, 'openknowledge.skill');

  try {
    await buildSkillZip({ outputPath, skipVersionCheck: true });
  } catch (err) {
    return {
      ok: false,
      reason: 'build-failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // shell.openPath returns a string — empty on success, error description
  // on failure (Electron convention).
  let openError: string;
  try {
    openError = await deps.shell.openPath(outputPath);
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

  return { ok: true, path: outputPath };
}
