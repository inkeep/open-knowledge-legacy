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
import { type Config, ConfigSchema } from './schema.ts';

export interface LoadConfigResult {
  config: Config;
  sources: string[];
}

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
