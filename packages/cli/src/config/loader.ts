/**
 * Hierarchical YAML config loader.
 *
 * Priority (lowest → highest):
 *   Zod defaults → ~/.ok/config.yml → ./.ok/config.yml
 *
 * ENV and CLI flag overrides are applied in cli.ts after loading.
 *
 * Deep merge: project leaf values override user leaf values.
 * Arrays are replaced, not concatenated.
 *
 * Errors are emitted with source positions via yaml@2's `parseDocument`
 * (FR-27 / D36) — `file:line:col` plus a code-snippet with caret marker.
 *
 * The user-global file (`~/.ok/config.yml`) is read via
 * `readConfigSafely` (FR-35 / D57) — invalid files are sidelined to
 * `<path>.invalid-<ISO-timestamp>` and replaced with schema defaults so
 * OK can still boot. The project file errors loud (throws) — project
 * errors are user-fixable in-place and failing fast helps the user notice.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import {
  type ConfigIssue,
  type ConfigIssueSource,
  type ConfigValidationError,
  humanFormat,
  locateIssue,
} from '@inkeep/open-knowledge-core';
import { readConfigSafely } from '@inkeep/open-knowledge-core/server';
import { type Document, parseDocument } from 'yaml';
import { CONFIG_FILENAME, OK_DIR } from '../constants.ts';
import { isObject } from '../utils/is-object.ts';
import { normalizeCwd } from '../utils/normalize-cwd.ts';
import { type Config, ConfigSchema } from './schema.ts';

export interface LoadConfigResult {
  config: Config;
  sources: string[];
}

/** Short TTL for per-cwd config resolution in long-lived MCP sessions. */
const DEFAULT_CONFIG_CACHE_MS = 1000;

/**
 * Deep merge two objects. Leaf values in `override` replace `base`.
 * Arrays are replaced, not concatenated.
 *
 * Cross-scope `folders[]` concat-merge (Q11 resolution per spec §9.5.6) is
 * NOT implemented here — left for a follow-up story. Today this is straight
 * array-replace, matching the legacy behavior US-001/002/003 inherited.
 */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overrideVal = override[key];
    if (isObject(overrideVal) && isObject(baseVal)) {
      result[key] = deepMerge(baseVal, overrideVal);
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal;
    }
  }
  return result;
}

interface LoadedYamlFile {
  /** Parsed JS object (or null if the file is empty / comments-only / missing). */
  value: Record<string, unknown> | null;
  /** Absolute path read. */
  path: string;
  /** Raw file source — needed for source-position rendering on validation failure. */
  source: string | null;
  /** yaml@2 Document AST — needed for `getIn(path)` → byte range translation. */
  doc: Document | null;
}

/**
 * Load a YAML file via parseDocument (source-position-preserving). Returns
 * the parsed JS value plus the Document AST + raw source so callers can
 * locate Zod issues back to file:line:col.
 *
 * On YAML syntax errors, logs a warning and returns `value: null` (existing
 * graceful-degradation semantic — broken project YAML doesn't block boot;
 * the user fixes the file and reloads).
 */
function loadYamlFile(filePath: string): LoadedYamlFile {
  if (!existsSync(filePath)) {
    return { value: null, path: filePath, source: null, doc: null };
  }
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.warn(
      `[config] Failed to read ${filePath}: ${err instanceof Error ? err.message : err}`,
    );
    return { value: null, path: filePath, source: null, doc: null };
  }
  const doc = parseDocument(raw);
  if (doc.errors.length > 0) {
    console.warn(
      `[config] Failed to parse ${filePath}: ${doc.errors.map((e) => e.message).join('; ')}`,
    );
    return { value: null, path: filePath, source: raw, doc: null };
  }
  const parsed = doc.toJSON();
  if (isObject(parsed)) {
    return { value: parsed, path: filePath, source: raw, doc };
  }
  // Comments-only or scalar root — treat as empty.
  return { value: null, path: filePath, source: raw, doc };
}

/** Removed `content.*` keys; their patterns now live in `.okignore`. */
const REMOVED_CONTENT_KEYS = ['include', 'exclude'] as const;

