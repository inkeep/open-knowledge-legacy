import type { FolderRule } from './types.ts';

/**
 * A starter-pack folder entry. Drives both the filesystem scaffold and the
 * `config.yml` `folders:` rule that the scaffolder writes for that folder.
 */
export interface StarterFolder {
  /** Directory name created under the project root, e.g. `external-sources`. */
  path: string;
  /** Glob written to `config.yml` `folders:` entry `match:` field, e.g. `external-sources/**`. */
  match: string;
  /** Human-readable title written to the folder rule frontmatter. */
  title: string;
  /**
   * Description written to the folder rule frontmatter. This is the **primary
   * agent-guidance surface** for folder purpose — per SPEC 2026-04-22 D2 LOCKED,
   * `ok seed` does NOT emit AGENTS.md files; agent guidance for each folder lives
   * in this description, which surfaces at every `exec("ls <folder>")` /
   * `read_document` / `search` call.
   */
  description: string;
  /** Tags written to the folder rule frontmatter. */
  tags: string[];
}

/**
 * The Karpathy three-layer knowledge-base starter pack.
 *
 * Mirrors the workflow tools the MCP server exposes:
 *   `external-sources/` ⇔ `ingest`
 *   `research/`         ⇔ `research`
 *   `articles/`         ⇔ `consolidate`
 *
 * See specs/2026-04-23-ok-seed-scaffold/SPEC.md §Design for the canonical text
 * and the bundled user-global skill at
 * packages/server/assets/skills/open-knowledge/SKILL.md §"Workflow tools" for
 * the layer semantics.
 */
export const STARTER_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'external-sources',
    match: 'external-sources/**',
    title: 'External Sources',
    description:
      'Raw sources SAVED verbatim — not just cited. The actual fetched text of URLs, extracted text of PDFs, and copies of any referenced files live as .md files here, each with frontmatter carrying the original URL, access date, and any publisher / author metadata. Produced by `ingest` — applies whether the user shared the URL OR the agent fetched it itself to ground a knowledge-base claim. The KB is closed-loop: downstream docs cite local paths in this folder, never bare web URLs. Immutable after capture (update only to refresh a stale fetch). No analysis in these files — that belongs in `research/`. Downstream articles cite specific docs here by path so every claim is traceable to preserved evidence rather than a dead link.',
    tags: ['source', 'immutable', 'layer-ingest'],
  },
  {
    path: 'research',
    match: 'research/**',
    title: 'Research',
    description:
      'Provisional analysis synthesizing external sources. Produced by the `research` tool. Every factual claim cites a specific doc in `external-sources/` (or an inline URL if ingest was skipped) — no unsourced assertions. Each article has `status: provisional` and a `sources:` frontmatter list of cited paths. Promoted to `articles/` via `consolidate` once the team decides the findings are stable.',
    tags: ['research', 'provisional', 'layer-research'],
  },
  {
    path: 'articles',
    match: 'articles/**',
    title: 'Articles',
    description:
      'Canonical knowledge committed after a team decision. Produced by `consolidate`. Carries `status: canonical` plus a `supersedes:` chain tying back to the `research/` docs it replaces, which in turn cite `external-sources/` — the full evidence chain is traceable without leaving the repo. Source-of-truth for the domain; update only when a new decision supersedes it.',
    tags: ['article', 'canonical', 'layer-consolidate'],
  },
] as const;

/**
 * Content written to the optional root `log.md` (append-only work log per the
 * Karpathy pattern). Seeded empty; user appends entries over time.
 */
export const LOG_MD_TEMPLATE = `---
title: Work Log
description: Append-only audit trail. After each turn that creates, edits, or restructures content in the knowledge base, append one dated entry here (one per turn, not per file). Silent edits break the audit trail.
---

# Work Log

Append-only audit trail. **Append a dated entry after any turn that creates, edits, or restructures content in the knowledge base** — one entry per turn, not per file. Silent edits break the chain that makes knowledge-base changes auditable.

What to log:

- \`ingest\` runs (new external sources captured)
- \`research\` / \`consolidate\` runs (provisional or canonical articles produced)
- Direct \`write_document\` / \`edit_document\` / renames / deletions outside the three workflow tools
- Folder restructures (\`ok seed\`, manual reorganization)
- \`.open-knowledge/config.yml\` changes

<!-- Example entry shape:

## YYYY-MM-DD — <short title>

- <what was done>
- Files touched: <path>, <path>
- Open follow-ups: <topic-1>, <topic-2>

-->
`;

/**
 * Build a `FolderRule` for the given starter folder. Used by `planSeed` /
 * `applySeed` to produce config.yml entries that match the existing
 * `FolderRuleSchema` shape.
 */
export function starterFolderRule(folder: StarterFolder): FolderRule {
  return {
    match: folder.match,
    frontmatter: {
      title: folder.title,
      description: folder.description,
      tags: folder.tags,
    },
  };
}
