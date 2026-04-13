# Wiki-Links Next: 4 Story Seeds for Prioritization

**Last verified:** 2026-04-12
**Prepared for:** Mike (decision-maker)
**Provenance:** Derived from the Staff-Eng Decision Brief (in-session, 2026-04-12) after review of Mike's PRs #42/#53/#71 against the `reports/backlinks-typed-links-and-ux-landscape/` landscape research.

---

## How to read this document

Four independent stories, each prioritizable on its own. Jump to any `## Story N` section. Each story is a full /stories-format seed (SCR-lite → value → invariants → constraints → non-goals → AC → Items table → context → references) — nothing has been summarized or compressed.

**Recommended sequencing** (rationale after each item):

1. **Story 1 — Slug correctness.** Smallest scope, biggest one-way door. Fixing this later rewrites every user's vault.
2. **Story 3 — Managed rename + inbound rewrite (M5a).** The one item flagged as actual tech debt in the brief. Silently breaks inbound links today.
3. **Story 2 — **`suggest_links`** MCP tool.** Depends on Story 1 for Unicode correctness; closes the discovery half of the agent KB workflow.
4. **Story 4 — Awareness-driven push for BacklinksPanel.** Independent, lowest priority; cut first if scope-trimming.

**Item ID convention:** Within each story, items follow the /stories convention (PQ = product question, TQ = technical question, XQ = cross-cutting). Across this document, IDs are prefixed with `S1.`, `S2.`, `S3.`, `S4.` so cross-references don't collide (e.g., S1.PQ1 vs S3.PQ1).

**Cross-story references:** Stories 1 and 3 share a rewrite-infrastructure dependency (see S1.TQ2 and S3.XQ2). Story 2 has a Unicode-correctness dependency on Story 1 (see S2.TQ3 and S1.I1). Story 4 is fully independent.

---

---

## Story 1: Make the wiki-link slug algorithm Unicode-safe and disambiguate duplicate heading anchors

### Problem (SCR-lite)

**Situation.** `toWikiLinkSlug` in `packages/core/src/utils/slug.ts` is the single identity function for both page targets and heading anchors. Its implementation is one line: `text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')`. Simultaneously, `extractHeadings` in `packages/server/src/api-extension.ts` (used by `/api/page-headings`) emits heading slugs without any duplicate disambiguation, while the client-side `HeadingAnchors` ProseMirror plugin (`packages/app/src/editor/extensions/heading-anchors.ts`) appends `-1`, `-2` suffixes at render time to keep DOM IDs unique.

**Complication.** Two correctness problems live in one slug surface:

- **(1) Unicode destruction.** The character class `[^a-z0-9]` treats every non-ASCII character as a separator. `[[naïve]]` slugifies to `na-ve`; `[[café]]` → `caf`; `[[東京]]` → empty string. Non-English content silently loses information on every save. This becomes a vault-wide rewrite migration the day we fix it, because existing link targets are keyed on the destructive slugs already written to disk.
- **(2) Anchor-API and anchor-renderer disagree.** `/api/page-headings` returns `notes, notes` for a doc with two `## Notes`; the renderer assigns `notes` and `notes-1`. The heading picker UI can offer `[[Page#notes]]` twice, but only one resolves. Agents using the MCP surface to find valid anchors hit the same inconsistency.

The two defects live in the same 20-line surface and share the same one-way-door property: once users accumulate links authored under the current slug algorithm, changing it rewrites every user's vault. They should be fixed together before the first non-English user or the first doc-with-duplicate-headings lands in production.

**Resolution.** Lock a Unicode-aware, idempotent slug algorithm used everywhere slugs are generated (page target creation, heading anchor rendering, heading-list API), and ensure duplicate-heading disambiguation is implemented consistently across the server-side extractor and the client-side renderer. Gate M3 on this.

### Value and goals

This story is **correctness before audience-growth**. The customer-facing dimension is concrete: any user whose content includes accented Latin, CJK, Cyrillic, Arabic, emoji-laden titles, or simply two `## Notes` in one file today is hitting a silent bug. The platform-internal dimension is the load-bearing one: the slug function is a shared identifier producer used in at least four contexts (page target normalization, heading anchor ID assignment, heading picker suggestions, unresolved-link creation). Because all four derive from the same function, a change ripples atomically — but the rewrite cost of fixing it *after* users accumulate content is linear in vault size. The GTM dimension is negative rather than positive: shipping international users a vault that destructively mangles their links on every save is a trust cliff.

Intersection: the Unicode correctness fix AND the duplicate-disambiguation fix both require touching `toWikiLinkSlug` and `extractHeadings`, so bundling them avoids two separate vault migrations. The platform constraint (one slug function, shared by server and client) is what makes this bundle coherent — an engineer implementing either defect alone would end up modifying the same files and owning the same migration story.

**Observable success:**

- A user types `[[café]]`, saves, reloads — the slug and the `.md` file on disk preserve the character (does not mangle to `caf`).
- A doc with two `## Notes` headings exposes two distinct, stable anchor slugs via both `/api/page-headings` and the rendered DOM.
- Idempotency holds: `toWikiLinkSlug(toWikiLinkSlug(x)) === toWikiLinkSlug(x)` for all strings in the test corpus (ASCII + Latin-accented + CJK + Cyrillic + Arabic + emoji + whitespace-heavy).

### Invariants

- **I1: Unicode preservation.** For any Unicode text containing letters or digits (any script), the slug is non-empty and preserves at least one character per Unicode word. Observable: test corpus covers Latin-accented (`naïve`), CJK (`東京`), Cyrillic (`Москва`), Arabic (`القاهرة`) — all slugs non-empty and round-trip identical through two slugification passes.
- **I2: Idempotent.** `slug(slug(x)) === slug(x)` for all x. Observable: property-based test across the corpus.
- **I3: Deterministic.** Same input produces same output on every call, every process, every environment. No time- or random-seed-dependence. Observable: test fixture with expected outputs.
- **I4: URL-safe.** The output slug is valid as a URL path segment and as an HTML fragment ID. Observable: every slug matches a restricted character class (exact class is a DELEGATED decision — see Items).
- **I5: Duplicate-heading disambiguation consistency.** Given a doc with N headings whose normalized slugs collide, `extractHeadings` returns N distinct slugs that match, in order, the IDs the client-side `HeadingAnchors` plugin assigns at render time. Observable: integration test loads a doc with `## Notes\n## Notes\n## Notes`, asserts API returns `notes, notes-1, notes-2`, and asserts the rendered DOM has matching `id=` attributes.
- \*\*I6: Slug function lives in \*\*`@inkeep/open-knowledge-core` and is the single source of truth; `extractHeadings` and `HeadingAnchors` both call it. Observable: no fork of the algorithm exists elsewhere in the codebase.
- **I7: Migration on upgrade.** On first server start after this change, existing vault content with slugs that would change under the new algorithm is rewritten atomically (cache invalidation + backlink index rebuild + inbound-link-rewrite through the same infrastructure Story 3 builds). Observable: users with existing non-ASCII titles upgrade without manual action; link graph remains consistent. *(This invariant depends on Story 3; see Items for sequencing.)*

