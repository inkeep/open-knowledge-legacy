/**
 * Frontmatter value schemas — single source of truth for value shapes accepted
 * across the browser-side `bindFrontmatterDoc` binding (used by the property
 * panel for direct CRDT writes to the YAML region of `Y.Text('source')`),
 * Observer B (source-mode YAML reconciliation), and disk-side YAML parsing on
 * file-watcher / load events.
 *
 * Five widget types: text, number, boolean, date, list. Date and text both
 * serialize to a YAML string; the distinction is metadata in a `types` map
 * rather than the value shape itself. ISO 8601 date strings are inferred as
 * `date` by `inferType`; consumers may override via the per-property `types`
 * map.
 */
import { z } from 'zod';

export const FRONTMATTER_TYPES = ['text', 'number', 'boolean', 'date', 'list'] as const;
export type FrontmatterType = (typeof FRONTMATTER_TYPES)[number];

export const FrontmatterTypeSchema = z.enum(FRONTMATTER_TYPES);

/**
 * Raw value shape — what an MCP agent sends in a Merge Patch payload, what
 * Observer B parses out of source-mode YAML, and what is stored in the
 * per-key `Y.Map('metadata')` slot (the slot may wrap an editable string in
 * `Y.Text` or a list in `Y.Array<Y.Text>`, but the value shape it represents
 * is one of these four).
 *
 * Lists are flat string arrays only — nested objects and multi-typed lists
 * are out of scope.
 */
export const FrontmatterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);
export type FrontmatterValue = z.infer<typeof FrontmatterValueSchema>;

/** Strict ISO 8601 date string (YYYY-MM-DD) — used to disambiguate text vs date. */
const ISO_8601_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && ISO_8601_DATE_RE.test(value);
}

/**
 * Infer the widget type from a raw value's shape. Used by the
 * `frontmatter_patch` handler when an agent creates a new property without an
 * explicit `types` override.
 *
 * Note: ISO 8601 strings infer as `date`; bare strings infer as `text`. An
 * agent that wants a date-shaped string stored as `text` (e.g. a version
 * string) must pass an explicit `types` override.
 */
export function inferType(value: FrontmatterValue): FrontmatterType {
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (isIsoDateString(value)) return 'date';
  return 'text';
}

/**
 * Map shape for an entire frontmatter block — `getFrontmatterMap` returns
 * this; `frontmatter_patch` accepts `Record<string, FrontmatterValue | null>`
 * (null = delete, per RFC 7396 Merge Patch).
 */
export const FrontmatterMapSchema = z.record(z.string(), FrontmatterValueSchema);
export type FrontmatterMap = z.infer<typeof FrontmatterMapSchema>;

export const FrontmatterPatchSchema = z.record(
  z.string(),
  z.union([FrontmatterValueSchema, z.null()]),
);
export type FrontmatterPatch = z.infer<typeof FrontmatterPatchSchema>;
