/**
 * Canonical YAML codec for frontmatter.
 *
 * Wraps `yaml@2.x` `parseDocument` / `Document.toString()` so that:
 *   - User-source order is preserved (`sortMapEntries: false`).
 *   - Comments and blank lines round-trip via the Document AST (`parseDocument`,
 *     not `parse`).
 *   - Output is deterministic across runs (default scalar style, no anchors).
 *
 * Used at every YAML boundary: disk load (`onLoadDocument`), disk store
 * (`onStoreDocument`), source-mode reconciliation (Observer B), and the
 * MCP `frontmatter_patch` handler when a payload key needs to be re-rendered
 * inline with existing comments.
 */
import { Document, type Pair, parseDocument, type ToStringOptions } from 'yaml';
import { type FrontmatterMap, FrontmatterMapSchema, FrontmatterValueSchema } from './schema.ts';

const STRINGIFY_OPTIONS: ToStringOptions = {
  defaultKeyType: 'PLAIN',
  defaultStringType: 'PLAIN',
  lineWidth: 0,
};

/** Result of a parse attempt — `null` map when the YAML is malformed or empty. */
export type ParsedFrontmatter = {
  doc: Document;
  map: FrontmatterMap | null;
};

/**
 * Parse a YAML *body* (the content between the `---` fences, no fences) into
 * a `Document` (preserving comments + source order) and a typed `FrontmatterMap`
 * snapshot. Returns `map: null` if the YAML is malformed or its top-level value
 * is not a mapping or contains values outside the supported shapes.
 *
 * Empty / whitespace-only input is valid: returns an empty map plus a fresh
 * Document (the caller can populate it).
 */
export function parseFrontmatterYaml(yaml: string): ParsedFrontmatter {
  if (yaml.trim() === '') {
    return { doc: new Document({}), map: {} };
  }
  let doc: Document;
  try {
    doc = parseDocument(yaml);
  } catch {
    return { doc: new Document({}), map: null };
  }
  if (doc.errors.length > 0) {
    return { doc, map: null };
  }
  const json = doc.toJS();
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    return { doc, map: null };
  }
  const result = FrontmatterMapSchema.safeParse(json);
  if (!result.success) {
    return { doc, map: null };
  }
  return { doc, map: result.data };
}

/**
 * Serialize a `FrontmatterMap` to canonical YAML (no `---` fences). Output is
 * stable across runs given the same input — the substrate bridge invariant
 * depends on this (composed-string equality across XmlFragment ↔ Y.Text).
 *
 * Returns the empty string for an empty map so callers can decide whether to
 * emit fences at all (`prependFrontmatter` already short-circuits on empty).
 */
export function serializeFrontmatterMap(map: FrontmatterMap): string {
  if (Object.keys(map).length === 0) return '';
  const doc = new Document(map);
  return doc.toString(STRINGIFY_OPTIONS);
}

/**
 * Apply a per-key patch to an existing parsed Document, preserving comments
 * and source order on untouched keys.
 *
 * Semantics (RFC 7396 Merge Patch):
 *   - `value !== null` → set or create the key
 *   - `value === null` → delete the key
 *   - missing keys → unchanged
 *
 * Returns the canonical YAML string (no fences). Validates each value against
 * `FrontmatterValueSchema` and throws on shape mismatch — the caller is
 * expected to pre-validate at the API boundary.
 */
export function applyPatchToDocument(doc: Document, patch: Record<string, unknown>): string {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      doc.delete(key);
      continue;
    }
    const result = FrontmatterValueSchema.safeParse(value);
    if (!result.success) {
      throw new Error(`Invalid frontmatter value for "${key}": ${result.error.message}`);
    }
    doc.set(key, result.data);
  }
  return doc.toString(STRINGIFY_OPTIONS);
}

/**
 * Wrap a serialized YAML body with `---` fences for disk persistence. Returns
 * the empty string for an empty body (caller writes a fence-less file).
 */
export function withFences(yamlBody: string): string {
  if (yamlBody === '') return '';
  const trimmed = yamlBody.endsWith('\n') ? yamlBody.slice(0, -1) : yamlBody;
  return `---\n${trimmed}\n---\n`;
}

/**
 * Read the ordered list of key strings from a parsed Document — used when the
 * caller needs to populate a `Y.Map` in the YAML's source order.
 */
export function getDocumentKeys(doc: Document): string[] {
  const contents = doc.contents;
  if (contents == null || typeof contents !== 'object' || !('items' in contents)) {
    return [];
  }
  const items = (contents as { items: Pair[] }).items;
  return items
    .map((pair) => {
      const key = pair.key as { value?: unknown } | string | undefined;
      if (typeof key === 'string') return key;
      if (key && typeof key === 'object' && 'value' in key && typeof key.value === 'string') {
        return key.value;
      }
      return null;
    })
    .filter((k): k is string => k !== null);
}
