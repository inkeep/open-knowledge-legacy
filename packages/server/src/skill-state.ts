import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tracedMkdir, tracedRename, tracedUnlink, tracedWriteFile } from './fs-traced.ts';

export const SKILL_STATE_DIR_REL = ['.ok', 'skill-state'] as const;

export const LEGACY_SIDECAR_FILENAME = 'skill-installed-version';

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

export type SkillStateTarget = 'claude-cowork' | 'cli-hosts';

export const SKILL_STATE_TARGETS: ReadonlyArray<SkillStateTarget> = ['claude-cowork', 'cli-hosts'];

export interface SkillStateLogger {
  warn: (data: unknown, message: string) => void;
  info?: (data: unknown, message: string) => void;
}

export function targetStatePath(home: string, target: SkillStateTarget): string {
  return join(home, ...SKILL_STATE_DIR_REL, target);
}

export function legacySidecarPath(home: string): string {
  return join(home, '.ok', LEGACY_SIDECAR_FILENAME);
}

export async function readTargetVersion(
  home: string,
  target: SkillStateTarget,
): Promise<string | null> {
  try {
    const raw = await readFile(targetStatePath(home, target), 'utf-8');
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (!VERSION_RE.test(trimmed)) return null;
    return trimmed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function readTargetRecordedAt(
  home: string,
  target: SkillStateTarget,
): Promise<string | null> {
  try {
    const info = await stat(targetStatePath(home, target));
    return info.mtime.toISOString();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeTargetVersion(
  home: string,
  target: SkillStateTarget,
  version: string,
): Promise<void> {
  if (!VERSION_RE.test(version)) {
    throw new Error(`Refusing to write invalid version string: ${version}`);
  }
  const finalPath = targetStatePath(home, target);
  const tmpPath = `${finalPath}.tmp`;
  await tracedMkdir(dirname(finalPath), { recursive: true });
  await tracedWriteFile(tmpPath, `${version}\n`, { encoding: 'utf-8' });
  await tracedRename(tmpPath, finalPath);
}

export async function migrateLegacySidecar(home: string, logger?: SkillStateLogger): Promise<void> {
  const legacy = legacySidecarPath(home);
  const target = targetStatePath(home, 'cli-hosts');

  let legacyContent: string;
  try {
    legacyContent = await readFile(legacy, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }

  const trimmed = legacyContent.trim();
  if (trimmed.length === 0 || !VERSION_RE.test(trimmed)) {
    logger?.warn?.(
      { event: 'skill-state.migration.legacy-corrupt', legacy, content: trimmed },
      'Legacy skill-installed-version sidecar has invalid content; deleting without migration.',
    );
    try {
      await tracedUnlink(legacy);
    } catch {}
    return;
  }

  await tracedMkdir(dirname(target), { recursive: true });
  try {
    await tracedRename(legacy, target);
    logger?.info?.(
      {
        event: 'skill-state.migration.completed',
        from: legacy,
        to: target,
        version: trimmed,
      },
      'Migrated legacy skill-installed-version sidecar to ~/.ok/skill-state/cli-hosts.',
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw err;
  }
}

export async function readServerPackageVersion(): Promise<string> {
  const pkgUrl = new URL('../package.json', import.meta.url);
  const raw = await readFile(fileURLToPath(pkgUrl), 'utf-8');
  const parsed = JSON.parse(raw) as { version?: unknown };
  if (typeof parsed.version !== 'string' || parsed.version.length === 0) {
    throw new Error('@inkeep/open-knowledge-server/package.json missing version field');
  }
  return parsed.version;
}

export interface SkillInstallStateSnapshot {
  currentVersion: string;
  targets: Record<SkillStateTarget, { version: string; recordedAt: string } | null>;
}

export async function readSkillInstallStateSnapshot(
  home: string,
): Promise<SkillInstallStateSnapshot> {
  const [currentVersion, targets] = await Promise.all([
    readServerPackageVersion(),
    readAllTargets(home),
  ]);
  return { currentVersion, targets };
}

export async function readAllTargets(
  home: string,
): Promise<Record<SkillStateTarget, { version: string; recordedAt: string } | null>> {
  const entries = await Promise.all(
    SKILL_STATE_TARGETS.map(async (target) => {
      try {
        const [version, recordedAt] = await Promise.all([
          readTargetVersion(home, target),
          readTargetRecordedAt(home, target),
        ]);
        if (version === null || recordedAt === null) {
          return [target, null] as const;
        }
        return [target, { version, recordedAt }] as const;
      } catch (err) {
        console.warn(
          `[skill-state] non-ENOENT error reading target ${target}; treating as absent:`,
          err,
        );
        return [target, null] as const;
      }
    }),
  );
  return Object.fromEntries(entries) as Record<
    SkillStateTarget,
    { version: string; recordedAt: string } | null
  >;
}
