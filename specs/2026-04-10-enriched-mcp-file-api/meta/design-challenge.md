# Design Challenge — Enriched MCP File API

**Challenger:** Cold reader (independent review)
**Spec:** `specs/2026-04-10-enriched-mcp-file-api/SPEC.md`
**Date:** 2026-04-10

---

## Challenge 1: The `.yml` sidecar model doubles the file surface area without clear migration off frontmatter

**What it challenges:** D5 (LOCKED), D6 (LOCKED), D9 (DIRECTED)

**Severity:** HIGH — architectural, 1-way door

**The concern:** The spec introduces `.yml` sidecar files in `.open-knowledge/metadata/` as the single source of truth for metadata, declaring that "content files never contain wiki metadata." This is a significant architectural commitment with several under-examined costs:

1. **File count explosion.** Every `.md` file gets a `.yml` sibling. Every directory gets a `_catalog.yml`. A 200-article wiki produces ~200 `.yml` files plus ~40 `_catalog.yml` files. These are all committed to git (the spec doesn't say they're gitignored). This is 240+ files of derived/semi-derived data in version control. The spec treats this as an invariant ("every `.md` in a wiki root has a corresponding `.yml`") but doesn't address the git noise (diffs, merge conflicts on catalog files, review burden).

2. **Split-brain risk the spec underestimates.** R4 ("Metadata tree drift") is rated Medium severity with a startup-scan mitigation. But the invariant is stronger than "should be in sync" — it's "must be in 1:1 correspondence at all times." Any bug in the watcher, any race condition between `write_file` writing content vs. metadata, any crash between writing `.md` and `.yml`, leaves the system in an inconsistent state. The startup reconciliation is a recovery mechanism, not a prevention mechanism.

3. **Frontmatter is the industry standard.** The existing system uses frontmatter. Every static site generator, every markdown-based knowledge tool (Obsidian, Notion exports, Hugo, Astro, Docusaurus) uses frontmatter. By moving to sidecars, you make wiki files non-portable — a `.md` file extracted from the wiki carries no metadata. The spec mentions "Frontmatter re-projection" in Future Work as "Noted" maturity, but this is the escape hatch for a real portability problem.

4. **The external file motivation doesn't justify the universal change.** The spec's strongest argument for sidecars is G7: "External files can be annotated with metadata without modifying them." This is a real need for external roots. But the spec applies the sidecar model universally — even to wiki-owned files where frontmatter would work fine. An alternative: use frontmatter for wiki-owned files, sidecars only for external files. The spec's Decision Log doesn't record considering this hybrid approach.

**What I'd expect to see:** Evidence that the frontmatter approach was evaluated as a hybrid option (frontmatter for owned files, sidecars for external) and rejected with specific reasoning. The "eliminates frontmatter round-trip complexity" rationale in D5 is vague — what round-trip complexity? The existing `parseFrontmatter`/`serializeFrontmatter` in `packages/cli/src/utils/frontmatter.ts` is ~50 lines of clean, tested code.

**Recommendation:** Reopen D5 for the hybrid alternative. If the uniform sidecar model is chosen, address: (a) whether `.open-knowledge/metadata/` should be gitignored (derived data argument) or committed (persistence argument), (b) the split-brain prevention strategy beyond startup reconciliation.

---

## Challenge 2: Five file API tools is a large surface for agents to learn — reconsider whether `edit_file` and `search` pull their weight

**What it challenges:** D4 (DIRECTED), D11 (DIRECTED)

**Severity:** MEDIUM — product, reversible

**The concern:** The spec proposes five file API tools (`read_file`, `list_files`, `search`, `write_file`, `edit_file`) plus three existing workflow tools = eight total. Each MCP tool the agent must learn increases cognitive load and the probability of the agent choosing the wrong tool. The prior spec (D2) deliberately rejected read tools because "agents use their native tools." This spec reverses that with the enrichment argument, which is valid — but then extends to a surface area that's larger than necessary.

Specific concerns:

