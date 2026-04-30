/**
 * Parse-edit-stringify primitives over the YAML region of a `Y.Text('source')`.
 *
 * The frontmatter region is detected by `FRONTMATTER_RE` (precedent #3 / D3),
 * parsed by `yaml@2.x` `parseDocument({ uniqueKeys: false })` (D4), edited at
 * the `Pair` level so source order is preserved on rename, and re-stringified
 * with `Document.toString()`. Output round-trips verbatim through
 * `parseFrontmatterYaml`.
 *
 * Lives in `@inkeep/open-knowledge-core` so both browser (`bindFrontmatterDoc`)
 * and Node (server / agent paths) can share one parser. No dep on `yjs` —
 * callers pass strings; they own the `Y.Text` mutation transact.
 */
import {
  Document,
  type Pair,
  parseDocument,
  type Scalar,
  type ToStringOptions,
  type YAMLMap,
} from 'yaml';
import { FRONTMATTER_RE, unwrapFrontmatterFences } from '../extensions/frontmatter.ts';
import {
  type FrontmatterMap,
  FrontmatterMapSchema,
  type FrontmatterValue,
  FrontmatterValueSchema,
} from '../frontmatter/schema.ts';
import { withFences } from '../frontmatter/yaml-codec.ts';

/**
 * Maximum byte length the binding will admit for a fenced FM region. Source-mode
 * users can still type past the limit via Y.Text — the binding only refuses
 * structured commits past this size (D33). 64 KB is generous; typical FM is
 * <1 KB.
 */
export const MAX_FM_REGION_BYTES = 65536;

const STRINGIFY_OPTIONS: ToStringOptions = {
  defaultKeyType: 'PLAIN',
  defaultStringType: 'PLAIN',
  lineWidth: 0,
};

/**
 * Result of detecting the FM region within a full Y.Text snapshot. `fenced`
 * is the empty string when there is no FM region; in that case the binding
 * inserts a fresh fenced block on the first commit.
 */
interface FmRegion {
  /** Full fenced YAML string (including the leading + trailing `---`). */
  fenced: string;
  /** Body content immediately following the fence. */
  body: string;
}

/**
 * Detect the FM region inside a Y.Text snapshot. Mirrors `stripFrontmatter`
 * but exposes the fenced region directly.
 */
export function detectFmRegion(ytextSnapshot: string): FmRegion {
  const match = ytextSnapshot.match(FRONTMATTER_RE);
  if (!match) return { fenced: '', body: ytextSnapshot };
  return { fenced: match[0], body: ytextSnapshot.slice(match[0].length) };
}

/**
 * Parsed yaml@2 `Document` plus a typed `FrontmatterMap` snapshot. `map === null`
 * means the YAML is malformed or fails `FrontmatterMapSchema`; consumers
 * (`PropertyPanel`) render last-valid + a banner per D21.
 *
 * Always uses `parseDocument(yaml, { uniqueKeys: false })` (D4 LOCKED) so
 * dup-name documents survive `Document.toString()` (A6 probe-verified).
 */
export interface ParsedFmRegion {
  doc: Document;
  map: FrontmatterMap | null;
  parseError?: string;
}

/**
 * Parse the FM region's YAML body (no fences). Empty/whitespace-only input is
 * a valid empty Document.
 */
