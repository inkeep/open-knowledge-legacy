/**
 * Hierarchical YAML config loader.
 *
 * Priority (lowest → highest):
 *   Zod defaults → ~/.open-knowledge/config.yml → ./.open-knowledge/config.yml → ENV → CLI flags
 *
 * Deep merge: workspace leaf values override user leaf values.
 * Arrays are replaced, not concatenated.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
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
    if (
      overrideVal !== null &&
      overrideVal !== undefined &&
      typeof overrideVal === 'object' &&
      !Array.isArray(overrideVal) &&
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      );
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
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function loadConfig(cwd?: string): LoadConfigResult {
  const workingDir = cwd ?? process.cwd();
  const sources: string[] = [];

  // Layer 1: user config
  const userConfigPath = resolve(homedir(), '.open-knowledge', 'config.yml');
  let merged: Record<string, unknown> = {};
  const userConfig = loadYamlFile(userConfigPath);
  if (userConfig) {
    merged = deepMerge(merged, userConfig);
    sources.push(userConfigPath);
  }

  // Layer 2: workspace config
  const workspaceConfigPath = resolve(workingDir, '.open-knowledge', 'config.yml');
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