### Constraints

- **C1:** Must remain consistent across server (`packages/server/src/api-extension.ts:extractHeadings`, `packages/server/src/backlink-index.ts`) and client (`packages/app/src/editor/extensions/wiki-link-helpers.ts`, `heading-anchors.ts`). Drift between server and client slug behavior is a bug.
- **C2:** Must survive markdown round-trip: what's stored on disk in a `[[target]]` or heading text must re-slugify to the same identifier after parse → editor → serialize → reload.
- **C3:** Must compose with the unresolved-link creation path (`buildUnresolvedWikiLinkAttrs`) — if a user types `[[Café Menu]]` and the target doesn't exist, the filename OK suggests for `CreatePageDialog` should match what the slug resolves to at lookup time.

### Non-goals

- **\[NEVER] Full Unicode normalization beyond NFKD + lowercase.** We will not strip combining marks (Arabic shadda, Vietnamese tone marks) or transliterate across scripts (e.g., `東京` → `tokyo`). Those are lossy linguistic operations, not identity normalization. Revisit only if a specific customer scenario justifies the transliteration cost.
- **\[NOT NOW] Configurable slug algorithm per workspace.** A user wanting GitHub-style vs Obsidian-style slugs is plausible but not day-1. Revisit if: two customers request different slug styles, or if interop with an external tool forces a specific format.
- **\[NOT NOW] Fuzzy slug resolution.** Matching `[[cafe]]` → `café.md` when both differ by diacritics. This is a UX feature layered on top of the identity function, not an invariant of the function itself. Revisit when unresolved-red-link frequency from diacritic mismatches is measurable in usage.
- **\[NOT UNLESS] Emoji in slugs.** `[[🚀 Launch Plan]]` is an edge case. Proposed default: strip emoji at slug time (matches GitHub). Revisit unless a user explicitly objects — in which case, treat emoji as letters.

### Acceptance criteria

