import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CONFIG_SCHEMA_MAJOR_PATH, LOCAL_DIR } from '@inkeep/open-knowledge-core';
import { CONFIG_FILENAME, OK_DIR, PACKAGE_VERSION } from '../constants.ts';

function assertNotSymlink(filePath: string, label: string): void {
  let lst: ReturnType<typeof lstatSync>;
  try {
    lst = lstatSync(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  if (lst.isSymbolicLink()) {
    throw new Error(
      `Refusing to follow symlink at ${label} (${filePath}). ` +
        `An untrusted upstream may have committed this symlink to redirect writes outside the project. ` +
        `Remove the symlink and re-run.`,
    );
  }
}

export function packageVersionMajorMinor(version: string): string {
  const [rawMajor = '0', rawMinor = '0'] = version.split('.');
  const major = rawMajor.length > 0 ? rawMajor : '0';
  const minor = rawMinor.length > 0 ? rawMinor : '0';
  return `${major}.${minor}`;
}

export function buildConfigYmlContent(_version: string): string {
  return `# yaml-language-server: $schema=https://unpkg.com/@inkeep/open-knowledge@latest/dist/schemas/${CONFIG_SCHEMA_MAJOR_PATH}/config.project.schema.json
# Open Knowledge — project configuration
#
# This file overrides built-in defaults for this project. Every key below
# is commented out and shows its current default value. Uncomment any key
# to override it.
#
# Precedence (lowest -> highest):
#   Built-in defaults
#     -> ~/${OK_DIR}/config.yml         (user defaults)
#     -> ./${OK_DIR}/config.yml         (this file)
#
# Schema reference: packages/cli/src/config/schema.ts


# --- Content ---------------------------------------------------------------
# dir: where the CRDT editor reads/writes documents. Relative to the project
# root (the directory containing ${OK_DIR}/), NOT to this file.
#
# Path exclusions live in .okignore (gitignore syntax) at the project root,
# with nested .okignore files honored at any folder depth.
#
# content:
#   dir: .


# --- Suggested lifecycle (optional pattern) --------------------------------
# Projects that want an explicit knowledge-maturation flow can organize as
# three tiers *relative to the content directory* — create the subfolders
# only when you need them:
#
#   1. external-sources/  — raw content fetched from URLs, PDFs. No analysis,
#                           just preservation. Use the \`ingest\` MCP tool.
#   2. research/          — analysis and synthesis. Provisional findings,
#                           trade-offs, open questions. Use the \`research\`
#                           MCP tool.
#   3. articles/          — canonical knowledge. Use the \`consolidate\` MCP
#                           tool to promote research -> articles once
#                           decisions are made.
#
# This is a pattern, not a requirement. Projects with existing layouts
# (\`specs/\`, \`reports/\`, \`docs/\`, etc.) should use those; the lifecycle
# exists as mental scaffolding, not as enforced filesystem structure.


# --- Server ----------------------------------------------------------------
# Host: set via \`--host\` flag or \`HOST\` env var (default: localhost; use
# \`0.0.0.0\` to bind LAN-visible). Port: set via \`--port\` flag or \`PORT\`
# env var (auto-allocated if unset). Both are per-process runtime knobs —
# no \`server:\` schema field exists.


# --- Appearance ------------------------------------------------------------
# Theme + default editor mode for new docs. Both default UNSET so the
# existing localStorage cache (\`ok-theme-v1\` / \`ok-editor-mode-v1\`) keeps
# powering FOUC-free first paint until you explicitly write here.
#
# appearance:
#   theme: system            # 'light' | 'dark' | 'system'
#   editorModeDefault: wysiwyg  # 'wysiwyg' | 'source'


# --- Folders: per-folder frontmatter defaults -------------------------------
#
# TL;DR glob gotcha: \`**\` is ONLY a multi-segment wildcard when it is a
# standalone path segment. \`foo-**\` behaves like \`foo-*\` (single segment, NOT
# descendants). Use \`foo/**\` or \`foo-*/**\` to match descendants.
#
# Declare title/description/tags defaults keyed by glob \`match:\`. Rules merge
# with a file's own frontmatter at read time:
#   - Per scalar (title, description): the FILE wins when declared; folder
#     rule fills in blanks.
#   - Tags: concatenated across ALL matching rules (in declaration order) with
#     file tags last; first-occurrence preserved on dedup.
#   - Evaluation is positional — LATER rules in this array override earlier
#     rules for scalars. Put general rules first, specific rules last.
#
# Picomatch glob cheatsheet:
#   \`match: 'foo'\`         — matches ONLY the folder \`foo\` itself
#   \`match: 'foo/**'\`      — matches \`foo\` AND all descendants (files + dirs)
#   \`match: 'foo-*'\`       — matches \`foo-1\`, \`foo-bar\` (single segment)
#   \`match: 'foo-**'\`      — behaves like \`foo-*\` (NOT multi-segment); see
#                              TL;DR above. Use \`foo-*/**\` if you want
#                              \`foo-X\` plus its descendants.
#
# Tip: run \`ok seed\` to scaffold the Karpathy three-layer starter
# (external-sources/, research/, articles/) with matching \`folders:\` entries.
# The commented example below is the exact structure \`ok seed\` writes.
#
# Example:
# folders:
#   - match: 'external-sources/**'
#     frontmatter:
#       title: External Sources
#       description: Raw preserved sources (URLs, PDFs, files). Immutable — captured verbatim via \`ingest\`. No analysis in these files; takeaways belong in \`research/\`.
#       tags: [source, immutable, layer-ingest]
#   - match: 'research/**'
#     frontmatter:
#       title: Research
#       description: Provisional analysis synthesizing external sources. Produced by the \`research\` tool. Promote to \`articles/\` via \`consolidate\` when the team decides.
#       tags: [research, provisional, layer-research]
#   - match: 'articles/**'
#     frontmatter:
#       title: Articles
#       description: Canonical knowledge committed after a team decision. Produced by the \`consolidate\` tool with a \`supersedes:\` chain tying back to the research that preceded it.
#       tags: [article, canonical, layer-consolidate]
`;
}

function writeIfMissing(filePath: string, content: string, label: string): boolean {
  assertNotSymlink(filePath, label);
  if (existsSync(filePath)) return false;
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

function ensureGitignoreEntries(
  filePath: string,
  scaffoldContent: string,
): 'created' | 'updated' | 'unchanged' {
  assertNotSymlink(filePath, '.ok/.gitignore');
  if (!existsSync(filePath)) {
    writeFileSync(filePath, scaffoldContent, 'utf-8');
    return 'created';
  }
  const required = scaffoldContent
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  const existing = readFileSync(filePath, 'utf-8');
  const present = new Set(existing.split('\n').map((l) => l.trim()));
  const missing = required.filter((l) => !present.has(l));
  if (missing.length === 0) return 'unchanged';
  const sep = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  writeFileSync(filePath, `${existing}${sep}${missing.join('\n')}\n`, 'utf-8');
  return 'updated';
}

const OK_GITIGNORE_CONTENT = `# .ok/local/ holds per-machine runtime state. Anything inside is
# machine-local and never committed. New runtime files (caches, locks,
# manifests, telemetry, error logs) are auto-ignored — no edit needed here.
${LOCAL_DIR}/
`;

export const OK_OKIGNORE_TEMPLATE = `# .okignore — paths to exclude from the Open Knowledge document index.
# Uses gitignore syntax (parsed by the \`ignore\` npm library), evaluated
# alongside .gitignore in a single ignore-lib instance.
#
# Patterns combine with .gitignore: an entry here adds to exclusions, and
# a leading \`!\` re-includes a file that .gitignore excluded.
# Nested .okignore files at any folder depth are honored (mirrors .gitignore).
#
# Examples:
#   drafts/        # exclude a directory
#   *.draft.md     # exclude files matching a pattern
#   !keep.md       # re-include a file .gitignore excluded
`;

export function initContent(projectDir: string): {
  created: string[];
  updated: string[];
  skipped: string[];
} {
  const okDir = resolve(projectDir, OK_DIR);
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  assertNotSymlink(okDir, '.ok/');
  mkdirSync(okDir, { recursive: true });

  const gitignoreAction = ensureGitignoreEntries(join(okDir, '.gitignore'), OK_GITIGNORE_CONTENT);
  if (gitignoreAction === 'created') {
    created.push('.gitignore');
  } else if (gitignoreAction === 'updated') {
    updated.push('.gitignore');
  } else {
    skipped.push('.gitignore');
  }

  if (
    writeIfMissing(
      join(okDir, CONFIG_FILENAME),
      buildConfigYmlContent(PACKAGE_VERSION),
      `.ok/${CONFIG_FILENAME}`,
    )
  ) {
    created.push(CONFIG_FILENAME);
  } else {
    skipped.push(CONFIG_FILENAME);
  }

  if (writeIfMissing(join(projectDir, '.okignore'), OK_OKIGNORE_TEMPLATE, '.okignore')) {
    created.push('.okignore');
  } else {
    skipped.push('.okignore');
  }

  return { created, updated, skipped };
}
