import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { OK_DIR } from '@inkeep/open-knowledge-core';
import { assertEntryPathInProject } from './path-safety.ts';
import {
  STARTER_FOLDER_FRONTMATTER_FILENAME,
  STARTER_FOLDERS,
  STARTER_TEMPLATES,
} from './starter.ts';
import type { FileEntry, ScaffoldPlan, SeedOptions, SkipEntry } from './types.ts';
import { SeedPrerequisiteError, SeedRootDirError } from './types.ts';

const LOG_MD_FILENAME = 'log.md';

function frontmatterTemplateId(folderPath: string): string {
  return `${folderPath}/.ok/frontmatter.yml`;
}

function templateFileTemplateId(folderPath: string, templateName: string): string {
  return `${folderPath}/.ok/templates/${templateName}.md`;
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
  assertEntryPathInProject(projectDir, posix);
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
    const folderAbs = join(projectDir, folderPath);
    if (existsSync(folderAbs)) {
      skipped.push({ path: folderPath, reason: 'already-exists' });
    } else {
      created.push({ path: folderPath, kind: 'folder' });
    }

    const okSubDir = `${folderPath}/.ok`;
    const okSubAbs = join(projectDir, okSubDir);
    if (existsSync(okSubAbs)) {
      skipped.push({ path: okSubDir, reason: 'already-exists' });
    } else {
      created.push({ path: okSubDir, kind: 'folder' });
    }

    const fmPath = `${okSubDir}/${STARTER_FOLDER_FRONTMATTER_FILENAME}`;
    const fmAbs = join(projectDir, fmPath);
    if (existsSync(fmAbs)) {
      skipped.push({ path: fmPath, reason: 'already-exists' });
    } else {
      created.push({
        path: fmPath,
        kind: 'file',
        template: frontmatterTemplateId(folder.path),
      });
    }

    const tplDir = `${okSubDir}/templates`;
    const tplDirAbs = join(projectDir, tplDir);
    if (existsSync(tplDirAbs)) {
      skipped.push({ path: tplDir, reason: 'already-exists' });
    } else {
      created.push({ path: tplDir, kind: 'folder' });
    }

    const tplFile = `${tplDir}/${folder.starterTemplate}.md`;
    const tplFileAbs = join(projectDir, tplFile);
    if (existsSync(tplFileAbs)) {
      skipped.push({ path: tplFile, reason: 'already-exists' });
    } else if (STARTER_TEMPLATES[folder.starterTemplate] === undefined) {
      warnings.push(
        `No starter template body registered for "${folder.starterTemplate}". The folder will land without a template.`,
      );
    } else {
      created.push({
        path: tplFile,
        kind: 'file',
        template: templateFileTemplateId(folder.path, folder.starterTemplate),
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

  return { created, skipped, warnings };
}
