import { lstatSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createContentFilter } from '@inkeep/open-knowledge-server';

export interface PreviewOptions {
  projectDir: string;
  contentDir: string;
  include: string[];
  exclude: string[];
  sampleCap?: number;
}

export interface PreviewResult {
  totalCount: number;
  sample: string[];
  contentDir: string;
  include: string[];
  exclude: string[];
  warnings: string[];
}

const DEFAULT_SAMPLE_CAP = 5;

export function previewContent(opts: PreviewOptions): PreviewResult {
  const { projectDir, contentDir, include, exclude, sampleCap = DEFAULT_SAMPLE_CAP } = opts;
  const warnings: string[] = [];
  const files: string[] = [];

  try {
    lstatSync(contentDir);
  } catch {
    return {
      totalCount: 0,
      sample: [],
      contentDir,
      include,
      exclude,
      warnings: [`content directory not found: ${contentDir}`],
    };
  }

  let filter: ReturnType<typeof createContentFilter>;
  try {
    filter = createContentFilter({
      projectDir,
      contentDir,
      includePatterns: include,
      excludePatterns: exclude,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      totalCount: 0,
      sample: [],
      contentDir,
      include,
      exclude,
      warnings: [msg],
    };
  }

  function walk(dir: string): void {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`could not read directory ${relative(contentDir, dir) || '.'}: ${msg}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        const relPath = relative(contentDir, fullPath);
        if (filter.isDirExcluded(relPath)) continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const relPath = relative(contentDir, fullPath);
        if (filter.isExcluded(relPath)) continue;
        files.push(relPath);
      }
    }
  }

  walk(contentDir);

  return {
    totalCount: files.length,
    sample: files.slice(0, sampleCap),
    contentDir,
    include,
    exclude,
    warnings,
  };
}

export function formatPreviewBlock(result: PreviewResult, cwd: string): string {
  const lines: string[] = [];
  const rel = relative(cwd, result.contentDir);
  const displayDir = rel === '' ? './' : `./${rel}`;

  lines.push('Content:');
  lines.push(`  Found ${result.totalCount} markdown files in ${displayDir}`);

  const includeStr = result.include.join(', ');
  const excludeStr = result.exclude.length > 0 ? result.exclude.join(', ') : '(none)';
  lines.push(`  Scope: include=${includeStr}  exclude=${excludeStr}`);

  if (result.sample.length > 0) {
    const sampleStr = result.sample.join(', ');
    const suffix = result.totalCount > result.sample.length ? ', \u2026' : '';
    lines.push(`  Sample: ${sampleStr}${suffix}`);
  }

  lines.push('');
  lines.push('  To adjust, edit .open-knowledge/config.yml:');
  lines.push('    content:');
  lines.push(`      include: ${JSON.stringify(result.include)}`);
  lines.push(`      exclude: ${JSON.stringify(result.exclude)}`);

  lines.push('');
  lines.push('  Re-check anytime: open-knowledge preview');

  return lines.join('\n');
}
