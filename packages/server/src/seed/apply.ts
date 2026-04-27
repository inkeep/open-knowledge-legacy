import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseDocument, YAMLSeq } from 'yaml';
import { LOG_MD_TEMPLATE } from './starter.ts';
import type {
  ApplyError,
  ApplyResult,
  ConfigEdit,
  FileEntry,
  ScaffoldPlan,
  SeedOptions,
} from './types.ts';

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
 * Apply a ScaffoldPlan to disk. Creates folders, writes files, and appends
 * new `folders:` entries to `config.yml` using a YAML Document API that
 * preserves existing comments + key ordering.
 *
 * Rollback semantics: not atomic. On partial failure, successfully-written
 * entries remain on disk; `errors[]` lists what failed. Apply order is
 * created-folders → created-files → config-edits, so folder structure lands
 * first even if a later step fails.
 *
 * @see specs/2026-04-23-ok-seed-scaffold/SPEC.md
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

  // 3. config.yml edits — group by configPath so we parse/write each file once.
  const editsByConfig = new Map<string, ConfigEdit[]>();
  for (const edit of plan.configEdits) {
    const list = editsByConfig.get(edit.configPath) ?? [];
    list.push(edit);
    editsByConfig.set(edit.configPath, list);
  }

  for (const [configPath, edits] of editsByConfig) {
    try {
      const raw = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
      const doc = parseDocument(raw);

      // Ensure `folders:` exists as a YAMLSeq; create if absent.
      let folders = doc.get('folders');
      if (!(folders instanceof YAMLSeq)) {
        folders = new YAMLSeq();
        doc.set('folders', folders);
      }

      // Append each new entry — plan already checked for collisions, so we don't
      // re-guard here. yaml stringifies nested plain objects correctly.
      for (const edit of edits) {
        (folders as YAMLSeq).add(edit.entry);
        applied += 1;
      }

      writeFileSync(configPath, doc.toString(), 'utf-8');
    } catch (err) {
      for (const edit of edits) {
        errors.push({
          path: `${configPath}#${edit.folderMatch}`,
          error: err instanceof Error ? err.message : String(err),
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
