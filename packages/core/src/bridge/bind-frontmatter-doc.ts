/**
 * UI-side FrontmatterBinding (CRDT-direct over `Y.Text('source')`).
 *
 * Browser-and-Node-compatible wrapper around a Hocuspocus-bound `Y.Doc` that
 * exposes a typed read/patch/rename/reorder/subscribe API over the YAML region
 * of `Y.Text('source')`. Sibling to `bindConfigDoc` — same posture, same
 * lifecycle model, same `Result`-typed errors.
 *
 * Single defense layer:
 *   - L1 (this binding): client-side `FrontmatterPatchSchema` + region-byte-
 *     size gate before any Y.Text mutation. Invalid → `Result.err`, no
 *     Y.Doc write.
 *
 * No L3 server-side hook. Source-mode malformed YAML is handled at read time
 * (panel renders last-valid + banner per D21). Y.Text region IS the source of
 * truth (D31 LOCKED).
 *
 * Provider lifecycle: the caller owns the `HocuspocusProvider`. The binding
 * attaches a `ytext.observe` listener and a `synced` listener to the provider;
 * both detach on `dispose()`.
 *
 * Origin: writes use `FORM_WRITE_ORIGIN` (single-root writer; touches only
 * Y.Text). Drag-reorder commits MUST recompute the region byte range inside
 * `doc.transact(...)` immediately before the byte-range replace — never use a
 * snapshot from `dragstart` (STOP_IF rule, D12).
 */

import type * as Y from 'yjs';
import type { Err, Ok, Result } from '../config/result.ts';
import { type FrontmatterValidationError, toFrontmatterIssue } from '../frontmatter/errors.ts';
import {
  type FrontmatterMap,
  type FrontmatterPatch,
  FrontmatterPatchSchema,
} from '../frontmatter/schema.ts';
import {
  applyPatchToFm,
  applyRenameToFm,
  applyReorderToFm,
  detectFmRegion,
  type FmEditError,
  type FmEditResult,
  MAX_FM_REGION_BYTES,
  readFmKeys,
  readFmRegionWithError,
} from './frontmatter-region.ts';

/**
 * Origin marker the binding stamps on its Y.Text writes.
 *
 * `paired: false` (omitted) — single-root writer (touches only `Y.Text`,
 * not `Y.XmlFragment`). Server Observer B fires normally to sync the
 * recomposed body into XmlFragment when the FM-region byte length shifts the
 * body. For pure FM-only edits the body stays identical and Observer B
 * exits via the already-in-sync gate (`server-observers.ts:369`).
 */
export const FORM_WRITE_ORIGIN = Object.freeze({
  source: 'local' as const,
  skipStoreHooks: false,
  context: Object.freeze({ origin: 'form-write' as const }),
});

/**
 * Reserved frontmatter key — the legacy single-string slot from the
 * predecessor schema. Reject so the new contract stays clean.
 */
const RESERVED_FRONTMATTER_KEY = 'frontmatter';

/**
 * Structural type satisfied by `HocuspocusProvider` — keeps `@inkeep/open-
 * knowledge-core` free of a runtime `@hocuspocus/provider` dep. Tests can pass
 * a minimal mock with just `document` + a small event emitter.
 */
export interface FrontmatterDocProvider {
  /** The Y.Doc bound to this provider. */
  document: Y.Doc;
  /** Subscribe to provider events. We only use `'synced'` for the
   *  reconnect-fires-listener semantic — see `subscribe()` below. */
  on(event: 'synced', listener: () => void): void;
  off(event: 'synced', listener: () => void): void;
}

export interface FrontmatterBindingPatchSuccess {
  /** Top-level keys the patch touched (set or deleted). */
  appliedKeys: string[];
}

export type FrontmatterBindingPatchResult = Result<
  FrontmatterBindingPatchSuccess,
  FrontmatterValidationError
>;

export interface FrontmatterBindingRenameSuccess {
  oldKey: string;
  newKey: string;
}

export type FrontmatterBindingRenameResult = Result<
  FrontmatterBindingRenameSuccess,
  FrontmatterValidationError
>;

export interface FrontmatterBindingReorderSuccess {
  orderedKeys: string[];
}

export type FrontmatterBindingReorderResult = Result<
  FrontmatterBindingReorderSuccess,
  FrontmatterValidationError
>;

/** Returned from `subscribe()` — call to stop receiving updates. */
export type Unsubscribe = () => void;

/**
 * Snapshot of the FM region for React render + commit gating. `parseError`
 * is set when YAML is unparseable; UI surfaces a banner and renders
 * `map` (which holds the last-valid map for the snapshot — empty when there
 * is no prior valid state).
 */
