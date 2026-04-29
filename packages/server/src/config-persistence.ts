/**
 * Persistence-time validation + LKG-backed revert for config docs (US-006).
 *
 * Three-layer defense-in-depth (D45): this is L3 (server-side last line of
 * defense). L1 (Modal walker) and L2 (`writeConfigPatch` headless writer)
 * already validate before reaching here; L3 catches malicious/buggy clients,
 * schema drift, and external hand-edits that bypass L1/L2.
 *
 * On success, atomically writes Y.Text content to the resolved config path
 * (workspace or user-global). On failure, reverts Y.Text via
 * `CONFIG_VALIDATION_REVERT_ORIGIN` to the in-memory LKG cache and fires
 * `onConfigRejected` so the upstream CC1 emitter (`emitConfigValidationRejected`)
 * can broadcast to any connected Settings pane.
 *
 * Per-server-instance LKG cache: a `Map<docName, string>` holding the most
 * recent successfully-validated YAML string. Initialized on doc load by
 * reading the file from disk; falls back to schema-defaults serialized as
 * YAML when disk is missing, empty, or invalid (D57 cold-start recovery).
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  addConfigSpanEvent,
  CONFIG_DOC_NAME_USER,
  CONFIG_DOC_NAME_WORKSPACE,
  type ConfigIssue,
  ConfigSchema,
  type ConfigValidationError,
  isKnownConfigError,
  resolveConfigPath,
  withConfigSpan,
  withConfigSpanSync,
} from '@inkeep/open-knowledge-core';
import { parseDocument, stringify } from 'yaml';
import type * as Y from 'yjs';
import {
  CONFIG_FILE_WATCHER_ORIGIN,
  CONFIG_VALIDATION_REVERT_ORIGIN,
} from './config-edit-origin.ts';
import { tracedRename, tracedWriteFile } from './fs-traced.ts';

/**
 * Map a documentName to the OTel `config.scope` enum attribute.
 * Returns `undefined` for non-config docs (caller should never invoke this
 * helper for those; config-persistence's branches are isConfigDoc-gated).
 */
function configScopeAttr(documentName: string): 'user' | 'workspace' | undefined {
  if (documentName === CONFIG_DOC_NAME_WORKSPACE) return 'workspace';
  if (documentName === CONFIG_DOC_NAME_USER) return 'user';
  return undefined;
}

/**
 * Emit one span event per Zod issue when validation fails with SCHEMA_INVALID.
 * Bounded enum attributes only on the parent span; per-issue paths land in
 * span events to keep cardinality bounded (`concerns/observability.md`).
 *
 * The narrowing dance via `isKnownConfigError` is the canonical pattern for
 * the discriminated-union-plus-forward-compat-tail shape — without it, TS
 * sees `error.issues` as `unknown` because the tail variant doesn't carry it.
 */
function emitSchemaInvalidIssueEvents(error: ConfigValidationError): void {
  if (!isKnownConfigError(error)) return;
  if (error.code !== 'SCHEMA_INVALID') return;
  for (const issue of error.issues as ConfigIssue[]) {
    addConfigSpanEvent('config.validation.issue', {
      'issue.path': issue.path.map((p) => String(p)).join('.'),
      'issue.message': issue.message,
    });
  }
}

export interface ConfigPersistenceCtx {
  /** Project root — workspace config resolves to `<projectDir>/.open-knowledge/config.yml`. */
  projectDir: string;
  /**
   * Per-server-instance LKG cache. Maps each well-known config doc name
   * (`__config__/workspace`, `__user__/config.yml`) to the most recent
   * successfully-validated YAML string. Cleared at server shutdown.
   */
  lkgCache: Map<string, string>;
  /**
   * Override `os.homedir()` for tests. User-global config resolves to
   * `<homedir>/.open-knowledge/config.yml`; tests use a tempdir override
   * so they don't touch the developer's real `~/`.
   */
  homedirOverride?: string;
  /**
   * Fired synchronously after a validation rejection completes (Y.Text
   * already reverted to LKG). Wired in standalone boot to
   * `cc1Broadcaster.emitConfigValidationRejected(docName, error)`.
   */
  onConfigRejected?: (docName: string, error: ConfigValidationError) => void;
}

/** Resolve the on-disk path for a well-known config doc name. */
export function configDocAbsPath(documentName: string, ctx: ConfigPersistenceCtx): string {
  if (documentName === CONFIG_DOC_NAME_WORKSPACE) {
    return resolveConfigPath('workspace', ctx.projectDir, ctx.homedirOverride);
  }
  if (documentName === CONFIG_DOC_NAME_USER) {
    return resolveConfigPath('user', ctx.projectDir, ctx.homedirOverride);
  }
  throw new Error(`configDocAbsPath: not a config doc name: ${documentName}`);
}

/**
 * Schema-defaults serialized as YAML. Used as the LKG fallback when no
 * prior valid state exists (cold-start, disk broken, disk empty).
 *
 * Module-level memoized at first use because `ConfigSchema.parse({})`
 * runs every Zod default callback synchronously.
 */
