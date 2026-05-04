import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildStarterFolderFrontmatterYaml,
  LOG_MD_TEMPLATE,
  STARTER_FOLDERS,
  STARTER_TEMPLATES,
} from './starter.ts';
import type { ApplyError, ApplyResult, FileEntry, ScaffoldPlan, SeedOptions } from './types.ts';

function resolveFileContent(templateId: string): string | undefined {
  if (templateId === 'log.md') return LOG_MD_TEMPLATE;

  const fmMatch = /^([^/]+)\/\.ok\/frontmatter\.yml$/.exec(templateId);
  if (fmMatch) {
    const folder = STARTER_FOLDERS.find((f) => f.path === fmMatch[1]);
    if (!folder) return undefined;
    return buildStarterFolderFrontmatterYaml(folder);
  }

  const tplMatch = /^([^/]+)\/\.ok\/templates\/([^/]+)\.md$/.exec(templateId);
  if (tplMatch) {
    const templateName = tplMatch[2] ?? '';
    return STARTER_TEMPLATES[templateName];
  }

  return undefined;
}

export async function applySeed(plan: ScaffoldPlan, opts: SeedOptions = {}): Promise<ApplyResult> {
  const started = Date.now();
  const projectDir = resolve(opts.projectDir ?? process.cwd());

  let applied = 0;
  const errors: ApplyError[] = [];

  for (const entry of plan.created.filter(
    (e): e is FileEntry & { kind: 'folder' } => e.kind === 'folder',
  )) {
    const absPath = join(projectDir, entry.path);
    try {
      mkdirSync(absPath, { recursive: true });
      applied += 1;
    } catch (err) {
      errors.push({ path: entry.path, error: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const entry of plan.created.filter(
    (e): e is FileEntry & { kind: 'file' } => e.kind === 'file',
  )) {
    const absPath = join(projectDir, entry.path);
    const templateId = entry.template ?? entry.path;
    const content = resolveFileContent(templateId);
    if (content === undefined) {
      errors.push({
        path: entry.path,
        error: `No content template registered for template id "${templateId}"`,
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