export function parseFmRegion(yamlBody: string): ParsedFmRegion {
  if (yamlBody.trim() === '') {
    return { doc: new Document({}), map: {} };
  }
  let doc: Document;
  try {
    doc = parseDocument(yamlBody, { uniqueKeys: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { doc: new Document({}), map: null, parseError: `parse threw: ${msg}` };
  }
  if (doc.errors.length > 0) {
    return { doc, map: null, parseError: doc.errors[0]?.message ?? 'yaml parse errors' };
  }
  const json = doc.toJS();
  if (json == null || typeof json !== 'object' || Array.isArray(json)) {
    return { doc, map: null, parseError: 'top-level value is not a mapping' };
  }
  const result = FrontmatterMapSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue && Array.isArray(issue.path) ? issue.path.join('.') : '';
    const reason = issue?.message ?? 'unknown';
    return {
      doc,
      map: null,
      parseError: path
        ? `value at "${path}" failed schema: ${reason}`
        : `schema validation failed: ${reason}`,
    };
  }
  return { doc, map: result.data };
}

/**
 * Parse the FM region directly from a fenced string (`---\n…\n---\n`). Empty
 * fenced input → empty Document.
 */
export function parseFencedFmRegion(fenced: string): ParsedFmRegion {
  if (fenced === '') return { doc: new Document({}), map: {} };
  return parseFmRegion(unwrapFrontmatterFences(fenced));
}

/**
 * Read the structured map from a Y.Text snapshot. Returns an empty map when
 * there is no FM region OR the YAML is malformed (the latter case is the
 * "render last-valid" intent of D21 — the caller distinguishes via
 * `parseFmRegion(...).parseError`).
 */
export function readFmMap(ytextSnapshot: string): FrontmatterMap {
  const { fenced } = detectFmRegion(ytextSnapshot);
  const { map } = parseFencedFmRegion(fenced);
  return map ?? {};
}

/**
 * Read both the structured map AND the parse-error envelope from a Y.Text
 * snapshot in one pass. Used by the PropertyPanel to render last-valid + the
 * inline banner without re-parsing.
 */
interface ReadFmResult {
  /** Last-valid map (empty when YAML is malformed and there is no prior valid state to render). */
  map: FrontmatterMap;
  /** Present when the YAML is malformed; consumers surface a banner. */
  parseError: string | undefined;
}

export function readFmRegionWithError(ytextSnapshot: string): ReadFmResult {
  const { fenced } = detectFmRegion(ytextSnapshot);
  const { map, parseError } = parseFencedFmRegion(fenced);
  return { map: map ?? {}, parseError };
}

/**
 * Read the ordered list of property names from the FM region. Used by
 * `binding.reorder()` consumers to construct the move list. When YAML is
 * malformed, returns an empty list (consumers render last-valid via
 * `readFmRegionWithError`).
 */
export function readFmKeys(ytextSnapshot: string): string[] {
  const { fenced } = detectFmRegion(ytextSnapshot);
  if (fenced === '') return [];
  const { doc, map } = parseFencedFmRegion(fenced);
  if (map === null) return [];
  return getDocKeys(doc);
}

function isPair(item: unknown): item is Pair {
  return item !== null && typeof item === 'object' && 'key' in (item as Record<string, unknown>);
}

function pairKey(pair: Pair): string | null {
  const key = pair.key as { value?: unknown } | string | undefined;
  if (typeof key === 'string') return key;
  if (key && typeof key === 'object' && 'value' in key && typeof key.value === 'string') {
    return key.value;
  }
  return null;
}

function setPairKey(pair: Pair, newKey: string): void {
  const key = pair.key as Scalar<unknown> | { value?: unknown } | string | undefined;
  if (typeof key === 'string') {
    pair.key = newKey;
    return;
  }
  if (key && typeof key === 'object') {
    (key as { value: string }).value = newKey;
    return;
  }
  pair.key = newKey;
}

function getDocKeys(doc: Document): string[] {
  const contents = doc.contents as YAMLMap | null | undefined;
  if (!contents || !('items' in contents) || !Array.isArray(contents.items)) return [];
  const out: string[] = [];
  for (const item of contents.items) {
    if (!isPair(item)) continue;
    const k = pairKey(item);
    if (k !== null) out.push(k);
  }
  return out;
}

/**
 * Sentinel returned when an edit operation cannot be represented in the FM
 * region (e.g. unknown key in `rename`, value shape outside
 * `FrontmatterValueSchema`). Production code converts these into structured
 * `FrontmatterValidationError`s at the binding boundary.
 */
export type FmEditError =
  | { kind: 'unknown_key'; key: string }
  | { kind: 'duplicate_target'; key: string }
  | { kind: 'invalid_value'; key: string; reason: string }
  | { kind: 'reserved_key'; key: string }
  | { kind: 'reorder_mismatch'; expected: string[]; got: string[] }
  | { kind: 'region_too_large'; bytes: number; limit: number }
  | { kind: 'parse_failed'; reason: string };

export type FmEditResult = { ok: true; nextFenced: string } | { ok: false; error: FmEditError };

const RESERVED_FRONTMATTER_KEY = 'frontmatter';

function ensureContents(doc: Document): YAMLMap {
  if (doc.contents == null || !('items' in (doc.contents as object))) {
    const empty = doc.createNode({}) as YAMLMap;
    doc.contents = empty;
    return empty;
  }
  return doc.contents as YAMLMap;
}

/** Convert the parsed Document back to fenced YAML. Empty Document → empty string. */
function stringify(doc: Document): string {
  const contents = doc.contents as YAMLMap | null | undefined;
  if (!contents || !('items' in contents) || (contents.items?.length ?? 0) === 0) {
    return '';
  }
  return withFences(doc.toString(STRINGIFY_OPTIONS));
}

function checkRegionSize(fenced: string): FmEditError | null {
  const bytes = new TextEncoder().encode(fenced).byteLength;
  if (bytes > MAX_FM_REGION_BYTES) {
    return { kind: 'region_too_large', bytes, limit: MAX_FM_REGION_BYTES };
  }
  return null;
}

/**
 * Apply an RFC 7396 Merge Patch to the FM region. `null` deletes; other values
 * set or insert. New keys append to the end (D15). Existing keys are updated
 * in place (no reorder — D8 + D11 + FR2).
 *
 * The reserved key `'frontmatter'` is rejected to keep the legacy slot from
 * being re-introduced via the public surface.
 */
export function applyPatchToFm(
  currentFenced: string,
  patch: Record<string, FrontmatterValue | null>,
): FmEditResult {
  if (Object.hasOwn(patch, RESERVED_FRONTMATTER_KEY)) {
    return { ok: false, error: { kind: 'reserved_key', key: RESERVED_FRONTMATTER_KEY } };
  }

  const { doc, map } = parseFencedFmRegion(currentFenced);
  if (map === null) {
    // Refuse to commit while the region is unparseable — the panel renders
    // last-valid; user must fix in source mode (D21 + D31).
    return { ok: false, error: { kind: 'parse_failed', reason: 'fm region unparseable' } };
  }

  const contents = ensureContents(doc);

  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      doc.delete(key);
      continue;
    }
    const parsed = FrontmatterValueSchema.safeParse(value);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          kind: 'invalid_value',
          key,
          reason: parsed.error.issues[0]?.message ?? 'invalid value',
        },
      };
    }
    const existing = contents.items?.find(
      (item): item is Pair => isPair(item) && pairKey(item) === key,
    );
    if (existing) {
      // Set in place. yaml@2's `doc.set(key, value)` REPLACES the Pair at the
      // same source position when the key already exists, preserving order
      // (the position invariant FR2 hinges on).
      doc.set(key, parsed.data);
    } else {
      doc.set(key, parsed.data);
    }
  }

  const next = stringify(doc);
  const sizeErr = checkRegionSize(next);
  if (sizeErr) return { ok: false, error: sizeErr };
  return { ok: true, nextFenced: next };
}