1. **`edit_file` duplicates `write_file` with `mode: replace`.** The spec says `edit_file` is "token-efficient for small edits to large files." But this is an optimization for a problem that may not be significant at wiki scale (<500 files, knowledge articles, not code). The find-and-replace semantic is also fragile — if the `find` string appears multiple times or the content has changed since the agent last read it, the edit fails silently or hits the wrong match. The existing reference implementation in `tools.ts` shows this exact fragility (line 143: `content.replace(args.find, args.replace)` — replaces only the first occurrence).

2. **`search` over `Grep`.** The spec's search tool wraps grep with metadata enrichment. But agents already know how to use `Grep` — it's a native tool. The enrichment value of `search` (metadata annotations on results) could alternatively be achieved by having `read_file` be the enrichment point: agent greps natively, then calls `read_file` on interesting results to get metadata. This is two tool calls instead of one, but avoids teaching the agent a new search tool that's less capable than its native `Grep` (which supports regex, context lines, file type filtering, etc.).

**What I'd expect to see:** Usage data or reasoning about agent tool-selection behavior with 5+ tools. Evidence that token efficiency of `edit_file` over `write_file(mode: replace)` is material at wiki-article scale.

**Recommendation:** Consider shipping with three core tools (`read_file`, `list_files`, `write_file`) and adding `search` and `edit_file` only when friction data justifies them. This is a reversible decision — tools can be added later without breaking anything.

---

## Challenge 3: Optimistic Hocuspocus writes (D20) create a silent behavior difference the agent cannot reason about

**What it challenges:** D20 (DIRECTED)

**Severity:** MEDIUM — cross-cutting, partially reversible

**The concern:** D20 says: "Try Hocuspocus first on every write, fall back to disk on failure." The write confirmation (Tool 4 output) shows "via hocuspocus" or implies disk fallback. But the agent has no way to control or predict which path is taken, and the two paths have materially different behavior:

1. **Hocuspocus path:** CRDT sync, origin tagging, per-agent undo, instant editor propagation, authorship tracking.
2. **Disk path:** Anonymous write, no undo, 2-10 second editor delay via disk bridge, no authorship.

The spec's `write_file` output includes "Undo: available" only when Hocuspocus is used. But the agent doesn't know whether Hocuspocus will be available for the *next* write. If the agent builds a workflow that depends on undo (e.g., "write X, check result, undo if wrong"), that workflow silently breaks when Hocuspocus goes down.

Additionally, the spec says "On failure -> fallback to disk + warn." What constitutes failure? Network timeout? HTTP 500? Connection refused? The <5ms localhost overhead assumption (D20) may not hold if Hocuspocus is on a different host or under load.

**What I'd expect to see:** Clear documentation of which behavioral guarantees are available in each mode, surfaced to the agent. A mechanism for the agent to query current mode ("am I writing through CRDT or disk?").

**Recommendation:** The write response should clearly state the write mode used and what capabilities are available. Consider adding a `status` tool or including mode information in `list_files` root view so the agent can adapt its workflow.

---

## Challenge 4: The `_catalog.yml` cascade is a reinvention of the existing `INDEX.md` system with unclear migration path

**What it challenges:** D6 (LOCKED), D13 (DIRECTED)

**Severity:** MEDIUM — technical, partially 1-way door

**The concern:** The spec introduces `_catalog.yml` as the new catalog format, replacing the existing `INDEX.md` markdown catalogs. The current system (in `catalog.ts` and `watcher.ts`) generates `INDEX.md` files with frontmatter for sticky metadata, using content-hash dedup to prevent watcher loops. The new system generates `_catalog.yml` files in a shadow tree with a different schema.

Several questions the spec doesn't address:

1. **What happens to `INDEX.md` files?** Are they deprecated? Removed? Kept alongside `_catalog.yml`? The MCP instructions currently tell agents to "Read `.open-knowledge/INDEX.md` for a top-level overview." If `_catalog.yml` replaces `INDEX.md`, the instructions change. If both coexist, there are two sources of truth for catalog data.

2. **Sticky metadata migration.** The current `INDEX.md` system has "sticky" `title` and `description` fields in frontmatter that survive catalog rebuilds. The init-wiki tool instructs agents to set these. The new `.yml` sidecar system moves this metadata to individual `.yml` files and `_catalog.yml`. How are existing sticky metadata fields in `INDEX.md` migrated to the new system?

