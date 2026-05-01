/**
 * Filesystem writers for nested `.ok/templates/<name>.md` files.
 *
 * Two callable surfaces — wrapped by the `write_template` and
 * `delete_template` MCP tools. Both are atomic-ish: write goes
 * through a tmp+rename to avoid partial-state visibility for the
 * file-watcher; delete is a single unlink + auto-clean of empty
 * `.ok/templates/` and `.ok/` per D3.
 *
 * Validation:
 *   - `folder` must resolve under `projectDir` (no traversal escape)
 *   - `name` is a safe filename: `[A-Za-z0-9_-]+` only
 *   - `frontmatter.title` + `frontmatter.description` SHOULD be present
 *     (D14 soft contract — surfaced as a warning, NOT a hard error)
 *
 * Spec: 2026-05-01-folder-level-metadata-and-templates §6.3 / §6.4,
 * FR11 / FR12.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, normalize, resolve, sep } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

export type TemplateWriteResult =
  | {
      ok: true;
      path: string;
      created: boolean;
      warnings: string[];
    }
  | {
      ok: false;
      error: { code: string; message: string };
    };

export type TemplateDeleteResult =
  | {
      ok: true;
      path: string;
      existed: boolean;
      cleanedEmpty: { templatesDir: boolean; okDir: boolean };
    }
  | {
      ok: false;
      error: { code: string; message: string };
    };

export interface TemplateFrontmatter {
  title?: string;
  description?: string;
  tags?: string[];
}

export interface WriteTemplateInput {
  projectDir: string;
  folder: string;
  name: string;
  body: string;
  frontmatter: TemplateFrontmatter;
}

export interface DeleteTemplateInput {
  projectDir: string;
  folder: string;
  name: string;
}

/** Filename grammar: ASCII alnum + `_` + `-`. Stable identifier for write_document. */
const NAME_RE = /^[A-Za-z0-9_-]+$/;

export function applyTemplateWrite(input: WriteTemplateInput): TemplateWriteResult {
  const validation = validateInputs(input.projectDir, input.folder, input.name);
  if (!validation.ok) return { ok: false, error: validation.error };

  const { templatesDir, filePath } = templatePaths(
    input.projectDir,
    validation.folderRel,
    input.name,
  );

  // Build the file content: frontmatter block (if non-empty) + body.
  const fmYaml = serializeFrontmatter(input.frontmatter);
  const content = fmYaml ? `---\n${fmYaml}---\n${input.body}` : input.body;

  // Lazy-create .ok/ and templates/.
  mkdirSync(templatesDir, { recursive: true });

  const created = !existsSync(filePath);

  // Atomic write: tmp + rename so the file-watcher sees one event.
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmpPath, content, 'utf-8');
  renameSync(tmpPath, filePath);

  const warnings: string[] = [];
  if (
    input.frontmatter.title === undefined ||
    typeof input.frontmatter.title !== 'string' ||
    input.frontmatter.title.length === 0
  ) {
    warnings.push(
      'Template frontmatter.title is missing — agents pick templates from the title + description, so omitting these undermines the menu UX. (D14 soft contract.)',
    );
  }
  if (
    input.frontmatter.description === undefined ||
    typeof input.frontmatter.description !== 'string' ||
    input.frontmatter.description.length === 0
  ) {
    warnings.push(
      'Template frontmatter.description is missing — agents pick templates from the title + description, so omitting these undermines the menu UX. (D14 soft contract.)',
    );
  }

  return { ok: true, path: relPathOf(input.projectDir, filePath), created, warnings };
}

export function applyTemplateDelete(input: DeleteTemplateInput): TemplateDeleteResult {
  const validation = validateInputs(input.projectDir, input.folder, input.name);
  if (!validation.ok) return { ok: false, error: validation.error };

  const { templatesDir, okDir, filePath } = templatePaths(
    input.projectDir,
    validation.folderRel,
    input.name,
  );

  const existed = existsSync(filePath);
  if (existed) {
    try {
      unlinkSync(filePath);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'UNLINK_FAILED',
          message: `Failed to delete template at ${relPathOf(input.projectDir, filePath)}: ${(err as Error).message}`,
        },
      };
    }
  }

  // Auto-clean per D3: empty templates/ → remove; empty .ok/ → remove.
  let templatesCleaned = false;
  let okCleaned = false;
  if (existsSync(templatesDir) && isEmpty(templatesDir)) {
    try {
      rmdirSync(templatesDir);
      templatesCleaned = true;
    } catch {
      // Non-empty (race) or permission error — leave it.
    }
  }
  if (existsSync(okDir) && isEmpty(okDir)) {
    try {
      rmdirSync(okDir);
      okCleaned = true;
    } catch {
      // Non-empty (e.g., frontmatter.yml still here) — leave it.
    }
  }

  return {
    ok: true,
    path: relPathOf(input.projectDir, filePath),
    existed,
    cleanedEmpty: { templatesDir: templatesCleaned, okDir: okCleaned },
  };
}

function validateInputs(
  projectDir: string,
  folder: string,
  name: string,
): { ok: true; folderRel: string } | { ok: false; error: { code: string; message: string } } {
  if (!isAbsolute(projectDir)) {
    return {
      ok: false,
      error: { code: 'BAD_PROJECT_DIR', message: 'projectDir must be absolute' },
    };
  }
  if (!NAME_RE.test(name)) {
    return {
      ok: false,
      error: {
        code: 'BAD_NAME',
        message: `Template name must match /^[A-Za-z0-9_-]+$/ (got: ${JSON.stringify(name)}). Use letters, digits, underscores, or hyphens — no slashes, dots, or spaces.`,
      },
    };
  }

  const folderNormalized = folder
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/^\.$/, '');
  if (folderNormalized.includes('..')) {
    return {
      ok: false,
      error: {
        code: 'PATH_TRAVERSAL',
        message: `Folder path may not contain "..": ${JSON.stringify(folder)}`,
      },
    };
  }
  // Re-resolve and confirm we stay under projectDir.
  const folderAbs = folderNormalized ? resolve(projectDir, folderNormalized) : projectDir;
  const projectAbs = resolve(projectDir);
  if (!folderAbs.startsWith(projectAbs + sep) && folderAbs !== projectAbs) {
    return {
      ok: false,
      error: {
        code: 'PATH_ESCAPE',
        message: `Resolved folder path escapes projectDir: ${folderAbs}`,
      },
    };
  }
  return { ok: true, folderRel: folderNormalized };
}

function templatePaths(
  projectDir: string,
  folderRel: string,
  name: string,
): { okDir: string; templatesDir: string; filePath: string } {
  const okDir = folderRel ? join(projectDir, folderRel, '.ok') : join(projectDir, '.ok');
  const templatesDir = join(okDir, 'templates');
  const filePath = join(templatesDir, `${name}.md`);
  return { okDir, templatesDir, filePath };
}

function relPathOf(projectDir: string, abs: string): string {
  const rel = abs.startsWith(projectDir + sep) ? abs.slice(projectDir.length + 1) : abs;
  return normalize(rel).split(sep).join('/');
}

function serializeFrontmatter(fm: TemplateFrontmatter): string {
  const obj: Record<string, unknown> = {};
  if (fm.title !== undefined) obj.title = fm.title;
  if (fm.description !== undefined) obj.description = fm.description;
  if (Array.isArray(fm.tags) && fm.tags.length > 0) obj.tags = fm.tags;
  if (Object.keys(obj).length === 0) return '';
  return stringifyYaml(obj);
}

function isEmpty(absDir: string): boolean {
  try {
    return readdirSync(absDir).length === 0;
  } catch {
    return false;
  }
}