/**
 * Rename a property in place — `Pair`'s key is mutated; its source position is
 * preserved (FR2). Refuses unknown source key. Refuses target collision unless
 * caller explicitly allows duplicate names (`allowDuplicate: true` per D17 +
 * D18; for now the binding always passes `false` and asks the UI to surface
 * the duplicate via the rendered map).
 */
export function applyRenameToFm(
  currentFenced: string,
  oldKey: string,
  newKey: string,
  options: { allowDuplicate?: boolean } = {},
): FmEditResult {
  if (oldKey === RESERVED_FRONTMATTER_KEY || newKey === RESERVED_FRONTMATTER_KEY) {
    return { ok: false, error: { kind: 'reserved_key', key: RESERVED_FRONTMATTER_KEY } };
  }

  const { doc, map } = parseFencedFmRegion(currentFenced);
  if (map === null) {
    return { ok: false, error: { kind: 'parse_failed', reason: 'fm region unparseable' } };
  }

  if (oldKey === newKey) {
    return { ok: true, nextFenced: currentFenced };
  }

  const contents = doc.contents as YAMLMap | null | undefined;
  if (!contents || !('items' in contents) || !Array.isArray(contents.items)) {
    return { ok: false, error: { kind: 'unknown_key', key: oldKey } };
  }

  const sourcePair = contents.items.find(
    (item): item is Pair => isPair(item) && pairKey(item) === oldKey,
  );
  if (!sourcePair) {
    return { ok: false, error: { kind: 'unknown_key', key: oldKey } };
  }

  if (!options.allowDuplicate) {
    const collides = contents.items.some(
      (item) => isPair(item) && item !== sourcePair && pairKey(item) === newKey,
    );
    if (collides) {
      return { ok: false, error: { kind: 'duplicate_target', key: newKey } };
    }
  }

  setPairKey(sourcePair, newKey);

  const next = stringify(doc);
  const sizeErr = checkRegionSize(next);
  if (sizeErr) return { ok: false, error: sizeErr };
  return { ok: true, nextFenced: next };
}