let cachedDefaultsYaml: string | null = null;
function serializedDefaults(): string {
  if (cachedDefaultsYaml === null) {
    cachedDefaultsYaml = stringify(ConfigSchema.parse({}));
  }
  return cachedDefaultsYaml;
}

interface ValidConfig {
  readonly ok: true;
}
interface InvalidConfig {
  readonly ok: false;
  readonly error: ConfigValidationError;
}

/**
 * Parse + validate a YAML string against `ConfigSchema`. Empty input is
 * valid (parses to null → coerced to `{}` → defaults applied — same
 * convention as `writeConfigPatch`).
 */
function validateConfigYaml(content: string): ValidConfig | InvalidConfig {
  const parsed = parseDocument(content);
  if (parsed.errors.length > 0) {
    return {
      ok: false,
      error: {
        code: 'YAML_PARSE',
        detail: parsed.errors.map((e) => e.message).join('; '),
      },
    };
  }
  const merged = parsed.toJSON() ?? {};
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        issues: result.error.issues.map((iss) => ({
          path: iss.path.map((seg) =>
            typeof seg === 'symbol' ? String(seg) : (seg as string | number),
          ),
          message: iss.message,
          issueCode: iss.code,
        })),
      },
    };
  }
  return { ok: true };
}

/**
 * Seed a config doc's Y.Text from disk + initialize the LKG cache entry.
 * Idempotent: re-seeds only when Y.Text is empty.
 *
 * The seed transaction uses `CONFIG_VALIDATION_REVERT_ORIGIN`
 * (`skipStoreHooks: true`) so Hocuspocus does NOT fire `onStoreDocument`
 * for the load mutation — lazy file creation per D51 means admitting a
 * doc must never auto-write disk.
 *
 * LKG behavior:
 * - Disk valid + non-empty   → LKG = disk bytes
 * - Disk missing/empty/invalid → LKG = schema-defaults YAML
 *
 * The disk-invalid case does NOT fire `onConfigRejected` from the load path
 * (that surfacing is FR-35's territory in `readConfigSafely` at boot — by
 * the time we admit the synthetic doc, broken user-global files have
 * already been sidelined). The persistence-hook `storeConfigDoc` will
 * surface a rejection on the first invalid Y.Text mutation.
 */
export function loadConfigDoc(
  document: Y.Doc,
  documentName: string,
  ctx: ConfigPersistenceCtx,
): void {
  const ytext = document.getText('source');
  if (ytext.length > 0) return;

  const filePath = configDocAbsPath(documentName, ctx);
  let raw = '';
  if (existsSync(filePath)) {
    try {
      raw = readFileSync(filePath, 'utf-8');
    } catch {
      raw = '';
    }
  }

  const validation = validateConfigYaml(raw);

  document.transact(() => {
    if (raw.length > 0) ytext.insert(0, raw);
  }, CONFIG_VALIDATION_REVERT_ORIGIN);

  if (validation.ok && raw.length > 0) {
    ctx.lkgCache.set(documentName, raw);
  } else {
    ctx.lkgCache.set(documentName, serializedDefaults());
  }
}

