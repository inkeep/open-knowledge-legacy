# Changelog

## 2026-04-10 — Initial draft

- Created SPEC.md with SCR problem statement, goals, non-goals, target state
- Investigated persistence layer: nested paths work except missing mkdir in onStoreDocument
- Investigated provider lifecycle: identified 7 tight coupling points to address
- Investigated MCP/API surface: D1-deferred tools ready to revive, missing list endpoint
- Locked decisions D1-D9 based on user input
- Identified 5 open questions (OQ1-OQ5) for iterative resolution
- Wrote evidence files for all three investigation tracks

## 2026-04-10 — Iterative resolution

- Resolved OQ1 (flat list), OQ2 (singleton pool), OQ5 (auto-reconnect) through investigation
- Resolved OQ3 (blank state) and OQ4 (require Hocuspocus) via user decisions
- Added decisions D10 (blank state), D11 (require Hocuspocus)
- Discovered AgentUndoButton missing docName — added section 8.4.1
- Discovered EditorHeader hardcodes "untitled.md" — added section 8.4.2
- Added blank state design (section 8.4.3)

## 2026-04-10 — Audit findings applied

Design challenger (6 findings: 2H, 3M, 1L) and auditor (5 findings: 1H, 3M, 1L):

**Corrections applied:**
- Fixed observer cleanup ordering contradiction (H1 audit) — disconnect first, then cleanup, consistent across all 3 sections
- Added per-document `lastUserTypedAt` requirement (H challenge) — `setupObservers` returns `{ cleanup, markUserTyping }`
- Fixed evidence file: AgentUndoButton was incorrectly described as "already decoupled" (M1 audit)
- Fixed assumption A4 file reference to `packages/cli/src/mcp/server.ts:82-93` (M2 audit)
- Added `safeSubdir` helper for list endpoint (M3 challenge) — replaces hacky `safeContentPath` reuse
- Added pool state authority clarification (M4 challenge) — pool is authoritative, React state derived
- Promoted E2E test risk to Medium, added test files to SCOPE (M5 challenge + audit)
- Documented SourceEditor remount flicker as accepted trade-off (L challenge)
- Fixed MCP tool revival to reference new per-file registry pattern (L1 audit)
- Added D12 (defer update_frontmatter) and Future Work entry (M3 audit)

**Design challenge resolved:**
- Blank state + no sidebar = unusable app period (H2 challenge) — user chose D: accept the regression. This is infrastructure; sidebar PR follows immediately.

## 2026-04-11 — Rebase on main (748f63e)

Picked up two commits: `refactor: rename wiki → content, unify config with glob patterns (#47)` and `Slash command polish (#48)`.

Changes applied to spec:
- Updated `init-wiki` → `init-content` in Current State section
- Added Config subsection documenting `content.dir`, `content.include`, `content.exclude`
- Updated document list API to respect config glob patterns
- Updated baseline commit to 748f63e

## 2026-04-11 — Finalized

- Resolved H2 design challenge (blank state regression) — user chose D: accept
- Fixed eviction ordering inconsistency in section 6.1 (cleanup-then-disconnect → disconnect-then-cleanup, matching 8.2 and sequence diagram)
- Ran resolution completeness gate — all In Scope items pass
- Status → Final