/**
 * Reorder properties to match `orderedKeys`. The list must be a permutation
 * of the current keys (length-equal + setwise-equal); otherwise returns
 * `reorder_mismatch` and the caller refreshes from current state.
 */
export function applyReorderToFm(
  currentFenced: string,
  orderedKeys: readonly string[],
): FmEditResult {
  const { doc, map } = parseFencedFmRegion(currentFenced);
  if (map === null) {
    return { ok: false, error: { kind: 'parse_failed', reason: 'fm region unparseable' } };
  }

  const contents = doc.contents as YAMLMap | null | undefined;
  if (!contents || !('items' in contents) || !Array.isArray(contents.items)) {
    return { ok: true, nextFenced: currentFenced };
  }

  const currentKeys = getDocKeys(doc);
  if (currentKeys.length !== orderedKeys.length || !permutationOf(currentKeys, orderedKeys)) {
    return {
      ok: false,
      error: {
        kind: 'reorder_mismatch',
        expected: currentKeys,
        got: [...orderedKeys],
      },
    };
  }

  // For dup-name documents, reorder maps each requested key to the FIRST
  // matching Pair in source-order, then to the SECOND, etc. — preserves
  // 1-to-1 correspondence so a permutation across N rows of the same name
  // still moves N distinct Pairs.
  const remaining: Pair[] = contents.items.filter(isPair);
  const next: Pair[] = [];
  for (const key of orderedKeys) {
    const idx = remaining.findIndex((p) => pairKey(p) === key);
    if (idx === -1) {
      return {
        ok: false,
        error: {
          kind: 'reorder_mismatch',
          expected: currentKeys,
          got: [...orderedKeys],
        },
      };
    }
    const [picked] = remaining.splice(idx, 1);
    if (picked) next.push(picked);
  }
  contents.items = next;

  const nextFenced = stringify(doc);
  const sizeErr = checkRegionSize(nextFenced);
  if (sizeErr) return { ok: false, error: sizeErr };
  return { ok: true, nextFenced };
}

function permutationOf(a: readonly string[], b: readonly string[]): boolean {
  const counts = new Map<string, number>();
  for (const k of a) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const k of b) {
    const next = (counts.get(k) ?? 0) - 1;
    if (next < 0) return false;
    counts.set(k, next);
  }
  for (const v of counts.values()) if (v !== 0) return false;
  return true;
}