async function atomicWriteConfig(absPath: string, content: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.tmp.${crypto.randomUUID()}`;
  await tracedWriteFile(tmpPath, content, 'utf-8');
  await tracedRename(tmpPath, absPath);
}

/**
 * Outcome surfaced by `storeConfigDoc` for tests + telemetry.
 *
 * - `'persisted'`: validated successfully and written to disk; LKG updated.
 * - `'reverted'`: validation failed; Y.Text reverted to LKG; `onConfigRejected` fired.
 * - `'no-op'`: entry-gate matched (revert origin), Y.Text empty, or content equals LKG.
 */
type StoreConfigDocOutcome = 'persisted' | 'reverted' | 'no-op';

/**
 * Persistence-time validation hook for a config doc (L3).
 *
 * Entry-gate at top: if `lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN`,
 * skip — belt-and-suspenders alongside the origin's `skipStoreHooks: true`.
 *
 * Empty-content + LKG-equality short-circuits prevent spurious writes when
 * the load path seeds Y.Text to disk content (which by definition matches
 * LKG).
 */
export async function storeConfigDoc(
  document: Y.Doc,
  documentName: string,
  lastTransactionOrigin: unknown,
  ctx: ConfigPersistenceCtx,
): Promise<StoreConfigDocOutcome> {
  return withConfigSpan(
    'config.persist',
    { 'config.scope': configScopeAttr(documentName), 'config.transport': 'fs' },
    async (span) => {
      const outcome = await storeConfigDocInner(document, documentName, lastTransactionOrigin, ctx);
      span.setAttribute('config.outcome', persistOutcomeAttr(outcome));
      return outcome;
    },
  );
}

function persistOutcomeAttr(outcome: StoreConfigDocOutcome): 'success' | 'reverted' | 'rejected' {
  // 'persisted' → success; 'reverted' → reverted; 'no-op' renders as success
  // (no failure occurred — a no-op is a successful completion of the hook).
  if (outcome === 'reverted') return 'reverted';
  return 'success';
}

async function storeConfigDocInner(
  document: Y.Doc,
  documentName: string,
  lastTransactionOrigin: unknown,
  ctx: ConfigPersistenceCtx,
): Promise<StoreConfigDocOutcome> {
  if (lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN) return 'no-op';

  const ytext = document.getText('source');
  const content = ytext.toString();

  if (content.length === 0) return 'no-op';

  const lkg = ctx.lkgCache.get(documentName);
  if (lkg !== undefined && content === lkg) return 'no-op';

  const scope = configScopeAttr(documentName);
  const validation = withConfigSpanSync(
    'config.validate',
    { 'config.scope': scope, 'config.validation.layer': 'L3' },
    (validateSpan) => {
      const r = validateConfigYaml(content);
      validateSpan.setAttribute('config.outcome', r.ok ? 'success' : 'rejected');
      if (!r.ok) emitSchemaInvalidIssueEvents(r.error);
      return r;
    },
  );
  if (!validation.ok) {
    await withConfigSpan(
      'config.revert',
      { 'config.scope': scope, 'config.outcome': 'reverted' },
      async () => {
        const fallbackLkg = lkg ?? serializedDefaults();
        document.transact(() => {
          if (ytext.length > 0) ytext.delete(0, ytext.length);
          ytext.insert(0, fallbackLkg);
        }, CONFIG_VALIDATION_REVERT_ORIGIN);
        if (lkg === undefined) {
          ctx.lkgCache.set(documentName, fallbackLkg);
        }
        ctx.onConfigRejected?.(documentName, validation.error);
      },
    );
    return 'reverted';
  }

  const filePath = configDocAbsPath(documentName, ctx);
  await atomicWriteConfig(filePath, content);
  ctx.lkgCache.set(documentName, content);
  return 'persisted';
}

/**
 * Outcome surfaced by `applyExternalConfigChange` for tests + telemetry.
 *
 * - `'applied'`: external content was valid; Y.Text replaced under
 *   `CONFIG_FILE_WATCHER_ORIGIN`; LKG updated.
 * - `'rejected'`: external content failed validation; Y.Text NOT mutated;
 *   `onConfigRejected` fired so the caller can broadcast CC1.
 * - `'no-op'`: content equals LKG (self-write reflection or unchanged
 *   external read), OR the document was not loaded.
 */
type ApplyExternalConfigChangeOutcome = 'applied' | 'rejected' | 'no-op';

/**
 * Apply an externally-detected config file change (US-007 / FR-15).
 *
 * Called by the file-watcher orchestration when chokidar fires a change
 * event. Mirrors `storeConfigDoc` but inverted: disk → Y.Text rather than
 * Y.Text → disk.
 *
 * Self-write detection uses the LKG cache: when persistence writes content
 * `C` to disk, it sets `lkgCache[doc] = C`. When the watcher reads `C` back
 * (chokidar fires for OUR own write), this comparison short-circuits before
 * any Y.Text mutation. The residual race (rename completes before LKG
 * updates) is benign — Y.Text would be replaced with content it already
 * holds, which Yjs handles as an idempotent no-op delta.
 *
 * The Y.Text mutation runs under `CONFIG_FILE_WATCHER_ORIGIN`
 * (`skipStoreHooks: true`) so the persistence-hook does NOT re-write the
 * file we just read. Without this, every external edit would generate a
 * redundant disk write before the LKG-equality check fires next time.
 *
 * On invalid YAML or schema fail: Y.Text is NOT mutated (stays at LKG);
 * `onConfigRejected` fires so the caller can emit a CC1 broadcast for any
 * open Settings pane to surface the rejection toast.
 */
export function applyExternalConfigChange(
  document: Y.Doc | null,
  documentName: string,
  content: string,
  ctx: ConfigPersistenceCtx,
): ApplyExternalConfigChangeOutcome {
  if (!document) return 'no-op';

  const lkg = ctx.lkgCache.get(documentName);
  if (lkg !== undefined && lkg === content) return 'no-op';

  const scope = configScopeAttr(documentName);
  const validation = withConfigSpanSync(
    'config.validate',
    { 'config.scope': scope, 'config.validation.layer': 'L3' },
    (validateSpan) => {
      const r = validateConfigYaml(content);
      validateSpan.setAttribute('config.outcome', r.ok ? 'success' : 'rejected');
      if (!r.ok) emitSchemaInvalidIssueEvents(r.error);
      return r;
    },
  );
  if (!validation.ok) {
    ctx.onConfigRejected?.(documentName, validation.error);
    return 'rejected';
  }

  const ytext = document.getText('source');
  document.transact(() => {
    if (ytext.length > 0) ytext.delete(0, ytext.length);
    ytext.insert(0, content);
  }, CONFIG_FILE_WATCHER_ORIGIN);

  ctx.lkgCache.set(documentName, content);
  return 'applied';
}
