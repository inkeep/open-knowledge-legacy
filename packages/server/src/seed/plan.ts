import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { OK_DIR } from '@inkeep/open-knowledge-core';
import { parseDocument } from 'yaml';
import { STARTER_FOLDERS, starterFolderRule } from './starter.ts';
import type { ConfigEdit, FileEntry, ScaffoldPlan, SeedOptions, SkipEntry } from './types.ts';
import { SEED_CONFIG_FILENAME, SeedPrerequisiteError, SeedRootDirError } from './types.ts';

const LOG_MD_FILENAME = 'log.md';

function readExistingFolderMatches(configYmlRaw: string | null): string[] {
  if (!configYmlRaw) return [];
  const doc = parseDocument(configYmlRaw);
  const folders = doc.get('folders');
  if (!folders || typeof folders !== 'object') return [];
  const asJson = (folders as { toJSON?: () => unknown }).toJSON?.() ?? folders;
  if (!Array.isArray(asJson)) return [];
  return asJson
    .map((entry) =>
      entry && typeof entry === 'object' ? (entry as { match?: unknown }).match : undefined,
    )
    .filter((m): m is string => typeof m === 'string');
}

function normalizeRootDir(rootDir: string | undefined, projectDir: string): string {
  if (!rootDir) return '';
  const trimmed = rootDir.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === './') return '';
  if (trimmed.startsWith('/')) {
    throw new SeedRootDirError(
      `rootDir must be relative to the project directory, got: ${rootDir}`,
    );
  }
  const posix = trimmed.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (posix.split('/').some((seg) => seg === '..')) {
    throw new SeedRootDirError(`rootDir must not contain '..' segments, got: ${rootDir}`);
  }
  const projectAbs = resolve(projectDir);
  const candidateAbs = resolve(projectAbs, posix);
  if (candidateAbs !== projectAbs && !candidateAbs.startsWith(projectAbs + sep)) {
    throw new SeedRootDirError(
      `rootDir must resolve inside the project directory, got: ${rootDir}`,
    );
  }
  return posix;
}

function joinRelative(root: string, path: string): string {
  return root === '' ? path : `${root}/${path}`;
}

export async function planSeed(opts: SeedOptions = {}): Promise<ScaffoldPlan> {
  const projectDir = resolve(opts.projectDir ?? process.cwd());
  const okDir = join(projectDir, OK_DIR);

  if (!existsSync(okDir)) {
    throw new SeedPrerequisiteError(
      `No ${OK_DIR}/ directory found at ${projectDir}. Run \`ok init\` first to scaffold the tool config.`,
    );
  }

  const rootDir = normalizeRootDir(opts.rootDir, projectDir);

  const created: FileEntry[] = [];
  const skipped: SkipEntry[] = [];
  const configEdits: ConfigEdit[] = [];
  const warnings: string[] = [];

  if (rootDir !== '') {
    const rootPath = join(projectDir, rootDir);
    if (!existsSync(rootPath)) {
      created.push({ path: rootDir, kind: 'folder' });
    } else {
      skipped.push({ path: rootDir, reason: 'already-exists' });
    }
  }

  for (const folder of STARTER_FOLDERS) {
    const folderPath = joinRelative(rootDir, folder.path);
    const absPath = join(projectDir, folderPath);
    if (existsSync(absPath)) {
      skipped.push({ path: folderPath, reason: 'already-exists' });
    } else {
      created.push({ path: folderPath, kind: 'folder' });
    }
  }

  const configPath = join(okDir, SEED_CONFIG_FILENAME);
  let configYmlRaw: string | null = null;
  try {
    configYmlRaw = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : null;
  } catch (err) {
    warnings.push(
      `Could not read ${OK_DIR}/${SEED_CONFIG_FILENAME}: ${err instanceof Error ? err.message : String(err)}. Treating as absent for plan computation.`,
    );
  }

  const existingMatches = new Set(readExistingFolderMatches(configYmlRaw));
  for (const folder of STARTER_FOLDERS) {
    const scopedMatch = joinRelative(rootDir, folder.match);
    if (existingMatches.has(scopedMatch)) {
      skipped.push({ path: `${SEED_CONFIG_FILENAME}#${scopedMatch}`, reason: 'already-exists' });
    } else {
      const scopedFolder = { ...folder, match: scopedMatch };
      configEdits.push({
        configPath,
        folderMatch: scopedMatch,
        entry: starterFolderRule(scopedFolder),
      });
    }
  }

  const logRelPath = joinRelative(rootDir, LOG_MD_FILENAME);
  const logAbsPath = join(projectDir, logRelPath);
  if (existsSync(logAbsPath)) {
    skipped.push({ path: logRelPath, reason: 'already-exists' });
  } else {
    created.push({ path: logRelPath, kind: 'file', template: LOG_MD_FILENAME });
  }

  return { created, skipped, configEdits, warnings };
}
