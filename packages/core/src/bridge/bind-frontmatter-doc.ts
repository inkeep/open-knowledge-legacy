/**
 * UI-side FrontmatterBinding.
 *
 * Browser-and-Node-compatible wrapper around a Hocuspocus-bound `Y.Doc` that
 * exposes a typed read/patch/subscribe API over `Y.Map('metadata')` per-key
 * entries. Sibling to `bindConfigDoc` — same posture (L1 client-side gate),
 * same lifecycle model, same `Result`-typed errors.
 *
 * Three-layer defense-in-depth:
 *   - L1 (this binding): client-side `FrontmatterPatchSchema` parse before any
 *     `Y.Map` mutation. Invalid → `Result.err`, no Y.Doc write.
 *   - L2 (none today): no headless writer needed. Server-side agent paths
 *     (agent-sessions.ts) call `setFrontmatterProperty` directly under their
 *     per-session paired origin and skip the L3 hook by origin check.
 *   - L3 (server persistence-hook): validates per-key state and reverts via
 *     `FRONTMATTER_VALIDATION_REVERT_ORIGIN` on schema failure, then
 *     broadcasts `cc1:frontmatter-validation-rejected` so the originating
 *     client can surface the error.
 *
 * Provider lifecycle: the caller owns the `HocuspocusProvider`. The binding
 * attaches a deep observer to `Y.Map('metadata')` and a `synced` listener to
 * the provider; both detach on `dispose()`.
 *
 * Origin: writes use `FORM_WRITE_ORIGIN` — the structural shape mirrored on
 * the server (`packages/server/src/frontmatter-edit-origin.ts`). The L3 hook
 * gates on `origin.context.origin === 'form-write'` (structural check, not
 * reference equality) so the browser-side and server-side origin objects are
 * recognized as the same writer class.
 */

import type * as Y from 'yjs';
import type { Err, Ok, Result } from '../config/result.ts';
import { type FrontmatterValidationError, toFrontmatterIssue } from '../frontmatter/errors.ts';
import {
  type FrontmatterMap,
  type FrontmatterPatch,
  FrontmatterPatchSchema,
} from '../frontmatter/schema.ts';
import { getFrontmatterMap, setFrontmatterProperty } from './frontmatter-y.ts';

/**
 * Origin marker the binding stamps on its Y.Map writes. Structurally
 * identical to the server-side `FORM_WRITE_ORIGIN` in
 * `packages/server/src/frontmatter-edit-origin.ts` (deep-frozen on this side
 * too so accidental mutation throws). The L3 server-side hook recognizes
 * form writes by `origin.context.origin === 'form-write'` — structural,
 * not by-reference, so client-emitted writes match.
 *
 * `paired: false` (omitted) — single-root writer (touches only `Y.Map('metadata')`,
 * not Y.Text or XmlFragment). Observer A must fire normally on the metaMap
 * deep observer to recompose YAML+body for Y.Text.
 */
export const FORM_WRITE_ORIGIN = Object.freeze({
  source: 'local' as const,
  skipStoreHooks: false,
  context: Object.freeze({ origin: 'form-write' as const }),
});

/**
 * Reserved frontmatter key — the legacy single-string slot mirror used by
 * Observer A/B. Reject this key in client patches so the per-key contract
 * stays clean (the slot is server-internal transition state).
 */
const RESERVED_FRONTMATTER_KEY = 'frontmatter';

/**
 * Structural type satisfied by `HocuspocusProvider` — keeps `@inkeep/open-
 * knowledge-core` free of a runtime `@hocuspocus/provider` dep. The concrete
 * `HocuspocusProvider` from `@hocuspocus/provider` satisfies this shape.
 *
 * Tests can pass a minimal mock with just `document` + a small event emitter.
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

/** Returned from `subscribe()` — call to stop receiving updates. */
export type Unsubscribe = () => void;

/**
 * Typed read/patch/subscribe API over a frontmatter `Y.Map('metadata')`.
 * Constructed via `bindFrontmatterDoc(provider)`; consumer is responsible for
 * the provider's lifecycle.
 */
