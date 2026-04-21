---
title: "Run 2026-04-20-initial — Mastra + Speakeasy CLI Install Recommendations"
description: "Initial research pass for reports/mastra-speakeasy-cli-install-recommendations/. Three parallel workers dispatched covering Mastra, Speakeasy, and in-product browser preview handoff (D8 cross-cutting)."
runId: 2026-04-20-initial
status: Active
startedAt: 2026-04-20
---

# RUN.md — Initial Research Pass

## Purpose

Factual landscape of how **Mastra.ai** and **Speakeasy** present CLI installation to users, plus the cross-cutting question of which editors (Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, Codex) expose in-product browser preview panes that a CLI-scaffolded config can target. Reader: someone making packaging + onboarding UX decisions for `@inkeep/open-knowledge` and adjacent tools.

## Rubric (locked after user confirmation)

| # | Dimension                                                                                                               | Depth    | Priority |
|---|-------------------------------------------------------------------------------------------------------------------------|----------|----------|
| D1 | Canonical "Installation" page — what's shown first, default PM, copy-paste ergonomics                                   | Deep     | P0       |
| D2 | Distribution channels shipped — npm / brew / binary / install.sh / Docker; authoritative source-of-truth                | Deep     | P0       |
| D3 | One-shot runner vs permanent install posture — `npx/bunx/pnpm dlx` emphasis vs real install                             | Deep     | P0       |
| D4 | Version pinning + upgrade UX — `@latest` in snippets, self-update commands, stale warnings                              | Moderate | P1       |
| D5 | First-run + auth + project scaffolding — create-X flows, config writes, auth model                                      | Moderate | P1       |
| D6 | CI / non-interactive install — actions, Docker, pinned-tarball patterns                                                 | Light    | P2       |
| D7 | Short-name / bin ergonomics — `mastra`/`speakeasy` long form, aliases, multiple bins                                    | Light    | P2       |
| ~~D8~~ | ~~In-product browser preview handoff~~ — **DROPPED 2026-04-20 mid-run at user request.** Investigation scope returned to 2-vendor CLI install recommendations only. | — | — |

**Non-goals:** Runtime behavior of the tools (agent quality, SDK correctness); comparative recommendations for open-knowledge (Factual stance); Windows-specific quirks; pricing/licensing.

## Workers

| Worker | Scope | Status |
|--------|-------|--------|
| W1 — Mastra CLI install research | Mastra docs, npm, GitHub (D1-D7 for Mastra specifically) | Dispatched |
| W2 — Speakeasy CLI install research | Speakeasy docs, install.sh, npm, goreleaser, GitHub (D1-D7 for Speakeasy specifically) | Dispatched |
| ~~W3~~ | ~~In-product browser preview handoff~~ | **Killed mid-run 2026-04-20 — D8 dropped from rubric at user request.** Partial findings (confirmed `.claude/launch.json` schema exists, was about to fetch Claude Code preview docs) discarded; not compiled into evidence. |

## Output contract

Each worker returns a structured Markdown document (per-dimension sections with URL + verbatim snippet for every claim). Orchestrator compiles returned findings into `evidence/<dimension>.md` files and synthesizes `REPORT.md`. Workers do NOT write files into the run folder.

## Evidence file plan

- `evidence/d1-install-page.md` — Mastra + Speakeasy install-page copy
- `evidence/d2-distribution-channels.md` — npm packages, brew tap, install.sh, Docker
- `evidence/d3-one-shot-vs-permanent.md` — dlx posture
- `evidence/d4-pinning-and-upgrade.md` — version pinning + self-update
- `evidence/d5-first-run-auth-scaffolding.md` — create-* flows, auth, config writes
- `evidence/d6-ci-patterns.md` — GH Actions, Docker, pinned install
- `evidence/d7-short-name-bin.md` — bin naming conventions
