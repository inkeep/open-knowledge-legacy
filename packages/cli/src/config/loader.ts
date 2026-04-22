/**
 * Hierarchical YAML config loader.
 *
 * Priority (lowest → highest):
 *   Zod defaults → ~/.open-knowledge/config.yml → ./.open-knowledge/config.yml
 *
 * ENV and CLI flag overrides are applied in cli.ts after loading.
 *
 * Deep merge: workspace leaf values override user leaf values.
 * Arrays are replaced, not concatenated.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
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

function loadYamlFile(filePath: string): Record<string, unknown> | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = parseYaml(raw);
    if (isObject(parsed)) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.warn(
      `[config] Failed to parse ${filePath}: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}

export function loadConfig(cwd?: string): LoadConfigResult {
  const workingDir = cwd ?? process.cwd();
  const sources: string[] = [];

  // Layer 1: user config
  const userConfigPath = resolve(homedir(), OK_DIR, CONFIG_FILENAME);
  let merged: Record<string, unknown> = {};
  const userConfig = loadYamlFile(userConfigPath);
  if (userConfig) {
    merged = deepMerge(merged, userConfig);
    sources.push(userConfigPath);
  }

  // Layer 2: workspace config
  const workspaceConfigPath = resolve(workingDir, OK_DIR, CONFIG_FILENAME);
  const workspaceConfig = loadYamlFile(workspaceConfigPath);
  if (workspaceConfig) {
    merged = deepMerge(merged, workspaceConfig);
    sources.push(workspaceConfigPath);
  }

  // Validate with Zod (applies defaults for missing fields)
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid configuration:\n${errors.join('\n')}`);
  }

  return { config: result.data, sources };
}

/**
 * Apply process-level env overrides that affect config semantics. Kept narrow
 * on purpose: only values that already override the loaded config in the CLI
 * entrypoint belong here.
 */
function applyProcessEnvConfigOverrides(
  config: Config,
  env: NodeJS.ProcessEnv = process.env,
): Config {
  let next = config;
  if (env.PORT) {
    next = {
      ...next,
      server: {
        ...next.server,
        port: Number(env.PORT),
      },
    };
  }
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
 * re-loads its own `.open-knowledge/config.yml` (plus user config) and applies
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