export interface FrontmatterSnapshot {
  map: FrontmatterMap;
  /** Source-order list of keys exactly as they appear in YAML (dup-keys preserved). */
  keys: string[];
  /** Set when YAML is malformed; consumers render last-valid + a banner per D21. */
  parseError: string | undefined;
}

/**
 * Typed read/patch/rename/reorder/subscribe API over a frontmatter Y.Text
 * region. Constructed via `bindFrontmatterDoc(provider)`.
 */
export interface FrontmatterBinding {
  /** Snapshot the current parsed map + key order + parse error envelope. */
  current(): FrontmatterSnapshot;
  /**
   * Apply a JSON-Merge-Patch (RFC 7396) — `key: value` to set/create,
   * `key: null` to delete, missing keys unchanged. Validates BEFORE any
   * Y.Text mutation. Existing keys update in place (FR2 — no reorder on
   * value or set-existing). New keys append at the end (D15).
   *
   * The reserved key `'frontmatter'` is rejected with `SCHEMA_INVALID`.
   */
  patch(patch: FrontmatterPatch): FrontmatterBindingPatchResult;
  /**
   * Rename a property in place — Pair's source position is preserved (FR2).
   * Refuses unknown source key. By default refuses target collision (the UI
   * pre-checks); pass `allowDuplicate: true` to admit both rows for the
   * dup-name surfacing path (D17).
   */
  rename(
    oldKey: string,
    newKey: string,
    options?: { allowDuplicate?: boolean },
  ): FrontmatterBindingRenameResult;
  /**
   * Reorder properties to match `orderedKeys` exactly. Recomputes the FM
   * region byte range INSIDE `doc.transact(...)` immediately before the
   * byte-range replace (D12 STOP_IF rule). The drop commit lands in one
   * transaction.
   */
  reorder(orderedKeys: readonly string[]): FrontmatterBindingReorderResult;
  /**
   * Listen for changes to the bound frontmatter region. Fires on every
   * Y.Text observe event AND on every provider `'synced'` event (the latter
   * guarantees reconnect-fresh-value semantics).
   *
   * Includes a content-equality bailout: skips firing when the parsed
   * `FrontmatterMap` shape is byte-identical to the previously-fired one
   * (D20 — keeps body keystrokes from invalidating React state).
   */
  subscribe(listener: (snapshot: FrontmatterSnapshot) => void): Unsubscribe;
  /** Detach the Y.Text observer + provider listener. */
  dispose(): void;
}

function err(error: FrontmatterValidationError): Err<FrontmatterValidationError> {
  return { ok: false, error };
}

function okPatch(value: FrontmatterBindingPatchSuccess): Ok<FrontmatterBindingPatchSuccess> {
  return { ok: true, ...value };
}

function okRename(value: FrontmatterBindingRenameSuccess): Ok<FrontmatterBindingRenameSuccess> {
  return { ok: true, ...value };
}

function okReorder(value: FrontmatterBindingReorderSuccess): Ok<FrontmatterBindingReorderSuccess> {
  return { ok: true, ...value };
}

function fmEditErrorToValidation(e: FmEditError): FrontmatterValidationError {
  switch (e.kind) {
    case 'unknown_key':
      return {
        code: 'SCHEMA_INVALID',
        issues: [{ path: [e.key], message: `unknown key '${e.key}'`, issueCode: 'unknown_key' }],
      };
    case 'duplicate_target':
      return {
        code: 'SCHEMA_INVALID',
        issues: [
          {
            path: [e.key],
            message: `key '${e.key}' already exists`,
            issueCode: 'duplicate_target',
          },
        ],
      };
    case 'invalid_value':
      return {
        code: 'SCHEMA_INVALID',
        issues: [{ path: [e.key], message: e.reason, issueCode: 'invalid_value' }],
      };
    case 'reserved_key':
      return {
        code: 'SCHEMA_INVALID',
        issues: [
          {
            path: [e.key],
            message: `'${e.key}' is a reserved frontmatter key`,
            issueCode: 'reserved_key',
          },
        ],
      };
    case 'reorder_mismatch':
      return {
        code: 'WRITE_ERROR',
        detail: 'reorder list does not match current keys (state changed mid-drag)',
      };
    case 'region_too_large':
      return {
        code: 'SCHEMA_INVALID',
        issues: [
          {
            path: [],
            message: `Frontmatter region exceeds ${MAX_FM_REGION_BYTES}-byte limit (would be ${e.bytes})`,
            issueCode: 'region_too_large',
          },
        ],
      };
    case 'parse_failed':
      return {
        code: 'WRITE_ERROR',
        detail: `Frontmatter YAML is malformed; fix in source mode to commit (${e.reason})`,
      };
  }
}

