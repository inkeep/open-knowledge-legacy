import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { z } from 'zod';
import { parseFrontmatter, serializeFrontmatter } from '../utils/frontmatter.ts';
import { CATALOG_FILENAME } from './constants.ts';

const ArticleFrontmatter = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const IndexFrontmatter = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
});

export interface ArticleMeta {
  title: string;
  description: string;
  tags: string[];
  relativePath: string;
}

export interface SubfolderMeta {
  name: string;
  title: string;
  description: string;
  articleCount: number;
  relativePath: string;
}

export interface IndexMeta {
  title?: string;
  description?: string;
}

export interface CatalogOptions {
  title?: string;
  description?: string;
}

interface RootSection {
  label: string;
  relativePath: string;
}

function extractArticleMeta(filePath: string, relativePath: string): ArticleMeta {
  const content = readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content, ArticleFrontmatter);
  const fileName = basename(filePath, '.md');

  return {
    title: fm?.title ?? fileName,
    description: fm?.description ?? '',
    tags: fm?.tags ?? [],
    relativePath,
  };
}

/**
 * Read an existing INDEX.md's frontmatter and return its title/description.
 * These fields are "sticky" — preserved across catalog regenerations — so
 * authors can edit them to set folder-level metadata that surfaces in the
 * parent catalog's Subfolders section.
 */
export function readIndexMeta(dirPath: string): IndexMeta | null {
  const indexPath = join(dirPath, CATALOG_FILENAME);
  if (!existsSync(indexPath)) return null;
  const content = readFileSync(indexPath, 'utf-8');
  return parseFrontmatter(content, IndexFrontmatter);
}

function countArticles(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  let count = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== CATALOG_FILENAME) {
      count++;
    } else if (entry.isDirectory()) {
      count += countArticles(join(dirPath, entry.name));
    }
  }
  return count;
}

export function generateCatalog(dirPath: string, options?: CatalogOptions): string {
  const resolvedDir = resolve(dirPath);
  const dirName = basename(resolvedDir);
  const title = options?.title || dirName;
  const description = options?.description || '';

  const articles: ArticleMeta[] = [];
  const subfolders: SubfolderMeta[] = [];

  if (existsSync(resolvedDir)) {
    const entries = readdirSync(resolvedDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== CATALOG_FILENAME) {
        articles.push(extractArticleMeta(join(resolvedDir, entry.name), entry.name));
      } else if (entry.isDirectory()) {
        const subDir = join(resolvedDir, entry.name);
        const subMeta = readIndexMeta(subDir);
        subfolders.push({
          name: entry.name,
          title: subMeta?.title || entry.name,
          description: subMeta?.description || '',
          articleCount: countArticles(subDir),
          relativePath: `${entry.name}/INDEX.md`,
        });
      }
    }
  }

  articles.sort((a, b) => a.title.localeCompare(b.title));
  subfolders.sort((a, b) => a.name.localeCompare(b.name));

  const fm = serializeFrontmatter({
    title,
    description,
    generated: true,
    schema_version: 1,
  });

  const lines: string[] = [fm, ''];

  if (articles.length > 0) {
    lines.push('## Articles', '');
    for (const a of articles) {
      const tagSuffix = a.tags.length > 0 ? ` Tags: ${a.tags.join(', ')}` : '';
      const descSuffix = a.description ? ` — ${a.description}` : '';
      lines.push(`- **[${a.title}](${a.relativePath})**${descSuffix}${tagSuffix}`);
    }
    lines.push('');
  }

  if (subfolders.length > 0) {
    lines.push('## Subfolders', '');
    for (const sf of subfolders) {
      const countLabel = sf.articleCount === 1 ? '1 article' : `${sf.articleCount} articles`;
      const descSuffix = sf.description ? ` — ${sf.description}` : '';
      lines.push(`- **[${sf.title}](${sf.relativePath})** (${countLabel})${descSuffix}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export interface RootCatalogOptions {
  sections: RootSection[];
  projectName?: string;
}

export function generateRootCatalog(openknowledgeDir: string, options: RootCatalogOptions): string {
  const projectName = options.projectName || 'Project Wiki';

  const fm = serializeFrontmatter({
    title: projectName,
    description: 'Living knowledge base',
    generated: true,
    schema_version: 1,
  });

  const lines: string[] = [fm, ''];

  lines.push('## Sections', '');
  for (const section of options.sections) {
    const sectionDir = resolve(openknowledgeDir, section.relativePath.replace('/INDEX.md', ''));
    const count = countArticles(sectionDir);
    const countLabel = count === 1 ? '1 article' : `${count} articles`;
    lines.push(`- **[${section.label}](${section.relativePath})** (${countLabel})`);
  }
  lines.push('');

  return lines.join('\n');
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
