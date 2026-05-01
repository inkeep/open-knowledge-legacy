import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { humanFormat } from '@inkeep/open-knowledge-core';
import { applyFolderRulesUpsert } from '@inkeep/open-knowledge-core/server';
import { LOG_MD_TEMPLATE } from './starter.ts';
import type { ApplyError, ApplyResult, FileEntry, ScaffoldPlan, SeedOptions } from './types.ts';

const FILE_CONTENT: Readonly<Record<string, string>> = {
  'log.md': LOG_MD_TEMPLATE,
};

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
    const content = FILE_CONTENT[templateId];
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

  if (plan.configEdits.length > 0) {
    const result = await applyFolderRulesUpsert({
      cwd: projectDir,
      scope: 'project',
      rules: plan.configEdits.map((edit) => ({
        match: edit.entry.match,
        frontmatter: { ...edit.entry.frontmatter },
      })),
    });
    if (result.ok) {
      applied += plan.configEdits.length;
    } else {
      const message = humanFormat(result.error);
      for (const edit of plan.configEdits) {
        errors.push({
          path: `${edit.configPath}#${edit.folderMatch}`,
          error: message,
        });
      }
    }
  }

  return {
    applied,
    errors,
    durationMs: Date.now() - started,
  };
}