3. **Human readability.** `INDEX.md` files are human-readable markdown that agents can navigate with native `Read`. `_catalog.yml` files are YAML intended for machine consumption by `list_files`. If `INDEX.md` is removed, human developers lose the ability to browse the wiki structure without MCP tools. The spec's NG1 says these tools are "wiki-scoped only" — but what about humans browsing on GitHub or in their editor?

**What I'd expect to see:** An explicit migration plan from `INDEX.md` to `_catalog.yml`. A decision on whether `INDEX.md` is kept for human readability or removed. If removed, acknowledgment that this trades human navigability for agent efficiency.

**Recommendation:** Consider keeping `INDEX.md` as a derived artifact generated from `_catalog.yml` (the reverse of the current approach). This preserves human readability while making `_catalog.yml` the machine-friendly source for `list_files`.

---

## Challenge 5: Config schema change (`mcp.tools` section) is marked DIRECTED but is a 1-way door for existing users

**What it challenges:** D19 (DIRECTED)

**Severity:** LOW-MEDIUM — technical, 1-way door

**The concern:** D19 adds `mcp.tools.read_file.history_depth` and `mcp.tools.search.max_results` to the config schema. The current `ConfigSchema` in `packages/cli/src/config/schema.ts` has no `mcp` section. Adding one is additive and backward-compatible (Zod defaults handle missing fields). However:

1. The spec's agent constraints say "STOP_IF: changes to config.yml schema" — but D19 *is* a config schema change. This is a self-contradiction in the spec.

2. The naming convention `mcp.tools.<tool_name>.<setting>` couples the config schema to tool names. If a tool is renamed (e.g., `read_file` -> `read_article`), the config path changes. This is a minor concern but worth noting since tool naming hasn't been deeply challenged.

**Recommendation:** Resolve the agent constraint contradiction. Consider whether per-tool config settings are premature — defaults of 5 and 50 may be sufficient for the foreseeable future, and the config complexity may not be worth it until users request customization.

---

## Challenge 6: The spec doesn't address the docName mapping problem for multi-document Hocuspocus routing

**What it challenges:** D2 (DIRECTED), the write_file implementation section

**Severity:** HIGH — technical, blocks implementation

**The concern:** The existing Hocuspocus API uses `docName` to identify documents. The current server defaults to `'test-doc'` when no docName is provided (see `api-extension.ts` lines 92, 166, 262). The agent write flow via `POST /api/agent-write-md` takes `{ markdown, position, docName }`.

The spec's `write_file` tool needs to map a filesystem path (e.g., `articles/auth/sso.md`) to a Hocuspocus `docName`. But the spec never defines this mapping. The current Hocuspocus server was designed for a single-document editor (`test-doc`), not for a multi-file wiki. Key questions:

1. **Does Hocuspocus currently support multiple concurrent documents?** The `AgentSessionManager.getSession(docName)` appears to support arbitrary document names, but `DirectConnection` creates a Y.Doc per session. Does the persistence layer (`persistence.ts`) handle arbitrary docNames mapping to arbitrary file paths?

2. **What is the docName convention?** Is it the relative path (`articles/auth/sso.md`)? The path without extension (`articles/auth/sso`)? Something else? The existing commented-out tools use `args.path` directly as `docName`, but there's no evidence this was tested with the persistence layer for wiki files.

3. **Does the persistence layer know about wiki roots?** The current persistence resolves `docName` to a file path relative to `contentDir`. Wiki roots can point to directories outside `.open-knowledge/`. If the persistence layer doesn't know about wiki roots, writing `../docs/api-guide.md` through Hocuspocus would attempt to write relative to `contentDir`, not relative to the project root.

**What I'd expect to see:** A traced path from `write_file(path: "articles/auth/sso.md")` through the MCP tool, through the HTTP API, through `AgentSessionManager`, through persistence, to disk — with each mapping spelled out.

**Recommendation:** This needs investigation before the spec can claim the Hocuspocus write path is implementable. Trace the docName -> filesystem path mapping end-to-end and document it in evidence.

