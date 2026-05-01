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
  app: Pick<App, 'getPath'>;
  shell: Pick<Shell, 'openPath'>;
}

export { detectClaudeDesktopPresence as handleDetectClaudeDesktop } from '@inkeep/open-knowledge-server';

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
    return { ok: false, reason: 'open-failed', message: openError };
  }

  return { ok: true, path: outputPath };
}
