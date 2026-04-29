import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CACHE_DIR, CONFIG_FILENAME, OK_DIR, PACKAGE_VERSION } from '../constants.ts';

/**
 * Pin the `$schema` URL to the running CLI's MAJOR.MINOR so the user's IDE
 * autocomplete surface stays in lockstep with what they wrote against
 * (FR-17 / D21). Mirrors the [Biome `$schema` URL precedent](https://biomejs.dev/guides/configure-biome/)
 * — `https://biomejs.dev/schemas/<version>/schema.json` — adapted for unpkg.
 *
 * On upgrade, the user re-runs `ok init` (or extends `ok config migrate`) to
 * bump the URL alongside any field migrations.
 */
export function packageVersionMajorMinor(version: string): string {
  // Default-on-undefined ([major = '0']) doesn't kick in for empty strings —
  // ''.split('.') returns [''], not []. Coerce empty segments to '0' so a
  // malformed version still yields a parsable URL slug.
  const [rawMajor = '0', rawMinor = '0'] = version.split('.');
  const major = rawMajor.length > 0 ? rawMajor : '0';
  const minor = rawMinor.length > 0 ? rawMinor : '0';
  return `${major}.${minor}`;
}

export function buildConfigYmlContent(version: string): string {
  const majorMinor = packageVersionMajorMinor(version);
  return `# yaml-language-server: $schema=https://unpkg.com/@inkeep/open-knowledge@${majorMinor}/dist/config.workspace.schema.json
# Open Knowledge — workspace configuration
#
# This file overrides built-in defaults for this workspace. Every key below
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
# include/exclude: glob patterns for tracked content files. Relative to the
# content directory (content.dir).
#
# content:
#   dir: .
#   include:
#     - "**/*.md"
#   exclude: []


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
# HTTP/WebSocket listener for the Hocuspocus server + static React app.
#
# host: bind interface for the HTTP server (\`localhost\` for loopback;
# \`0.0.0.0\` for LAN). Override per-process with the \`HOST\` env var or the
# \`--host\` CLI flag. Port is per-machine only — set via \`PORT\` env or the
# \`--port\` CLI flag (no schema field).
#
# openOnAgentEdit: when true, the browser opens automatically the first time
# an agent writes to the knowledge base in this server session. Debounced to
# one open per boot. Useful for pairing with Claude Code — you see the edit
# land live. Leave false for headless/CI.
#
# server:
#   host: localhost
#   openOnAgentEdit: false


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

function writeIfMissing(filePath: string, content: string): boolean {
  if (existsSync(filePath)) return false;
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

/**
 * Append missing scaffold entries to an existing `.gitignore`, or create the
 * file from scratch when absent. User customizations are preserved — only
 * entries that aren't already present (via trim-equality) get appended.
 *
 * Required entries are derived from `scaffoldContent`'s non-comment, non-empty
 * lines. This is the upgrade path: workspaces that ran `ok init` before this
 * scaffold gained `principal.json` / `last-spawn-error.log` would otherwise
 * never see the new entries because `writeIfMissing` short-circuits.
 */
function ensureGitignoreEntries(
  filePath: string,
  scaffoldContent: string,
): 'created' | 'updated' | 'unchanged' {
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

/**
 * Single source of truth for `.open-knowledge/.gitignore`.
 *
 * Every per-machine OK runtime path lives here so the project root
 * `.gitignore` stays free of OK-internal entries. No `ok` command writes
 * to the project root `.gitignore`.
 */
const OK_GITIGNORE_CONTENT = `# Per-machine runtime state — never commit. All Open Knowledge ignore rules
# live here so the project root .gitignore stays free of OK-internal paths.

# Derived caches
${CACHE_DIR}/

# Per-process locks
server.lock
ui.lock

# Sync watermarks + per-machine principal identity
sync-state.json
principal.json

# MCP spawn diagnostics
last-spawn-error.log
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

  // Create .open-knowledge/ itself + the cache/ subdir. No scaffold content dirs —
  // content lives wherever config.content.dir points (project root by default).
  mkdirSync(okDir, { recursive: true });
  mkdirSync(join(okDir, CACHE_DIR), { recursive: true });

  // .gitignore: merge-on-upgrade — append missing scaffold entries to an
  // existing file rather than skipping outright. Keeps the SSoT contract for
  // workspaces created before new entries (`principal.json`,
  // `last-spawn-error.log`) joined the scaffold.
  const gitignoreAction = ensureGitignoreEntries(join(okDir, '.gitignore'), OK_GITIGNORE_CONTENT);
  if (gitignoreAction === 'created') {
    created.push('.gitignore');
  } else if (gitignoreAction === 'updated') {
    updated.push('.gitignore');
  } else {
    skipped.push('.gitignore');
  }

  // config.yml: writeIfMissing — user customizations win.
  if (writeIfMissing(join(okDir, CONFIG_FILENAME), buildConfigYmlContent(PACKAGE_VERSION))) {
    created.push(CONFIG_FILENAME);
  } else {
    skipped.push(CONFIG_FILENAME);
  }

  return { created, updated, skipped };
}
