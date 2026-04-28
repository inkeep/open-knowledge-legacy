# Run: 2026-04-25-followup

**Status:** Closed
**Intent:** Additive (Path C — extend existing report)
**Created:** 2026-04-25
**Closed:** 2026-04-25

## Parent Context
**Purpose:** Side-by-side conceptual map of VS Code's and Claude Code's per-user-global / per-project / per-user-project configuration topology.
**Primary question:** What scopes exist in each, what kind of thing can live at which scope, how precedence works, what surfaces (UI vs file) are kept in sync, what's exclusive to one product's model?
**Stance:** Factual landscape only — no recommendations.
**Non-goals (inherited — sub-research must respect):** Apple defaults / XDG / 12-Factor lineage; broad 15-product survey; performance analysis; schema validation libraries; 1P analysis of Open Knowledge.

## Follow-up Directions Selected by User

| # | Direction | Facet Count | Source Diversity | Assessment | Integration target |
|---|-----------|-------------|------------------|------------|-------------------|
| 1 | VS Code Profiles lifecycle deep-dive | 5 | Single product | Heavy | New §D8 (extends D2/D6) |
| 2 | Workspace Trust vs permissions DSL threat models | 4 | Multi-product, multi-source | Heavy | New §D9 (extends D5/D6) |
| 3 | Project-local-personal override patterns across products | 5+ products | Multi-source | Heavy | New §D10 (extends D5/D7) |

## Approach

Hybrid Path C: parallel focused subagents (Agent tool, general-purpose type) — not full /nest-claude subprocesses. Cost-appropriate for moderate-depth Path C extensions. Each produces structured findings in a Markdown contract; orchestrator synthesizes into REPORT.md.

## Sub-instance Tracking

| Direction | Status | Worker output | Evidence file |
|-----------|--------|---------------|---------------|
| FU#1 Profiles | spawned | inline agent return | evidence/d8-vscode-profiles.md |
| FU#2 Threat models | spawned | inline agent return | evidence/d9-threat-models.md |
| FU#3 Local-personal | spawned | inline agent return | evidence/d10-local-personal-patterns.md |

## Source Anchors (additional to parent run)

- VS Code Profiles docs: `https://code.visualstudio.com/docs/configure/profiles`
- VS Code Profiles release notes (1.75 GA, May 2023; later refinements)
- VS Code Workspace Trust docs: `https://code.visualstudio.com/docs/editing/workspaces/workspace-trust`
- VS Code Workspace Trust security blog: `https://code.visualstudio.com/blogs/2021/05/06/workspace-trust`
- Claude Code permissions docs: `https://code.claude.com/docs/en/permissions`
- Next.js .env.local docs (project-local-personal pattern): `https://nextjs.org/docs/pages/guides/environment-variables`
- direnv docs: `https://direnv.net/`
- JetBrains workspace.xml taxonomy: `https://github.com/github/gitignore/blob/main/Global/JetBrains.gitignore`

## Notes for sub-researchers
- Stance: factual landscape only. No recommendations. Decision-triggers ("matters when X") are fine.
- Frame all findings in terms of how they enrich the parent report's purpose.
- All citations must be external primary sources with URL + access date.
- Each subagent: max 8-10 findings, max 5 negative searches, max 4 gaps. Tight discipline.
