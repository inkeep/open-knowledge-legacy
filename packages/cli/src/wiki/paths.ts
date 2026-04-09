/**
 * Wiki path resolution — pure helper that takes a loaded CLI Config and an
 * absolute `.open-knowledge/` directory, and returns the three resolved
 * absolute directories the wiki code needs.
 *
 * This replaces the old `wiki/config.ts` loader. Wiki path settings now live
 * inside the main CLI config schema under the `wiki` section, so there's a
 * single config file (`./.open-knowledge/config.yml`) and a single Zod schema
 * for everything instead of two files with overlapping purposes.
 */
import { resolve } from 'node:path';
import type { Config } from '../config/schema.ts';

export interface WikiPaths {
  articlesDir: string;
  externalSourcesDir: string;
  researchDir: string;
}

export function resolveWikiPaths(config: Config, openknowledgeDir: string): WikiPaths {
  const okDir = resolve(openknowledgeDir);
  return {
    articlesDir: resolve(okDir, config.wiki.articles_path),
    externalSourcesDir: resolve(okDir, config.wiki.external_sources_path),
    researchDir: resolve(okDir, config.wiki.research_path),
  };
}