- **AC1:** `bun test` suite for `toWikiLinkSlug` includes a property-based test generating strings from Latin, CJK, Cyrillic, Arabic, Hebrew, Devanagari corpora; all slugs are non-empty, idempotent, and deterministic.
- **AC2:** `[[naïve]]`, `[[café]]`, `[[東京]]` typed in the editor create wiki-links whose `.md` on disk and in-editor chip round-trip identically (no character loss across save/reload).
- **AC3:** A doc containing `# Main\n## Notes\ntext\n## Notes\n## Notes` — the `/api/page-headings` response and the rendered DOM IDs match exactly (`main`, `notes`, `notes-1`, `notes-2` in that order). Heading picker UI offers three distinct entries, not one.
- **AC4:** `packages/server/src/backlink-index.ts` correctly extracts and resolves wiki-link targets containing non-ASCII characters; backlinks panel shows source docs with non-ASCII titles correctly.
- **AC5:** `packages/core/src/utils/slug.ts` exports exactly one slug function; no duplicate or fork exists anywhere in the tree.
- **AC6:** Upgrade path (see I7): any existing vault content with pre-fix slugs is rewritten consistently on the first boot after upgrade. Users do not see red-linked pages they previously had resolved, and `.md` files are either migrated in place or the pre-fix slugs are aliased at resolution time. *(Sequencing note: this AC depends on Story 3's managed-rewrite infrastructure — see Items S1.TQ2.)*

### Items

| ID     | Item                                                                                                                                                  | Type          | Priority | Status      | Notes                                                                                                                                                                                                                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1.PQ1 | Exact slug algorithm — NFKD normalize, lowercase, keep `\p{L}\p{N}`, collapse other to `-`, trim `-`                                                  | Product/Tech  | P0       | **Assumed** | Confidence: INFERRED. Mirrors GitHub's heading-anchor algorithm. Verify by: spec-level review of the algorithm against the I1–I4 invariants before implementation. \[Inferred from the well-known GitHub Kramdown/Rouge convention — verify with Mike that this matches product expectations for international users.] |
| S1.PQ2 | Emoji disposition: strip at slug time                                                                                                                 | Product       | P1       | **Assumed** | Confidence: INFERRED. Matches GitHub. See NOT UNLESS non-goal. Verify by: checking whether any existing content uses emoji in titles; if yes, ask Mike.                                                                                                                                                                |
| S1.TQ1 | Duplicate-heading disambiguation algorithm: `-1`, `-2`, ... in document-order                                                                         | Tech          | P0       | **Decided** | Confidence: CONFIRMED. `heading-anchors.ts` already does this client-side. `extractHeadings` must match.                                                                                                                                                                                                               |
| S1.TQ2 | Migration path for existing content under old algorithm                                                                                               | Tech          | P0       | **Assumed** | Confidence: UNCERTAIN. Options: (a) rewrite `.md` files on boot using Story 3's rewrite infrastructure, (b) dual-resolve (new slug OR legacy slug) during a transition window, (c) empty-vault-only release. Verify by: inspecting current dogfood vaults for non-ASCII titles before choosing.                        |
| S1.TQ3 | Slug function stays in `packages/core/src/utils/slug.ts` (no move)                                                                                    | Tech          | P1       | **Decided** | CLAUDE.md declares `packages/core` as the shared extensions home; slug already lives there.                                                                                                                                                                                                                            |
| S1.TQ4 | Update call sites: `extractHeadings`, `HeadingAnchors`, `buildUnresolvedWikiLinkAttrs`, `BacklinkIndex.extractWikiLinksFromProsemirrorJson` consumers | Tech          | P0       | **Open**    | All call sites identified via grep; straightforward refactor.                                                                                                                                                                                                                                                          |
| S1.XQ1 | Test corpus covering Latin-accented, CJK, Cyrillic, Arabic, Hebrew, Devanagari, emoji, whitespace-only, empty                                         | Tech          | P0       | **Open**    | Live in `packages/core/src/utils/slug.test.ts`.                                                                                                                                                                                                                                                                        |
| S1.XQ2 | Sequencing with Story 3 (Managed Rename) for the migration path                                                                                       | Cross-cutting | P0       | **Assumed** | Confidence: INFERRED. If S1.TQ2 lands on option (a), Story 3's inbound-link-rewrite infrastructure is the cheapest tool to reuse. Option (b) decouples them. Mike to decide sequencing.                                                                                                                                |

### Context

- **Traces to:** `specs/2026-04-10-wiki-links-backlinks/IMPLEMENTATION_MILESTONES.md` — Milestone 4 lists "Finalize section-link resolution polish, including duplicate-heading slug behavior." Unicode correctness is not explicitly scoped in M4 but is the same surface.
- **Lateral:** Story 3 (Managed Rename) — shares the vault-rewrite infrastructure if S1.TQ2 resolves to option (a). Story 2 (`suggest_links`) — the unlinked-mention scanner MUST use the same slug function or it will false-negative on international content.
- **Forward:** Sets the precedent for every future identifier-producing function (heading IDs, wiki-link targets, section anchors, and eventually block IDs if ever). Getting the Unicode story right here is a precedent for the whole KB.

### Evidence & References (Story 1)

**Research Reports**

- `reports/backlinks-typed-links-and-ux-landscape/REPORT.md` — landscape comparison, §D1 Link identity and rename resilience
- `reports/wiki-links-backlinks-architecture/REPORT.md` — §D1 Link format conventions, noting Obsidian's "case-insensitive, shortest-path resolution" pattern

**Code (1P — origin/main)**

- `packages/core/src/utils/slug.ts` — current (buggy) `toWikiLinkSlug` implementation
- `packages/server/src/api-extension.ts` — `extractHeadings` (no dedup)
- `packages/app/src/editor/extensions/heading-anchors.ts` — client-side dedup (`-1`, `-2`)
- `packages/app/src/editor/extensions/wiki-link-helpers.ts` — re-exports `toWikiLinkSlug`
- `packages/server/src/backlink-index.ts` — consumer

**External Sources**

- [GitHub heading-anchor algorithm (Kramdown)](https://gist.github.com/asabaylus/3071099) — reference implementation for the proposed slug algorithm
- [Unicode TR15 (NFKD normalization)](https://unicode.org/reports/tr15/) — the normalization standard underlying the S1.PQ1 proposal

**Upstream Artifacts**

- Staff-Eng Decision Brief (in-session, 2026-04-12) — this story is item #3 (Unicode slug) + item #4 (dup-heading dedup) bundled.

---

---

## Story 2: Ship the `suggest_links` MCP tool to close the discovery half of the agent KB workflow

### Problem (SCR-lite)

**Situation.** M3 shipped four MCP graph tools — `get_backlinks`, `get_forward_links`, `get_orphans`, `get_hubs` — plus the `BacklinksPanel` in the editor. Agents can now discover existing edges in the link graph. The editor also has `PageListContext` fetching `/api/pages` (all page titles), and `/api/page-headings` for heading anchors. No tool — HTTP or MCP — surfaces **pages that mention a concept but don't link it**. The concept is well-known: Roam calls it "Unlinked References," Obsidian has the same panel. Our `wiki-links-backlinks-architecture` report (§D3) identified it as the key gap between a backlink index and an actionable knowledge graph.

**Complication.** The agent-native KB story splits cleanly into **orient → discover → consume** (per `reports/kb-index-navigation-patterns-for-agents/`). M3 covered orient and the "existing edges" slice of discover. The "missing edges" slice — "what pages should link to this one but don't?" — is the highest-leverage discovery primitive for an agent that's *authoring* knowledge, not just reading it. Without it, agents can curate titles and summaries but cannot perform the one cross-cutting hygiene task that defines a healthy KB: finding and closing unlinked mentions. This is also the cheapest place for an agent to produce observable value — the output is a ranked list, the action is one-tool-call away, and the result is immediately visible in the backlinks panel on the next save. Every day we ship M3 without it is a day agents can describe the KB but not improve it.

**Resolution.** Ship a `suggest_links` MCP tool (and paired HTTP endpoint for the editor if/when a UI surfaces it) that performs a deterministic, no-LLM substring scan across all doc bodies for titles/aliases of a target page, excluding existing wikilinks and non-prose regions. Return a ranked list with source doc, excerpt, and byte offset for precise editing.

### Value and goals

The customer/agent-facing dimension is the **discovery primitive** — this is the single net-new agent capability beyond M3. The platform dimension is that it establishes the pattern for "derived-state MCP tools that operate on the live backlink index" — any future tool (`find_similar_pages`, `detect_outdated_references`) will follow the same shape. GTM is neutral-to-positive — Obsidian has unlinked-references, so users coming from Obsidian expect it; shipping it is parity, not differentiation.

The intersection that matters: **this tool's value is gated by the slug correctness story (Story 1).** If the slug function mangles non-ASCII, `suggest_links` silently false-negatives on international content; if duplicate-heading slugs aren't deduplicated, the tool may false-match against anchors that don't exist. Story 1 is therefore a strong prerequisite — not a hard blocker, but a reason to sequence Story 1 first.

**Observable success:**

- An agent calls `suggest_links(target="Project Alpha")` on a vault where three other docs mention "Project Alpha" in prose without a wikilink. The response contains three source entries with excerpts.
- The tool returns in <500ms on a 500-doc vault (see NFR).
- Zero false positives from inside code blocks, existing wikilinks, or YAML frontmatter.

### Invariants

- **I1: Deterministic.** Same vault state → same output on every call. No time-dependence, no sampling, no LLM.
- **I2: No LLM dependency.** Implementation is a text-matching algorithm. No embeddings, no semantic similarity, no model calls. Observable: the tool works with `OPENAI_API_KEY` unset.
- **I3: Respects content filter.** Excluded dirs and gitignored files are not scanned. Observable: putting a doc under a gitignored path hides it from `suggest_links` the same way it's hidden from `list_documents`.
- **I4: Excludes existing wikilinks.** If `docA` already contains `[[Target]]`, it does not appear as an unlinked mention from `docA`. Observable: test fixture with a mixed doc (some linked, some unlinked) returns only the unlinked mention.
- **I5: Excludes non-prose regions.** Matches inside fenced code blocks (` ``` `), inline code (`` ` ``), and YAML frontmatter are not returned. Observable: test fixture with the target string in code fence returns zero results.
- **I6: Title + aliases.** The tool matches against both the target page's primary title (first heading / frontmatter title) AND its aliases (from frontmatter `aliases:` list). Observable: a page aliased as "PA" surfaces in mentions of "PA" as well as "Project Alpha."
- **I7: Case-insensitive, whole-word.** `"alpha"` should match `"Alpha"` but not `"alphabet"`. Observable: test fixture distinguishes word-boundary matches from substring matches.
- **I8: Deterministic rank.** Results are sorted by (a) source doc name, or by (b) a deterministic relevance score (e.g., count of mentions per source). Order must be stable across calls. Observable: same call twice returns byte-identical JSON.

### Constraints

- **C1:** MCP tool registration follows the existing pattern in `packages/cli/src/mcp/tools/index.ts` (alongside `get-backlinks.ts`, etc.) and uses `snake_case` tool naming consistent with the existing four.
- **C2:** Implementation lives in `packages/server/src/backlink-index.ts` (or a sibling file) and reads from the in-memory index, not by re-walking disk. Exposed via `/api/suggest-links?docName=…` paralleling `/api/backlinks`.
- **C3:** Scan budget — must complete within 500ms p95 on a 500-doc vault of \~5KB avg. Above that, truncate with a `truncated: true` response flag.
- **C4:** Uses the same slug function as the rest of the system (see Story 1). International content works only to the extent Story 1's Unicode fix is in.

### Non-goals

- **\[NEVER] LLM-based semantic similarity.** A separate "find conceptually related pages" feature could exist, but *this tool is the deterministic primitive*. The whole point is that it runs without API keys, without network calls, and is cheap enough for agents to call repeatedly. An embeddings-based tool is a separate story.
- **\[NEVER] Auto-rewriting unlinked mentions into wikilinks.** The tool *surfaces* candidates. The agent/user decides to link. Auto-linking is a trust violation — fuzzy matches at scale create bad content.
- **\[NOT NOW] Configurable match strategy (case-sensitive, substring vs whole-word, stemming).** Fix I7 (case-insensitive whole-word) as the default. Revisit if: a user-documented scenario shows the default producing poor recall/precision.
- **\[NOT NOW] UI surface in the editor (an "Unlinked References" tab next to Backlinks).** The MCP tool is agent-facing first. A UI tab is a natural next story after agent usage proves the primitive. Revisit when: (a) at least one agent workflow uses it productively, or (b) a human writer asks for the UI.
- **\[NOT UNLESS] Cross-vault / cross-workspace scanning.** Current scope is single-vault. Revisit unless a multi-workspace feature lands.

### Acceptance criteria

- **AC1:** Calling `suggest_links(target="<docName>")` via MCP returns a JSON response shaped as `{ ok: true, target, mentions: [{ source, excerpt, offset }, ...], truncated?: boolean }`.
- **AC2:** `GET /api/suggest-links?docName=<docName>` returns the same payload (for editor consumption).
- **AC3:** The test suite under `packages/server/src/backlink-index.test.ts` (or a paired file) covers I1–I8 with fixtures including: multi-mention docs, mixed linked/unlinked, aliases, code blocks, frontmatter, Unicode titles.
- **AC4:** The tool is registered in `packages/cli/src/mcp/tools/index.ts` and exposed when the CLI MCP server starts (`open-knowledge mcp`).
- **AC5:** Performance test: 500-doc synthetic vault, `suggest_links` completes <500ms p95. (Consider a benchmark or a bounded-reasoning estimate if no benchmark harness exists yet.)
- **AC6:** No false-positives from fenced code blocks, inline code, or YAML frontmatter in the tested corpus.

### Items

| ID     | Item                                                                                                                      | Type          | Priority | Status        | Notes                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S2.PQ1 | Tool name: `suggest_links` (snake\_case) matching MCP convention                                                          | Product       | P0       | **Decided**   | Mike already named the tool in the spec.                                                                                                                     |
| S2.PQ2 | Ranking strategy: by mention-count-per-source, descending, then alphabetical                                              | Product       | P1       | **Assumed**   | Confidence: INFERRED. Most-mentioned-source is more actionable for agents. \[Inferred — verify with Mike.]                                                   |
| S2.PQ3 | Include aliases from frontmatter `aliases:` field                                                                         | Product       | P0       | **Assumed**   | Confidence: INFERRED. Obsidian/Roam both do this. Verify: does OK's frontmatter schema today support `aliases: [..]`? \[Spot-check needed.]                  |
| S2.TQ1 | Substring algorithm: case-insensitive whole-word regex or Aho-Corasick for multi-target scans                             | Tech          | P1       | **Delegated** | Implementation detail. For a single-target tool, a simple regex is fine; Aho-Corasick matters only if a future API does multi-target scans. Spec can decide. |
| S2.TQ2 | Excerpt window: same 60-char / sentence-boundary logic as `snippetAround`                                                 | Tech          | P1       | **Decided**   | Reuse `snippetAround` from `backlink-index.ts` for consistency with the BacklinksPanel excerpts.                                                             |
| S2.TQ3 | Sequencing: after Story 1 (slug correctness)                                                                              | Cross-cutting | P0       | **Assumed**   | Confidence: INFERRED. If slug function is broken for Unicode, `suggest_links` inherits the bug. Mike can overrule if Story 1 is deferred.                    |
| S2.XQ1 | No new MCP dependency — reuse existing `FastMcpServer` setup                                                              | Tech          | P0       | **Decided**   | Same pattern as `get-backlinks`, etc.                                                                                                                        |
| S2.XQ2 | Excluding code blocks, frontmatter, existing wikilinks: is this done at ProseMirror-JSON walk time, or regex on markdown? | Tech          | P0       | **Open**      | ProseMirror-JSON walk is more robust (types distinguish `codeBlock`, `wikiLink`) but adds cost. Regex is cheaper. Spec decision.                             |

### Context

- **Traces to:** `specs/2026-04-10-wiki-links-backlinks/SPEC.md` §6 (Should-priority item) and IMPLEMENTATION\_MILESTONES.md M4.
- **Lateral:** Story 1 (Slug correctness) — Unicode Bug in slug function propagates into `suggest_links` false-negatives. Story 3 (Managed rename) — independent.
- **Forward:** Establishes the pattern for additional derived-state MCP tools (`find_similar_pages` via LLM; `detect_outdated_references` via timestamp+link staleness; `cluster_unlinked` as a richer version of this tool).

### Evidence & References (Story 2)

**Research Reports**

- `reports/backlinks-typed-links-and-ux-landscape/REPORT.md` — §Roam + §Obsidian reference Unlinked References as the discovery primitive
- `reports/wiki-links-backlinks-architecture/REPORT.md` — §D3 backlink UX, Unlinked Mentions discussion
- `reports/kb-index-navigation-patterns-for-agents/REPORT.md` — orient/discover/consume pattern that contextualizes this tool

**Code (1P — origin/main)**

- `packages/cli/src/mcp/tools/get-backlinks.ts` — pattern to follow for tool registration
- `packages/cli/src/mcp/tools/index.ts` — tool registry
- `packages/server/src/backlink-index.ts` — `snippetAround` to reuse, `BacklinkIndex.backward` for "already-linked" exclusion
- `packages/server/src/api-extension.ts` — pattern for the `/api/suggest-links` endpoint

**Upstream Artifacts**

- Staff-Eng Decision Brief (in-session, 2026-04-12) — this story is "address now" item #2.
- Spec §6 lists `suggest_links(page)` as Should-priority and IMPLEMENTATION\_MILESTONES.md M4 as its home. This story is the "pull forward" decision.

---

---

## Story 3: Managed page rename that atomically rewrites inbound wiki-links (M5a)

### Problem (SCR-lite)

**Situation.** `BacklinkIndex.renameDocument(old, new, markdown)` exists and is called from `standalone.ts` on file-watcher rename events. Its implementation is four lines: delete the old doc from the index, re-insert as the new doc name. This updates the renamed doc's *outbound* edges (what it links TO) but does not touch any other doc's content. Every `[[oldName]]` authored in a different doc remains literal text referencing a now-nonexistent target; those chips render as unresolved red-links the next time those docs open. There is no managed-rename surface in the app or server today — the only way to rename is to rename the `.md` file on disk, which triggers the same incomplete path.

The prior wiki-links report (`reports/wiki-links-backlinks-architecture/`) identified this as the "classic rename-propagation problem" that **every ID-based tool solves** (Roam, Notion, Tana, Anytype, Org-roam, Heptabase) and that **every title-based tool mitigates with a rewrite pass** (TiddlyWiki's Relink plugin, Obsidian's automatic link updating when renames happen through its UI). OK is currently title/slug-based with *neither* approach wired up end-to-end — rename is structurally broken for inbound references.

**Complication.** This is the most trust-breaking gap post-M3. A user or agent renames one `.md` file on day one and accumulates silently-broken inbound links; three weeks later, the vault has tens of stale red-links nobody knows how they got there. The product positions as real-time collaborative, agent-native, markdown-primary — all three audiences rename files. Deferring this to "M5 proper" (which also includes external-rename reconciliation and ambiguity resolution) is a false economy: the **managed-rename** half of M5 is cheap and closes the trust gap; the **external-rename reconciliation** half is genuinely hard and can ship later. Shipping M3 without at least the managed-rename half leaves a day-1 data-integrity bug on by default. The spec's G5 ("propagate OR make broken clearly visible") is technically satisfied by the current red-link UI, but "clearly visible broken state that accumulates silently" is not the same as a trustworthy product.

**Resolution.** Add a first-class managed-rename flow (server API + editor trigger) that, given the current backward-map in `BacklinkIndex`, rewrites every inbound `[[old]]` → `[[new]]` across affected docs atomically, preserving aliases and section anchors. Scope the external-filesystem rename reconciliation out — it becomes a separate M5b story.

### Value and goals

Customer value is direct: **rename doesn't silently break things.** An agent performing knowledge-hygiene renames (consolidating duplicates, renaming drafts) can do so without leaving stale links behind. A human moving a note from `drafts/` to `published/` doesn't scatter red-links across the vault.

Platform value is the rewrite infrastructure itself. The backward map (`Map<target, Map<source, snippet>>`) already tells the server exactly which docs need patching — we already have the index. What's missing is the *orchestration*: open the docs via Hocuspocus, apply a targeted transaction that rewrites specific wiki-link nodes, serialize, save. This same orchestration is the reuse target for several future features:

- **Heading rename** (M5-adjacent): rewrites `[[Page#OldHeading]]` → `[[Page#NewHeading]]`.
- **Slug migration** (Story 1, S1.TQ2 option): the Unicode slug fix may require rewriting existing vault content — the same transaction infrastructure applies.
- **Future "move to subfolder" or "merge two pages"** product features.

Internal value is data-integrity guarantees. Branch-scoped backlink index (from M3) plus atomic inbound rewrite = the vault has exactly one consistent link graph per branch at rest.

**Intersection:** the customer-facing "rename doesn't break things" outcome AND the platform "reusable rewrite orchestration" AND the internal "atomic per-branch graph consistency" all converge on the same scope — managed-rename flow. The story's value is the intersection, not any one dimension.

**Observable success:**

- A user (or agent) invokes managed rename on doc `foo` → `bar`. Every doc in the vault that previously showed `[[foo]]` now shows `[[bar]]`. No red links remain from this rename.
- The rewrite is atomic: if it fails partway, no partial state is left on disk (either all affected docs are rewritten or none are).
- Aliases and section anchors on inbound links are preserved: `[[foo|display text]]` → `[[bar|display text]]`; `[[foo#installation]]` → `[[bar#installation]]`.
- Open editor tabs on affected docs update live (Hocuspocus collab propagates the change).

### Invariants

- **I1: Atomic propagation.** After a managed rename completes successfully, no doc in the vault contains `[[old]]` *from this rename*. After a failed rename, every affected doc is either unchanged or rolled back to its pre-rename state. Observable: a crash test interrupting the rewrite mid-flight leaves the vault consistent (verified via backlink-index + on-disk grep).
- **I2: Preservation of alias.** `[[old|Display Text]]` in any doc becomes `[[new|Display Text]]` — alias survives. Observable: rename fixture includes aliased inbound links; test asserts aliases are unchanged.
- **I3: Preservation of anchor.** `[[old#section]]` becomes `[[new#section]]` — anchor survives. Observable: rename fixture includes section-anchored inbound links.
- **I4: Editor-open docs update live.** If doc `A` is open in an editor tab and doc `foo` is renamed (A links to foo), the open tab reflects `[[bar]]` within the collab propagation budget (≤ Hocuspocus debounce interval). Observable: Playwright test opens doc A, triggers rename of foo→bar via API, asserts the rendered DOM updates.
- **I5: Backlink index stays consistent.** After rename, `getBacklinks("new")` returns everything that previously returned from `getBacklinks("old")`; `getBacklinks("old")` returns empty. Observable: unit test on `BacklinkIndex`.
- **I6: Branch-scoped.** Rename on branch `main` does not affect any other branch's state. Observable: test with two loaded branch states.
- **I7: No LLM, no fuzzy matching.** The rewrite matches the exact `target` attribute of each wiki-link node — not string similarity, not semantic. `[[foobar]]` is NOT rewritten when `foo` renames. Observable: fixture with near-miss link names.
- **I8: Filesystem rename via managed flow** (not the app writing to `os.rename`). The managed-rename path writes to Hocuspocus (or the persistence layer) which handles disk + CRDT consistently. A raw `os.rename` on disk falls into the M5b external-reconciliation scope — out of this story.

### Constraints

- **C1:** Reuses `BacklinkIndex.backward.get(oldName)` as the "list of affected docs" source of truth. This is the intended use — M3 built the backward map for exactly this purpose.
- **C2:** Uses Hocuspocus `DirectConnection` / agent-session transaction primitive to apply the rewrite — same pattern as agent writes. Does NOT write `.md` files directly; goes through the CRDT persistence path.
- **C3:** Rewrite must fit in a single Hocuspocus transaction per affected doc (preserves the agent-write-style atomicity at the per-doc level) and a single "rename operation" at the vault level (so a crash during the operation either completes or rolls back).
- **C4:** The managed-rename trigger must be exposed as (a) an HTTP API (`POST /api/rename?from=&to=`) and (b) an MCP tool (`rename_page`). The editor may use a UI surface; that's a follow-on UX story.

### Non-goals

- **\[NOT NOW] External filesystem rename reconciliation.** If a user runs `mv foo.md bar.md` in their terminal, the watcher sees `delete foo` + `create bar`. Reconciling that back to a "rename" with confidence tiers + ambiguity records is the M5b scope. Revisit after this story ships AND we have evidence of external-rename frequency from dogfood.
- **\[NOT NOW] Heading rename propagation** (`[[Page#OldHeading]]` → `[[Page#NewHeading]]` when a heading is renamed in-place). Same rewrite infrastructure, different trigger. Scope to a sibling story — call it M5c. Revisit after M5a ships.
- **\[NOT NOW] Ambiguity / conflict UI** (when two files with different names are collapsed to one by the slug function, or when a rename would create a collision). Handle the collision case with a simple error ("target already exists"). Revisit when: user pain reports or dogfood data show collision frequency matters.
- **\[NOT UNLESS] Undo of a rename.** The rewrite is a single logical operation; undoing it rewrites back. If agents need this, it's `rename_page(new, old)`. Do not build a separate undo stack.
- **\[NEVER] Silent fuzzy rewrite.** "This link points to `foo` which no longer exists, but `fooo` exists — did you mean that?" is an auto-fuzzy-fix pattern we will not ship. Suggest-flows are separate (see Story 2).

### Acceptance criteria

- **AC1:** `POST /api/rename { from: "foo", to: "bar" }` returns `{ ok: true, rewroteDocs: ["a", "b", "c"] }` on success.
- **AC2:** MCP tool `rename_page(from, to)` is registered and works.
- **AC3:** Integration test: vault with `foo.md`, `a.md` containing `[[foo]]`, `b.md` containing `[[foo|Display]]`, `c.md` containing `[[foo#section]]`. After `rename(foo, bar)`: `bar.md` exists, `foo.md` does not, all three other docs contain rewritten links with aliases and anchors preserved.
- **AC4:** Crash-recovery test: kill the server mid-rewrite (e.g., after rewriting 1 of 3 docs). On restart, either (a) the rename completes (all 3 rewritten + `bar.md` on disk) or (b) the vault is rolled back to the pre-rename state (all 3 unchanged + `foo.md` on disk). Partial state — 1 of 3 rewritten — must be rejected by the recovery path.
- **AC5:** Playwright test: open `a.md` in the editor, invoke rename of foo→bar via API. The editor DOM shows `[[bar]]` within the Hocuspocus debounce budget (declared elsewhere; verify by watching awareness `mode` field).
- **AC6:** Negative test: `rename(foo, bar)` when `bar.md` already exists returns `409 Conflict`, no changes applied to any doc.
- **AC7:** `BacklinkIndex` state after successful rename matches expected: `getBacklinks("bar")` equals pre-rename `getBacklinks("foo")`; `getBacklinks("foo")` is empty; per-source forward-maps updated.

### Items

| ID     | Item                                                                                                            | Type          | Priority | Status      | Notes                                                                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3.PQ1 | Trigger surface: HTTP + MCP (no editor UI in this story)                                                        | Product       | P0       | **Decided** | MCP is the primary agent-facing trigger; HTTP lets the editor add a UI later without backend changes.                                                                                                          |
| S3.PQ2 | Collision behavior: error out (not auto-resolve)                                                                | Product       | P0       | **Assumed** | Confidence: INFERRED. Silent auto-resolution (rename to `bar-1.md`) is surprising. Error + require caller to pick a different name is simpler. \[Inferred — verify with Mike.]                                 |
| S3.TQ1 | Atomic-rewrite strategy: all-docs-in-one-Hocuspocus-transaction vs per-doc-with-journal                         | Tech          | P0       | **Open**    | Staff-level decision for spec. Per-doc transactions are simpler but need an external journal for I1 crash recovery. One big transaction is cleaner but doesn't fit Hocuspocus's per-doc model. Spec must pick. |
| S3.TQ2 | Use `AgentSessionManager.getSession` as the transaction entry point                                             | Tech          | P0       | **Assumed** | Confidence: INFERRED. Same pattern as agent-write; re-uses the per-origin undo path. \[Inferred — verify with Mike.]                                                                                           |
| S3.TQ3 | Update `target` attribute in `wikiLink` nodes; do NOT regenerate markdown via round-trip                        | Tech          | P0       | **Assumed** | Confidence: INFERRED. Modifying a single attribute in the PM tree is safer than round-tripping through markdown, which could introduce unintended formatting changes elsewhere. \[Inferred — verify.]          |
| S3.TQ4 | File rename on disk: via persistence layer (Hocuspocus `onStoreDocument` writes `bar.md`; delete `foo.md`)      | Tech          | P0       | **Open**    | Depends on whether persistence supports a rename primitive today, or whether we need to add one. Spot-check the persistence API.                                                                               |
| S3.TQ5 | Recovery journal: append-only log in `.open-knowledge/cache/<branch>/rename-journal.jsonl`, replayed on startup | Tech          | P1       | **Open**    | For crash-recovery (I1/AC4). Spec decision.                                                                                                                                                                    |
| S3.XQ1 | Affected docs may be closed (not currently loaded in Hocuspocus) — need `getSession` to load them transiently   | Tech          | P0       | **Decided** | `AgentSessionManager.getSession(docName)` already handles this pattern.                                                                                                                                        |
| S3.XQ2 | Consistency with slug-rewrite in Story 1 — can this infrastructure be reused?                                   | Cross-cutting | P1       | **Assumed** | If Story 1's S1.TQ2 lands on "rewrite existing vault content on upgrade," the same machinery applies. Mike to decide on bundling vs sequencing.                                                                |
| S3.XQ3 | Awareness signal: broadcast `renamed` lifecycle to open editor tabs so UI updates                               | Tech          | P1       | **Decided** | `document.getMap('lifecycle').set('status', 'renamed')` already exists in `standalone.ts:384` for external rename; this story generalizes the pattern.                                                         |

### Context

- **Traces to:** `specs/2026-04-10-wiki-links-backlinks/IMPLEMENTATION_MILESTONES.md` Milestone 5. This story is M5a — the managed-rename slice cut out of the full M5.
- **Lateral:** Story 1 (Slug correctness) — shares rewrite infrastructure for the slug-migration path (S3.XQ2). Story 2 (`suggest_links`) — independent.
- **Forward:** M5b (external-rename reconciliation — hard half of M5). M5c (heading rename propagation). Future: page-merge, page-split, folder-rename — all reuse this infrastructure.

### Evidence & References (Story 3)

**Research Reports**

- `reports/backlinks-typed-links-and-ux-landscape/REPORT.md` — §Executive summary axis 1 (link identity), §Cross-cutting D1+D5 comparison
- `reports/wiki-links-backlinks-architecture/REPORT.md` — rename-resilience discussion

**Code (1P — origin/main)**

- `packages/server/src/backlink-index.ts` — current `renameDocument` (4-line stub) + `backward` map (our source-of-truth for affected docs)
- `packages/server/src/standalone.ts` — file-watcher rename event handler (lines \~370-390)
- `packages/server/src/agent-sessions.ts` — `AgentSessionManager.getSession` pattern
- `packages/server/src/api-extension.ts` — HTTP route registration pattern
- `packages/cli/src/mcp/tools/get-backlinks.ts` — MCP tool registration pattern
- `packages/core/src/extensions/wiki-link.ts` — wikiLink node schema (for targeted attribute update)

**Upstream Artifacts**

- Staff-Eng Decision Brief (in-session, 2026-04-12) — this story is "address now" item #1 (the one item in that brief explicitly flagged as tech debt, not conscious deferral).
- `specs/2026-04-10-wiki-links-backlinks/SPEC.md` §6 lists "Managed rename/move flow" and "External rename reconciliation" as Must-priority; this story cuts the managed half into its own scope.

---

---

## Story 4: Replace BacklinksPanel polling with awareness-driven push on save

### Problem (SCR-lite)

**Situation.** `packages/app/src/components/BacklinksPanel.tsx` fetches `/api/backlinks?docName=…` on mount and re-fetches every 2 seconds whenever the tab is visible. The server maintains the backlink index event-driven: `persistence.ts:onStoreDocument` updates the index on every CRDT save, and `standalone.ts`'s file-watcher handlers update on every external change. The server knows exactly when any doc's backlinks change. The client does not — it polls blindly.

**Complication.** This is a small but real cross-cutting tension with the product's real-time-collab positioning. In a product where humans and agents co-edit live, the backlinks panel having up to 2 seconds of staleness on an inbound link that just got created is *visible* — the new link is chipified in the other user's editor instantly, but the current user's panel lags. More concretely:

- **Resource use:** every open editor tab fetches one HTTP response per 2s regardless of whether any change occurred. The per-call cost is small, but the ratio of useful responses (change actually occurred) to wasted responses (no change) is dominated by the latter in any realistic editing session.
- **Perceived-lag budget:** collaborative products build up their "feels alive" property from lots of individual sub-second update paths. Each 2-second gap in the UI is a small subtraction from that property.
- **Pattern precedent:** if the Backlinks panel ships with polling as the default pattern, future derived-view UIs (orphans sidebar, hubs view, link graph) will follow. Establishing push-on-save now sets the pattern for the panel family.

**Resolution.** When the server's persistence layer finishes updating the backlink index for doc `X` and determines that doc `X`'s *forward* links changed, broadcast an awareness signal to every loaded `Y.Doc` that appears in X's current or prior target set. The frontend `BacklinksPanel` subscribes to an awareness field on its own doc and re-fetches only when that field changes. No timer.

### Value and goals

Customer-facing: **the backlinks panel feels live.** Platform: **establishes the push-over-awareness pattern for derived-view UIs** — the next six UIs that want to react to graph-level changes will use the same mechanism. Internal: **reduced HTTP load per open tab** — not a crisis today, but a multiplier effect at higher tab counts.

Intersection: the **platform pattern** is the load-bearing dimension. We're picking a signaling primitive — awareness field bump vs dedicated WebSocket channel vs server-sent events — and every future similar feature will inherit the choice. Picking awareness (reuses the existing Hocuspocus awareness channel, per-doc, low cost) commits us to a pattern that's cheap and composable. Picking a dedicated WebSocket channel has broader flexibility but doubles the transport surface. This is a reversible-but-sticky decision — easier to migrate a few panels off awareness later than to build two transport patterns in parallel.

**Observable success:**

- A user has doc `A` open with a BacklinksPanel showing 2 inbound links. Another user adds a new `[[A]]` to doc `B` and saves. User 1's panel updates within 500ms without a polling timer firing.
- When no backlinks change for doc `A`, zero `/api/backlinks` fetches happen while user 1 has `A` open.
- A disconnected tab (Hocuspocus awareness severed) falls back to a single-re-fetch on reconnect, not to continuous polling.

### Invariants

- **I1: Zero polling in steady state.** While the BacklinksPanel for doc `X` is mounted and awareness is connected, no `/api/backlinks` fetch fires unless (a) first mount, (b) awareness signals X's backlinks are dirty, or (c) awareness disconnects and reconnects. Observable: network-tab inspection with no edits happening.
- **I2: Update latency bound.** From the moment doc `B`'s persistence-save-that-touches-X's-backlinks completes to the moment `A`'s panel renders the new state: ≤ 500ms on a local dev machine; ≤ (Hocuspocus awareness-broadcast latency + network RTT + one `/api/backlinks` fetch) in general. Observable: Playwright test with two browsers measures the delta.
- **I3: No stale state after awareness reconnect.** If awareness drops for doc `A` for N seconds and reconnects, the panel refetches exactly once and shows the current state. Observable: simulate awareness disconnect, assert one-shot refetch on reconnect.
- **I4: Awareness signal is idempotent.** Multiple rapid saves of doc `B` that each touch `A`'s backlinks result in at most one refetch per Hocuspocus debounce window on `A`. Observable: rapid-save test; panel fetch count ≤ debounce count.
- **I5: Signal only goes to actually-affected docs.** When doc `B` saves and its forward links change from `[X, Y]` → `[X, Z]`, awareness signals propagate to `X, Y, Z` (not to every doc in the vault). Observable: unit test on the signal-dispatch function.
- **I6: Panel works without the awareness signal.** If awareness is unavailable for any reason (extension disabled, transport issue), the panel falls back to a *single* fetch on mount and no further updates — the user can close/reopen the tab to refresh. No fallback to silent polling. Observable: panel with awareness blocked shows static initial state.

### Constraints

- **C1:** Uses the existing Hocuspocus awareness channel on each doc's provider. Does NOT introduce a new WebSocket or SSE endpoint.
- **C2:** The signal is a single field bump on each affected doc's awareness state (e.g., `backlinksRev: <timestamp>` on a per-doc "system" awareness state, separate from per-user cursor states). The field value is opaque; clients react to "it changed," not to the value's content.
- **C3:** Server-side dispatch must run inside `persistence.ts`'s `onStoreDocument` flow (after the index update completes) and inside `standalone.ts`'s file-watcher handlers (after the index update completes). No separate scheduler.
- **C4:** If the target doc is not currently loaded in Hocuspocus (no live connections, no `Y.Doc` in memory), the signal is silently dropped — clients that open that doc later will fetch fresh on mount (covered by I6's fallback path).

### Non-goals

- **\[NEVER] Push the actual backlink payload through awareness or a Y.Map.** Awareness is for small signaling only; backlink lists can be arbitrarily large and would bloat the awareness state. The pattern is signal-then-fetch, not push-the-data.
- **\[NOT NOW] Generalized "graph-changed" pub/sub.** A generic signaling bus for any derived-view UI. Useful conceptually; premature as scope. Revisit when: the third derived-view UI (after BacklinksPanel and a hypothetical OrphansSidebar) wants signals AND the awareness pattern is straining.
- **\[NOT NOW] Server-sent events as an alternate transport.** If awareness proves the wrong primitive — too tight a coupling to Hocuspocus, too hard to generalize — SSE or a dedicated WebSocket channel is the next stop. Revisit when: we have evidence the awareness pattern is pressure-limiting new features.
- **\[NOT UNLESS] Client-side backlink index** (mirror the server index in the browser for zero-latency updates). Feasible but premature. Revisit only if: the fetch latency itself becomes the UX bottleneck, which requires I2 to be consistently violated.

### Acceptance criteria

- **AC1:** Two-browser Playwright test: browser A has doc `X` open (BacklinksPanel visible). Browser B edits doc `Y` to add `[[X]]` and saves. Within 500ms (local-dev budget), browser A's panel re-renders with `Y` in the list.
- **AC2:** Network-tab assertion test: browser A idles on doc `X` for 30 seconds with no edits anywhere. Zero `/api/backlinks` fetches beyond the single mount-time fetch.
- **AC3:** Awareness-disconnect test: start browser A on `X` with awareness connected, then simulate awareness disconnection, then add a link from `Y` → `X`, then restore awareness. Panel refetches exactly once on awareness reconnect.
- **AC4:** Signal-dispatch unit test: mock `BacklinkIndex.updateDocument` call for doc `B` changing forward links from `[X, Y]` to `[X, Z]`. Assert awareness signals fire exactly on loaded docs among , not on others.
  {`X`, `Y`, `Z`}
- **AC5:** Fallback test: block awareness broadcast capability in the test. Mount the panel. Assert one fetch on mount, no further fetches, no errors in console.

### Items

| ID     | Item                                                                                                                                              | Type         | Priority | Status      | Notes                                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S4.PQ1 | Signal channel: Hocuspocus awareness (not a new transport)                                                                                        | Product/Tech | P0       | **Assumed** | Confidence: SUPPORTED. Awareness is already in the system; reusing it is the lowest-cost path. Alternative (SSE) would double transport surface. \[Inferred — verify with Mike the trade-off sits right.] |
| S4.PQ2 | Signal content: opaque timestamp (`backlinksRev: Date.now()`), not a structured payload                                                           | Product/Tech | P0       | **Decided** | Matches C2. Signal-then-fetch pattern; payload bloat is explicitly non-goal.                                                                                                                              |
| S4.TQ1 | Signal field location: "system" awareness sub-state, not user-state                                                                               | Tech         | P0       | **Assumed** | Confidence: INFERRED. User-state fields mix with cursor position broadcasts; a dedicated system slot avoids confusion. \[Inferred — verify the awareness API supports this cleanly.]                      |
| S4.TQ2 | Server dispatch: compute the target-set diff (old forwards ∪ new forwards) inside `BacklinkIndex.updateDocument` and emit signals from the caller | Tech         | P0       | **Open**    | Design detail for spec — the signal emission could live in the index itself (pushes coupling into the index) or in the caller (pushes diff-computation into the caller).                                  |
| S4.TQ3 | Client subscription: `awareness.on('update', ...)` filter for `backlinksRev` changes, debounced                                                   | Tech         | P0       | **Open**    | Debounce window: match or exceed Hocuspocus debounce to align with I4. Spec decision.                                                                                                                     |
| S4.TQ4 | Fallback: single fetch on mount, no timer                                                                                                         | Tech         | P0       | **Decided** | Matches I6. Removes existing 2s interval.                                                                                                                                                                 |
| S4.XQ1 | Check: does Hocuspocus awareness support a non-user system field?                                                                                 | Tech         | P0       | **Open**    | Worldmodel / spec pass should verify. If not, S4.TQ1 falls back to a reserved user-state field (less clean but works).                                                                                    |
| S4.XQ2 | No impact on the four MCP graph tools — they're HTTP-pull, not push                                                                               | Tech         | P2       | **Decided** | Scope boundary.                                                                                                                                                                                           |

### Context

- **Traces to:** Staff-Eng Decision Brief "Address now" item #5 (Client-side push).
- **Lateral:** None of the other three stories in this batch depend on this one; it's orthogonal.
- **Forward:** Sets the pattern for future derived-view UI updates (orphans sidebar, hubs tab, link-graph view if any).

### Evidence & References (Story 4)

**Research Reports**

- *(No directly-relevant external landscape research — this is a signaling-pattern choice within our own stack.)*

**Code (1P — origin/main)**

- `packages/app/src/components/BacklinksPanel.tsx` — current polling implementation (`setInterval(..., 2000)`)
- `packages/server/src/persistence.ts` — server-side backlink-index update site (line \~422)
- `packages/server/src/standalone.ts` — file-watcher backlink updates
- `packages/server/src/backlink-index.ts` — `updateDocument` is the logical emission point for the target-set diff
- `packages/app/src/editor/TiptapEditor.tsx` — awareness subscription pattern precedent (user cursor/mode awareness)

**External Sources**

- [Hocuspocus awareness docs](https://tiptap.dev/docs/hocuspocus/awareness) — primitive we're building on

**Upstream Artifacts**

- Staff-Eng Decision Brief (in-session, 2026-04-12) — this story was reclassified from "legitimately defer" to "address now" in the brief after reasoning about platform-pattern precedent.
