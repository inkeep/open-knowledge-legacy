/**
 * Filesystem writer for nested folder/.ok/frontmatter.yml files —
 * the canonical home for folder-level metadata under spec
 * 2026-05-01-folder-level-metadata-and-templates.
 *
 * Resolves match globs to a single target folder by walking leading
 * literal segments. Multi-folder globs are rejected with
 * MULTI_FOLDER_GLOB per spec §6.1 — agents can split them into multiple
 * per-folder rules.
 *
 * Writes are atomic (tmp + rename). When the merged frontmatter is
 * empty (every key cleared), the file is removed and .ok/ is auto-
 * cleaned per D3 (templates/ may still be there; that case keeps .ok/).
 *
 * Spec: 2026-05-01-folder-level-metadata-and-templates §6.1, FR6.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface NestedFolderRuleInput {
  /** Glob `match` (e.g. `"specs/**"` or `"meetings/prep-notes/**"`). */
  match: string;
  /**
   * Frontmatter to apply. Per-key REPLACE semantics: any key explicitly
   * present overrides the existing value at that level. Pass `null` to
   * clear (treated like absent for upsert; the file's existing value is
   * preserved). Empty object after merge → file is deleted.
   */
  frontmatter: {
    title?: string;
    description?: string;
    tags?: string[];
  };
  /** Optional rename glob — moves an existing rule to a different folder. */
  new_match?: string;
}

export type NestedFolderRulesUpsertResult =
  | {
      ok: true;
      applied: Array<{
        match: string;
        path: string; // project-root-relative path of the written/removed frontmatter.yml
        action: 'written' | 'deleted';
      }>;
    }
  | {
      ok: false;
      error: {
        code: 'MULTI_FOLDER_GLOB' | 'PATH_ESCAPE' | 'BAD_PROJECT_DIR' | 'WRITE_ERROR';
        message: string;
        rule?: string;
      };
    };

export interface NestedFolderRulesUpsertOptions {
  projectDir: string;
  rules: NestedFolderRuleInput[];
}

/**
 * Transactional upsert: validate every rule first; only commit to disk
 * once all rules resolve to a single target folder. If any fail, NO
 * writes happen.
 */
export function applyNestedFolderRulesUpsert(
  opts: NestedFolderRulesUpsertOptions,
): NestedFolderRulesUpsertResult {
  if (!isAbsolute(opts.projectDir)) {
    return {
      ok: false,
      error: { code: 'BAD_PROJECT_DIR', message: 'projectDir must be absolute' },
    };
  }

  // Phase 1: resolve every rule's target folder + plan the operation.
  interface PlannedOp {
    targetFolder: string; // project-root-relative; "" for project root
    targetAbs: string;
    sourceFolder: string | null; // for rename: previous folder (relative)
    sourceAbs: string | null;
    rule: NestedFolderRuleInput;
  }
  const planned: PlannedOp[] = [];

  for (const rule of opts.rules) {
    const target = resolveTargetFolderFromMatch(rule.new_match ?? rule.match);
    if (!target.ok) {
      return {
        ok: false,
        error: { code: 'MULTI_FOLDER_GLOB', message: target.message, rule: rule.match },
      };
    }
    const targetAbs = target.folder ? resolve(opts.projectDir, target.folder) : opts.projectDir;
    const projectAbs = resolve(opts.projectDir);
    if (!targetAbs.startsWith(projectAbs + sep) && targetAbs !== projectAbs) {
      return {
        ok: false,
        error: {
          code: 'PATH_ESCAPE',
          message: `Resolved target folder escapes projectDir: ${targetAbs}`,
          rule: rule.match,
        },
      };
    }

    let sourceFolder: string | null = null;
    let sourceAbs: string | null = null;
    if (rule.new_match !== undefined && rule.new_match !== rule.match) {
      const source = resolveTargetFolderFromMatch(rule.match);
      if (!source.ok) {
        return {
          ok: false,
          error: { code: 'MULTI_FOLDER_GLOB', message: source.message, rule: rule.match },
        };
      }
      sourceFolder = source.folder;
      sourceAbs = source.folder ? resolve(opts.projectDir, source.folder) : opts.projectDir;
    }

    planned.push({
      targetFolder: target.folder,
      targetAbs,
      sourceFolder,
      sourceAbs,
      rule,
    });
  }

  // Phase 2: execute all writes. Each rule is independent — we do not
  // rollback partial writes on a mid-batch failure. The Phase 1 validation
  // ensures the only remaining failure modes are filesystem errors.
  const applied: Array<{
    match: string;
    path: string;
    action: 'written' | 'deleted';
  }> = [];

  for (const op of planned) {
    try {
      // For rename, first delete the source nested file (if any).
      if (op.sourceAbs && op.sourceAbs !== op.targetAbs) {
        const sourceFmPath = join(op.sourceAbs, '.ok', 'frontmatter.yml');
        if (existsSync(sourceFmPath)) {
          unlinkSync(sourceFmPath);
          autoCleanOkDir(join(op.sourceAbs, '.ok'));
          applied.push({
            match: op.rule.match,
            path: relPathOf(opts.projectDir, sourceFmPath),
            action: 'deleted',
          });
        }
      }

      // Apply the upsert at the target. An empty patch (no defined keys)
      // is the explicit "remove this folder rule" signal per spec §6.1 —
      // collapse the merge to {} so the existing file gets deleted.
      const okDir = join(op.targetAbs, '.ok');
      const fmPath = join(okDir, 'frontmatter.yml');
      const existing = readExistingFrontmatter(fmPath);
      const isEmptyPatch =
        op.rule.frontmatter.title === undefined &&
        op.rule.frontmatter.description === undefined &&
        op.rule.frontmatter.tags === undefined;
      const merged = isEmptyPatch ? {} : mergeFrontmatter(existing, op.rule.frontmatter);

      if (Object.keys(merged).length === 0) {
        if (existsSync(fmPath)) {
          unlinkSync(fmPath);
          autoCleanOkDir(okDir);
          applied.push({
            match: op.rule.new_match ?? op.rule.match,
            path: relPathOf(opts.projectDir, fmPath),
            action: 'deleted',
          });
        }
        continue;
      }

      mkdirSync(okDir, { recursive: true });
      const yaml = stringifyYaml(merged);
      const tmpPath = `${fmPath}.tmp.${process.pid}.${Date.now()}`;
      writeFileSync(tmpPath, yaml, 'utf-8');
      renameSync(tmpPath, fmPath);

      applied.push({
        match: op.rule.new_match ?? op.rule.match,
        path: relPathOf(opts.projectDir, fmPath),
        action: 'written',
      });
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'WRITE_ERROR',
          message: `Failed to write nested frontmatter for ${op.rule.match}: ${(err as Error).message}`,
          rule: op.rule.match,
        },
      };
    }
  }

  return { ok: true, applied };
}

