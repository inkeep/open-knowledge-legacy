export interface StarterFolder {
  path: string;
  title: string;
  description: string;
  tags: string[];
  starterTemplate: string;
}

export const STARTER_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'external-sources',
    title: 'External Sources',
    description:
      'Raw sources SAVED verbatim — not just cited. The actual fetched text of URLs, extracted text of PDFs, and copies of any referenced files live as .md files here, each with frontmatter carrying the original URL, access date, and any publisher / author metadata. Produced by `ingest` — applies whether the user shared the URL OR the agent fetched it itself to ground a knowledge-base claim. The KB is closed-loop: downstream docs cite local paths in this folder, never bare web URLs. Immutable after capture (update only to refresh a stale fetch). No analysis in these files — that belongs in `research/`. Downstream articles cite specific docs here by path so every claim is traceable to preserved evidence rather than a dead link.',
    tags: ['source', 'immutable', 'layer-ingest'],
    starterTemplate: 'clip',
  },
  {
    path: 'research',
    title: 'Research',
    description:
      'Provisional analysis synthesizing external sources. Produced by the `research` tool. Every factual claim cites a specific doc in `external-sources/` (or an inline URL if ingest was skipped) — no unsourced assertions. Each article has `status: provisional` and a `sources:` frontmatter list of cited paths. Promoted to `articles/` via `consolidate` once the team decides the findings are stable.',
    tags: ['research', 'provisional', 'layer-research'],
    starterTemplate: 'research-log',
  },
  {
    path: 'articles',
    title: 'Articles',
    description:
      'Canonical knowledge committed after a team decision. Produced by `consolidate`. Carries `status: canonical` plus a `supersedes:` chain tying back to the `research/` docs it replaces, which in turn cite `external-sources/` — the full evidence chain is traceable without leaving the repo. Source-of-truth for the domain; update only when a new decision supersedes it.',
    tags: ['article', 'canonical', 'layer-consolidate'],
    starterTemplate: 'article',
  },
] as const;

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
- \`.ok/config.yml\` changes

**Reference docs as markdown links, not bare paths.** Every doc you touched should appear as \`[path/to/doc](./path/to/doc.md)\` so the log shows up in \`get_backlinks\` for those docs. A bare path string (\`Files touched: foo/bar.md\`) does not register in the doc graph — the audit trail compounds only when the log is a real linker.

<!-- Example entry shape:

## YYYY-MM-DD — <short title>

- <what was done>
- Files touched: [path/to/doc-a](./path/to/doc-a.md), [path/to/doc-b](./path/to/doc-b.md)
- Sources ingested: [source-slug](./external-sources/source-slug.md)
- Open follow-ups: <topic-1>, <topic-2>

-->
`;

export const STARTER_TEMPLATES: Readonly<Record<string, string>> = {
  clip: `---
title: External Source
description: Capture a URL, PDF, or referenced file verbatim. Update title to match the actual source after instantiation.
source:
clipped: {{date}}
status: raw
tags: [source]
---

## Source

(Paste / fetch the verbatim source text here. Keep it raw — analysis goes in research/.)

## Highlights

(Direct quotes worth pulling out.)

## My notes

(Your reactions, questions, follow-ups. NOT analysis — that belongs in research/.)
`,
  'research-log': `---
title: Research Log
description: Provisional analysis synthesizing external sources. Every factual claim cites a doc in external-sources/. Promoted to articles/ via consolidate once findings are stable.
status: provisional
sources: []
created: {{date}}
author: {{user}}
tags: [research, provisional]
---

## Question

(What are you trying to figure out?)

## Sources cited

(List paths from external-sources/ this log synthesizes. Mirror in the \`sources:\` frontmatter list.)

## Findings

(Provisional. Every claim traces back to a specific source above.)

## Open questions

(Threads to chase next.)
`,
  article: `---
title: Canonical Article
description: Canonical knowledge committed after a team decision. Carries status:canonical plus a supersedes chain tying back to the research/ docs it replaces. Source-of-truth for the domain.
status: canonical
supersedes: []
authored: {{date}}
author: {{user}}
tags: [article, canonical]
---

## Summary

(One-paragraph summary of the canonical position. The decision in plain English.)

## Body

(The full canonical knowledge. Cite research/ entries (which in turn cite external-sources/) so the evidence chain is traceable.)

## References

(Markdown links to the research/ + external-sources/ docs this article rests on.)
`,
};

export const STARTER_FOLDER_FRONTMATTER_FILENAME = 'frontmatter.yml';

export function buildStarterFolderFrontmatterYaml(folder: StarterFolder): string {
  const lines: string[] = [];
  lines.push(`title: ${yamlScalar(folder.title)}`);
  lines.push(`description: ${yamlScalar(folder.description)}`);
  lines.push('tags:');
  for (const tag of folder.tags) {
    lines.push(`  - ${yamlScalar(tag)}`);
  }
  return `${lines.join('\n')}\n`;
}

function yamlScalar(value: string): string {
  if (value === '') return '""';
  if (/[:#\n"'\\]|^\s|\s$/.test(value)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}