---

## Challenge 7: D16 (exact field matches only for frontmatter extraction) is too conservative and will lose user data

**What it challenges:** D16 (DIRECTED)

**Severity:** LOW-MEDIUM — product, reversible

**The concern:** D16 says frontmatter extraction on initial scan uses exact field name matches only: `title`, `description`, `tags`. No variant mapping. But the existing workflow tools already instruct agents to use additional frontmatter fields:

- `ingest.ts` instructs: `source_url`, `source_path`, `captured_at`, `content_type` (line 30-44)
- `research.ts` instructs: `status`, `date`, `sources` (line 134-142)
- `init-wiki.ts` instructs: `title`, `description`, `tags` (line 53-71)

When the initial scan runs and encounters files with `source_url`, `status`, `date`, `sources`, etc., D16 says these fields are silently dropped. The `.yml` sidecar gets only `title`, `description`, `tags`. The original frontmatter is still in the `.md` file, but D5 says "content files never contain wiki metadata" and "`.yml` is the single source of truth for metadata."

This creates an awkward gap: the existing frontmatter has richer metadata than the `.yml` sidecar will contain after migration. The `write_file` metadata parameter has an open schema (`[key: string]: unknown`), so `.yml` files *can* store arbitrary fields — but the migration (D9 + D16) doesn't carry them over.

**Recommendation:** The initial scan should extract *all* frontmatter fields to the `.yml` sidecar, not just three exact matches. If the concern is schema validation, the open schema on `write_file` metadata already allows arbitrary fields — the migration should be equally permissive.

---

## Challenge 8: No undo/redo tools in the new surface despite Hocuspocus integration being a primary goal

**What it challenges:** D4 (DIRECTED — "Five file API tools")

**Severity:** MEDIUM — product, reversible

**The concern:** The prior spec's commented-out tools include `undo_agent_edit` and `redo_agent_edit`. The current spec's D2 says "Writes route through Hocuspocus when available — CRDT sync, authorship, undo." The `write_file` output even shows "Undo: available." But the spec proposes no undo/redo tools.

If an agent writes something wrong through `write_file` via Hocuspocus, it has no way to undo through the MCP surface. It would need to either (a) use `write_file` to replace the content, which creates a new CRDT transaction rather than a proper undo, or (b) the human uses the editor's undo button.

The spec lists `canUndo` information in the `write_file` response (Could requirement), but no tool to act on it. This is a capability tease — "undo is available" with no way to trigger it.

**Recommendation:** Either include `undo` and `redo` as tools (they're trivially simple — the reference implementation is ~15 lines each and the server endpoints exist), or remove undo-related information from `write_file` responses to avoid misleading the agent.

---

## Summary

| # | Challenge | Severity | Challenges | Type |
|---|-----------|----------|------------|------|
| 1 | Sidecar model vs. hybrid frontmatter+sidecar | HIGH | D5, D6, D9 | Architecture |
| 2 | Five tools may be too many; `edit_file` and `search` may not pull their weight | MEDIUM | D4, D11 | Product |
| 3 | Optimistic writes create silent behavioral differences | MEDIUM | D20 | Cross-cutting |
| 4 | INDEX.md to _catalog.yml migration unclear | MEDIUM | D6, D13 | Technical |
| 5 | Config schema contradiction with agent constraints | LOW-MEDIUM | D19 | Technical |
| 6 | docName mapping for multi-document Hocuspocus not specified | HIGH | D2 | Technical |
| 7 | Frontmatter extraction too conservative, will lose metadata | LOW-MEDIUM | D16 | Product |
| 8 | No undo/redo tools despite undo being a stated benefit | MEDIUM | D4 | Product |

**Challenges that independently arrive at previously-rejected alternatives:** Challenge 2 partially echoes the prior spec's D2 (agents should use native tools). The enrichment argument in this spec is valid — it genuinely adds value over native reads. But the spec may be over-correcting by adding *five* tools where three would capture most of the value. The D2 rejection ("agents have native tools") doesn't hold for reads (enrichment is real value), but it partially holds for search (native Grep is more capable) and edit (write_file covers the use case).