function snapshotsEqual(a: FrontmatterSnapshot, b: FrontmatterSnapshot): boolean {
  if (a.parseError !== b.parseError) return false;
  if (a.keys.length !== b.keys.length) return false;
  for (let i = 0; i < a.keys.length; i++) {
    if (a.keys[i] !== b.keys[i]) return false;
  }
  // Map equality — keys equal already, so just compare values.
  for (const key of a.keys) {
    if (!frontmatterValuesEqual(a.map[key], b.map[key])) return false;
  }
  return true;
}

function frontmatterValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  return false;
}

/**
 * Read the FM region keys from a parsed Document — exposed so `current()` can
 * surface them alongside the map (the UI uses `keys` for render order +
 * dup-name detection).
 */
function readSnapshotFromYText(ytext: Y.Text): FrontmatterSnapshot {
  const snapshot = ytext.toString();
  const { map, parseError } = readFmRegionWithError(snapshot);
  // Source-order keys (with duplicates preserved) — re-parse via the AST
  // path. Light enough for typical FM (≤10 keys) that re-walking on each
  // observer fire isn't a hot path; the perf-critical path is the body-edit
  // bailout in `subscribe`.
  const keys = readKeysFromFenced(snapshot);
  return { map, keys, parseError };
}

function readKeysFromFenced(ytextSnapshot: string): string[] {
  return readFmKeys(ytextSnapshot);
}

/**
 * Bind a Hocuspocus-attached Y.Doc as a typed frontmatter source. The caller
 * is responsible for creating + destroying the provider.
 */
export function bindFrontmatterDoc(provider: FrontmatterDocProvider): FrontmatterBinding {
  const ydoc = provider.document;
  const ytext = ydoc.getText('source');

  const listeners = new Set<(snapshot: FrontmatterSnapshot) => void>();
  let lastSnapshot: FrontmatterSnapshot = readSnapshotFromYText(ytext);
  let lastFenced = detectFmRegion(ytext.toString()).fenced;
  let disposed = false;

  function fireListeners(force = false): void {
    if (disposed) return;
    const next = readSnapshotFromYText(ytext);
    if (!force && snapshotsEqual(lastSnapshot, next)) {
      return;
    }
    lastSnapshot = next;
    lastFenced = detectFmRegion(ytext.toString()).fenced;
    for (const listener of listeners) {
      try {
        listener(next);
      } catch (e) {
        console.warn('[bindFrontmatterDoc] listener threw:', e);
      }
    }
  }

  /**
   * Y.Text observer with positional bailout (D20). The event delta describes
   * inserts/deletes by retain-cursor position — if every op's position is
   * `>= lastFenced.length`, the FM region wasn't touched and we bail out.
   * Body keystrokes pay only the delta walk, not a re-parse.
   */
  const onYTextChange = (event: Y.YTextEvent): void => {
    if (disposed) return;
    if (touchesFmRegion(event, lastFenced.length)) {
      fireListeners();
    }
  };

  ytext.observe(onYTextChange);
  // Provider 'synced' fires after every successful sync. When the post-sync
  // state is identical to the pre-sync state, the observer won't fire — but
  // subscribers expect at least one notification on reconnect with the
  // fresh value.
  provider.on('synced', forceFireListeners);
  function forceFireListeners(): void {
    fireListeners(true);
  }

  /**
   * Run an FM-region edit operation entirely inside a single
   * `doc.transact(..., FORM_WRITE_ORIGIN)` block. The op closure receives the
   * current fenced region (recomputed inside the transact) and returns either
   * an `FmEditResult` describing the next fenced bytes or `null` to indicate
   * "no commit needed". Mirrors `reorderInner`'s D12 STOP_IF discipline so
   * any reader of the source can verify the parse-edit-stringify ↔ Y.Text
   * write sequence is atomic without tracking call-graph order across
   * `withCurrentFenced` + `commitYTextRegion` boundaries.
   */
  function commitFmEdit(op: (currentFenced: string) => FmEditResult): FmEditResult {
    let outcome: FmEditResult | undefined;
    ydoc.transact(() => {
      // STOP_IF rule (D12): recompute region byte range INSIDE the transact
      // so a remote peer's body edit between the call entry and the commit
      // doesn't leave us pointing into the body.
      const currentFull = ytext.toString();
      const { fenced: currentFenced } = detectFmRegion(currentFull);
      outcome = op(currentFenced);
      if (!outcome.ok) return;
      if (outcome.nextFenced === currentFenced) return;
      // Atomic byte-range replace. For a fresh insertion (currentFenced === '')
      // the slice is empty and we insert at byte 0.
      ytext.delete(0, currentFenced.length);
      if (outcome.nextFenced !== '') {
        ytext.insert(0, outcome.nextFenced);
      }
    }, FORM_WRITE_ORIGIN);
    return (
      outcome ?? {
        ok: false,
        error: { kind: 'parse_failed', reason: 'commit transact produced no result' },
      }
    );
  }

  function patchInner(patch: FrontmatterPatch): FrontmatterBindingPatchResult {
    if (disposed) {
      return err({ code: 'WRITE_ERROR', detail: 'FrontmatterBinding has been disposed' });
    }

    if (Object.hasOwn(patch, RESERVED_FRONTMATTER_KEY)) {
      return err({
        code: 'SCHEMA_INVALID',
        issues: [
          {
            path: [RESERVED_FRONTMATTER_KEY],
            message: `'${RESERVED_FRONTMATTER_KEY}' is a reserved frontmatter key`,
            issueCode: 'reserved_key',
          },
        ],
      });
    }

    const parsed = FrontmatterPatchSchema.safeParse(patch);
    if (!parsed.success) {
      return err({
        code: 'SCHEMA_INVALID',
        issues: parsed.error.issues.map(toFrontmatterIssue),
      });
    }

    const validated = parsed.data;
    const appliedKeys = Object.keys(validated);

    const result = commitFmEdit((currentFenced) => applyPatchToFm(currentFenced, validated));
    if (!result.ok) {
      return err(fmEditErrorToValidation(result.error));
    }

    return okPatch({ appliedKeys });
  }

  function renameInner(
    oldKey: string,
    newKey: string,
    options: { allowDuplicate?: boolean } = {},
  ): FrontmatterBindingRenameResult {
    if (disposed) {
      return err({ code: 'WRITE_ERROR', detail: 'FrontmatterBinding has been disposed' });
    }

    const result = commitFmEdit((currentFenced) =>
      applyRenameToFm(currentFenced, oldKey, newKey, options),
    );
    if (!result.ok) {
      return err(fmEditErrorToValidation(result.error));
    }

    return okRename({ oldKey, newKey });
  }

  function reorderInner(orderedKeys: readonly string[]): FrontmatterBindingReorderResult {
    if (disposed) {
      return err({ code: 'WRITE_ERROR', detail: 'FrontmatterBinding has been disposed' });
    }

    const result = commitFmEdit((currentFenced) => applyReorderToFm(currentFenced, orderedKeys));
    if (!result.ok) {
      return err(fmEditErrorToValidation(result.error));
    }
    return okReorder({ orderedKeys: [...orderedKeys] });
  }

  return {
    current(): FrontmatterSnapshot {
      return readSnapshotFromYText(ytext);
    },

    patch(patch: FrontmatterPatch): FrontmatterBindingPatchResult {
      return patchInner(patch);
    },

    rename(
      oldKey: string,
      newKey: string,
      options?: { allowDuplicate?: boolean },
    ): FrontmatterBindingRenameResult {
      return renameInner(oldKey, newKey, options);
    },

    reorder(orderedKeys: readonly string[]): FrontmatterBindingReorderResult {
      return reorderInner(orderedKeys);
    },

    subscribe(listener: (snapshot: FrontmatterSnapshot) => void): Unsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      ytext.unobserve(onYTextChange);
      provider.off('synced', forceFireListeners);
      listeners.clear();
    },
  };
}

