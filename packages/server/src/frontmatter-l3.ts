/**
 * L3 frontmatter validation hook — defense-in-depth gate that runs in
 * `onStoreDocument` for non-config docs. Mirrors the L3 config validation
 * hook in `config-persistence.ts` but scoped to `Y.Map('metadata')` per-key
 * entries.
 *
 * Purpose: catch writes that bypass the L1 client binding
 * (`bindFrontmatterDoc`) or the per-key helpers in
 * `@inkeep/open-knowledge-core/bridge/frontmatter-y.ts` and land an
 * invalid-shape value directly via `metaMap.set(...)`. On invalid: revert
 * the bad keys to the per-doc LKG (or delete if no prior valid value),
 * then fire `onFrontmatterRejected` so the originating client can be
 * notified via CC1 broadcast.
 *
 * This hook does NOT validate the legacy single-string `'frontmatter'`
 * slot — that mirror is server-internal and is rewritten by Observer A
 * after every per-key change. It only validates user-key entries.
 */

import type { LocalTransactionOrigin } from '@hocuspocus/server';
import {
  type FrontmatterMap,
  type FrontmatterValidationError,
  type FrontmatterValue,
  FrontmatterValueSchema,
} from '@inkeep/open-knowledge-core';
import * as Y from 'yjs';
import { FRONTMATTER_VALIDATION_REVERT_ORIGIN } from './frontmatter-edit-origin.ts';

const LEGACY_FRONTMATTER_KEY = 'frontmatter';

/** Per-server-instance LKG cache, scoped per-doc. Updated only after a
 *  successful validation pass. The cache survives across Hocuspocus
 *  document lifecycles for the lifetime of the server process. */
export type FrontmatterLkgCache = Map<string, FrontmatterMap>;

export interface FrontmatterL3Ctx {
  lkgCache: FrontmatterLkgCache;
  /** Fires when L3 reverts a bad write. Wired in standalone boot to
   *  `cc1Broadcaster?.emitFrontmatterValidationRejected(docName, error)`.
   *  Omitted in plugin mode where no CC1Broadcaster is available. */
  onFrontmatterRejected?: (docName: string, error: FrontmatterValidationError) => void;
}

/** Outcome surface for the hook — used by callers for telemetry / branching. */
type FrontmatterL3Outcome = 'no-op' | 'valid' | 'reverted';

/**
 * Coerce a per-key Y-typed slot into its plain runtime value, identical to
 * the helper in `frontmatter-y.ts` but exposed here so the L3 hook can flag
 * UN-coercible slots (those that fail `unwrapSlot` are the ones that bypass
 * the type system entirely — the primary defense target).
 *
 * Returns `null` (not undefined) when the value is outside the supported
 * shape set so the caller can distinguish "absent" from "invalid".
 */
function unwrapSlot(value: unknown): FrontmatterValue | null {
  if (value instanceof Y.Text) return value.toString();
  if (value instanceof Y.Array) {
    const out: string[] = [];
    for (const item of value as Y.Array<unknown>) {
      if (item instanceof Y.Text) out.push(item.toString());
      else if (typeof item === 'string') out.push(item);
      else return null;
    }
    return out;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    return value as string[];
  }
  return null;
}

/**
 * Validate every per-key entry in `Y.Map('metadata')` against
 * `FrontmatterValueSchema`. Returns the validated map plus a list of
 * keys that failed (either unparseable shape or schema rejection).
 */
function validateAndMap(metaMap: Y.Map<unknown>): {
  validMap: FrontmatterMap;
  invalidKeys: { key: string; message: string }[];
} {
  const validMap: FrontmatterMap = {};
  const invalidKeys: { key: string; message: string }[] = [];
  for (const [key, raw] of metaMap.entries()) {
    if (key === LEGACY_FRONTMATTER_KEY) continue;
    const unwrapped = unwrapSlot(raw);
    if (unwrapped === null) {
      invalidKeys.push({
        key,
        message: 'value shape not supported (expected string, number, boolean, or string[])',
      });
      continue;
    }
    const parsed = FrontmatterValueSchema.safeParse(unwrapped);
    if (!parsed.success) {
      invalidKeys.push({
        key,
        message: parsed.error.issues[0]?.message ?? 'value failed schema',
      });
      continue;
    }
    validMap[key] = parsed.data;
  }
  return { validMap, invalidKeys };
}

/**
 * Run the L3 hook. Called from `onStoreDocument` for non-system / non-config
 * docs before the disk-write path.
 *
 * Outcomes:
 *   - `'no-op'` — origin is the revert origin (loop guard) OR no per-key
 *     changes vs. LKG. The disk-write path proceeds normally.
 *   - `'valid'` — all per-key entries validated; LKG cache updated. The
 *     disk-write path proceeds normally.
 *   - `'reverted'` — one or more keys had invalid values; bad keys were
 *     reverted to LKG values (or deleted if no prior LKG entry).
 *     `onFrontmatterRejected` fired with the issue list. The caller
 *     should still let the disk-write proceed — the post-revert state
 *     is now valid and worth flushing.
 */
export function validateAndRevertFrontmatterIfBad(
  document: Y.Doc,
  documentName: string,
  lastTransactionOrigin: LocalTransactionOrigin | unknown,
  ctx: FrontmatterL3Ctx,
): FrontmatterL3Outcome {
  if (lastTransactionOrigin === FRONTMATTER_VALIDATION_REVERT_ORIGIN) return 'no-op';

  const metaMap = document.getMap('metadata');
  const { validMap, invalidKeys } = validateAndMap(metaMap);

  if (invalidKeys.length === 0) {
    // Compare cheap-equality with cached LKG; skip the cache update when
    // unchanged. The shallow-compare is sufficient because the shapes are
    // primitives + flat string arrays.
    const cached = ctx.lkgCache.get(documentName);
    if (cached !== undefined && shallowMapEqual(cached, validMap)) {
      return 'no-op';
    }
    ctx.lkgCache.set(documentName, validMap);
    return 'valid';
  }

  // One or more keys failed validation. Revert each bad key to its LKG
  // value, or delete it if no prior LKG entry exists.
  const lkg = ctx.lkgCache.get(documentName);
  document.transact(() => {
    for (const { key } of invalidKeys) {
      const lkgValue = lkg?.[key];
      if (lkgValue === undefined) {
        metaMap.delete(key);
      } else {
        metaMap.set(key, lkgValue);
      }
    }
  }, FRONTMATTER_VALIDATION_REVERT_ORIGIN);

  const error: FrontmatterValidationError = {
    code: 'SCHEMA_INVALID',
    issues: invalidKeys.map(({ key, message }) => ({
      path: [key],
      message,
      issueCode: 'invalid_value',
    })),
  };
  ctx.onFrontmatterRejected?.(documentName, error);
  return 'reverted';
}

function shallowMapEqual(a: FrontmatterMap, b: FrontmatterMap): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    const av = a[key];
    const bv = b[key];
    if (av === undefined || bv === undefined) return false;
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (av.length !== bv.length) return false;
      for (let i = 0; i < av.length; i += 1) {
        if (av[i] !== bv[i]) return false;
      }
      continue;
    }
    if (av !== bv) return false;
  }
  return true;
}
