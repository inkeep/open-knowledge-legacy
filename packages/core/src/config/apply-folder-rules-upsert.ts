import { existsSync, readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import type { ConfigValidationError } from './errors.ts';
import type { Err, Ok, Result } from './result.ts';
import type { FolderFrontmatter, FolderRule } from './schema.ts';
import {
  resolveConfigPath,
  type WriteConfigPatchSuccess,
  writeConfigPatch,
} from './write-config-patch.ts';

export interface FolderRuleUpsert {
  match: string;
  frontmatter: FolderFrontmatter;
  new_match?: string;
}

export interface ApplyFolderRulesUpsertOptions {
  cwd: string;
  rules: FolderRuleUpsert[];
  scope?: 'project' | 'user';
  homedirOverride?: string;
}

export type ApplyFolderRulesUpsertResult = Result<WriteConfigPatchSuccess, ConfigValidationError>;

function readCurrentFolders(absPath: string): FolderRule[] {
  if (!existsSync(absPath)) return [];
  const raw = readFileSync(absPath, 'utf-8');
  const doc = parseDocument(raw);
  if (doc.errors.length > 0) {
    return [];
  }
  const json = doc.toJSON();
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  const folders = (json as Record<string, unknown>).folders;
  if (!Array.isArray(folders)) return [];
  return folders as FolderRule[];
}

function err(error: ConfigValidationError): Err<ConfigValidationError> {
  return { ok: false, error };
}

function ok(value: WriteConfigPatchSuccess): Ok<WriteConfigPatchSuccess> {
  return { ok: true, ...value };
}

export async function applyFolderRulesUpsert(
  opts: ApplyFolderRulesUpsertOptions,
): Promise<ApplyFolderRulesUpsertResult> {
  const scope = opts.scope ?? 'project';
  const absPath = resolveConfigPath(scope, opts.cwd, opts.homedirOverride);

  let current: FolderRule[];
  try {
    current = readCurrentFolders(absPath);
  } catch (e) {
    return err({
      code: 'WRITE_ERROR',
      detail: `Could not read current folders: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  const working: FolderRule[] = current.map((r) => ({
    match: r.match,
    frontmatter: { ...r.frontmatter },
  }));

  for (const rule of opts.rules) {
    const targetMatch = rule.new_match ?? rule.match;
    const sourceIdx = working.findIndex((r) => r.match === rule.match);

    if (rule.new_match !== undefined && rule.new_match !== rule.match) {
      if (sourceIdx >= 0) {
        const collisionIdx = working.findIndex(
          (r, i) => i !== sourceIdx && r.match === rule.new_match,
        );
        if (collisionIdx >= 0) {
          working.splice(collisionIdx, 1);
        }
        const adjustedIdx =
          collisionIdx >= 0 && collisionIdx < sourceIdx ? sourceIdx - 1 : sourceIdx;
        working[adjustedIdx] = {
          match: rule.new_match,
          frontmatter: { ...rule.frontmatter },
        };
      } else {
        const targetIdx = working.findIndex((r) => r.match === targetMatch);
        if (targetIdx >= 0) {
          working[targetIdx] = {
            match: targetMatch,
            frontmatter: { ...rule.frontmatter },
          };
        } else {
          working.push({
            match: targetMatch,
            frontmatter: { ...rule.frontmatter },
          });
        }
      }
      continue;
    }

    if (sourceIdx >= 0) {
      working[sourceIdx] = {
        match: rule.match,
        frontmatter: { ...rule.frontmatter },
      };
    } else {
      working.push({
        match: rule.match,
        frontmatter: { ...rule.frontmatter },
      });
    }
  }

  const result = await writeConfigPatch({
    cwd: opts.cwd,
    scope,
    patch: { folders: working },
    homedirOverride: opts.homedirOverride,
  });

  if (!result.ok) return err(result.error);
  return ok({
    effective: result.effective,
    appliedPaths: result.appliedPaths,
    path: result.path,
    created: result.created,
  });
}
