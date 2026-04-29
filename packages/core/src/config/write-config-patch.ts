/**
 * Headless config writer.
 *
 * Used by MCP `set_config` / `set_folder_rule`, CLI `ok config validate` /
 * `ok config migrate`, and `seed/apply.ts`. Returns `Result<T, E>` — never
 * throws across the boundary for expected failures (validation, malformed
 * YAML, write errors).
 *
 * Three-layer defense-in-depth: this is L2 (headless writers). Same
 * `ConfigSchema.safeParse` runs at L1 (Modal walker) and L3 (persistence-hook).
 *
 * Comment + structure preservation: the yaml@2 Document layer round-trip
 * (`parseDocument` → `setIn`/`deleteIn` → `doc.toString()`) preserves
 * comments, blank lines, and anchors — load-bearing for the edit-in-place
 * UX where users hand-edit YAML alongside tool-driven writes.
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, resolve } from 'node:path';
import { isMap, isSeq, type ParsedNode, parseDocument } from 'yaml';
import { OK_DIR } from '../constants/ok-dir.ts';
import type { ConfigValidationError } from './errors.ts';
import type { Err, Ok, Result } from './result.ts';
import { type Config, type ConfigPatch, ConfigSchema } from './schema.ts';
import { CONFIG_SCHEMA_MAJOR_PATH } from './schema-version.ts';
import { addConfigSpanEvent, withConfigSpan, withConfigSpanSync } from './telemetry.ts';
import { applyPatchToDocument, toConfigIssue } from './yaml-patch.ts';

/** Filename of the workspace + user config under `.open-knowledge/`. */
const CONFIG_FILENAME = 'config.yml';

/**
 * Default magic-comment header written on lazy first-write.
 *
 * Version pin is sourced from `package.json` at runtime via `import.meta.url`
 * + relative path traversal — keeps the version always in sync with what
 * the running package reports. Falls back to a non-pinned URL if the
 * lookup fails for any reason (won't crash a write).
 *
 * `ok init` scaffolds its own header for workspace files; this helper covers
 * the user-global lazy-write path.
 *
 * URL shape: `unpkg.com/@inkeep/open-knowledge@latest/dist/schemas/v<N>/config.<scope>.schema.json`.
 *   - `@latest` is the npm dist-tag — additive schema changes (new optional
 *     fields, new enum values) reach existing users automatically as soon
 *     as unpkg's `@latest` cache refreshes (typically <1h).
 *   - `v<N>` is the schema MAJOR version (independent of the package version).
 *     Breaking changes bump v<N> → v<N+1> and emit to a new directory; the
 *     old directory keeps shipping forever, so legacy YAMLs never lose
 *     autocomplete.
 *   - `<scope>` is `workspace` or `user`. Each scoped schema lists only
 *     fields valid at that scope, so autocomplete in either file surfaces
 *     only the fields that belong there.
 */
function schemaUrl(scope: 'workspace' | 'user'): string {
  const filename = scope === 'user' ? 'config.user.schema.json' : 'config.workspace.schema.json';
  return `https://unpkg.com/@inkeep/open-knowledge@latest/dist/schemas/${CONFIG_SCHEMA_MAJOR_PATH}/${filename}`;
}

function defaultFirstWriteHeader(scope: 'workspace' | 'user'): string {
  return `# yaml-language-server: $schema=${schemaUrl(scope)}\n`;
}

export interface WriteConfigPatchOptions {
  /** Project root (workspace scope) or any path (user scope ignores this). */
  cwd: string;
  /** Which file to write. */
  scope: 'workspace' | 'user';
  /** Deep-partial patch. Null at any path means "clear that field". */
  patch: ConfigPatch;
  /**
   * Override homedir for tests. Defaults to `os.homedir()`.
   */
  homedirOverride?: string;
  /**
   * Optional header comment for lazy first-write. Used only when the target
   * file does not yet exist. Defaults to the version-pinned `$schema` magic
   * comment. Pass `null` to skip the header (e.g., when the caller writes
   * its own scaffolded content above the patch).
   */
  firstWriteHeader?: string | null;
}

export interface WriteConfigPatchSuccess {
  /** The full merged config after applying the patch + Zod defaults. */
  effective: Config;
  /** Dotted paths of leaves the patch touched (for telemetry / logs). */
  appliedPaths: string[];
  /** Absolute path of the config file that was written. */
  path: string;
  /** Whether the file was created on this call (lazy first-write). */
  created: boolean;
}

export type WriteConfigPatchResult = Result<WriteConfigPatchSuccess, ConfigValidationError>;

/**
 * Resolve the absolute config file path for a given scope.
 *
 * Workspace: `<cwd>/.open-knowledge/config.yml` (relative paths resolved
 * against process.cwd() if `cwd` is relative).
 *
 * User: `<homedir>/.open-knowledge/config.yml`.
 */
export function resolveConfigPath(
  scope: 'workspace' | 'user',
  cwd: string,
  homedirOverride?: string,
): string {
  if (scope === 'user') {
    const home = homedirOverride ?? homedir();
    return resolve(home, OK_DIR, CONFIG_FILENAME);
  }
  const absCwd = isAbsolute(cwd) ? cwd : resolve(cwd);
  return resolve(absCwd, OK_DIR, CONFIG_FILENAME);
}

