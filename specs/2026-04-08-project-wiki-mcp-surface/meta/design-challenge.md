# Design Challenge Findings

**Artifact:** specs/2026-04-08-project-wiki-mcp-surface/SPEC.md
**Challenge date:** 2026-04-08
**Total findings:** 5 (2 high, 2 medium, 1 low)

---

## High Severity

### [H] Finding 1: The spec creates a parallel architecture that contradicts the parent project's CRDT-canonical design

**Category:** DESIGN
**Source:** DC3 (Framing validity) + DC1 (Simpler alternative)
**Location:** Section 1 (Problem statement), Section 9 (Proposed solution — System architecture, MCP server implementation)
**Issue:** The spec frames the problem as "scattered docs go stale" and proposes a solution where agents write directly to `.openknowledge/` files on disk, with a thin MCP server doing file watching and catalog generation. This creates a self-contained system that operates entirely outside the broader Open Knowledge architecture described in PROJECT.md and STORIES.md.

PROJECT.md CC1 states explicitly: "The CRDT is the source of truth during editing. Files on disk are projections." MCP tools "read from CRDT (fresh), not from disk (stale)." STORIES.md Bucket 2 defines T2.1 as building MCP tools with filesystem-compatible signatures that route through Hocuspocus DirectConnection, and T2.4 says "Wire MCP writes through Hocuspocus DirectConnection to Y.Docs — already validated in init-spike TQ15."

The spec's architecture bypasses this entirely. It has agents using native Read/Write/Edit tools directly on the filesystem, and the MCP server is reduced to a file watcher + catalog regenerator. There is no CRDT layer, no Hocuspocus, no integration with the editor that the init spike already validated.

This is not merely a phasing decision (build simpler now, integrate later). The spec's architecture would create a **second, parallel write path** for `.openknowledge/` content that doesn't go through the CRDT — meaning the editor and the wiki MCP server would fight over the same files. When the editor is running and someone writes via the wiki's "thin MCP server" path, the editor's CRDT is not updated. When someone writes via the editor, the wiki's file watcher fires but the CRDT already has the content. Two independent systems watching the same directory is a recipe for race conditions, double-processing, and feedback loops.

**Current design:** "Agent uses native tools (Read, Write, Edit, Grep) for file operations. MCP server does NOT proxy file reads/writes; agent uses its built-in tools directly." (D2)
**Alternative:** Build the wiki MCP surface as part of the existing S4 MCP server architecture — filesystem-compatible tool signatures that route through Hocuspocus DirectConnection when the editor is running, and fall back to direct file I/O when it's not. This is already the design in PROJECT.md S4 and STORIES.md T2.1-T2.4.
**Trade-off:** The spec's approach is simpler to build in isolation (no CRDT dependency, no Hocuspocus). But it creates a split-world problem: wiki content authored through the "thin MCP server" path is invisible to the editor until the persistence pipeline serializes it from disk back to CRDT, introducing a 2-10s lag and potential conflicts. The alternative requires building on the existing validated architecture, which is more work upfront but avoids creating two incompatible write paths.

The Decision Log records D2 as "Thin MCP server, NOT just-bash proxy" with rationale "Agent uses native tools for file ops; MCP server handles side effects only. just-bash overkill for this use case." But the rejection of just-bash does not justify rejecting the CRDT write path — those are different alternatives. The choice was framed as "just-bash vs thin server" when the actual architectural question is "disk-first vs CRDT-first." PROJECT.md's XQ1 decision (decided, not open) already chose CRDT-first with filesystem-compatible signatures.

**Status:** CHALLENGED
**Suggested resolution:** Re-examine whether the wiki MCP surface should be a subset of the S4 MCP server (filesystem-compatible tools that route through CRDT) rather than a separate thin server with a file watcher. If the intent is to ship before the full S4 MCP server, define how the two systems converge — the spec should either (a) acknowledge this is a throwaway prototype that will be replaced by S4, or (b) explain how it becomes S4 incrementally. Currently it does neither.

---

### [H] Finding 2: The code mirror index creates an unsustainable maintenance burden that may not deliver proportional value

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** Section 9 (Code-index annotation format, /init-wiki skill definition), D13, D17, D18
**Issue:** The spec requires generating and maintaining a per-file annotation for every source file >= 25 lines in the entire repository. For a medium-sized repo (500 source files), this means 500+ annotation files that must be kept current via CLAUDE.md conventions (D14: "CLAUDE.md tells agent to update code-index after code edits") and `/ingest` at PR boundaries.