/**
 * Per-key redirect message. `content.exclude` patterns migrate 1:1 to
 * `.okignore` (both are exclude-only). `content.include` was a positive
 * whitelist — copying patterns straight into exclude-only `.okignore` would
 * invert intent. Surface `content.dir` as the simpler subdirectory-scoping
 * alternative for the common include case.
 */
function redirectForKey(key: 'include' | 'exclude'): string {
  if (key === 'exclude') {
    return 'Move these patterns to .okignore at the project root (gitignore syntax, 1:1 migration).';
  }
  return [
    'content.include has been removed.',
    'For subdirectory scoping, set content.dir in .ok/config.yml instead.',
    'For pattern-based filtering, use .okignore (gitignore syntax — exclude-only; do not copy include patterns directly).',
  ].join(' ');
}

/**
 * Detect `content.include` / `content.exclude` in a parsed YAML file. These
 * keys were removed from `ConfigSchema`; path rules now live in `.okignore`
 * files at the project root. Returns ALL removed-key errors found (a config
 * with both keys gets both errors in one pass — no two-trip fix cycle).
 *
 * The schema's `content` block is a `looseObject`, so unknown nested keys
 * pass through validation silently — explicit detection is required to
 * surface the migration directive.
 */
function detectRemovedContentKeys(file: LoadedYamlFile): ConfigValidationError[] {
  const value = file.value;
  if (!isObject(value)) return [];
  const content = value.content;
  if (!isObject(content)) return [];
  const errors: ConfigValidationError[] = [];
  for (const key of REMOVED_CONTENT_KEYS) {
    if (key in content) {
      const path = ['content', key];
      let source: ConfigIssueSource | undefined;
      if (file.doc !== null && file.source !== null) {
        source = locateIssue({
          file: file.path,
          source: file.source,
          doc: file.doc,
          path,
        });
      }
      errors.push({
        code: 'REMOVED_KEY',
        path,
        redirect: redirectForKey(key),
        ...(source !== undefined ? { source } : {}),
      });
    }
  }
  return errors;
}

/**
 * Map Zod issues to source-located `ConfigIssue`s using the project
 * Document AST when the path resolves there. User-global paths don't get
 * source-located here (the user-global file went through readConfigSafely
 * upstream and any user-global issues already triggered sideline + defaults
 * before this merged validation runs).
 */
function annotateIssuesWithSource(
  zodIssues: ReadonlyArray<{ path: PropertyKey[]; message: string; code: string }>,
  projectFile: LoadedYamlFile,
): ConfigIssue[] {
  return zodIssues.map((issue) => {
    const path = issue.path.map((seg) =>
      typeof seg === 'symbol' ? String(seg) : (seg as string | number),
    );
    const base: ConfigIssue = {
      path,
      message: issue.message,
      issueCode: issue.code,
    };
    if (projectFile.doc !== null && projectFile.source !== null) {
      const located = locateIssue({
        file: projectFile.path,
        source: projectFile.source,
        doc: projectFile.doc,
        path,
      });
      if (located !== undefined) {
        return { ...base, source: located };
      }
    }
    return base;
  });
}

