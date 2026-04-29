/**
 * UI-side ConfigBinding.
 *
 * Browser-and-Node-compatible wrapper around a Hocuspocus-bound `Y.Doc` that
 * exposes a typed read/patch/subscribe API over the config doc's `Y.Text`.
 *
 * Three-layer defense-in-depth: this is L1 (client-side walker). Per-field
 * commits go through `patch()`; invalid patches return a typed `Result.err`
 * and never mutate `Y.Text`. L2 (`writeConfigPatch`, headless) and L3
 * (persistence-hook revert) are the safety nets for non-binding writers.
 *
 * Provider lifecycle: the caller owns the `HocuspocusProvider`. Each config
 * doc gets its OWN provider — pool reuse would require gating
 * `setupObservers` to keep the markdown bridge from running on Y.Text-only
 * docs (the bridge is already gated server-side; client-side a pooled
 * provider would also engage TipTap binding which we explicitly don't want).
 *
 * No client-side persistence: `bindConfigDoc` does NOT call
 * `createClientPersistence` / `IndexeddbPersistence`. Stale IDB cache would
 * race with fresh server LKG on reconnect. Cold-mount cost (~100-300ms) is
 * well under the 200ms first-open target's tolerance.
 */

import { isMap, type ParsedNode, parseDocument } from 'yaml';
import type * as Y from 'yjs';
import type { ConfigValidationError } from './errors.ts';
import type { Err, Ok, Result } from './result.ts';
import { type Config, type ConfigPatch, ConfigSchema } from './schema.ts';
import { addConfigSpanEvent, withConfigSpanSync } from './telemetry.ts';
import { applyPatchToDocument, toConfigIssue } from './yaml-patch.ts';

/**
 * Structural type satisfied by `HocuspocusProvider` — keeps `@inkeep/open-
 * knowledge-core` free of a runtime `@hocuspocus/provider` dep. The concrete
 * `HocuspocusProvider` from `@hocuspocus/provider` satisfies this shape.
 *
 * Tests can pass a minimal mock with just `document` + a small event emitter.
 */
export interface ConfigDocProvider {
  /** The Y.Doc bound to this provider. */
  document: Y.Doc;
  /**
   * Subscribe to provider events. We only use `'synced'` for the
   * reconnect-fires-listener semantic — see `subscribe()` below.
   */
  on(event: 'synced', listener: () => void): void;
  off(event: 'synced', listener: () => void): void;
}

/** Successful patch outcome — same shape as `WriteConfigPatchSuccess` minus fs fields. */
export interface ConfigBindingPatchSuccess {
  /** The full merged Config after applying the patch + Zod defaults. */
  effective: Config;
  /** Dotted paths of leaves the patch touched. */
  appliedPaths: string[];
}

export type ConfigBindingPatchResult = Result<ConfigBindingPatchSuccess, ConfigValidationError>;

/** Returned from `subscribe()` — call to stop receiving updates. */
export type Unsubscribe = () => void;

/**
 * Typed read/patch/subscribe API over a config Y.Doc. Constructed via
 * `bindConfigDoc(provider, scope)`; consumer is responsible for the
 * provider's lifecycle.
 */
export interface ConfigBinding {
  /**
   * Parse the current Y.Text content as YAML and return the merged
   * `Config`. On parse or schema failure, falls back to schema defaults
   * — the binding never throws from `current()`. Use `patch()` for
   * write-time validation feedback.
   */
  current(): Config;
  /**
   * Apply a deep-partial patch via yaml@2 Document round-trip. Validates
   * the merged document against `ConfigSchema` BEFORE mutating Y.Text.
   * Returns `Result.err` with no Y.Text mutation on validation failure;
   * returns `Result.ok` with the merged effective config + applied paths
   * on success.
   *
   * The Y.Text mutation runs inside `doc.transact(...)`. The transaction
   * has no marked origin — it propagates through Hocuspocus normally and
   * triggers the persistence-hook (L3) for end-to-end disk write.
   */
  patch(patch: ConfigPatch): ConfigBindingPatchResult;
  /**
   * Listen for changes to the bound config. Fires on every Y.Text change
   * (local + remote) AND on every provider `'synced'` event. The latter
   * guarantees reconnect-fresh-value semantics even when the post-sync
   * state is byte-identical to the pre-sync state. Returns an
   * `Unsubscribe` function; calling it removes the listener.
   *
   * The listener does NOT fire synchronously on subscribe — call
   * `current()` for the initial value, then react to subsequent updates.
   */
  subscribe(listener: (config: Config) => void): Unsubscribe;
  /**
   * Detach the binding's Y.Text observer + provider listener. The caller
   * still owns the provider — destroying the provider also tears down the
   * underlying Y.Doc, which would invalidate this binding even if
   * `dispose()` was never called.
   */
  dispose(): void;
}

interface BindConfigDocOptions {
  /**
   * Override the Y.Text key. Defaults to `'source'` (the convention used by
   * `loadConfigDoc` / `storeConfigDoc` / `applyExternalConfigChange` in
   * server/config-persistence.ts). Tests may pass `'test'` or similar.
   */
  ytextKey?: string;
}

const DEFAULT_YTEXT_KEY = 'source';

function err(error: ConfigValidationError): Err<ConfigValidationError> {
  return { ok: false, error };
}

function ok(value: ConfigBindingPatchSuccess): Ok<ConfigBindingPatchSuccess> {
  return { ok: true, ...value };
}

/**
 * Schema defaults — single shared instance per process. `ConfigSchema.parse({})`
 * runs every `.default()` callback synchronously; the result is invariant for
 * a process lifetime.
 */
let cachedDefaults: Config | null = null;
function schemaDefaults(): Config {
  if (cachedDefaults === null) {
    cachedDefaults = ConfigSchema.parse({});
  }
  return cachedDefaults;
}

