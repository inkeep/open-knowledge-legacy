import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface ArticleMeta {
  title: string;
  description: string;
  tags: string[];
  relativePath: string;
}

export interface SubfolderMeta {
  name: string;
  articleCount: number;
  relativePath: string;
}

export interface CatalogOptions {
  title?: string;
  description?: string;
}

interface RootSection {
  label: string;
  relativePath: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return null;
  try {
    const parsed = parseYaml(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // gracefully handle invalid YAML
  }
  return null;
}

function extractArticleMeta(filePath: string, relativePath: string): ArticleMeta {
  const content = readFileSync(filePath, 'utf-8');
  const fm = parseFrontmatter(content);
  const fileName = basename(filePath, '.md');

  return {
    title: (fm?.title as string) || fileName,
    description: (fm?.description as string) || '',
    tags: Array.isArray(fm?.tags) ? (fm.tags as string[]) : [],
    relativePath,
  };
}

function countArticles(dirPath: string): number {
  if (!existsSync(dirPath)) return 0;
  let count = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'INDEX.md') {
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
      if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'INDEX.md') {
        articles.push(extractArticleMeta(join(resolvedDir, entry.name), entry.name));
      } else if (entry.isDirectory()) {
        subfolders.push({
          name: entry.name,
          articleCount: countArticles(join(resolvedDir, entry.name)),
          relativePath: `${entry.name}/INDEX.md`,
        });
      }
    }
  }

  articles.sort((a, b) => a.title.localeCompare(b.title));
  subfolders.sort((a, b) => a.name.localeCompare(b.name));

  const frontmatter = stringifyYaml({
    title,
    description,
    generated: true,
    schema_version: 1,
  }).trim();

  const lines: string[] = [`---`, frontmatter, `---`, ''];

  if (articles.length > 0) {
    lines.push('## Articles', '');
    for (const a of articles) {
      const tagSuffix = a.tags.length > 0 ? ` Tags: ${a.tags.join(', ')}` : '';
      const descSuffix = a.description ? ` — ${a.description}.` : '';
      lines.push(`- **[${a.title}](${a.relativePath})**${descSuffix}${tagSuffix}`);
    }
    lines.push('');
  }

  if (subfolders.length > 0) {
    lines.push('## Subfolders', '');
    for (const sf of subfolders) {
      const countLabel = sf.articleCount === 1 ? '1 article' : `${sf.articleCount} articles`;
      lines.push(`- **[${sf.name}](${sf.relativePath})** (${countLabel})`);
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

  const frontmatter = stringifyYaml({
    title: projectName,
    description: `Living knowledge base`,
    generated: true,
    schema_version: 1,
  }).trim();

  const lines: string[] = [`---`, frontmatter, `---`, ''];

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
