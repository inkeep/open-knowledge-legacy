# Tim — V0 launch audit (last 48h)

**Stories owned:** 2 total (1 shipped, 1 in-progress, 0 remaining)
**Verdict:** V0-24 shipped cleanly with full spec coverage. V0-26 is in-progress with zero implementation since being added to PROJECT.md on 2026-04-13—three major workstreams (`list_documents` enrichment, harness integration, file-ops MCP tools) claimed "underway" but not started; only foundational PR #74 merged.
**Material deviations:** V0-26 scope cut (no implementation activity in 48h window despite "underway" framing).

---

### V0-24 — Enriched `exec` MCP surface
- **Phase bucket:** Shipped (Reach)
- **Claimed status (PROJECT.md):** "Shipped via #103, #111"
- **Actual status (verified):** Both PRs merged 2026-04-13T23:45Z (spec #103, impl #111). End-to-end `exec(command)` tool with enriched output (title, tags, backlink count, shadow-repo git history) registered and tested.
- **Evidence:** PR #103 merged 2026-04-13T23:45:22Z (065ebc7). PR #111 merged 2026-04-13T23:45:38Z (4fdc217). Spec: `specs/2026-04-13-enriched-exec-mcp-surface/SPEC.md` (21 functional requirements, all accepted). Implementation: packages/cli/src/mcp/tools/exec.ts + bash/index.ts + shadow-repo-layout.ts (core/shared). CI clean, 135 CLI tests green.
- **Deviation from spec:**
  - **Scope cuts:** None detected. All 21 FRs (FR1–FR21) satisfied per spec. Folder catalog `catalogCategory` field removed post-spec per D19 (team decision with Amy); agents derive parent context from `ls ../` as needed.
  - **Scope adds:** None beyond spec.
  - **Match summary:** Full spec match. Shipped on target.
- **48h activity:** 2 commits authored by tim-inkeep on 2026-04-13 (spec + impl PRs).
- **Blockers / risks:** None. Metric 1 (>50% exec share in 30 days) will drive post-v0 decision to keep dual surface or deprecate semantic tools; currently L2-aggressive INSTRUCTIONS. No shipping risk.
- **Reviewer note (for Nick):** V0-24 is complete and merged. Tim's spec was comprehensive with detailed evidence + decision rationale (XQ1 thesis, allowlist design, shadow-repo identity sharing via core, security invariants, dual enrichment channels). Ready for post-ship telemetry on agent adoption.

---

### V0-26 — MCP tool completeness + agent harness integration
- **Phase bucket:** Now (in-progress, no hard deadline but on critical path for v0)
- **Claimed status (PROJECT.md):** "`list_documents` enrichment underway (CC9 workstream); harness integration + file-ops MCP tools queued." (Added 2026-04-13T05:35:27Z, commit 3c6ec18.)
- **Actual status (verified):** THREE WORKSTREAMS, NO IMPLEMENTATION. (1) `list_documents` enrichment: NOT STARTED — tool still returns raw Hocuspocus passthrough (PR #50, 2026-04-11). (2) Agent harness integration: NOT STARTED — no branches, drafts, or commits. (3) File-ops MCP tools: PARTIALLY DONE — V0-4 backend (delete, rename UI + server API, PR #88) merged 2026-04-13; MCP tool wrapper not yet written.
- **Evidence:** PROJECT.md added V0-26 on 2026-04-13 05:35Z. PR #74 (spec + impl: enriched read tools) merged 2026-04-13T03:15:52Z — provides foundational enrichment pipeline (`read_document`, `search`, `consolidate`) that V0-26's `list_documents` workstream needs but does NOT enrich `list_documents` itself. Zero subsequent commits/branches/PRs from tim-inkeep on list_documents, harness integration, or file-ops MCP wrappers since then. `list_documents.ts` last touched 2026-04-11 (PR #50, raw Hocuspocus passthrough).
- **Deviation from spec:**
  - **Scope cuts:** MATERIAL. Three workstreams described in PROJECT.md §"What to build" — none have implementation:
    - Workstream 1: `list_documents` enrichment (per-doc metadata: title, description, tags, backlink count, modified timestamp). Acceptance criteria per CC9: must return enriched metadata, not raw names. Current: raw names only. **Status: 0% implemented.**
    - Workstream 2: Agent harness integration (Cursor, Claude Code, Claude Desktop with `localhost:PORT/#/docName` URLs + MCP INSTRUCTIONS updated). Acceptance criteria: agents know how to open editor during co-authoring. Current: no changes. **Status: 0% implemented.**
    - Workstream 3: File-ops MCP tools (`delete_document`, `move_document`, `duplicate_document`, `create_folder`). Acceptance criteria: enriched responses (e.g., delete reports orphaned backlinks; move reports updated references). Current: V0-4 UI+backend done; MCP wrapper not written. **Status: ~30% implemented (backend only).**
  - **Scope adds:** PR #74 (enriched read tools) is foundational infrastructure but goes beyond V0-26 scope — adds `read_document` (not listed in V0-26) and `search` (also not explicitly in V0-26's three workstreams). Neither is a deviation; both support Tim's enrichment quality bar (CC9). Not flagged for review.
  - **Match summary:** Claimed as "underway" with three workstreams; actual is "spec in PROJECT.md, infrastructure ready (PR #74), zero workstream implementation." SCOPE CUT relative to framing.
- **48h activity:** PR #74 merged 2026-04-13 (foundational, not V0-26 workstreams). V0-26 PROJECT.md entry added 2026-04-13. Zero commits/PRs/branches from tim-inkeep on V0-26 workstreams since then.
- **Blockers / risks:**
  - V0-26 is "Now" phase on critical path. Three workstreams with zero implementation carry shipping risk.
  - Workstream 1 depends on CC9 (enrichment bar Tim owns) — foundational via PR #74 ✓; actual `list_documents` integration task not scoped/assigned.
  - Workstream 3 depends on V0-4 backend API (Dima's responsibility) — backend merged ✓; MCP wrapper task not visible.
  - Workstream 2 (harness integration) is documentation + testing, lowest technical risk but still not started.
  - **Next steps unclear:** No spec draft, no branch, no commit. PROJECT.md says "can start immediately" but no work is visible.
- **Reviewer note (for Nick):** V0-26 is in-progress status but zero implementation against three workstreams claimed as "underway." PR #74 provides Tim's foundational enrichment infrastructure; V0-26's three workstreams should be spec'd (likely in a new spec draft) and prioritized against Tim's other load (V0-24 is shipped, but post-ship telemetry work may surface). Flag for Tim + Nick sync: is V0-26 spec needed before implementation starts, or should he begin on the three workstreams immediately (e.g., `list_documents` enrichment + harness INSTRUCTIONS as a first PR)?
