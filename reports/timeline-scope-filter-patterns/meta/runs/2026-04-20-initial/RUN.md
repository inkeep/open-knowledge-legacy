# RUN: 2026-04-20-initial

**Status:** Active
**Owner:** Parent research orchestrator
**Report:** `reports/timeline-scope-filter-patterns/REPORT.md`

## Purpose

Investigate multi-scope filtering patterns for activity timelines (file / folder / project) across consumer and developer products, plus git-level query mechanics for scope-variable history. Output dimensions D1-D6 per confirmed rubric.

## Rubric (delta — full rubric in REPORT.md)

- D1 (P0/Deep): Scope-switching UI patterns
- D2 (P0/Deep): Multi-entity aggregation & density
- D3 (P0/Moderate): Query-layer patterns (git pathspec + activity logs)
- D4 (P1/Moderate): Filter affordance taxonomy
- D5 (P0/Moderate): Open Knowledge 1P current state
- D6 (P2/Light): Empty states + zero-history scope behavior

## Canonical sources (per subagent)

- **Subagent A (consumer apps):** Google Drive Activity dashboard, Google Docs version history, Notion page history & Updates feed, Figma Version History, Obsidian File Recovery
- **Subagent B (developer tools):** GitHub commit history (file/folder/repo), VS Code Timeline view + TimelineProvider API, Linear activity feed
- **Subagent C (git mechanics):** `git log` pathspec semantics, `git log --all`, ref walks, `git log --follow`, scan performance on large repos

## Output contract (each subagent returns Markdown findings)

Each finding must include:
1. Declarative claim (one line)
2. Confidence: CONFIRMED | INFERRED | UNCERTAIN | NOT FOUND
3. Primary-source evidence (URL + short snippet)
4. Implications for multi-scope filter design

## Orchestrator owns

- Judgment calls on conflicts
- Scope discipline (no pivots to permission/ACL, cross-workspace, etc.)
- Evidence-file authorship (subagents return findings; orchestrator writes `evidence/*.md`)
- D5 (1P) — direct investigation, not delegated
