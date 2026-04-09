import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const WikiConfigSchema = z.object({
  articles_path: z.string().default('./articles'),
  external_sources_path: z.string().default('./external-sources'),
  research_path: z.string().default('./research'),
});

export type WikiConfig = z.infer<typeof WikiConfigSchema>;

export interface ResolvedWikiConfig {
  raw: WikiConfig;
  articlesDir: string;
  externalSourcesDir: string;
  researchDir: string;
}

export function loadWikiConfig(openknowledgeDir: string): ResolvedWikiConfig {
  const configPath = resolve(openknowledgeDir, 'config.yaml');

  let raw: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      raw = parsed as Record<string, unknown>;
    }
  }

  const result = WikiConfigSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid wiki config at ${configPath}:\n${errors.join('\n')}`);
  }

  const config = result.data;
  return {
    raw: config,
    articlesDir: resolve(openknowledgeDir, config.articles_path),
    externalSourcesDir: resolve(openknowledgeDir, config.external_sources_path),
    researchDir: resolve(openknowledgeDir, config.research_path),
  };
}