export interface FrontmatterBinding {
  /**
   * Snapshot the current per-key frontmatter map. Empty when the doc has no
   * frontmatter (or only the legacy single-string slot).
   */
  current(): FrontmatterMap;
  /**
   * Apply a JSON-Merge-Patch (RFC 7396) — `key: value` to set/create,
   * `key: null` to delete, missing keys unchanged. Validates the patch
   * against `FrontmatterPatchSchema` BEFORE any Y.Map mutation. On failure,
   * returns `Result.err` and does not touch the doc. On success, writes per-
   * key entries inside `doc.transact(fn, FORM_WRITE_ORIGIN)`.
   *
   * The reserved key `'frontmatter'` is rejected with `SCHEMA_INVALID` so
   * the legacy single-string slot stays under server-side observer control.
   */
  patch(patch: FrontmatterPatch): FrontmatterBindingPatchResult;
  /**
   * Listen for changes to the bound frontmatter map. Fires on every
   * `Y.Map('metadata')` deep change AND on every provider `'synced'` event.
   * The latter guarantees reconnect-fresh-value semantics. Returns an
   * `Unsubscribe`.
   *
   * The listener does NOT fire synchronously on subscribe — call `current()`
   * for the initial value, then react to subsequent updates.
   */
  subscribe(listener: (map: FrontmatterMap) => void): Unsubscribe;
  /**
   * Detach the metaMap observer + provider listener. The caller still owns
   * the provider — destroying the provider also tears down the underlying
   * Y.Doc, which would invalidate this binding even if `dispose()` was never
   * called.
   */
  dispose(): void;
}

function err(error: FrontmatterValidationError): Err<FrontmatterValidationError> {
  return { ok: false, error };
}

function ok(value: FrontmatterBindingPatchSuccess): Ok<FrontmatterBindingPatchSuccess> {
  return { ok: true, ...value };
}

/**
 * Bind a Hocuspocus-attached Y.Doc as a typed frontmatter source. The caller
 * is responsible for creating + destroying the provider.
 */
export function bindFrontmatterDoc(provider: FrontmatterDocProvider): FrontmatterBinding {
  const ydoc = provider.document;
  const metaMap = ydoc.getMap('metadata');

  const listeners = new Set<(map: FrontmatterMap) => void>();
  let disposed = false;

  function fireListeners(): void {
    if (disposed) return;
    const map = getFrontmatterMap(ydoc);
    for (const listener of listeners) {
      try {
        listener(map);
      } catch (e) {
        console.warn('[bindFrontmatterDoc] listener threw:', e);
      }
    }
  }

  // metaMap deep observer fires on every per-key change (local + remote
  // post-sync deltas) plus mutations to nested Y.Text / Y.Array<Y.Text> slots.
  metaMap.observeDeep(fireListeners);
  // Provider 'synced' fires after every successful sync. When the post-sync
  // state is identical to the pre-sync state, the metaMap observer doesn't
  // fire — but subscribers expect at least one notification on reconnect with
  // the fresh value. Wiring 'synced' to `fireListeners` covers both cases.
  // The double-fire on a reconnect that produces a delta is idempotent in
  // React (state-equality bailout).
  provider.on('synced', fireListeners);

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

    ydoc.transact(() => {
      for (const [key, value] of Object.entries(validated)) {
        setFrontmatterProperty(ydoc, key, value);
      }
    }, FORM_WRITE_ORIGIN);

    return ok({ appliedKeys });
  }

  return {
    current(): FrontmatterMap {
      return getFrontmatterMap(ydoc);
    },

    patch(patch: FrontmatterPatch): FrontmatterBindingPatchResult {
      return patchInner(patch);
    },

    subscribe(listener: (map: FrontmatterMap) => void): Unsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      metaMap.unobserveDeep(fireListeners);
      provider.off('synced', fireListeners);
      listeners.clear();
    },
  };
}
