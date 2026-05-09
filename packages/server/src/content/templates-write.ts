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
import { validateSubstitution } from './substitution.ts';
import { getUserHome } from './user-home.ts';

export type TemplateTarget = 'project' | 'user';

type TemplateWriteResult =
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

type TemplateDeleteResult =
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

interface WriteTemplateInput {
  projectDir: string;
  folder: string;
  name: string;
  body: string;
  frontmatter: TemplateFrontmatter;
  target?: TemplateTarget;
}

interface DeleteTemplateInput {
  projectDir: string;
  folder: string;
  name: string;
  target?: TemplateTarget;
}

const NAME_RE = /^[A-Za-z0-9_-]+$/;

export function applyTemplateWrite(input: WriteTemplateInput): TemplateWriteResult {
  const target: TemplateTarget = input.target ?? 'project';
  const resolvedRoot = resolveRootForTarget(target, input.projectDir);
  if (!resolvedRoot.ok) return { ok: false, error: resolvedRoot.error };

  const folderForValidation = target === 'user' ? '' : input.folder;
  const validation = validateInputs(resolvedRoot.rootDir, folderForValidation, input.name);
  if (!validation.ok) return { ok: false, error: validation.error };

  const titleCheck = validateTitle(input.frontmatter.title);
  if (!titleCheck.ok) return { ok: false, error: titleCheck.error };

  const subsCheck = validateSubstitutionAllowlist(input.body);
  if (!subsCheck.ok) return { ok: false, error: subsCheck.error };

  const { templatesDir, filePath } = templatePaths(
    resolvedRoot.rootDir,
    validation.folderRel,
    input.name,
  );

  const fmYaml = serializeFrontmatter(input.frontmatter);
  const content = fmYaml ? `---\n${fmYaml}---\n${input.body}` : input.body;

  try {
    mkdirSync(templatesDir, { recursive: true });
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'WRITE_ERROR',
        message: `Failed to create template directory at ${displayPath(target, resolvedRoot.rootDir, templatesDir)}: ${(err as Error).message}`,
      },
    };
  }

  const created = !existsSync(filePath);

  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    writeFileSync(tmpPath, content, 'utf-8');
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {}
    return {
      ok: false,
      error: {
        code: 'WRITE_ERROR',
        message: `Failed to write template at ${displayPath(target, resolvedRoot.rootDir, filePath)}: ${(err as Error).message}`,
      },
    };
  }

  const warnings: string[] = [];
  if (
    input.frontmatter.description === undefined ||
    typeof input.frontmatter.description !== 'string' ||
    input.frontmatter.description.length === 0
  ) {
    warnings.push(
      'Template frontmatter.description is missing — `description` disambiguates between similarly-named templates in the menu. Recommended but not required.',
    );
  }

  return {
    ok: true,
    path: displayPath(target, resolvedRoot.rootDir, filePath),
    created,
    warnings,
  };
}

export function applyTemplateDelete(input: DeleteTemplateInput): TemplateDeleteResult {
  const target: TemplateTarget = input.target ?? 'project';
  const resolvedRoot = resolveRootForTarget(target, input.projectDir);
  if (!resolvedRoot.ok) return { ok: false, error: resolvedRoot.error };

  const folderForValidation = target === 'user' ? '' : input.folder;
  const validation = validateInputs(resolvedRoot.rootDir, folderForValidation, input.name);
  if (!validation.ok) return { ok: false, error: validation.error };

  const { templatesDir, okDir, filePath } = templatePaths(
    resolvedRoot.rootDir,
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
          message: `Failed to delete template at ${displayPath(target, resolvedRoot.rootDir, filePath)}: ${(err as Error).message}`,
        },
      };
    }
  }

  let templatesCleaned = false;
  let okCleaned = false;
  if (existsSync(templatesDir) && isEmpty(templatesDir)) {
    try {
      rmdirSync(templatesDir);
      templatesCleaned = true;
    } catch {}
  }
  if (existsSync(okDir) && isEmpty(okDir)) {
    try {
      rmdirSync(okDir);
      okCleaned = true;
    } catch {}
  }

  return {
    ok: true,
    path: displayPath(target, resolvedRoot.rootDir, filePath),
    existed,
    cleanedEmpty: { templatesDir: templatesCleaned, okDir: okCleaned },
  };
}

function resolveRootForTarget(
  target: TemplateTarget,
  projectDir: string,
): { ok: true; rootDir: string } | { ok: false; error: { code: string; message: string } } {
  if (target === 'user') {
    const userHome = getUserHome();
    if (!userHome) {
      return {
        ok: false,
        error: {
          code: 'USER_HOME_UNAVAILABLE',
          message:
            'User home directory could not be resolved. User templates require a writable home directory at ~/.ok/templates/.',
        },
      };
    }
    return { ok: true, rootDir: userHome };
  }
  return { ok: true, rootDir: projectDir };
}

function displayPath(target: TemplateTarget, rootDir: string, absPath: string): string {
  if (target === 'user') {
    if (absPath.startsWith(rootDir + sep)) {
      return `~/${absPath
        .slice(rootDir.length + 1)
        .split(sep)
        .join('/')}`;
    }
    return absPath.split(sep).join('/');
  }
  return relPathOf(rootDir, absPath);
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

function validateTitle(
  title: unknown,
): { ok: true } | { ok: false; error: { code: string; message: string } } {
  if (typeof title !== 'string' || title.length === 0) {
    return {
      ok: false,
      error: {
        code: 'TEMPLATE_TITLE_REQUIRED',
        message:
          'Template frontmatter.title is required. `title` is the menu surface — agents pick templates by name+title; a title-less template is effectively invisible. Set a non-empty `title` and retry.',
      },
    };
  }
  return { ok: true };
}

function validateSubstitutionAllowlist(
  body: string,
): { ok: true } | { ok: false; error: { code: string; message: string } } {
  const errors = validateSubstitution(body);
  if (errors.length === 0) return { ok: true };
  const offenders = errors.map((e) => `\`{{${e.token}}}\` at offset ${e.offset}`).join(', ');
  return {
    ok: false,
    error: {
      code: 'TEMPLATE_UNKNOWN_VARIABLE',
      message: `Template body contains unknown substitution token(s): ${offenders}. v1 allowlist: \`{{date}}\`, \`{{user}}\`. Remove or rename the offending tokens and retry.`,
    },
  };
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