function readCurrent(ytext: Y.Text): Config {
  const content = ytext.toString();
  if (content.length === 0) return schemaDefaults();

  const doc = parseDocument(content);
  if (doc.errors.length > 0) return schemaDefaults();

  const merged = doc.toJSON() ?? {};
  const result = ConfigSchema.safeParse(merged);
  return result.success ? result.data : schemaDefaults();
}

/**
 * Bind a Hocuspocus-attached Y.Doc as a typed config source. The caller is
 * responsible for creating + destroying the provider; the binding does NOT
 * instantiate any client-side persistence layer.
 *
 * The `scope` parameter is informational — it does NOT enforce scope-as-
 * constraint (the Settings pane filters fields per `getFieldMeta(field).scope`).
 * Callers should ensure `provider` is connected to a config doc matching
 * `scope` (`__config__/workspace` for `'workspace'`, `__user__/config.yml`
 * for `'user'`).
 */
export function bindConfigDoc(
  provider: ConfigDocProvider,
  scope: 'workspace' | 'user',
  options: BindConfigDocOptions = {},
): ConfigBinding {
  return withConfigSpanSync(
    'config.bind',
    { 'config.scope': scope, 'config.transport': 'ytext' },
    () => bindConfigDocInner(provider, scope, options),
  );
}

function bindConfigDocInner(
  provider: ConfigDocProvider,
  scope: 'workspace' | 'user',
  options: BindConfigDocOptions,
): ConfigBinding {
  const { ytextKey = DEFAULT_YTEXT_KEY } = options;
  const ydoc = provider.document;
  const ytext = ydoc.getText(ytextKey);

  const listeners = new Set<(config: Config) => void>();
  let disposed = false;

  function fireListeners(): void {
    if (disposed) return;
    const config = readCurrent(ytext);
    for (const listener of listeners) {
      try {
        listener(config);
      } catch (e) {
        console.warn(`[bindConfigDoc:${scope}] listener threw:`, e);
      }
    }
  }

  // Y.Text observer fires on every change (local + remote post-sync deltas).
  ytext.observe(fireListeners);
  // Provider 'synced' fires after every successful sync. When the post-sync
  // state is identical to the pre-sync state, the Y.Text observer doesn't
  // fire — but subscribers expect at least one notification on reconnect with
  // the fresh value. Wiring 'synced' to `fireListeners` covers both cases.
  // The double-fire on a reconnect that produces a delta is idempotent in
  // React (state-equality bailout).
  provider.on('synced', fireListeners);

  function patchInner(patch: ConfigPatch): ConfigBindingPatchResult {
    if (disposed) {
      return err({
        code: 'WRITE_ERROR',
        detail: `ConfigBinding (${scope}) has been disposed`,
      });
    }

    const currentContent = ytext.toString();
    const doc = parseDocument(currentContent);
    if (doc.errors.length > 0) {
      return err({
        code: 'YAML_PARSE',
        detail: doc.errors.map((e) => e.message).join('; '),
      });
    }

    // Empty Y.Text → empty Document. setIn requires a top-level map to
    // create nested paths; createNode({}) gives us one. Mirrors the
    // writeConfigPatch contents-null branch.
    if (doc.contents === null) {
      doc.contents = doc.createNode({}) as ParsedNode;
    } else if (!isMap(doc.contents)) {
      return err({
        code: 'YAML_PARSE',
        detail: 'Top-level YAML value must be a mapping (object)',
      });
    }

    const appliedPaths = applyPatchToDocument(doc, patch);
    const merged = doc.toJSON() ?? {};
    // L1 of the three-layer defense. Wrapped in a config.validate span
    // with `validation.layer: 'L1'` so traces correlate the client-side gate
    // with the L2 (writeConfigPatch) and L3 (persistence-hook) passes.
    const parsed = withConfigSpanSync(
      'config.validate',
      { 'config.scope': scope, 'config.validation.layer': 'L1' },
      (validateSpan) => {
        const r = ConfigSchema.safeParse(merged);
        validateSpan.setAttribute('config.outcome', r.success ? 'success' : 'rejected');
        if (!r.success) {
          for (const issue of r.error.issues) {
            addConfigSpanEvent('config.validation.issue', {
              'issue.path': issue.path.map((p) => String(p)).join('.'),
              'issue.message': issue.message,
            });
          }
        }
        return r;
      },
    );
    if (!parsed.success) {
      return err({
        code: 'SCHEMA_INVALID',
        issues: parsed.error.issues.map(toConfigIssue),
      });
    }

    // Serialize and replace Y.Text content atomically. The transaction
    // has no marked origin — propagates through Hocuspocus normally so
    // the persistence-hook (L3) and any other connected clients see the
    // update.
    const newContent = doc.toString();
    ydoc.transact(() => {
      if (ytext.length > 0) ytext.delete(0, ytext.length);
      ytext.insert(0, newContent);
    });

    return ok({
      effective: parsed.data,
      appliedPaths,
    });
  }

  return {
    current(): Config {
      return readCurrent(ytext);
    },

    patch(patch: ConfigPatch): ConfigBindingPatchResult {
      return withConfigSpanSync(
        'config.patch',
        { 'config.scope': scope, 'config.transport': 'ytext' },
        (patchSpan) => {
          const result = patchInner(patch);
          patchSpan.setAttribute('config.outcome', result.ok ? 'success' : 'rejected');
          if (!result.ok) patchSpan.setAttribute('config.error.code', result.error.code);
          return result;
        },
      );
    },

    subscribe(listener: (config: Config) => void): Unsubscribe {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      ytext.unobserve(fireListeners);
      provider.off('synced', fireListeners);
      listeners.clear();
    },
  };
}
