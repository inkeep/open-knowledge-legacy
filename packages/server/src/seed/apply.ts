import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertEntryPathInProject } from './path-safety.ts';
import { buildStarterFolderFrontmatterYaml, DEFAULT_PACK_ID, resolvePack } from './starter.ts';
import type { ApplyError, ApplyResult, FileEntry, ScaffoldPlan, SeedOptions } from './types.ts';
import { SeedRootDirError } from './types.ts';

function resolveFileContent(
  templateId: string,
  pack: ReturnType<typeof resolvePack>,
): string | undefined {
  const fmMatch = /^([^/]+)\/\.ok\/frontmatter\.yml$/.exec(templateId);
  if (fmMatch) {
    const folder = pack.folders.find((f) => f.path === fmMatch[1]);
    if (!folder) return undefined;
    return buildStarterFolderFrontmatterYaml(folder);
  }

  const tplMatch = /^([^/]+)\/\.ok\/templates\/([^/]+)\.md$/.exec(templateId);
  if (tplMatch) {
    const templateName = tplMatch[2] ?? '';
    return pack.templates[templateName];
  }

  if (!templateId.includes('/') && pack.rootFiles?.[templateId] !== undefined) {
    return pack.rootFiles[templateId];
  }

  return undefined;
}

export async function applySeed(plan: ScaffoldPlan, opts: SeedOptions = {}): Promise<ApplyResult> {
  const started = Date.now();
  const projectDir = resolve(opts.projectDir ?? process.cwd());
  const pack = resolvePack(opts.packId ?? DEFAULT_PACK_ID);

  let applied = 0;
  const errors: ApplyError[] = [];

  const safeEntries: Array<{ entry: FileEntry; absPath: string }> = [];
  for (const entry of plan.created) {
    try {
      const absPath = assertEntryPathInProject(projectDir, entry.path);
      safeEntries.push({ entry, absPath });
    } catch (err) {
      errors.push({
        path: typeof entry.path === 'string' ? entry.path : String(entry.path),
        error:
          err instanceof SeedRootDirError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err),
      });
    }
  }

  for (const { entry, absPath } of safeEntries.filter(
    (e): e is { entry: FileEntry & { kind: 'folder' }; absPath: string } =>
      e.entry.kind === 'folder',
  )) {
    try {
      mkdirSync(absPath, { recursive: true });
      applied += 1;
    } catch (err) {
      errors.push({ path: entry.path, error: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const { entry, absPath } of safeEntries.filter(
    (e): e is { entry: FileEntry & { kind: 'file' }; absPath: string } => e.entry.kind === 'file',
  )) {
    const templateId = entry.template ?? entry.path;
    const content = resolveFileContent(templateId, pack);
    if (content === undefined) {
      errors.push({
        path: entry.path,
        error: `No content template registered for template id "${templateId}" in pack "${pack.id}"`,
      });
      continue;
    }
    if (existsSync(absPath)) {
      continue;
    }
    try {
      writeFileSync(absPath, content, 'utf-8');
      applied += 1;
    } catch (err) {
      errors.push({ path: entry.path, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    applied,
    errors,
    durationMs: Date.now() - started,
  };
}
