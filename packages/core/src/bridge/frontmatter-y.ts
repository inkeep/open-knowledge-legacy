/**
 * Frontmatter readers + writers over `Y.Map('metadata')`.
 *
 * Storage convention is in transition:
 *   - Legacy single-string slot: `metaMap.get('frontmatter')` = entire YAML
 *     as a string. Used by Observer A/B today.
 *   - Per-key entries: `metaMap.get('title')`, `metaMap.get('tags')`, etc. —
 *     one slot per frontmatter property. Field-level CRDT merge for
 *     concurrent multi-writer edits. Editable strings may be wrapped in
 *     `Y.Text`; lists in `Y.Array<Y.Text>`.
 *
 * `getFrontmatter` synthesizes a YAML string from per-key entries when any
 * exist; otherwise it falls back to the legacy string slot. This keeps the
 * existing string-shape readers compiling while writers migrate incrementally.
 *
 * Used by both the client observer (`packages/app/src/editor/observers.ts`)
 * for baseline tracking and the server observer
 * (`packages/server/src/server-observers.ts`) for cross-CRDT sync.
 */
import * as Y from 'yjs';
import { unwrapFrontmatterFences } from '../extensions/frontmatter.ts';
import type { FrontmatterMap, FrontmatterValue } from '../frontmatter/schema.ts';
import {
  parseFrontmatterYaml,
  serializeFrontmatterMap,
  withFences,
} from '../frontmatter/yaml-codec.ts';

const LEGACY_FRONTMATTER_KEY = 'frontmatter';

/** True if any non-legacy entry exists in `Y.Map('metadata')`. */
function hasPerKeyEntries(metaMap: Y.Map<unknown>): boolean {
  for (const key of metaMap.keys()) {
    if (key !== LEGACY_FRONTMATTER_KEY) return true;
  }
  return false;
}

/**
 * Coerce a per-key Y-typed slot into its plain runtime value:
 *   - `Y.Text` → `.toString()`
 *   - `Y.Array<Y.Text>` → `string[]`
 *   - primitives (string / number / boolean) → as-is
 *
 * Returns `undefined` when the slot value is outside the supported shape set
 * (defensive — callers treat as "skip this key" rather than a hard error).
 */
function unwrapSlot(value: unknown): FrontmatterValue | undefined {
  if (value instanceof Y.Text) return value.toString();
  if (value instanceof Y.Array) {
    const out: string[] = [];
    for (const item of value as Y.Array<unknown>) {
      if (item instanceof Y.Text) out.push(item.toString());
      else if (typeof item === 'string') out.push(item);
      else return undefined;
    }
    return out;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value as string[];
  }
  return undefined;
}

/**
 * Return the frontmatter as a structured map of per-key values. Legacy
 * single-string slot (`'frontmatter'`) is excluded. Returns an empty object
 * when no per-key entries exist (the doc is in legacy storage shape).
 */
