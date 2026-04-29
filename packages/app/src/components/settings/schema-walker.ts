/**
 * Helpers for walking the published `ConfigSchema` from
 * `@inkeep/open-knowledge-core` into form metadata. Uses the same
 * `_zod.def.innerType` descent pattern as `getFieldMeta` (US-002 /
 * field-registry.ts) so wrappers (`.default()`, `.optional()`,
 * `.nullable()`) are transparent.
 *
 * Pure functions — no React, no I/O. Settings pane components consume the
 * outputs (`buildPatch`, `getFieldDefault`, `pathHasValue`, `resolveLeafSchema`).
 */

import type { z } from 'zod';

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
 * arrays as "set"). Used by the modified-at-scope indicator (FR-3b).
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

/**
 * Descend into a `ZodObject` shape at `path` to retrieve the leaf schema.
 * Returns `undefined` if the path resolves to a non-object container or a
 * missing key. Does NOT unwrap `.default()` / `.optional()` — callers that
 * want the inner type should walk further via `_zod.def.innerType`.
 */
export function resolveLeafSchema(
  rootSchema: AnyZ,
  path: readonly (string | number)[],
): AnyZ | undefined {
  let cur: unknown = rootSchema;
  for (const seg of path) {
    cur = unwrapToShape(cur);
    const shape = (cur as { _zod?: { def?: { shape?: Record<string, AnyZ> } } })?._zod?.def?.shape;
    if (!shape) return undefined;
    cur = shape[String(seg)];
    if (cur === undefined) return undefined;
  }
  return cur as AnyZ;
}

/**
 * Walk through `.default()` / `.optional()` / `.nullable()` wrappers to
 * find the underlying object schema (whose `_zod.def.shape` we can index
 * into). Bounded depth, mirrors `getFieldMeta`'s pattern.
 */
function unwrapToShape(schema: unknown): unknown {
  let cur: unknown = schema;
  for (let depth = 0; depth < 16; depth++) {
    if (cur === null || cur === undefined) return cur;
    const shape = (cur as { _zod?: { def?: { shape?: unknown } } })?._zod?.def?.shape;
    if (shape !== undefined) return cur;
    const inner = (cur as { _zod?: { def?: { innerType?: unknown } } })?._zod?.def?.innerType;
    if (inner === undefined) return cur;
    cur = inner;
  }
  return cur;
}

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
