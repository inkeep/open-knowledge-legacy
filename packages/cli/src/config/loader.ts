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
import { type Config, ConfigSchema } from '@inkeep/open-knowledge-server';
import { type Document, parseDocument } from 'yaml';
import { CONFIG_FILENAME, OK_DIR } from '../constants.ts';
import { isObject } from '../utils/is-object.ts';
import { normalizeCwd } from '../utils/normalize-cwd.ts';

export interface LoadConfigResult {
  config: Config;
  sources: string[];
}

const DEFAULT_CONFIG_CACHE_MS = 1000;

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
  value: Record<string, unknown> | null;
  path: string;
  source: string | null;
  doc: Document | null;
}

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
  return { value: null, path: filePath, source: raw, doc };
}

const REMOVED_CONTENT_KEYS = ['include', 'exclude'] as const;

function redirectForKey(key: 'include' | 'exclude'): string {
  const stripHint =
    'Run `ok config migrate` to strip the obsolete key from config.yml automatically, or remove it by hand.';
  if (key === 'exclude') {
    return [
      'Move these patterns to .okignore at the project root (gitignore syntax, 1:1 migration).',
      stripHint,
    ].join(' ');
  }
  return [
    'content.include has been removed.',
    'For subdirectory scoping, set content.dir in .ok/config.yml instead.',
    'For pattern-based filtering, use .okignore (gitignore syntax — exclude-only; do not copy include patterns directly).',
    stripHint,
  ].join(' ');
}

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

  const userConfigPath = resolve(homedir(), OK_DIR, CONFIG_FILENAME);
  const userResult = readConfigSafely({ absPath: userConfigPath });
  let merged: Record<string, unknown> = {};
  if (userResult.valid && userResult.source !== undefined) {
    merged = deepMerge(merged, userResult.value as unknown as Record<string, unknown>);
    sources.push(userConfigPath);
  } else if (!userResult.valid) {
  }

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

  warnIfRemovedConfigKey(
    merged,
    ['upload', 'maxBytes'],
    'streaming uploads have no user-facing cap',
  );
  warnIfRemovedConfigKey(
    merged,
    ['github', 'oauthAppClientId'],
    'use the OPEN_KNOWLEDGE_GITHUB_CLIENT_ID env var instead',
  );
  warnIfRemovedConfigKey(merged, ['server', 'host'], 'use the --host flag or HOST env var instead');
  warnIfRemovedConfigKey(merged, ['server', 'openOnAgentEdit']);
  warnIfRemovedConfigKey(
    merged,
    ['mcp', 'autoStart'],
    'to disable auto-start, set OK_MCP_AUTOSTART=0',
  );
  warnIfRemovedConfigKey(merged, ['mcp', 'tools', 'read_document', 'historyDepth']);
  warnIfRemovedConfigKey(merged, ['mcp', 'tools', 'grep', 'maxResults']);
  warnIfRemovedConfigKey(merged, ['mcp', 'tools', 'search', 'maxResults']);
  warnIfRemovedConfigKey(
    merged,
    ['preview', 'baseUrl'],
    'preview URLs now resolve only to the running UI process — start one with `ok ui`',
  );

  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const issues = annotateIssuesWithSource(result.error.issues, projectFile);
    const error: ConfigValidationError = { code: 'SCHEMA_INVALID', issues };
    throw new Error(humanFormat(error));
  }

  return { config: result.data, sources };
}

function warnIfRemovedConfigKey(
  merged: Record<string, unknown>,
  path: readonly string[],
  replacementHint?: string,
): void {
  let cursor: unknown = merged;
  for (let i = 0; i < path.length - 1; i++) {
    if (!isObject(cursor)) return;
    cursor = (cursor as Record<string, unknown>)[path[i] as string];
  }
  if (!isObject(cursor)) return;
  const lastKey = path[path.length - 1] as string;
  if (cursor[lastKey] === undefined) return;
  const dotted = path.join('.');
  const reason = replacementHint ?? 'the value is hardcoded in @inkeep/open-knowledge-core';
  console.warn(
    `[config] ${dotted} is no longer user-configurable; ${reason}. Remove the key to silence this warning.`,
  );
}

interface CreateProjectConfigResolverOptions {
  startupCwd: string;
  startupConfig: Config;
  cacheMs?: number;
  loadConfigFn?: (cwd?: string) => LoadConfigResult;
}

export function createProjectConfigResolver(
  opts: CreateProjectConfigResolverOptions,
): (cwd?: string) => Promise<Config> {
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
        cache.set(effectiveCwd, {
          config: opts.startupConfig,
          expiresAt: Date.now() + cacheMs,
        });
        return opts.startupConfig;
      }

      const resolved = load(effectiveCwd).config;
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
