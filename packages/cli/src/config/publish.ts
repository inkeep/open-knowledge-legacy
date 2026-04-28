import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { OK_DIR, PUBLISH_CONFIG_FILENAME } from '../constants.ts';
import { defaultPublishManifest, type PublishManifest } from '../publish/builder.ts';
import { isObject } from '../utils/is-object.ts';

const PublishConfigSchema = z
  .object({
    siteTitle: z.string().min(1).default(defaultPublishManifest().siteTitle),
    basePath: z.string().default(defaultPublishManifest().basePath),
    outputDir: z.string().min(1).default(defaultPublishManifest().outputDir),
    exclude: z.array(z.string()).default([]),
  })
  .strict();

interface LoadPublishConfigResult {
  config: PublishManifest;
  source: string | null;
}

export function publishConfigPath(projectDir: string): string {
  return resolve(projectDir, OK_DIR, PUBLISH_CONFIG_FILENAME);
}

export function loadPublishConfig(projectDir: string): LoadPublishConfigResult {
  const path = publishConfigPath(projectDir);
  if (!existsSync(path)) {
    return { config: defaultPublishManifest(), source: null };
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(path, 'utf-8')) ?? {};
  } catch (err) {
    throw new Error(
      `Invalid publish configuration:\n  ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!isObject(parsed)) {
    throw new Error(`Invalid publish configuration:\n  ${path}: expected an object`);
  }

  const result = PublishConfigSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const key = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  ${key}: ${issue.message}`;
    });
    throw new Error(`Invalid publish configuration:\n${errors.join('\n')}`);
  }

  return {
    config: {
      siteTitle: result.data.siteTitle,
      basePath: result.data.basePath,
      outputDir: result.data.outputDir,
      exclude: result.data.exclude,
    },
    source: path,
  };
}