export function loadConfig(cwd?: string): LoadConfigResult {
  const workingDir = cwd ?? process.cwd();
  const sources: string[] = [];

  // Layer 1: user-global config — go through readConfigSafely so a broken
  // file is sidelined and we boot on defaults instead of hanging the user.
  const userConfigPath = resolve(homedir(), OK_DIR, CONFIG_FILENAME);
  const userResult = readConfigSafely({ absPath: userConfigPath });
  let merged: Record<string, unknown> = {};
  if (userResult.valid && userResult.source !== undefined) {
    // Re-emit through the JSON projection so deepMerge stays uniform.
    merged = deepMerge(merged, userResult.value as unknown as Record<string, unknown>);
    sources.push(userConfigPath);
  } else if (!userResult.valid) {
    // readConfigSafely already logged + sidelined; we treat this as "user
    // contributed nothing" and proceed with defaults at this layer.
  }

  // Layer 2: project config — fail loud on schema-fail so the user notices.
  const projectConfigPath = resolve(workingDir, OK_DIR, CONFIG_FILENAME);
  const projectFile = loadYamlFile(projectConfigPath);
  if (projectFile.value !== null) {
    const removedKeyErrors = detectRemovedContentKeys(projectFile);
    if (removedKeyErrors.length > 0) {
      throw new Error(removedKeyErrors.map(humanFormat).join('\n\n'));
    }
    merged = deepMerge(merged, projectFile.value);
    sources.push(projectConfigPath);
  }

  // Deprecation WARN — `upload.maxBytes` was removed when uploads switched
  // to streaming (reports/streaming-upload-refactor/REPORT.md §D8). The
  // schema is not `.strict()`, so the key parses cleanly and gets silently
  // stripped; surface a one-time note so users can remove it from their
  // config.
  const mergedUpload = merged.upload;
  if (isObject(mergedUpload) && mergedUpload.maxBytes !== undefined) {
    console.warn(
      '[config] upload.maxBytes is deprecated and ignored — streaming uploads have no user-facing cap. Remove the key to silence this warning.',
    );
  }

  // Validate the merged result with Zod.
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = annotateIssuesWithSource(result.error.issues, projectFile);
    const error: ConfigValidationError = { code: 'SCHEMA_INVALID', issues };
    throw new Error(humanFormat(error));
  }

  return { config: result.data, sources };
}

/**
 * Apply process-level env overrides that affect config semantics. Kept narrow
 * on purpose: only values that already override the loaded config in the CLI
 * entrypoint belong here.
 *
 * `PORT` is intentionally NOT handled here — per D29 `server.port` is no
 * longer a schema field; the `start` command resolves port directly from
 * `--port` flag → `PORT` env → bootServer kernel-allocation.
 */
function applyProcessEnvConfigOverrides(
  config: Config,
  env: NodeJS.ProcessEnv = process.env,
): Config {
  let next = config;
  if (env.HOST) {
    next = {
      ...next,
      server: {
        ...next.server,
        host: env.HOST,
      },
    };
  }
  return next;
}

interface CreateProjectConfigResolverOptions {
  startupCwd: string;
  startupConfig: Config;
  env?: NodeJS.ProcessEnv;
  cacheMs?: number;
  loadConfigFn?: (cwd?: string) => LoadConfigResult;
}

/**
 * Create a lazy per-cwd config resolver for long-lived MCP sessions. Each cwd
 * re-loads its own `.ok/config.yml` (plus user config) and applies
 * the same process-level env overrides as the CLI bootstrap path.
 */
export function createProjectConfigResolver(
  opts: CreateProjectConfigResolverOptions,
): (cwd?: string) => Promise<Config> {
  const env = opts.env ?? process.env;
  const cacheMs = opts.cacheMs ?? DEFAULT_CONFIG_CACHE_MS;
  const load = opts.loadConfigFn ?? loadConfig;
  const cache = new Map<string, { config: Config; expiresAt: number }>();
  const pendingResolutions = new Map<string, Promise<Config>>();
  const normalizedStartupCwdPromise = normalizeCwd(opts.startupCwd);

  return async (cwd?: string): Promise<Config> => {
    const effectiveCwd = await normalizeCwd(cwd ?? opts.startupCwd);
    const now = Date.now();
    const cached = cache.get(effectiveCwd);
    if (cached && cached.expiresAt > now) return cached.config;

    const pending = pendingResolutions.get(effectiveCwd);
    if (pending) return await pending;

    const resolution = (async (): Promise<Config> => {
      if (effectiveCwd === (await normalizedStartupCwdPromise)) {
        const startupResolved = applyProcessEnvConfigOverrides(opts.startupConfig, env);
        cache.set(effectiveCwd, { config: startupResolved, expiresAt: Date.now() + cacheMs });
        return startupResolved;
      }

      const resolved = applyProcessEnvConfigOverrides(load(effectiveCwd).config, env);
      cache.set(effectiveCwd, { config: resolved, expiresAt: Date.now() + cacheMs });
      return resolved;
    })();

    pendingResolutions.set(effectiveCwd, resolution);
    try {
      return await resolution;
    } finally {
      pendingResolutions.delete(effectiveCwd);
    }
  };
}
