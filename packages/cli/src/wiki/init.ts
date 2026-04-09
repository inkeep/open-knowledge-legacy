import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { generateCatalog, generateRootCatalog } from './catalog.ts';
import type { WikiConfig } from './config.ts';

const DEFAULT_CONFIG: WikiConfig = {
  articles_path: './articles',
  external_sources_path: './external-sources',
  research_path: './research',
};

export const AGENTS_MD_CONTENT = `# .openknowledge/ — Project Wiki

This directory contains a living knowledge base for this project, maintained by both agents and humans.

## Structure

- \`articles/\` — Canonical knowledge articles grouped by topic
- \`external-sources/\` — Ingested external content (raw reference material)
- \`research/\` — Exploratory research and provisional findings
- \`cache/\` — Derived data (gitignored)

## Navigation

1. **Start with INDEX.md** — Every directory has an auto-generated \`INDEX.md\` catalog listing all articles and subfolders
2. **Search with grep** — Use grep/ripgrep to find specific topics across all wiki content
3. **Read specific files** — Once you find the right article, read it for full context

## Content Lifecycle

1. **External sources** (\`external-sources/\`) — Raw content fetched from URLs, PDFs, or other documents. No analysis, just preservation.
2. **Research** (\`research/\`) — Analysis and synthesis of sources. Provisional findings, trade-offs, open questions.
3. **Articles** (\`articles/\`) — Canonical knowledge. Architecture decisions, processes, how things work. The source of truth.

Knowledge matures through stages: external sources → research → articles.

## Frontmatter Conventions

Every \`.md\` file should have YAML frontmatter:

\`\`\`yaml
---
title: Article Title (required)
description: Brief summary for catalog listings (required)
tags:
  - relevant
  - tags
---
\`\`\`

- \`title\` and \`description\` are required — they appear in INDEX.md catalogs
- \`tags\` are recommended for discoverability

## MCP Server

This wiki can be served via MCP for automatic catalog generation:

\`\`\`json
{
  "mcpServers": {
    "openknowledge": {
      "command": "npx",
      "args": ["open-knowledge", "mcp"]
    }
  }
}
\`\`\`

Add this to \`.mcp.json\` in the repo root for automatic agent integration.
`;

export const CLAUDE_MD_SECTION = `## .openknowledge/ — Project Wiki

This repo has a living knowledge base in \`.openknowledge/\`.

- Read \`INDEX.md\` at any level for navigation
- After doing significant work, update or create relevant wiki articles
- Knowledge articles live in \`.openknowledge/articles/\` grouped by topic
- External sources live in \`.openknowledge/external-sources/\`
`;

function writeIfMissing(filePath: string, content: string): boolean {
  if (existsSync(filePath)) return false;
  writeFileSync(filePath, content, 'utf-8');
  return true;
}

export function initWiki(projectDir: string): { created: string[]; skipped: string[] } {
  const okDir = resolve(projectDir, '.openknowledge');
  const created: string[] = [];
  const skipped: string[] = [];

  const dirs = [
    okDir,
    join(okDir, 'articles'),
    join(okDir, 'external-sources'),
    join(okDir, 'research'),
    join(okDir, 'cache'),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }

  // config.yaml
  const configPath = join(okDir, 'config.yaml');
  if (writeIfMissing(configPath, stringifyYaml(DEFAULT_CONFIG))) {
    created.push('config.yaml');
  } else {
    skipped.push('config.yaml');
  }

  // AGENTS.md
  const agentsPath = join(okDir, 'AGENTS.md');
  if (writeIfMissing(agentsPath, AGENTS_MD_CONTENT)) {
    created.push('AGENTS.md');
  } else {
    skipped.push('AGENTS.md');
  }

  // .gitignore for cache/
  const gitignorePath = join(okDir, '.gitignore');
  if (writeIfMissing(gitignorePath, 'cache/\n')) {
    created.push('.gitignore');
  } else {
    skipped.push('.gitignore');
  }

  // Section catalogs
  const sectionDirs = [
    {
      path: join(okDir, 'articles'),
      title: 'Knowledge Articles',
      description: 'Architecture, processes, and decisions',
    },
    {
      path: join(okDir, 'external-sources'),
      title: 'External Sources',
      description: 'Ingested external content',
    },
    {
      path: join(okDir, 'research'),
      title: 'Research',
      description: 'Exploratory research and findings',
    },
  ];

  for (const section of sectionDirs) {
    const indexPath = join(section.path, 'INDEX.md');
    const content = generateCatalog(section.path, {
      title: section.title,
      description: section.description,
    });
    if (writeIfMissing(indexPath, content)) {
      created.push(`${section.title}/INDEX.md`);
    } else {
      skipped.push(`${section.title}/INDEX.md`);
    }
  }

  // Root INDEX.md
  const rootIndexPath = join(okDir, 'INDEX.md');
  const rootContent = generateRootCatalog(okDir, {
    sections: [
      { label: 'Knowledge Articles', relativePath: 'articles/INDEX.md' },
      { label: 'External Sources', relativePath: 'external-sources/INDEX.md' },
      { label: 'Research', relativePath: 'research/INDEX.md' },
    ],
  });
  if (writeIfMissing(rootIndexPath, rootContent)) {
    created.push('INDEX.md');
  } else {
    skipped.push('INDEX.md');
  }

  return { created, skipped };
}
