import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { getUserTemplatesDir, USER_TEMPLATES_SOURCE_LABEL } from './user-home.ts';

type TemplateScope = 'local' | 'inherited' | 'user';

export {
  __resetUserHomeProviderForTest,
  __setUserHomeProviderForTest,
} from './user-home.ts';

export interface TemplateEntry {
  name: string;
  title?: string;
  description?: string;
  path: string;
  source_folder: string;
  scope: TemplateScope;
}

interface ResolveTemplatesOptions {
  depth?: number;
}

export function resolveTemplatesAvailable(
  projectDir: string,
  folderRelPath: string,
  _options: ResolveTemplatesOptions = {},
): TemplateEntry[] {
  const normalized = normalizeFolderPath(folderRelPath);
  const segments = normalized === '' ? [] : normalized.split('/');

  const seen = new Set<string>();
  const out: TemplateEntry[] = [];

  collectFromFolder(projectDir, normalized, 'local', seen, out);

  for (let i = segments.length - 1; i >= 1; i--) {
    const ancestorPath = segments.slice(0, i).join('/');
    collectFromFolder(projectDir, ancestorPath, 'inherited', seen, out);
  }
  if (segments.length > 0) {
    collectFromFolder(projectDir, '', 'inherited', seen, out);
  }

  collectUserTemplates(seen, out);

  return out;
}

function collectUserTemplates(seen: Set<string>, out: TemplateEntry[]): void {
  const templatesDir = getUserTemplatesDir();
  if (!templatesDir) return;
  if (!existsSync(templatesDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(templatesDir);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[ok-templates] failed to read user templates directory at ${templatesDir}: ${reason}`,
    );
    return;
  }

  for (const entryName of entries) {
    if (!entryName.endsWith('.md')) continue;
    const name = entryName.slice(0, -3);
    if (seen.has(name)) continue;

    const absPath = join(templatesDir, entryName);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(absPath);
    } catch {
      continue;
    }
    if (!s.isFile()) continue;

    const meta = readTemplateMeta(absPath);
    const tplEntry: TemplateEntry = {
      name,
      path: absPath.split(/\\/g).join('/'),
      source_folder: USER_TEMPLATES_SOURCE_LABEL,
      scope: 'user',
    };
    if (meta.title !== undefined) tplEntry.title = meta.title;
    if (meta.description !== undefined) tplEntry.description = meta.description;

    seen.add(name);
    out.push(tplEntry);
  }
}

function collectFromFolder(
  projectDir: string,
  folderRelPath: string,
  scope: TemplateScope,
  seen: Set<string>,
  out: TemplateEntry[],
): void {
  const templatesDir = folderRelPath
    ? join(projectDir, folderRelPath, '.ok', 'templates')
    : join(projectDir, '.ok', 'templates');

  if (!existsSync(templatesDir)) return;

  let entries: string[];
  try {
    entries = readdirSync(templatesDir);
  } catch {
    return;
  }

  for (const entryName of entries) {
    if (!entryName.endsWith('.md')) continue;
    const name = entryName.slice(0, -3); // strip `.md`
    if (seen.has(name)) continue;

    const absPath = join(templatesDir, entryName);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(absPath);
    } catch {
      continue;
    }
    if (!s.isFile()) continue;

    const meta = readTemplateMeta(absPath);
    const relPath = folderRelPath
      ? posix.join(folderRelPath, '.ok', 'templates', entryName)
      : posix.join('.ok', 'templates', entryName);

    const tplEntry: TemplateEntry = {
      name,
      path: relPath,
      source_folder: folderRelPath,
      scope,
    };
    if (meta.title !== undefined) tplEntry.title = meta.title;
    if (meta.description !== undefined) tplEntry.description = meta.description;

    seen.add(name);
    out.push(tplEntry);
  }
}

function normalizeFolderPath(folderRelPath: string): string {
  return folderRelPath
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/^\.$/, '');
}

interface TemplateMeta {
  title?: string;
  description?: string;
}

const templateMetaWarnedPaths = new Set<string>();

function readTemplateMeta(absPath: string): TemplateMeta {
  let content: string;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code !== 'ENOENT' && !templateMetaWarnedPaths.has(absPath)) {
      templateMetaWarnedPaths.add(absPath);
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[ok-templates] failed to read template at ${absPath} — metadata skipped. Reason: ${reason}`,
      );
    }
    return {};
  }
  const fmYaml = extractFrontmatterYaml(content);
  if (fmYaml === null) return {};

  let parsed: unknown;
  try {
    parsed = parseYaml(fmYaml);
  } catch (err) {
    if (!templateMetaWarnedPaths.has(absPath)) {
      templateMetaWarnedPaths.add(absPath);
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[ok-templates] malformed YAML frontmatter at ${absPath} — title/description unavailable. Reason: ${reason}`,
      );
    }
    return {};
  }
  if (parsed == null || typeof parsed !== 'object') return {};

  const fm = parsed as Record<string, unknown>;
  const result: TemplateMeta = {};
  if (typeof fm.title === 'string') result.title = fm.title;
  if (typeof fm.description === 'string') result.description = fm.description;
  return result;
}

function extractFrontmatterYaml(content: string): string | null {
  const normalized = content.replace(/^﻿/, '');
  const match = /^[ \t]*---\r?\n([\s\S]*?)\r?\n[ \t]*---(\r?\n|$)/.exec(normalized);
  return match ? (match[1] ?? null) : null;
}
