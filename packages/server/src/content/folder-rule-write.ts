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
import { type FrontmatterRecord, mergePatch } from './frontmatter-merge.ts';

interface NestedFolderRuleInput {
  match: string;
  frontmatter: Record<string, unknown>;
  new_match?: string;
}

interface AppliedRule {
  match: string;
  path: string;
  action: 'written' | 'deleted';
}

type NestedFolderRulesUpsertResult =
  | {
      ok: true;
      applied: AppliedRule[];
    }
  | {
      ok: false;
      error: {
        code: 'MULTI_FOLDER_GLOB' | 'PATH_ESCAPE' | 'BAD_PROJECT_DIR' | 'WRITE_ERROR';
        message: string;
        rule?: string;
      };
      partiallyApplied?: AppliedRule[];
    };

interface NestedFolderRulesUpsertOptions {
  projectDir: string;
  rules: NestedFolderRuleInput[];
}

export function applyNestedFolderRulesUpsert(
  opts: NestedFolderRulesUpsertOptions,
): NestedFolderRulesUpsertResult {
  if (!isAbsolute(opts.projectDir)) {
    return {
      ok: false,
      error: { code: 'BAD_PROJECT_DIR', message: 'projectDir must be absolute' },
    };
  }

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
      if (!sourceAbs.startsWith(projectAbs + sep) && sourceAbs !== projectAbs) {
        return {
          ok: false,
          error: {
            code: 'PATH_ESCAPE',
            message: `Resolved source folder escapes projectDir: ${sourceAbs}`,
            rule: rule.match,
          },
        };
      }
    }

    planned.push({
      targetFolder: target.folder,
      targetAbs,
      sourceFolder,
      sourceAbs,
      rule,
    });
  }

  const applied: AppliedRule[] = [];

  for (const op of planned) {
    try {
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

      const okDir = join(op.targetAbs, '.ok');
      const fmPath = join(okDir, 'frontmatter.yml');
      const existing = readExistingFrontmatter(fmPath);
      const isEmptyPatch = Object.keys(op.rule.frontmatter).length === 0;
      const merged = isEmptyPatch ? {} : mergePatch(existing, op.rule.frontmatter);

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
        ...(applied.length > 0 ? { partiallyApplied: applied } : {}),
      };
    }
  }

  return { ok: true, applied };
}

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

function readExistingFrontmatter(absPath: string): FrontmatterRecord {
  if (!existsSync(absPath)) return {};
  const content = readFileSync(absPath, 'utf-8');
  const parsed: unknown = parseYaml(content);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return { ...(parsed as FrontmatterRecord) };
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
    } catch {}
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
