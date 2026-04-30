import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { humanFormat } from '@inkeep/open-knowledge-core';
import { applyFolderRulesUpsert } from '@inkeep/open-knowledge-core/server';
import { LOG_MD_TEMPLATE } from './starter.ts';
import type { ApplyError, ApplyResult, FileEntry, ScaffoldPlan, SeedOptions } from './types.ts';

/**
 * Content lookup for scaffolded files. Keyed by the `template` field from a
 * `FileEntry` (stable across `rootDir` choices — an entry might land at
 * `log.md` or `brain/log.md` on disk, but its template id stays `log.md`).
 * Folders have no content and are not represented here.
 */
const FILE_CONTENT: Readonly<Record<string, string>> = {
  'log.md': LOG_MD_TEMPLATE,
};

/**
 * Apply a ScaffoldPlan to disk. Creates folders, writes files, and routes
 * `folders[]` config edits through `applyFolderRulesUpsert` so they share
 * the canonical write primitive (D63 / FR-9b) — atomic tmp+rename, single
 * Zod validation pass, comment preservation.
 *
 * Rollback semantics: not atomic across the three phases (folders →
 * files → config). Inside the config-edits phase, `applyFolderRulesUpsert`
 * gives transactional all-or-nothing on the rule batch — if validation
 * fails on the merged result, no rules land. Phase ordering ensures folder
 * structure exists before config edits reference it.
 */
export async function applySeed(plan: ScaffoldPlan, opts: SeedOptions = {}): Promise<ApplyResult> {
  const started = Date.now();
  const projectDir = resolve(opts.projectDir ?? process.cwd());

  let applied = 0;
  const errors: ApplyError[] = [];

  // 1. Folders first — everything else potentially lives inside them.
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

  // 2. Files — only write if absent (defense-in-depth; plan should already
  //    have excluded existing ones, but a race could slip through).
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
      // Already present — plan was stale, skip silently (not an error).
      continue;
    }
    try {
      writeFileSync(absPath, content, 'utf-8');
      applied += 1;
    } catch (err) {
      errors.push({ path: entry.path, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // 3. config.yml edits via applyFolderRulesUpsert. Plan emits configEdits
  //    pointing at the workspace `<projectDir>/.open-knowledge/config.yml`;
  //    the upsert helper writes there via the same scope='workspace'
  //    contract used by MCP/CLI (D63).
  if (plan.configEdits.length > 0) {
    // Seed's local FolderFrontmatter is a closed-shape interface; core's
    // is z.looseObject-derived with an `[x: string]: unknown` index. They
    // are structurally compatible — spread to widen for the upsert call.
    const result = await applyFolderRulesUpsert({
      cwd: projectDir,
      scope: 'workspace',
      rules: plan.configEdits.map((edit) => ({
        match: edit.entry.match,
        frontmatter: { ...edit.entry.frontmatter },
      })),
    });
    if (result.ok) {
      // Transactional: all rules land or none do. Count each input edit.
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