/**
 * Walk a `YTextEvent` delta. Return true when any op intersects the FM region
 * `[0, fmLength)` — a touch means the panel must re-parse + re-render. Pure
 * body edits (every op at position `>= fmLength`) bail out without a parse.
 *
 * Y.js delta op shape: `{ insert?: string | object, delete?: number, retain?: number }`.
 * We track a logical cursor that advances on `retain`, and treat any op whose
 * start cursor position is `< fmLength` as a region touch — for `delete`
 * specifically, this is sufficient because the post-state cursor reflects
 * positions in the resulting doc, so a delete at `cursor >= fmLength` removes
 * bytes that were entirely in the body (the FM region had already shifted
 * before the delete's effective offset).
 */
function touchesFmRegion(event: Y.YTextEvent, fmLength: number): boolean {
  // Defensive: when the binding's lastFenced is empty (no FM yet), any
  // insert at position 0 might be the user starting an FM block — re-parse.
  if (fmLength === 0) {
    // Any structural change to the doc could newly introduce an FM region.
    return true;
  }
  let cursor = 0;
  for (const op of event.delta) {
    if (typeof op.retain === 'number') {
      cursor += op.retain;
      continue;
    }
    if (typeof op.insert === 'string') {
      if (cursor < fmLength) return true;
      cursor += op.insert.length;
      continue;
    }
    if (op.insert !== undefined) {
      // Embedded objects — treat as a touch when at/inside region.
      if (cursor < fmLength) return true;
      cursor += 1;
      continue;
    }
    if (typeof op.delete === 'number') {
      if (cursor < fmLength) return true;
    }
  }
  return false;
}
