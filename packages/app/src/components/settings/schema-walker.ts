/**
 * Helpers for walking the published `ConfigSchema` from
 * `@inkeep/open-knowledge-core` into form metadata. Uses the same
 * `_zod.def.innerType` descent pattern as `getFieldMeta` so wrappers
 * (`.default()`, `.optional()`, `.nullable()`) are transparent.
 *
 * Pure functions — no React, no I/O. Settings pane components consume the
 * outputs (`buildPatch`, `getFieldDefault`, `pathHasValue`).
 *
 * `resolveLeafSchema` lives in core (also used by MCP `set_config`) and
 * is re-exported here for the existing call sites' import-path stability.
 */

import { resolveLeafSchema } from '@inkeep/open-knowledge-core';
import type { z } from 'zod';

export { resolveLeafSchema };

type AnyZ = z.ZodType<unknown>;

/**
 * Build a deep-partial patch object setting `value` at the given path.
 * `null` is preserved as-is so `RFC 7396` clear-via-null reaches `applyPatchToDocument`.
 *
 *   buildPatch(['mcp', 'tools', 'search', 'maxResults'], 100)
 *     → { mcp: { tools: { search: { maxResults: 100 } } } }
 */
export function buildPatch(
  path: readonly (string | number)[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) {
    throw new Error('buildPatch: path must be non-empty');
  }
  const [head, ...rest] = path;
  if (rest.length === 0) {
    return { [String(head)]: value };
  }
  return { [String(head)]: buildPatch(rest, value) };
}

/**
 * Read a value at `path` from a deeply-nested config object. Returns
 * `undefined` if any segment is missing or non-object along the way.
 */
export function readPath(value: unknown, path: readonly (string | number)[]): unknown {
  let cur: unknown = value;
  for (const seg of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[String(seg)];
  }
  return cur;
}

/**
 * True iff every segment of `path` exists in `value` (allows `null`/empty
 * arrays as "set"). Used by the modified-at-scope indicator.
 */
export function pathHasValue(value: unknown, path: readonly (string | number)[]): boolean {
  let cur: unknown = value;
  for (const seg of path) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return false;
    if (!(String(seg) in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[String(seg)];
  }
  return cur !== undefined;
}

// resolveLeafSchema lives in `@inkeep/open-knowledge-core/config/schema-leaf`
// and is re-exported above so existing imports (`./schema-walker`) keep
// working without churn. The MCP `set_config` tool imports it from core
// directly.

/**
 * If `schema` (or any inner-type ancestor) is a `ZodDefault`, invoke and
 * return its default. `undefined` for fields without `.default()`.
 */
export function getFieldDefault(schema: AnyZ): unknown {
  let cur: unknown = schema;
  for (let depth = 0; depth < 16; depth++) {
    if (cur === null || cur === undefined) return undefined;
    const def = (cur as { _zod?: { def?: { type?: string; defaultValue?: unknown } } })?._zod?.def;
    if (def?.type === 'default') {
      const dv = def.defaultValue;
      return typeof dv === 'function' ? (dv as () => unknown)() : dv;
    }
    const inner = (cur as { _zod?: { def?: { innerType?: unknown } } })?._zod?.def?.innerType;
    if (inner === undefined) return undefined;
    cur = inner;
  }
  return undefined;
}

/**
 * Strip `.default()` / `.optional()` / `.nullable()` to reveal the raw
 * leaf type tag (`string`, `boolean`, `number`, `enum`, `array`, `object`,
 * etc.). Used by the per-type renderer dispatch in `SettingsField`.
 */
export function getLeafTypeTag(schema: AnyZ): string | undefined {
  let cur: unknown = schema;
  for (let depth = 0; depth < 16; depth++) {
    if (cur === null || cur === undefined) return undefined;
    const def = (cur as { _zod?: { def?: { type?: string; innerType?: unknown } } })?._zod?.def;
    if (!def) return undefined;
    if (def.type === 'default' || def.type === 'optional' || def.type === 'nullable') {
      cur = def.innerType;
      continue;
    }
    return def.type;
  }
  return undefined;
}

/**
 * For an enum leaf (or wrapped enum), return the literal options array.
 * `undefined` if the leaf isn't an enum.
 */
export function getEnumOptions(schema: AnyZ): readonly string[] | undefined {
  let cur: unknown = schema;
  for (let depth = 0; depth < 16; depth++) {
    if (cur === null || cur === undefined) return undefined;
    const def = (
      cur as {
        _zod?: { def?: { type?: string; entries?: Record<string, string>; innerType?: unknown } };
      }
    )?._zod?.def;
    if (!def) return undefined;
    if (def.type === 'enum') {
      // Zod v4 stores enum options under `entries` as { [name]: value }.
      // Values are returned in declaration order via `Object.values`.
      return def.entries ? Object.values(def.entries) : undefined;
    }
    if (def.innerType !== undefined) {
      cur = def.innerType;
      continue;
    }
    return undefined;
  }
  return undefined;
}
