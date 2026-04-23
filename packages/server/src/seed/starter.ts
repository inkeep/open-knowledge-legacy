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
      'Raw preserved sources (URLs, PDFs, files). Immutable — captured verbatim via `ingest`. No analysis in these files; takeaways belong in `research/`.',
    tags: ['source', 'immutable', 'layer-ingest'],
  },
  {
    path: 'research',
    match: 'research/**',
    title: 'Research',
    description:
      'Provisional analysis synthesizing external sources. Produced by the `research` tool. Each article has `status: provisional` and a `sources:` list citing `external-sources/` or external URLs. Promoted to `articles/` via `consolidate` when the team decides.',
    tags: ['research', 'provisional', 'layer-research'],
  },
  {
    path: 'articles',
    match: 'articles/**',
    title: 'Articles',
    description:
      'Canonical knowledge committed after a team decision. Produced by the `consolidate` tool. Carries `status: canonical` and a `supersedes:` chain tying back to the research that preceded it. Source-of-truth for the domain.',
    tags: ['article', 'canonical', 'layer-consolidate'],
  },
] as const;

/**
 * Content written to the optional root `log.md` (append-only work log per the
 * Karpathy pattern). Seeded empty; user appends entries over time.
 */
export const LOG_MD_TEMPLATE = `---
title: Work Log
description: Chronological record of knowledge base activity
---

# Work Log

Append-only record of ingests, research, consolidations, and maintenance. Each entry is dated and briefly describes what was done.

<!-- Example entry shape:

## YYYY-MM-DD — <short title>

- <what was done>
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