The maintenance mechanism is weak: CLAUDE.md conventions are "real-time best-effort" (the spec's own words). Agents don't reliably follow CLAUDE.md instructions — they're suggestions, not enforcement. `/ingest` at PR boundaries catches up, but between PRs the code-index is stale for every file that changed. This is exactly the "docs go stale" problem the spec's SCR identifies as the Complication — except now there are 500+ files that can go stale instead of a handful of docs.

The value proposition is also unclear. The code-index duplicates information that agents can get by reading the actual source files. An annotation saying "persistence.ts — handles the three-layer auto-persistence pipeline" is less useful than reading the first 20 lines of persistence.ts. Agents are already good at reading code — the code-index adds a layer of indirection that can be wrong.

**Current design:** "Code mirror index: every file gets an annotation" (D13). "Code-index freshness via CLAUDE.md convention + `/ingest` at PR boundaries" (D14).
**Alternative:** Start with directory-level summaries only (`_summary.md` per directory). These are 10-50x fewer files to maintain, higher signal-to-noise (a directory summary captures architectural intent that isn't obvious from individual files), and are the entries that agents would actually read for orientation. Per-file annotations can be generated on-demand by the agent reading the source — no pre-computation needed.

Risk row 2 in the spec already acknowledges this: "Code mirror index too expensive to maintain at scale — Medium likelihood, Medium impact — Mitigation: Start with directory-level summaries; file-level on demand." The mitigation contradicts D13 (every file gets an annotation). The spec chose the more aggressive option despite identifying the risk and its own mitigation.

**Trade-off:** Directory-only summaries lose per-file metadata in the catalog INDEX.md files. But per-file entries in a catalog listing 50+ files are unlikely to be read linearly anyway — agents would grep or navigate to the actual file. The directory summary provides the orientation layer; the source code provides the detail.
**Status:** CHALLENGED
**Suggested resolution:** Reconsider D13. The spec's own risk table suggests directory-level summaries as the mitigation. Adopt that as the P0 scope — per-file annotations as a future enhancement when the maintenance mechanism (CLAUDE.md convention + /ingest) has been proven to work.

---

## Medium Severity

### [M] Finding 3: File watcher + catalog regeneration as a persistent daemon adds operational complexity that a simpler trigger could avoid

**Category:** DESIGN
**Source:** DC1 (Simpler alternative)
**Location:** Section 9 (MCP server implementation, File watcher behavior), D2
**Issue:** The spec requires a persistent MCP server process running @parcel/watcher to detect file changes and regenerate INDEX.md catalogs. This introduces: (a) a process that must be running for catalogs to stay current, (b) debounce tuning (500ms quiet / 2s max), (c) loop prevention (content-hash check), (d) a dependency on @parcel/watcher. Q14 (file watcher loop prevention) is still open.

Since the spec has agents writing files directly (not through the MCP server), the file watcher is purely reactive — it watches for external changes and regenerates catalogs. An alternative: make catalog regeneration a **post-write step in the skills themselves**. `/init-wiki` and `/ingest` already know when they write files. They could call a `regenerate_catalogs` function (or a simple script) after their batch of writes completes. For manual agent writes (agent uses Edit/Write directly), the CLAUDE.md convention could say "after writing to .openknowledge/, run `npx openknowledge rebuild-catalogs`."

This eliminates: the persistent watcher process, debounce tuning, loop prevention complexity, and the @parcel/watcher dependency for catalog generation. The MCP server becomes even thinner — just `instructions` + `init`. Catalog freshness is equivalent because catalogs only matter when an agent reads them, and the agent that just wrote knows to rebuild.

**Current design:** "@parcel/watcher on `.openknowledge/` directory. Every .md file write triggers parent folder's INDEX.md regeneration." (Q10 resolution)
**Alternative:** Catalog regeneration as an explicit post-write step in skills and a CLI command for manual use. No file watcher needed for catalogs.
**Trade-off:** Catalogs could be transiently stale if someone edits a file outside a skill and forgets to rebuild. But the spec already accepts this for the code-index (CLAUDE.md conventions are "best-effort"). The same tolerance should apply to catalogs, especially since catalogs are fully regenerable and deterministic (D16).
**Status:** CHALLENGED
**Suggested resolution:** Evaluate whether the file watcher is load-bearing or a convenience. If catalog freshness within seconds is not a hard requirement (and the spec doesn't state it is), a simpler trigger model eliminates meaningful complexity.

---

### [M] Finding 4: The spec does not address coexistence with the broader Open Knowledge editor and persistence pipeline

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** Section 9 (System architecture), Section 14 (Risks)
**Issue:** The spec assumes `.openknowledge/` is a standalone directory with one system (the thin MCP server) watching it. But the parent project (init spike, STORIES.md Buckets 1-4) describes a Hocuspocus server with persistence hooks, a disk bridge (@parcel/watcher in `src/server/file-watcher.ts`), and auto-commit pipeline — all operating on files that would overlap with `.openknowledge/`.

When both systems are running:
1. The editor's disk bridge (TQ26, already validated) watches the filesystem with @parcel/watcher and syncs changes into CRDT. If the wiki's MCP server also watches `.openknowledge/` with @parcel/watcher, two watchers compete on the same directory.
2. The editor's persistence pipeline writes files from CRDT to disk (2-10s debounce). The wiki's file watcher would see these writes as "new changes" and re-trigger catalog regeneration, even though nothing semantically changed.
3. The editor's auto-commit pipeline (30s debounce) commits changes to git. The wiki content would be committed through this pipeline, but the spec doesn't acknowledge or plan for it.

None of these coexistence scenarios are addressed in the spec's risks table or the open questions. The spec treats `.openknowledge/` as if it exists in isolation. An SRE or integration engineer would flag this immediately.

**Current design:** The spec's system architecture diagram shows one MCP server watching `.openknowledge/`. No mention of the Hocuspocus server, disk bridge, or persistence pipeline.
**Alternative:** Either (a) scope the spec explicitly to the "no editor running" case and document the integration plan for when the editor exists, or (b) design the wiki MCP server as a mode of the existing Hocuspocus server that handles `.openknowledge/` content alongside regular KB content.
**Trade-off:** Option (a) is simpler but creates technical debt. Option (b) requires understanding the full architecture but produces a coherent system.
**Status:** CHALLENGED
**Suggested resolution:** Add a section addressing coexistence with the editor/Hocuspocus stack. At minimum, document what happens when both systems are running and how conflicts are resolved. If the intent is "this runs independently, editor integration comes later," make that explicit as a scoping decision with a convergence plan.

---

## Low Severity

### [L] Finding 5: CLAUDE.md as a freshness mechanism is an assumption presented as a solution

**Category:** DESIGN
**Source:** DC2 (Stakeholder gap)
**Location:** D14, Section 9 (CLAUDE.md additions)
**Issue:** D14 relies on CLAUDE.md conventions for real-time code-index freshness: "CLAUDE.md tells agent to update code-index after code edits." The spec treats this as a decided mechanism (DIRECTED status), but there is no evidence that agents reliably follow CLAUDE.md instructions for maintenance tasks unrelated to their current goal. When an agent is fixing a bug in `persistence.ts`, it is optimizing for the bug fix — updating `.openknowledge/code-index/src/server/persistence.md` is a side task that agents routinely skip.

The spec's own A4 assumption ("Teams will maintain the wiki if the friction is low enough — MEDIUM confidence") acknowledges this uncertainty. But D14 treats the CLAUDE.md mechanism as DIRECTED (decided), not ASSUMED.

**Current design:** "CLAUDE.md instructs agent to update relevant `.openknowledge/code-index/` entries after significant code changes" (D14)
**Alternative:** Classify D14's CLAUDE.md mechanism as ASSUMED (MEDIUM confidence) rather than DIRECTED, with a verification plan: "Test whether Claude Code reliably updates code-index entries when CLAUDE.md instructs it to, across 10+ diverse editing sessions."
**Trade-off:** No trade-off in scope — this is a classification correction. The mechanism may work; it just hasn't been validated.
**Status:** CHALLENGED
**Suggested resolution:** Downgrade D14's CLAUDE.md component from DIRECTED to ASSUMED with a verification plan. Keep `/ingest` at PR boundaries as the reliable fallback (this part of D14 is well-grounded).

---

## Confirmed Design Choices (summary)

**DC1 (Simpler alternative):**
- D8 (plain markdown in git) holds well — readable by any agent, greppable, diffable. No credible simpler alternative.
- D12 (INDEX.md naming) is well-reasoned — uppercase avoids Fumadocs collision, `.md` supports frontmatter.
- D7 (two-layer content model: articles + code-index) is architecturally sound as a concept, though the code-index scope is challenged above.
- D4 (init as MCP tool + /init-wiki skill) is a clean separation of concerns — scaffold vs populate.

**DC2 (Stakeholder gap):**
- Crash recovery via git (NFR) is solid — plain files in git is the simplest possible recovery model.
- Security model (local-only MCP, no secrets in wiki) is appropriate for P0.
- The portability principle (wiki readable without MCP) is well-designed and addresses the "what if the server isn't running" failure mode.

**DC3 (Framing validity):**
- The SCR's Situation (scattered knowledge) and Complication (staleness) are genuine and well-evidenced from the broader project research. The demand reality is strong.
- The "narrowest wedge" question is partially addressed — the spec includes phased delivery. However, the interaction between this narrowest wedge and the broader S4 MCP server is the core tension surfaced in Finding 1.
