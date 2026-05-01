
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

export const FORM_WRITE_ORIGIN = Object.freeze({
  source: 'local' as const,
  skipStoreHooks: false,
  context: Object.freeze({ origin: 'form-write' as const }),
});

const RESERVED_FRONTMATTER_KEY = 'frontmatter';

export interface FrontmatterDocProvider {
  document: Y.Doc;
  on(event: 'synced', listener: () => void): void;
  off(event: 'synced', listener: () => void): void;
}

export interface FrontmatterBindingPatchSuccess {
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

export type Unsubscribe = () => void;

export interface FrontmatterSnapshot {
  map: FrontmatterMap;
  keys: string[];
  parseError: string | undefined;
}

export interface FrontmatterBinding {
  current(): FrontmatterSnapshot;
  patch(patch: FrontmatterPatch): FrontmatterBindingPatchResult;
  rename(
    oldKey: string,
    newKey: string,
    options?: { allowDuplicate?: boolean },
  ): FrontmatterBindingRenameResult;
  reorder(orderedKeys: readonly string[]): FrontmatterBindingReorderResult;
  subscribe(listener: (snapshot: FrontmatterSnapshot) => void): Unsubscribe;
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

function readSnapshotFromYText(ytext: Y.Text): { snapshot: FrontmatterSnapshot; raw: string } {
  const raw = ytext.toString();
  return { snapshot: snapshotFromRaw(raw), raw };
}

function snapshotFromRaw(raw: string): FrontmatterSnapshot {
  const { map, parseError } = readFmRegionWithError(raw);
  const keys = readFmKeys(raw);
  return { map, keys, parseError };
}

export function bindFrontmatterDoc(provider: FrontmatterDocProvider): FrontmatterBinding {
  const ydoc = provider.document;
  const ytext = ydoc.getText('source');

  const listeners = new Set<(snapshot: FrontmatterSnapshot) => void>();
  const initial = readSnapshotFromYText(ytext);
  let lastSnapshot: FrontmatterSnapshot = initial.snapshot;
  let lastFenced = detectFmRegion(initial.raw).fenced;
  let disposed = false;

  function fireListeners(force = false): void {
    if (disposed) return;
    let next: FrontmatterSnapshot;
    let raw: string;
    try {
      const read = readSnapshotFromYText(ytext);
      next = read.snapshot;
      raw = read.raw;
    } catch (e) {
      console.warn('[bindFrontmatterDoc] readSnapshotFromYText threw:', e);
      return;
    }
    if (!force && snapshotsEqual(lastSnapshot, next)) {
      return;
    }
    lastSnapshot = next;
    lastFenced = detectFmRegion(raw).fenced;
    for (const listener of listeners) {
      try {
        listener(next);
      } catch (e) {
        console.warn('[bindFrontmatterDoc] listener threw:', e);
      }
    }
  }

  const onYTextChange = (event: Y.YTextEvent): void => {
    if (disposed) return;
    if (touchesFmRegion(event, lastFenced.length)) {
      fireListeners();
    }
  };

  ytext.observe(onYTextChange);
  provider.on('synced', forceFireListeners);
  function forceFireListeners(): void {
    fireListeners(true);
  }

  function commitFmEdit(op: (currentFenced: string) => FmEditResult): FmEditResult {
    let outcome: FmEditResult | undefined;
    ydoc.transact(() => {
      const currentFull = ytext.toString();
      const { fenced: currentFenced } = detectFmRegion(currentFull);
      outcome = op(currentFenced);
      if (!outcome.ok) return;
      if (outcome.nextFenced === currentFenced) return;
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
      return readSnapshotFromYText(ytext).snapshot;
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

function touchesFmRegion(event: Y.YTextEvent, fmLength: number): boolean {
  if (fmLength === 0) {
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
