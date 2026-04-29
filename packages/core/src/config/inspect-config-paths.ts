/**
 * Per-scope config inspection (D61 — most-specific-set scope wins).
 *
 * Reads workspace + user-global YAML files SEPARATELY (not merged) and
 * reports whether each requested path is set at each scope. Used by the
 * MCP `set_config` tool to infer the write target without exposing
 * `scope` to agents (D25/D61):
 *
 *   inspectConfig(path).workspace
 *     ?? inspectConfig(path).user
 *     ?? fieldRegistry.get(field).defaultScope
 *     ?? 'user'
 *
 * NOT browser-safe — imports `node:fs`. Use only in server / CLI contexts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';
import { resolveConfigPath } from './write-config-patch.ts';

export interface ConfigPathPresence {
  /** Whether the path is set in `<homedir>/.open-knowledge/config.yml`. */
  user: boolean;
  /** Whether the path is set in `<cwd>/.open-knowledge/config.yml`. */
  workspace: boolean;
}

export interface InspectConfigPathsOptions {
  cwd: string;
  homedirOverride?: string;
}

/**
 * Read both scopes' YAML files (independently — no merge) and check whether
 * each requested path resolves to a set value in each. The returned map is
 * keyed by `path.join('.')` for stable lookup.
 *
 * - File missing → `false` for that scope.
 * - File parse error → `false` for that scope (the same parse error will
 *   surface from `writeConfigPatch` later if the caller proceeds to write).
 * - Path traverses through a non-object → `false`.
 * - Path resolves but the leaf is `undefined` → `false`.
 * - Path resolves to any other value (including `null`, empty arrays, `0`,
 *   `false`) → `true`.
 */
export function inspectConfigPaths(
  paths: ReadonlyArray<readonly (string | number)[]>,
  opts: InspectConfigPathsOptions,
): Map<string, ConfigPathPresence> {
  const userJson = readJsonForScope('user', opts);
  const workspaceJson = readJsonForScope('workspace', opts);
  const result = new Map<string, ConfigPathPresence>();
  for (const path of paths) {
    const key = path.join('.');
    result.set(key, {
      user: hasPathInJson(userJson, path),
      workspace: hasPathInJson(workspaceJson, path),
    });
  }
  return result;
}

function readJsonForScope(scope: 'user' | 'workspace', opts: InspectConfigPathsOptions): unknown {
  const absPath = resolveConfigPath(scope, opts.cwd, opts.homedirOverride);
  if (!existsSync(absPath)) return null;
  let raw: string;
  try {
    raw = readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
  const doc = parseDocument(raw);
  if (doc.errors.length > 0) return null;
  return doc.toJSON();
}

function hasPathInJson(obj: unknown, path: readonly (string | number)[]): boolean {
  if (path.length === 0) return obj !== null && obj !== undefined;
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur === null || cur === undefined) return false;
    if (Array.isArray(cur) && typeof seg === 'number') {
      cur = cur[seg];
      continue;
    }
    if (typeof cur === 'object') {
      const key = String(seg);
      if (!(key in (cur as Record<string, unknown>))) return false;
      cur = (cur as Record<string, unknown>)[key];
      continue;
    }
    return false;
  }
  return cur !== undefined;
}
