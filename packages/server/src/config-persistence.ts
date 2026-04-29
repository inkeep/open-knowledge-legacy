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
  CONFIG_DOC_NAME_USER,
  CONFIG_DOC_NAME_WORKSPACE,
  ConfigSchema,
  type ConfigValidationError,
  resolveConfigPath,
} from '@inkeep/open-knowledge-core';
import { parseDocument, stringify } from 'yaml';
import type * as Y from 'yjs';
import { CONFIG_VALIDATION_REVERT_ORIGIN } from './config-edit-origin.ts';
import { tracedRename, tracedWriteFile } from './fs-traced.ts';

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
  if (lastTransactionOrigin === CONFIG_VALIDATION_REVERT_ORIGIN) return 'no-op';

  const ytext = document.getText('source');
  const content = ytext.toString();

  if (content.length === 0) return 'no-op';

  const lkg = ctx.lkgCache.get(documentName);
  if (lkg !== undefined && content === lkg) return 'no-op';

  const validation = validateConfigYaml(content);
  if (!validation.ok) {
    const fallbackLkg = lkg ?? serializedDefaults();
    document.transact(() => {
      if (ytext.length > 0) ytext.delete(0, ytext.length);
      ytext.insert(0, fallbackLkg);
    }, CONFIG_VALIDATION_REVERT_ORIGIN);
    if (lkg === undefined) {
      ctx.lkgCache.set(documentName, fallbackLkg);
    }
    ctx.onConfigRejected?.(documentName, validation.error);
    return 'reverted';
  }

  const filePath = configDocAbsPath(documentName, ctx);
  await atomicWriteConfig(filePath, content);
  ctx.lkgCache.set(documentName, content);
  return 'persisted';
}