function err(error: ConfigValidationError): Err<ConfigValidationError> {
  return { ok: false, error };
}

function ok(value: WriteConfigPatchSuccess): Ok<WriteConfigPatchSuccess> {
  return { ok: true, ...value };
}

/**
 * Atomic tmp+rename write. Mode 0o644 — config is not secret.
 *
 * Best-effort cleanup of the tmp file on failure: if rename fails, attempt
 * to unlink the tmp file but never throw on cleanup — the caller's error
 * is what matters.
 */
async function atomicWrite(absPath: string, content: string): Promise<void> {
  const tmpPath = `${absPath}.tmp.${crypto.randomUUID()}`;
  try {
    await writeFile(tmpPath, content, { encoding: 'utf-8', mode: 0o644 });
    await rename(tmpPath, absPath);
  } catch (e) {
    try {
      unlinkSync(tmpPath);
    } catch {
      /* best-effort cleanup */
    }
    throw e;
  }
}

/**
 * Write a partial patch to the config file at `cwd`/`scope`. Validates
 * via `ConfigSchema.safeParse` against the merged document; on failure
 * returns a typed error with no fs side-effect. On success, writes
 * atomically via tmp+rename.
 *
 * Lazy first-write: if the target file is missing, creates the parent dir
 * (`mkdir -p`) and writes a new file with the magic-comment header. Mode 0o644.
 */
export async function writeConfigPatch(
  opts: WriteConfigPatchOptions,
): Promise<WriteConfigPatchResult> {
  return withConfigSpan(
    'config.patch',
    { 'config.scope': opts.scope, 'config.transport': 'fs' },
    async (span) => {
      const result = await writeConfigPatchInner(opts);
      span.setAttribute('config.outcome', result.ok ? 'success' : 'rejected');
      if (!result.ok) span.setAttribute('config.error.code', result.error.code);
      return result;
    },
  );
}

async function writeConfigPatchInner(
  opts: WriteConfigPatchOptions,
): Promise<WriteConfigPatchResult> {
  const { cwd, scope, patch, homedirOverride, firstWriteHeader } = opts;
  const absPath = resolveConfigPath(scope, cwd, homedirOverride);

  // Step 1: read current file content (or empty for lazy first-write).
  let existingContent = '';
  let fileExists = false;
  if (existsSync(absPath)) {
    fileExists = true;
    try {
      existingContent = readFileSync(absPath, 'utf-8');
    } catch (e) {
      return err({
        code: 'WRITE_ERROR',
        detail: `Could not read existing config: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  // Step 2: parse the existing YAML (or empty document for first-write).
  // yaml@2 `parseDocument` accepts empty strings — produces an empty doc
  // with no contents node. Errors are surfaced via `doc.errors`.
  const doc = parseDocument(existingContent);
  if (doc.errors.length > 0) {
    return err({
      code: 'YAML_PARSE',
      detail: doc.errors.map((e) => e.message).join('; '),
    });
  }

  // Ensure the doc has a top-level map; an empty document parses with
  // `contents = null`. Replace with an empty map so setIn can create
  // nested paths.
  if (doc.contents === null) {
    doc.contents = doc.createNode({}) as ParsedNode;
  } else if (!isMap(doc.contents) && !isSeq(doc.contents)) {
    return err({
      code: 'YAML_PARSE',
      detail: 'Top-level YAML value must be a mapping (object), got scalar',
    });
  }

  // Step 3: apply the patch to the Document.
  const appliedPaths = applyPatchToDocument(doc, patch);

  // Step 4: serialize to JS for safeParse (validation), and to string for
  // write. The Document layer's `toJSON()` produces a plain JS object
  // suitable for Zod parsing. L2 of the three-layer defense.
  const merged = doc.toJSON();
  const parseResult = withConfigSpanSync(
    'config.validate',
    { 'config.scope': scope, 'config.validation.layer': 'L2' },
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
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map(toConfigIssue);
    return err({ code: 'SCHEMA_INVALID', issues });
  }

  // Step 5: serialize the doc to YAML. For lazy first-write, prepend the
  // magic-comment header so IDE intellisense fires immediately. The
  // doc.toString() output has its own trailing newline if non-empty.
  let serialized = doc.toString();
  if (!fileExists) {
    const header =
      firstWriteHeader === undefined ? defaultFirstWriteHeader(scope) : (firstWriteHeader ?? '');
    if (header.length > 0) {
      // Ensure exactly one newline between header and body.
      const headerNormalized = header.endsWith('\n') ? header : `${header}\n`;
      serialized = `${headerNormalized}${serialized}`;
    }
  }

  // Step 6: ensure parent directory exists, then atomic write.
  try {
    await mkdir(dirname(absPath), { recursive: true });
  } catch (e) {
    return err({
      code: 'WRITE_ERROR',
      detail: `Could not create parent directory for ${absPath}: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  try {
    await atomicWrite(absPath, serialized);
  } catch (e) {
    return err({
      code: 'WRITE_ERROR',
      detail: `Could not write ${absPath}: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  return ok({
    effective: parseResult.data,
    appliedPaths,
    path: absPath,
    created: !fileExists,
  });
}