export function getFrontmatterMap(doc: Y.Doc): FrontmatterMap {
  const metaMap = doc.getMap('metadata');
  const out: FrontmatterMap = {};
  for (const [key, raw] of metaMap.entries()) {
    if (key === LEGACY_FRONTMATTER_KEY) continue;
    const v = unwrapSlot(raw);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/**
 * Return the frontmatter as a YAML-fenced string for body composition (e.g.
 * `prependFrontmatter(getFrontmatter(doc), body)` in the bridge invariant).
 *
 * Synthesized from per-key entries when any exist; otherwise falls back to
 * the legacy single-string slot. Empty when neither is populated.
 */
export function getFrontmatter(doc: Y.Doc): string {
  const metaMap = doc.getMap('metadata');
  if (hasPerKeyEntries(metaMap)) {
    const map = getFrontmatterMap(doc);
    const yaml = serializeFrontmatterMap(map);
    return withFences(yaml);
  }
  const legacy = metaMap.get(LEGACY_FRONTMATTER_KEY);
  return typeof legacy === 'string' ? legacy : '';
}

/**
 * Replace the per-key entries in `Y.Map('metadata')` from a YAML string. Used
 * by `onLoadDocument` (eager-on-load migration), `applyExternalChange`, and
 * Observer B reconciliation. The caller is responsible for running this
 * inside a `doc.transact(fn, origin)` block — this helper is shape-only.
 *
 * Semantics:
 *   - YAML body without `---` fences (caller pre-strips).
 *   - Per-key diff: existing keys not in the parsed map are deleted; new
 *     keys are inserted; values that differ are set. Per-key (not bulk
 *     `clear()+setAll()`) preserves UndoManager attribution per property,
 *     so undoing one property reverts only that property.
 *   - Malformed YAML: no-op + returns `false` so the caller can keep last
 *     valid per-key state.
 *
 * Removes the legacy `'frontmatter'` slot on success (the per-key entries
 * are now the source).
 */
export function setFrontmatterFromYaml(doc: Y.Doc, yaml: string): boolean {
  const { map } = parseFrontmatterYaml(yaml);
  if (map === null) return false;
  const metaMap = doc.getMap('metadata');
  const desired = new Set(Object.keys(map));
  for (const existing of [...metaMap.keys()]) {
    if (existing === LEGACY_FRONTMATTER_KEY) {
      metaMap.delete(existing);
      continue;
    }
    if (!desired.has(existing)) metaMap.delete(existing);
  }
  for (const [key, value] of Object.entries(map)) {
    const current = unwrapSlot(metaMap.get(key));
    if (!isEqualValue(current, value)) {
      metaMap.set(key, value);
    }
  }
  return true;
}

/**
 * Atomic dual-write of a fenced YAML frontmatter string into both
 * representations: per-key `Y.Map('metadata')` entries (via
 * `setFrontmatterFromYaml`) and the legacy `'frontmatter'` slot (verbatim
 * mirror so comment-bearing input round-trips through
 * `composeFrontmatterForStore`).
 *
 * **Use this at every FM-touching server-side write surface.** Inlining the
 * pair has surfaced bugs (e.g. rollback handler missing the per-key call —
 * stale per-key state silently overwrites disk on the next persistence
 * cycle). Consolidating here means a future write site cannot forget half
 * of the pair.
 *
 * `fencedYaml` is the full fenced string (e.g. `---\ntitle: X\n---\n`) or
 * `''` for empty FM. Caller wraps in `doc.transact(fn, origin)`.
 *
 * Returns the `setFrontmatterFromYaml` boolean so callers can log when
 * malformed YAML left per-key state stale (callers still see the legacy
 * mirror updated — that's the documented contract: keep last valid per-key
 * state, mirror as-supplied).
 */
export function writeFrontmatterDualSlot(doc: Y.Doc, fencedYaml: string): boolean {
  const ok = setFrontmatterFromYaml(doc, unwrapFrontmatterFences(fencedYaml));
  doc.getMap('metadata').set(LEGACY_FRONTMATTER_KEY, fencedYaml);
  return ok;
}

/**
 * Set or delete a single frontmatter property in `Y.Map('metadata')`. Pass
 * `null` (or omit `value`) to delete. Caller wraps in `doc.transact(fn, origin)`.
 *
 * Note: this helper writes plain JS values to the slot. Y-types (`Y.Text`
 * for editable strings, `Y.Array<Y.Text>` for lists) are introduced by
 * higher-level writers (e.g. the form path / `frontmatter_patch` handler)
 * once those wires are in place.
 */
export function setFrontmatterProperty(
  doc: Y.Doc,
  key: string,
  value: FrontmatterValue | null,
): void {
  const metaMap = doc.getMap('metadata');
  if (value === null) {
    metaMap.delete(key);
    return;
  }
  metaMap.set(key, value);
}

function isEqualValue(a: FrontmatterValue | undefined, b: FrontmatterValue): boolean {
  if (a === undefined) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => item === b[i]);
  }
  return a === b;
}

function mapsEqual(a: FrontmatterMap, b: FrontmatterMap): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    const bValue = b[key];
    if (bValue === undefined) return false;
    if (!isEqualValue(a[key], bValue)) return false;
  }
  return true;
}

/**
 * Compose the fenced YAML frontmatter for `onStoreDocument` to write to disk.
 *
 * Prefers the legacy single-string slot verbatim when its parsed value matches
 * the per-key state — this keeps comments, blank lines, and scalar styles
 * intact for `doc-load → no-op-form-edit → doc-save` round-trips. Falls back
 * to canonical synthesis from the per-key map when state has diverged or no
 * legacy mirror exists.
 *
 * Returns the fenced FM string (e.g. `---\n…\n---\n`) or `''` for no FM.
 */
export function composeFrontmatterForStore(doc: Y.Doc): string {
  const metaMap = doc.getMap('metadata');
  const map = getFrontmatterMap(doc);
  const legacy = metaMap.get(LEGACY_FRONTMATTER_KEY);
  const legacyFenced = typeof legacy === 'string' ? legacy : '';
  if (Object.keys(map).length === 0) return legacyFenced;
  if (legacyFenced) {
    const yamlBody = unwrapFrontmatterFences(legacyFenced);
    const parsed = parseFrontmatterYaml(yamlBody);
    if (parsed.map !== null && mapsEqual(parsed.map, map)) {
      return legacyFenced;
    }
  }
  return withFences(serializeFrontmatterMap(map));
}
