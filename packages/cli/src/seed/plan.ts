import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { CONFIG_FILENAME, OK_DIR } from '../constants.ts';
import { STARTER_FOLDERS, starterFolderRule } from './starter.ts';
import type { ConfigEdit, FileEntry, ScaffoldPlan, SeedOptions, SkipEntry } from './types.ts';
import { SeedPrerequisiteError } from './types.ts';

const LOG_MD_FILENAME = 'log.md';

/**
 * Extract existing `folders:` glob match strings from a config.yml document,
 * defensively — returns an empty array if `folders:` is absent or malformed.
 * Used only for collision detection against STARTER_FOLDERS entries.
 */
function readExistingFolderMatches(configYmlRaw: string | null): string[] {
  if (!configYmlRaw) return [];
  const doc = parseDocument(configYmlRaw);
  const folders = doc.get('folders');
  if (!folders || typeof folders !== 'object') return [];
  // yaml.Document .get() returns a YAMLSeq; .toJSON() collapses to a plain array.
  const asJson = (folders as { toJSON?: () => unknown }).toJSON?.() ?? folders;
  if (!Array.isArray(asJson)) return [];
  return asJson
    .map((entry) =>
      entry && typeof entry === 'object' ? (entry as { match?: unknown }).match : undefined,
    )
    .filter((m): m is string => typeof m === 'string');
}

/**
 * Compute a ScaffoldPlan for the given project. Read-only — performs no writes.
 *
 * Throws `SeedPrerequisiteError` if `.open-knowledge/` is absent — the user
 * must run `ok init` first.
 *
 * @see specs/2026-04-23-ok-seed-scaffold/SPEC.md
 */
export async function planSeed(opts: SeedOptions = {}): Promise<ScaffoldPlan> {
  const projectDir = resolve(opts.projectDir ?? process.cwd());
  const okDir = join(projectDir, OK_DIR);

  if (!existsSync(okDir)) {
    throw new SeedPrerequisiteError(
      `No ${OK_DIR}/ directory found at ${projectDir}. Run \`ok init\` first to scaffold the tool config.`,
    );
  }

  const created: FileEntry[] = [];
  const skipped: SkipEntry[] = [];
  const configEdits: ConfigEdit[] = [];
  const warnings: string[] = [];

  // 1. Folder existence check on disk.
  for (const folder of STARTER_FOLDERS) {
    const folderPath = join(projectDir, folder.path);
    if (existsSync(folderPath)) {
      skipped.push({ path: folder.path, reason: 'already-exists' });
    } else {
      created.push({ path: folder.path, kind: 'folder' });
    }
  }

  // 2. config.yml folders: array collision check.
  const configPath = join(okDir, CONFIG_FILENAME);
  let configYmlRaw: string | null = null;
  try {
    configYmlRaw = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : null;
  } catch (err) {
    warnings.push(
      `Could not read ${OK_DIR}/${CONFIG_FILENAME}: ${err instanceof Error ? err.message : String(err)}. Treating as absent for plan computation.`,
    );
  }

  const existingMatches = new Set(readExistingFolderMatches(configYmlRaw));
  for (const folder of STARTER_FOLDERS) {
    if (existingMatches.has(folder.match)) {
      // Entry already in config — never overwrite user edits.
      skipped.push({ path: `${CONFIG_FILENAME}#${folder.match}`, reason: 'already-exists' });
    } else {
      configEdits.push({
        configPath,
        folderMatch: folder.match,
        entry: starterFolderRule(folder),
      });
    }
  }

  // 3. Optional root log.md.
  const logPath = join(projectDir, LOG_MD_FILENAME);
  if (existsSync(logPath)) {
    skipped.push({ path: LOG_MD_FILENAME, reason: 'already-exists' });
  } else {
    created.push({ path: LOG_MD_FILENAME, kind: 'file' });
  }

  return { created, skipped, configEdits, warnings };
}
