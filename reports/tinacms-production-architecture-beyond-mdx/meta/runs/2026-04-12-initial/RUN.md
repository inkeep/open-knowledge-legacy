---
run_id: 2026-04-12-initial
status: Active
started: 2026-04-12
mode: Deep research (5 parallel subagents)
---

# Run Context: TinaCMS Production Architecture Beyond MDX

## Purpose

Understand TinaCMS's production architectural decisions *outside* the MDX pipeline — what they've learned from 7 years shipping git-backed markdown editing at scale. Reader cares about: patterns worth adopting, pain points to avoid, gaps OK could differentiate on.

## Stance

Factual with conclusions (signal what OK can learn).

## Canonical sources

- **OSS repo (primary):** `~/.claude/oss-repos/tinacms` — HEAD = c33e3d1 (2026-04-02)
  - Key packages: `packages/@tinacms/mdx`, `packages/tinacms`, `packages/@tinacms/schema-tools`, `packages/@tinacms/graphql`, `packages/@tinacms/datalayer`
  - Docs source: `_docs/`
  - Agent config: `AGENTS.md`, `CLAUDE.md` (root)
- **Official docs:** https://tina.io/docs/ (and tinacms.org)
- **Issues tracker:** https://github.com/tinacms/tinacms/issues
- **Discussions:** https://github.com/tinacms/tinacms/discussions
- **CHANGELOG.md** in repo for recent history
- **Prior coverage** (reference only, do NOT re-research):
  - `reports/mdx-crdt-roundtrip-fidelity/fanout/2026-04-03-initial/tinacms-plate-mdx/` — parse/serialize
  - `reports/cms-custom-components-landscape/fanout/2026-04-03-initial/tinacms-mdx-components/` — schema/templates

## Out of scope (do NOT research)

- MDAST↔Plate parse/serialize mechanics
- Schema/template registration field types
- Pricing comparison with other CMSes
- Side-by-side with Payload/Sanity/Keystatic (covered elsewhere)

## Delta rubric (what each dimension owns)

| # | Dimension | Owner | Primary sources | Key questions |
|---|---|---|---|---|
| D1 | Git integration & branching model | Subagent A | OSS repo (datalayer, cli, graphql), issue #885, docs | Why isomorphic-git? How branching/drafts? Conflict handling? Client↔cloud split? |
| D2 | Unknown-component degradation & error UX | Subagent B | OSS repo (mdx parser error paths, editor components), docs | What happens with unknown JSX? With expression props? Recovery? User signal? |
| D3 | Collaboration / concurrency story | Subagent C | Issues + discussions + docs + repo search | Any collab features? Autosave races? Community sentiment on gap? |
| D4 | Agent / MCP / API surface | Subagent D | AGENTS.md, CLAUDE.md, GraphQL schema, CLI source, docs | What's the agent posture? Programmable write surface? Any MCP? |
| D5 | Trajectory, OSS/commercial split | Subagent E | Website, blog, changelog, commit velocity, GitHub insights | Tina Cloud vs self-hosted, team size, roadmap, funding, adoption signals |

## Worker contract

- Return structured Markdown findings inline (do not write to run folder)
- Primary-source snippets required for CONFIRMED findings
- Negative searches documented for NOT FOUND
- Confidence levels: CONFIRMED / INFERRED / UNCERTAIN / NOT FOUND
- File paths with line numbers for code citations
- URLs with access date for web citations

## Orchestrator owns

- Writing evidence/ files from worker findings + primary sources
- Conflict resolution between workers
- REPORT.md synthesis
- Judgment calls on sufficiency
