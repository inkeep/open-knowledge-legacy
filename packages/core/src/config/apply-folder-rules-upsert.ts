/**
 * Always-array transactional upsert primitive for `folders[]`.
 *
 * Read current folders[] for the chosen scope → for each input rule,
 * find-or-append-or-rename in a working array → call `writeConfigPatch`
 * once with the resulting full array.
 *
 * Transactional all-or-nothing: validation runs against the merged config
 * inside `writeConfigPatch`; if any rule produces an invalid merged result,
 * NO writes happen — atomic-tmp+rename gives transactional semantics for
 * free.
 *
 * Always-array shape (even N=1): the right-click-folder UX and agent
 * batch-reorganize both call this same primitive without forking on N.
 *
 * Removal goes through `set_config({patch: {folders: [<filtered>]}})` —
 * read-modify-write is fine for the rare removal case.
 */

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

/** Single rule to upsert. `new_match` renames an existing rule keyed by `match`. */
export interface FolderRuleUpsert {
  match: string;
  frontmatter: FolderFrontmatter;
  /** If set, rename the existing rule whose match === `match` to `new_match`. */
  new_match?: string;
}

export interface ApplyFolderRulesUpsertOptions {
  cwd: string;
  rules: FolderRuleUpsert[];
  /** Defaults to 'workspace' — folders[] are most natural at workspace scope. */
  scope?: 'workspace' | 'user';
  /** Override homedir for tests. */
  homedirOverride?: string;
}

export type ApplyFolderRulesUpsertResult = Result<WriteConfigPatchSuccess, ConfigValidationError>;

/**
 * Read current `folders[]` from the on-disk YAML for the given scope.
 *
 * Returns an empty array when:
 * - the file doesn't exist (lazy first-write target)
 * - the file exists but has no `folders:` key (Zod default of `[]`)
 * - the YAML parses but `folders` is malformed (shape will be re-validated
 *   by writeConfigPatch's L2 anyway)
 *
 * NOTE: this performs a minimal targeted read for the upsert-merge logic
 * only. Full validation happens inside `writeConfigPatch`.
 */
function readCurrentFolders(absPath: string): FolderRule[] {
  if (!existsSync(absPath)) return [];
  const raw = readFileSync(absPath, 'utf-8');
  const doc = parseDocument(raw);
  if (doc.errors.length > 0) {
    // Caller will see the same parse error inside writeConfigPatch's
    // safeParse and report it as YAML_PARSE; here we treat as empty so
    // the upsert merge has something to work with.
    return [];
  }
  const json = doc.toJSON();
  if (!json || typeof json !== 'object' || Array.isArray(json)) return [];
  const folders = (json as Record<string, unknown>).folders;
  if (!Array.isArray(folders)) return [];
  // Trust the shape — writeConfigPatch's safeParse will reject non-conforming
  // entries on the merged result.
  return folders as FolderRule[];
}

function err(error: ConfigValidationError): Err<ConfigValidationError> {
  return { ok: false, error };
}

function ok(value: WriteConfigPatchSuccess): Ok<WriteConfigPatchSuccess> {
  return { ok: true, ...value };
}

/**
 * Upsert one or more folder rules into the chosen-scope config's
 * `folders[]` array. Reads current state, applies each upsert (find-or-
 * append-or-rename), then issues a single `writeConfigPatch` with the
 * resulting full array.
 *
 * Per-rule semantics:
 * - If `new_match` is unset and a rule with `match: <input.match>` exists,
 *   replace its `frontmatter` (in place — preserves array order).
 * - If `new_match` is unset and no rule with `match: <input.match>` exists,
 *   append a new rule.
 * - If `new_match` is set and a rule with `match: <input.match>` exists,
 *   rewrite its `match` to `new_match` and replace `frontmatter`. If a
 *   rule with `match: <input.new_match>` already exists too, the rename
 *   target is overwritten — the source is removed.
 * - If `new_match` is set and no rule with `match: <input.match>` exists,
 *   treat as plain upsert keyed on `new_match`.
 *
 * Conflicts within the input batch (e.g., two rules targeting the same
 * `match`) resolve last-write-wins within the batch — earlier rules in
 * the array are overwritten by later ones during the merge walk.
 */
export async function applyFolderRulesUpsert(
  opts: ApplyFolderRulesUpsertOptions,
): Promise<ApplyFolderRulesUpsertResult> {
  const scope = opts.scope ?? 'workspace';
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

  // Working copy. We mutate in place (find-or-append-or-rename).
  const working: FolderRule[] = current.map((r) => ({
    match: r.match,
    frontmatter: { ...r.frontmatter },
  }));

  for (const rule of opts.rules) {
    const targetMatch = rule.new_match ?? rule.match;
    const sourceIdx = working.findIndex((r) => r.match === rule.match);

    if (rule.new_match !== undefined && rule.new_match !== rule.match) {
      // Rename path. Find the source by old match; if it exists, rewrite
      // its match + frontmatter. If a sibling with the new_match also
      // exists, the rename collides — drop the sibling so the renamed
      // rule lands cleanly.
      if (sourceIdx >= 0) {
        const collisionIdx = working.findIndex(
          (r, i) => i !== sourceIdx && r.match === rule.new_match,
        );
        if (collisionIdx >= 0) {
          // Remove the collision target. Adjust sourceIdx if needed.
          working.splice(collisionIdx, 1);
        }
        const adjustedIdx =
          collisionIdx >= 0 && collisionIdx < sourceIdx ? sourceIdx - 1 : sourceIdx;
        working[adjustedIdx] = {
          match: rule.new_match,
          frontmatter: { ...rule.frontmatter },
        };
      } else {
        // No source — treat as plain upsert keyed on the new_match.
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

    // Plain upsert (no rename).
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