// Resolve a glob `match` to a single target folder by walking leading
// literal segments. Returns multi-folder when any glob (`*`, `?`, `[`,
// `{`) appears mid-path with literal segments after it.
//
// Examples (replace SLASH with /):
//   "specs/**"               → ok, folder="specs"
//   "specs/foo/**"           → ok, folder="specs/foo"
//   "**"                     → ok, folder="" (project root)
//   "specs/[STAR]/evidence/**" → multi-folder rejected (literal after glob)
function resolveTargetFolderFromMatch(
  match: string,
): { ok: true; folder: string } | { ok: false; message: string } {
  const segments = match.split('/').filter((s) => s.length > 0);
  const literalSegments: string[] = [];
  let sawGlob = false;
  for (const seg of segments) {
    const isGlob = /[*?[\]{}]/.test(seg);
    if (sawGlob && !isGlob) {
      return {
        ok: false,
        message: `Glob "${match}" matches multiple folders (literal segment "${seg}" appears after a glob). Split it into one rule per folder, e.g. set_folder_rule({ rules: [{ match: "specs/foo/${seg}/**", ... }, ...] }).`,
      };
    }
    if (isGlob) {
      sawGlob = true;
      // `**` and `*` are accepted as single-folder markers (no folder
      // descent contributed). Anything more exotic (e.g. `[abc]`) is
      // rejected as ambiguous.
      if (seg !== '**' && seg !== '*') {
        return {
          ok: false,
          message: `Glob "${match}" uses an unsupported pattern segment "${seg}". Only "*" and "**" are supported in nested folder rules.`,
        };
      }
      continue;
    }
    literalSegments.push(seg);
  }
  return { ok: true, folder: literalSegments.join('/') };
}

interface FolderFm {
  title?: string;
  description?: string;
  tags?: string[];
}

function readExistingFrontmatter(absPath: string): FolderFm {
  if (!existsSync(absPath)) return {};
  let content: string;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch {
    return {};
  }
  if (parsed == null || typeof parsed !== 'object') return {};
  const fm = parsed as Record<string, unknown>;
  const out: FolderFm = {};
  if (typeof fm.title === 'string') out.title = fm.title;
  if (typeof fm.description === 'string') out.description = fm.description;
  if (Array.isArray(fm.tags)) {
    out.tags = fm.tags.filter((t): t is string => typeof t === 'string');
  }
  return out;
}

function mergeFrontmatter(existing: FolderFm, patch: FolderFm): FolderFm {
  const out: FolderFm = { ...existing };
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.description !== undefined) out.description = patch.description;
  if (patch.tags !== undefined) out.tags = patch.tags;
  // Drop empty arrays / strings to keep auto-clean predictable.
  if (out.tags && out.tags.length === 0) delete out.tags;
  if (out.title === '' || out.title === undefined) delete out.title;
  if (out.description === '' || out.description === undefined) delete out.description;
  return out;
}

function autoCleanOkDir(okAbsDir: string): void {
  if (!existsSync(okAbsDir)) return;
  let entries: string[];
  try {
    entries = readdirSync(okAbsDir);
  } catch {
    return;
  }
  if (entries.length === 0) {
    try {
      rmdirSync(okAbsDir);
    } catch {
      // Race or permission; leave it.
    }
  }
}

function relPathOf(projectDir: string, abs: string): string {
  const projectAbs = resolve(projectDir);
  if (abs.startsWith(projectAbs + sep)) {
    return abs
      .slice(projectAbs.length + 1)
      .split(sep)
      .join('/');
  }
  return abs;
}
