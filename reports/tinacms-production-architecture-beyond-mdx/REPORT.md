---
title: "TinaCMS Production Architecture Beyond MDX"
description: "Deep dive into TinaCMS's operational architecture outside the MDX pipeline — git integration via the Bridge/GitProvider seam, unknown-component degradation and error UX, absent real-time collaboration, agent/MCP posture, and SSW-era trajectory. Focused on what 7 years of git-backed markdown editing at scale reveals about patterns to adopt, pain points to avoid, and white space to differentiate on."
createdAt: 2026-04-12
updatedAt: 2026-04-13
subjects:
  - TinaCMS
  - SSW
  - isomorphic-git
  - Plate
  - GitHub Contents API
  - Tina Cloud
  - Editorial Workflow
topics:
  - git-backed CMS architecture
  - markdown round-trip fidelity
  - unknown-component degradation
  - collaboration model
  - agent-native content authoring
  - MCP integration
  - OSS/commercial split
  - parser architecture
  - schema evolution
  - GraphQL mutation API
---

# TinaCMS Production Architecture Beyond MDX

**Purpose:** Understand TinaCMS's production architectural decisions *outside* the MDX pipeline — what 7 years of shipping git-backed markdown editing at scale reveals. Reader cares about: patterns worth adopting, pain points to avoid, gaps Open Knowledge (OK) could differentiate on. MDX parse/serialize and schema/template registration mechanics are explicitly out of scope (already covered in [mdx-crdt-roundtrip-fidelity/.../tinacms-plate-mdx/](../mdx-crdt-roundtrip-fidelity/fanout/2026-04-03-initial/tinacms-plate-mdx/REPORT.md) and [cms-custom-components-landscape/.../tinacms-mdx-components/](../cms-custom-components-landscape/fanout/2026-04-03-initial/tinacms-mdx-components/REPORT.md)).

---

## Executive Summary

TinaCMS is the closest architectural neighbor to Open Knowledge — markdown/MDX in git as canonical, schema-driven void-node components, Plate/Slate editor — but five years of production learning reveal that the hard problems (concurrent editing, content-merge, schema evolution, agent-native writes) were **not solved in OSS**. They were either deferred to git's native semantics (push-to-branch-and-PR), gated behind Tina Cloud (Editorial Workflow, branch UI, PR orchestration), or left open as 4-year-stale community proposals (Draft Documents).

The central finding is that TinaCMS architected for **operational simplicity** (every save = one commit via a thin 4-method `Bridge` interface) and paid for it in **coordination complexity** at the feature layer (branch-per-editor, FSM-tracked indexing, full-page reloads on branch switch). The Tina Cloud backend — where all the interesting coordination lives — is closed source. The OSS pieces that ship are: `Bridge` (filesystem + isomorphic-git), `Database` + Level index, GraphQL resolver, `GitProvider` hooks. Everything above that — branch UI, PR creation, Editorial Workflow, multi-user draft isolation, cross-branch indexing — is proprietary.

For OK, this crystallizes five distinct conclusions. **First**, treat git as a pluggable content I/O strategy (OK already does this — make the seam as narrow and symmetric as Tina's 4-method `Bridge`). **Second**, adopt Tina's `invalid_markdown` opaque-source sentinel pattern — it's the cleanest answer to "the editor can't parse this but don't lose user content." **Third**, OK's CRDT + shadow-repo + rescue-buffer stack is a structurally different (and better) answer to multi-editor concurrency than Tina's branch-per-editor — the 4-year-open Draft Documents proposal confirms Tina's community hits this pain and their maintainers' answer remains "use branches." **Fourth**, OK's MCP-in-CLI is a 6–12-month lead on Tina's "Coming Soon" MCP server, and orthogonal to Tina's GitHub-Action-centric agent posture — different customer job-to-be-done. **Fifth**, SSW's acquisition reframes the competitive threat: TinaCMS is a consulting firm's preservation-mode in-house product, not a VC-funded growth engine. Expect architectural conservatism, bug fixes, and housekeeping — not a pivot to CRDT or agent-native.

**Key findings:**

- **Git as 4-method CRUD Bridge:** TinaCMS exposes a narrow `Bridge` interface (`glob`, `get`, `put`, `delete`) that treats git as a pluggable implementation. `FilesystemBridge`, `IsomorphicBridge`, and `GitHubProvider` are interchangeable. The lesson: treat git as content I/O strategy, not architectural layer.
- **No content-merge logic exists:** Across the write path (local `IsomorphicBridge.put`, remote `GitHubProvider.onPut`), there is no three-way merge, no `mergeBase`, no conflict resolution UI. Two editors on the same file hit last-writer-wins; their official answer is "branch per editor."
- **`invalid_markdown` is a universal fail-soft sentinel:** On any parse failure, Tina converts the entire document into a single `invalid_markdown` node that preserves the original source verbatim. The editor shows a red error block with a "Switch to raw-mode" button. Round-trip is data-safe, but the WYSIWYG becomes unusable for the whole file.
- **Zero real-time collaboration primitives:** No Yjs, no CRDT, no presence, no cursor sharing, no awareness, no locking, no OCC. The official story for multi-editor teams is branches + PRs. A 2022 maintainer-pinned "Draft Documents" proposal has no dev work 4 years later, through community follow-ups.
- **No official MCP; a C# third-party prototype has 1 star:** Tina has `AGENTS.md` + `CLAUDE.md` (for contributors, not consumers), a typed GraphQL mutation API (powerful but wildcard-token-auth), a GitHub-Action content auditor (not MCP), and "MCP Server" on the roadmap as "Coming Soon."
- **SSW acquisition (May 2024) reframes trajectory:** TinaCMS is now a consulting firm's in-house product. ~20 of 27 contributors in the last 10 months are SSW staff. H2 2025 commit velocity is ~34/month, down from 2023's ~144/month pre-acquisition peak (~4× drop). Apache 2.0 license, no enterprise-gated code, but most commercial UX lives in closed-source Tina Cloud.

**Update (2026-04-13) — Four additional dimensions investigated:**

- **"Next" parser track (D6):** TinaCMS ships a dual-parser architecture — a forgiving `markdown` parser (default for `.md` collections) that treats expressions/ESM as plain text (zero-error degradation) alongside the strict `mdx` parser that hard-fails. The forgiving parser was built to stop Hugo/Jekyll/Markdoc shortcodes from crashing entire collections.
- **Schema evolution (D7):** Zero migration tooling confirmed — no versioning, no migration CLI, no reconciliation UI. `resolveLegacyValues` preserves unknown fields during updates (good), but `audit --clean` and create paths silently drop them (bad). Multiple open GitHub issues confirm schema drift is a production pain point.
- **Tina Cloud coordination (D8):** CONFIRMED — the closed-source Tina Cloud layer adds zero collab primitives beyond the OSS. No presence, no locking, no merge intelligence. Locking was described as "down the road" but never shipped. OK's CRDT differentiation is vs the entire Tina product, not just OSS.
- **Typed GraphQL write API (D9):** 5 generic + 2-per-collection mutations with fully typed, schema-generated input types and multi-layer validation. But agents must construct Plate AST JSON (not raw markdown), errors are opaque strings, no batch operations, no dry-run mode, no OCC. OK's markdown-native agent-write API is more agent-friendly despite weaker type safety.

---

## Research Rubric

**Report type:** Deep-dive, factual-with-conclusions.

**Primary question:** What has TinaCMS learned from 7 years shipping git-backed markdown editing at scale — outside the MDX pipeline — that OK should adopt, avoid, or differentiate on?

**Stance:** Factual with conclusions. Findings stated declaratively; implications tagged as opinions.

| # | Dimension | Priority | Depth | Key question |
|---|---|---|---|---|
| D1 | Git integration & branching model | P0 | Deep | Why isomorphic-git? How branching/drafts? Conflict handling? Client↔cloud split? |
| D2 | Unknown-component degradation & error UX | P0 | Deep | What happens with unknown JSX, expression props, schema drift? What does the user see? |
| D3 | Collaboration / concurrency story | P0 | Moderate | Any collab features? Autosave races? Community sentiment on gaps? |
| D4 | Agent / MCP / API surface | P0 | Moderate | Agent posture? Programmable write surface? MCP? |
| D5 | Trajectory, OSS/commercial split | P1 | Light | Tina Cloud vs self-hosted, team, roadmap signals, adoption |
| D6 | "Next" parser track (no-mdx path) | P0 | Deep | What does PR #3055's markdown parser change vs legacy MDX parser? |
| D7 | Schema evolution & migration | P0 | Deep | Any migration tooling? What happens to content when schema changes? |
| D8 | Tina Cloud coordination layer | P0 | Moderate | Does TinaCloud add presence/locking/merge beyond OSS? |
| D9 | Typed GraphQL write API depth | P0 | Deep | Full mutation surface, validation, error handling, what agents can do |

**Non-goals:**
- MDAST↔Plate parse/serialize mechanics (covered elsewhere)
- Schema/template field-type registration (covered elsewhere)
- Pricing comparison vs Payload/Sanity/Contentful (not architectural)

---

## Detailed Findings

### D1: Git Integration & Branching Model

**Finding:** TinaCMS architects git as a pluggable I/O strategy behind a 4-method `Bridge` interface, but defers all coordination complexity (branching, PRs, indexing, conflict resolution) to either GitHub's native semantics or Tina Cloud's closed-source backend.

**Evidence:** [evidence/d1-git-integration-and-branching.md](evidence/d1-git-integration-and-branching.md)

**What the architecture looks like:**

```
                     ┌──────────────────────────────┐
                     │    Editor (Plate/TipTap)     │
                     └──────────────┬───────────────┘
                                    │ GraphQL mutation
                                    ▼
                     ┌──────────────────────────────┐
                     │   @tinacms/graphql Database  │
                     │  (Level KV index + resolver) │
                     └──────┬──────────────┬────────┘
                            │              │
                 bridge.put │              │ gitProvider.onPut
                            ▼              ▼
              ┌──────────────┐     ┌────────────────────┐
              │    Bridge    │     │    GitProvider     │
              │  (content    │     │  (remote push —    │
              │   I/O only)  │     │   GitHub API)      │
              └──────┬───────┘     └────────────────────┘
                     │
        ┌────────────┼─────────────┐
        ▼            ▼             ▼
  Filesystem   IsomorphicBridge  AuditFileSystem
   (no git)    (local commits)   (schema-only writes)
```

**The `Bridge` interface is 4 methods:**
```ts
interface Bridge {
  rootPath: string;
  glob(pattern: string, extension: string): Promise<string[]>;
  delete(filepath: string): Promise<void>;
  get(filepath: string): Promise<string>;
  put(filepath: string, data: string): Promise<void>;
}
```

This decouples git from the schema/query pipeline. A `FilesystemBridge` writes raw files; an `IsomorphicBridge` does `writeBlob → updateTreeHierarchy → writeCommit → writeRef` on every put; `AuditFileSystemBridge` is a write-muting subclass used by `tinacms audit`. Branch is just a `ref` parameter.

**Three other load-bearing choices:**

1. **Write path fires both `Bridge.put` and `GitProvider.onPut`.** The former writes content; the latter pushes to remote. Two writers on every save, no transaction, no rollback if one fails.

2. **`GitHubProvider.onPut` commits per-file via the Contents API.** If a form save touches N files, you get N commits. GitHub's `sha` freshness-check provides implicit last-writer-wins (409 on mismatch). No atomicity across files; no shadow repo; no WIP refs.

3. **Editorial Workflow (branch-per-editor, auto-PR, FSM-tracked indexing) exists only on Tina Cloud.** Self-hosted editors see the branch switcher disabled: *"Tina's branch switcher isn't available in local mode."* All branch/PR/indexing endpoints live at `content.tinajs.io` — proprietary.

**Implications for OK:**

- **Adopt:** The narrow `Bridge`-like seam. OK's server already has symmetric file-watcher + persistence paths — making that seam explicit (read-side + write-side, single interface) gets OK architectural optionality for free (dev filesystem ↔ CRDT-only ↔ GitHub-API-push ↔ in-memory tests).
- **Don't adopt:** Per-file `createOrUpdateFileContents` commits. OK's persistence debounce + shadow repo + BatchBegin/BatchEnd model is structurally better — one commit per logical save, atomic across files, WIP refs survive crashes.
- **Differentiate:** OK has an OSS shadow-repo architecture that Tina put behind a paywall. The branch UX, indexing FSM, PR orchestration — all the hard parts — are Tina Cloud-only. For an OSS-first product, a full branching + collab story in the OSS is a real moat.

**Decision triggers:**
- If OK ever ships a "serverless / static" deployment mode → validate the `Bridge`-like seam first
- If OK's per-branch view correctness (backlinks graph, section anchors) becomes slow → Tina's per-branch Level namespace (`namespace: branch` key prefix) is a proven pattern

**Remaining uncertainty:**
- How do `IsomorphicBridge`'s local commits get pushed upstream? OSS code has no push path. Presumably Tina Cloud CI or an external sync — not visible in the OSS tree.

---

### D2: Unknown-Component Degradation & Error UX

**Finding:** TinaCMS uses a tiered degradation strategy: unknown JSX components round-trip as opaque HTML (graceful), malformed shortcodes fall back to literal paragraph text (graceful), but expression props / ESM / schema-drift errors convert the entire document into a single `invalid_markdown` block (hard-fail with source preservation).

**Evidence:** [evidence/d2-unknown-component-degradation.md](evidence/d2-unknown-component-degradation.md)

**The `invalid_markdown` pattern is the load-bearing abstraction.** On any parse failure, Tina wraps the entire source in one root node:

```ts
export const invalidMarkdown = (e: RichTextParseError, value: string): Plate.RootElement => ({
  type: 'root',
  children: [{
    type: 'invalid_markdown',
    value,                       // ← entire original source
    message: e.message || `Error parsing markdown ${MDX_PARSE_ERROR_MSG}`,
    children: [{ type: 'text', text: '' }],
    ...extra,
  }],
});
```

The stringify side re-emits the source verbatim — **zero silent data loss on round-trip**, even when the editor can't parse the content. The editor then shows a red error block with a "Switch to raw-mode" button that drops the user into Monaco with inline error squiggles at the failing line.

**Four distinct failure modes exist, and they're treated differently:**

| Construct | Behavior | User experience |
|---|---|---|
| Unknown JSX component (`<Foo />` with no template) | Preserved as `html` node with source intact | Renders as HTML in editor; editable |
| Malformed shortcode / directive | Fallback to `p` paragraph with literal source text | Renders as plain paragraph; editable |
| Expression props (`data={x}`) | Throws `RichTextParseError` | Entire document becomes `invalid_markdown` error block |
| ESM (`export const meta = ...`) | Throws `RichTextParseError` | Entire document becomes `invalid_markdown` error block |
| Schema-removed prop in content | Throws on parse | Entire document becomes `invalid_markdown` |
| Schema-removed prop in editor state | Silently dropped on save | **Silent data loss** |
| Schema-removed template in editor state | Throws on save | Save blocked |

**Raw-mode (Monaco) is the universal escape hatch.** Debounced at 500ms, the raw editor re-parses as you type. Key discipline: **the form state is NOT updated while the current source is unparseable** — preventing the rich-text side from being overwritten by transient bad typing.

**Implications for OK:**

- **Adopt immediately:** The `invalid_markdown` sentinel pattern. OK's fidelity contract (I2 Character preservation, NG4 no HTML sanitization) is strengthened by an equivalent "opaque document on parse failure" node type. Prevents the worst failure mode — silent content destruction — without requiring the bridge to succeed.
- **Adopt:** The "don't commit form state while unparseable" rule for OK's Observer B (Y.Text → XmlFragment). Already implicit via the `parse(text) → JSON → updateYFragment` happy path, but should be explicit: if `parse()` throws, hold the XmlFragment at its last valid state.
- **Adopt:** The three-tier audit pattern. (1) In-editor error block for interactive users. (2) Form-validation blocking submit. (3) `tinacms audit` CLI → CI failure. OK has (1) and (2) implicitly via bridge invariants; an `open-knowledge audit` CLI subcommand closes the loop for CI regression detection.
- **Avoid:** Document-level error scoping. Tina's sharpest edge: one bad construct blocks the entire file. OK's block-level error scoping (isolate the bad region, keep the rest editable) is a strong differentiator if we can do it.
- **Differentiate:** Schema drift is Tina's real gap. Removed props are silently dropped on save. OK should treat schema drift as first-class: warn visibly when unknown props would be dropped; consider an "unknown data drawer" / diff UI before save.

**Decision triggers:**
- If OK ever accepts MDX with JSX expressions or ESM → apply Tina's whole-document-fail-soft pattern (not partial recovery)
- If OK supports schema-scoped MDX components (beyond void-node JSX) → ship schema evolution tooling from day one; don't inherit Tina's silent-drop behavior

**Remaining uncertainty:**
- The "next" parser path in `packages/@tinacms/mdx/src/next/` (PR #3055) may have refined fallback for JSX — worth a follow-up if OK plans a strict-markdown-only track alongside MDX.

---

### D3: Collaboration / Concurrency Story

**Finding:** TinaCMS has **zero real-time collaboration primitives** (no Yjs, Automerge, Hocuspocus, presence, cursor sharing, or awareness) and **zero concurrency control** (no OCC, ETags, locks, or sha-check beyond GitHub's implicit one). The official story for multi-editor teams is "use branches." A 4-year-old maintainer-pinned "Draft Documents" proposal sits unanswered through repeated community follow-ups.

**Evidence:** [evidence/d3-collaboration-story.md](evidence/d3-collaboration-story.md)

**The absence is quantified:**

- Grep for `yjs|y-prosemirror|automerge|hocuspocus|crdt` across all packages → 0 meaningful matches
- `find . -name package.json -exec grep -lE '"(yjs|automerge|hocuspocus|y-prosemirror|y-websocket)' {} \;` → 0 hits
- Grep for `Lock\b|sessionLock|editLock|docLock|pageLock|fileLock|lockFor|isLocked|acquireLock` → only `AsyncLock` for HTTP response cache deduplication (not user-facing)
- TinaCMS GitHub issues for `"real-time collaboration"`, `"concurrent editing"`, `"multiple editors"`, `"yjs"`, `"CRDT"`, `"presence"` → 0 hits each

**The save path is literally:**
```ts
if (this.bridge) {
  await this.bridge.put(normalizedPath, stringifiedFile);
}
```

No `If-Match`, no ETag, no `expectedVersion`, no compare-and-swap. The `version` references in the same file are a schema-migration counter, not per-document concurrency tokens.

**The official answer, quoted verbatim from a maintainer in [discussion #4639](https://github.com/tinacms/tinacms/discussions/4639) (2024-07-13):**

> User (@99ansh, 2024-07-12): "For self hosted TinaCMS I have observed that when multiple users are trying to edit the same page, the content gets overridden by the last save. There should be a way to introduce locking (page level/field level) for conflict free editing experience."
>
> Tina team (@bradystroud, 2024-07-13): "If you have multiple users, branching might be the way to go https://tina.io/docs/tina-cloud/branching/"

No follow-up from Tina; discussion remains open.

**The Draft Documents proposal ([#2962](https://github.com/tinacms/tinacms/discussions/2962))** was opened by @jamespohalloran, a TinaCMS maintainer, in June 2022. The proposal explicitly acknowledges:

> "the concept of working in branches isn't always intuitive for non-developers."
> "At the time of writing, no development work has been started on this project."

4 upvotes, 7 comments. Most recent follow-up 2026-01-13 asking for status: no Tina-team response. Second-most-recent (2024-12-11) asking for update: no Tina-team response. Four years of silence on the only official acknowledgement that the branch-per-editor model is painful for non-developers.

**Implications for OK:**

- **Validates OK's CRDT bet as a clean differentiation axis.** This is not "Tina has weaker collab" — they have none. No backend session, no ephemeral presence, no cursor broadcasting, no locking. The Plate.js editor inside TinaCMS ships without Plate's optional Yjs plugin enabled.
- **Marketing precision:** Tina uses "real-time" to mean *live preview on one user's screen*, not multi-user co-editing. OK should avoid conflation: "Tina has real-time preview; OK has real-time collaboration."
- **Whitespace:** Any OK story around drafts/preview that doesn't require users to understand git branches is a direct answer to the Draft Documents proposal gap. Non-developer editors are an underserved segment in the Tina ecosystem.
- **Don't adopt:** The "branch per editor" model for non-developer users. Community sentiment is clear (via silence-under-repeated-asks) that this is a load-bearing frustration that hasn't moved in 4 years.

**Decision triggers:**
- If OK targets non-developer editors explicitly → the Draft Documents gap is a concrete marketing angle
- If OK pursues enterprise SSO / permissions (where concurrent editing is routine) → CRDT + live presence is the qualifying feature Tina can't match in OSS

**Remaining uncertainty:**
- Unknown whether closed-source TinaCloud adds server-side edit-lock or presence on top of OSS Tina. The OSS has no hooks for it. Trial-booting a Tina Cloud project could confirm — out of scope for this pass.

---

### D4: Agent / MCP / API Surface

**Finding:** TinaCMS has a typed GraphQL write API (schema-validated mutations) but **no official MCP server, no agent-native write surface, no CLI agent commands**. The repo-level `AGENTS.md` and `CLAUDE.md` are for *contributors* (AI coding tools building Tina), not for *consumers* (agents writing content through Tina). The only community-authored MCP prototype is a 1-star single-commit C# project. "MCP Server" is listed as "Coming Soon" on the roadmap.

**Evidence:** [evidence/d4-agent-mcp-api-surface.md](evidence/d4-agent-mcp-api-surface.md)

**The agent surface matrix:**

| Surface | TinaCMS | OK |
|---|---|---|
| MCP server (official) | ❌ "Coming Soon" on roadmap | ✅ `open-knowledge mcp` CLI subcommand |
| MCP server (third-party) | 1-star C# prototype (calumjs/TinaMCP) | N/A |
| Typed mutation API (HTTP) | ✅ GraphQL `createDocument`/`updateDocument`/`deleteDocument` | Agent write API (markdown append/prepend/replace, patch) |
| Agent-awareness in editor | ❌ None | ✅ Y.Map('activity') flash side-channel |
| Agent auth model | Wildcard API token (all-or-nothing) | Local CLI process trust |
| AI content generation | Slash-command-style helper ("AI Features Beta" at Team Plus $49/mo) | N/A |
| CI-driven AI | `tinacms/github-content-auditor` GitHub Action | N/A |
| Docs for agents writing content | None (AGENTS.md is for contributors) | Implicit via MCP server |

**Tina's agent posture is GitHub-Action-centric (batch, scheduled, PR-gated), not interactive-editor-centric (local MCP, in-editor co-editing).** Their `tinacms/github-content-auditor` Action uses GitHub Models to run AI feedback on selected files, opens issues with suggestions, and creates PRs to update `lastChecked` timestamps. Different axis entirely from OK's "agent writes flash in real-time in the editor" model.

**The GraphQL mutation API is a real existing programmable write surface.** An agent can call:
```graphql
mutation {
  createDocument(collection: "stuff", relativePath: "my-stuff.md",
    params: { stuff: { template_1: { title: "Ok" } } }) { __typename }
}
```
with schema-validated typed params — arguably stronger than OK's markdown-text-manipulation API for field-level correctness. The weakness is auth: Tina uses a "wildcard token (*)" for write operations, coarse-grained and all-or-nothing.

**Implications for OK:**

- **OK has a ~6–12 month MCP lead window.** Tina's "Coming Soon" roadmap slot for MCP plus zero current implementation means OK can market "MCP-native since day one" aggressively before Tina closes the gap.
- **Copy from Tina:** The typed mutation API is architecturally clean. OK's agent-write API could grow a typed write mode for MDX components (given schema) as an optional alternative to free-form markdown patches — this matches Tina's strongest agent-write property.
- **Differentiate:** Tina's agent story is GitHub-Action-centric (periodic freshness checks, PR-gated). OK's is interactive-editor-centric (agent writes appear live in the editor, flash-visible to humans co-editing). Different customer job-to-be-done: "keep content fresh via AI" vs "human + agent pair-program a document." Don't compete on Tina's axis.
- **Avoid:** Wildcard-token auth as the default. OK's local-CLI-process trust model is simpler for local dev but doesn't generalize to cloud. Plan scoped-token auth (per-collection, per-operation) from day one if OK ever offers a hosted mode.

**Decision triggers:**
- If TinaCMS ships MCP within 6 months → OK must emphasize the *live CRDT bridge* (agent writes as first-class CRDT updates), not just "AI can edit content" (table stakes)
- If OK pursues a hosted/cloud mode → typed GraphQL mutations + scoped tokens is a known-good pattern to copy

**Remaining uncertainty:**
- TinaCon 2026 slate may signal whether SSW/Tina is genuinely committed to MCP or hedging with GitHub Actions. Worth monitoring Q3-Q4 2026.

---

### D5: Trajectory, OSS/Commercial Split, Sustainability

**Finding:** TinaCMS was acquired by SSW (a ~100-person Australian consulting firm) in May 2024 after its original Forestry.io-funded team ran out of runway. ~20 of 27 contributors in the last 10 months are SSW staff. H2 2025 commit velocity is ~34/month, down from 2023's ~144/month pre-acquisition peak (~4× drop). License is Apache 2.0 — no enterprise-gated code in the repo — but most commercial UX (Editorial Workflow, branching, search, image media repo) lives in closed-source Tina Cloud. The roadmap contains no mentions of AI agents, real-time collaboration, CRDT, or multiplayer editing.

**Evidence:** [evidence/d5-trajectory-and-sustainability.md](evidence/d5-trajectory-and-sustainability.md)

*Note: Several findings cite tina.io (vendor's own marketing site) for claims about Tina's own product direction, pricing, and customers — product-incentive bias possible.*

**SSW reframes the competitive threat.** From tina.io/about (vendor-sourced):

> "SSW ended up acquiring TinaCMS, bringing greater enterprise resources, support, and expertise."

Pre-acquisition, TinaCMS was "four developers operating on a tight budget … struggling to keep up with the needs of customers and community." Scott Gallant (co-founder) transitioned from CEO to Product Owner. SSW's business model is selling consulting hours to enterprise — keeping TinaCMS alive aligns with that, but the product trajectory is constrained to what a consulting firm can build in spare cycles.

**Commit velocity tells the story:**

| Year | Commits |
|---|---|
| 2023 (pre-acquisition) | 1,723 |
| 2024 (acquisition year) | 313 |
| 2025 | 254 |
| Since 2025-06-01 (10 months) | 280 |

Full 2025 averages ~21 commits/month; H2 2025 (since 2025-10-01) recovered to ~34 commits/month. Compare with 2023's ~144 commits/month. Latest release is `tinacms@3.7.1` with weekly patch cadence — sustained but conservative.

**The roadmap signals direction:**

> "The roadmap contains no mentions of AI agents, real-time collaboration, CRDT technology, or multiplayer editing features."

Completed: GitHub Enterprise, 2FA, Vercel Data Cache, React 19, TinaDocs, ESM migration.
In development: Editorial Workflow for media, Content API perf, image search.
Coming soon: merge PRs from CMS UI, Copilot Instructions, TinaCloud Project Insights, PostHog telemetry, MCP Server, WorkOS auth.

These are housekeeping and incremental UX moves, not architectural direction.

**Adoption is mid-tier OSS CMS** — 13.3k stars, ~88k weekly npm downloads (Payload ~200k, Strapi ~600k for comparison). Stable, mature, not breakout growth.

**Implications for OK:**

- **Lower threat level than a naive competitive read suggests.** TinaCMS is in stewardship mode, not growth mode. Not going to out-innovate a focused competitor on CRDT or agent-native.
- **Higher partnership/displacement potential.** SSW uses Tina for consulting client projects; they have incentive to preserve the category, not redefine it. OK as a next-generation successor (CRDT + agent-native) has room to grow without provoking a defensive reaction.
- **12–18-month architectural lead window.** A product architected around CRDT + agents starts from a structural position TinaCMS cannot close quickly under SSW stewardship. The "MCP Server Coming Soon" roadmap slot is the only item that could cross OK's territory — and even then it's exposure of existing GraphQL, not an agent-native editing pipeline.
- **License is safe.** Apache 2.0, no enterprise-gated code in the repo, no license-flip signals. OK doesn't need to worry about a Redis/Elastic/Sentry-style re-licensing event from Tina.
- **Watch item:** TinaCon 2026 + the MCP Server roadmap slot. If "Coming Soon" moves to "In Development" within 3–6 months, OK's MCP-native lead compresses.

**Decision triggers:**
- If OK needs a near-term competitive moat → CRDT + live collab is durable for 12–18 months minimum
- If OK considers hosted mode → study Tina Cloud's self-hosted-gaps list (repo-based media, search) as "what breaks when you self-host a headless git CMS"

**Remaining uncertainty:**
- Tina Cloud revenue not disclosed; pricing suggests small-to-mid-market. How big is the dedicated TinaCMS team inside SSW's 100-person shop? From commit counts, ~4–6 FTE-equivalents, but dual-hatting with consulting is plausible.
- "AI Features (Beta)" at the Team Plus tier ($49/mo+) not publicly documented in detail — likely a slash-command LLM helper based on CHANGELOG PostHog telemetry entries, but unverified.

---

### D6: "Next" Parser Track (No-MDX Path)

**Finding:** TinaCMS ships a dual-parser architecture — a forgiving `markdown` parser (default for `.md` collections) that replaces remark-mdx entirely with `mdast-util-from-markdown` + GFM + a custom shortcode micromark extension, alongside the strict `mdx` parser that hard-fails on expressions/ESM. The forgiving parser treats expressions, imports, and exports as plain text (zero-error degradation) instead of the legacy behavior where any acorn parse failure converts the entire document into `invalid_markdown`.

**Evidence:** [evidence/d6-next-parser-track.md](evidence/d6-next-parser-track.md)

**The two-tier strategy exists because Hugo/Jekyll/Markdoc shortcodes crashed entire collections.** PR #3055 / issue #2881 document the motivation: shortcode delimiters like `{{< >}}` and `{{% %}}` were fed to acorn by the legacy MDX parser, which cannot parse them, producing whole-collection indexing failures. The next parser sidesteps this by never invoking a JavaScript expression parser.

Runtime dispatch is via `field.parser.type`: `"markdown"` routes to the next parser, `"mdx"` routes to the legacy pipeline. The union type is `"mdx" | "markdown" | "slatejson"`. Default for `.md` collections is `"markdown"` (next); `.mdx` collections still default to `"mdx"` (legacy). The next parser reuses the legacy `remarkToSlate` transformer with `skipMDXProcess: true`, and its serializer includes `skipEscaping` to prevent markdown escape mangling of shortcode delimiters.

Unknown JSX components fall back to `html` nodes in both parser paths; the next parser adds `shouldFallback` for closing-tag mismatches. FIXME tests document known limitations (HTML children in shortcode blocks, duplicate patterns).

**Implications for OK:**

- OK could adopt a similar two-tier strategy if supporting both strict MDX and plain markdown content — forgiving parse for `.md`, strict for `.mdx`
- The shortcode micromark extension pattern is transferable: custom micromark extensions for domain-specific syntax (callouts, directives) without polluting the core parser
- Zero-error degradation (expressions become plain text) is a better UX than whole-document failure — relevant if OK ever handles JSX expressions

**Decision triggers:**
- If OK adds MDX support → the dual-parser split is a proven pattern for handling mixed-format content repositories
- If OK needs shortcode/directive support → micromark extensions are the right level of abstraction

**Remaining uncertainty:**
- Performance delta between next and legacy parser paths not benchmarked in TinaCMS's test suite

---

### D7: Schema Evolution & Migration

**Finding:** TinaCMS has zero schema migration tooling. No schema versioning, no migration CLI, no reconciliation UI, no field aliasing, no deprecation markers. The `Version` type tracks the TinaCMS package version, not a content schema version. The single codemod command is `move-tina-folder` (a one-time structural migration). `tinacms audit` is a round-trip consistency check, not a schema-content mismatch detector — and with `--clean` it silently drops unrecognized fields.

**Evidence:** [evidence/d7-schema-evolution.md](evidence/d7-schema-evolution.md)

**The `resolveLegacyValues` mechanism is the only protection against data loss.** During updates, fields that exist in content but are not in the current schema are preserved in the output file. This prevents schema changes from destroying data through normal editing. However, three paths bypass this protection: `audit --clean` (re-serializes, dropping unknown fields), `createDocument` (starts fresh), and full re-indexing (index only contains schema-recognized fields). The asymmetry is dangerous: routine editing preserves data, but "cleanup" operations destroy it.

The database index is rebuilt from scratch on every `indexContent` call — no incremental migration. The GraphQL resolver throws hard on unknown fields during mutations but silently ignores extra content on reads. Schema comparison at build time uses GraphQL SDL diff + SHA256 — a cache invalidation mechanism, not a migration system.

**Multiple open GitHub issues confirm this is a real production pain point:** #6629 (migration tooling request), #5732 (content breaking after schema changes), #5954 (fields lost after rename), #6412 (audit --clean data loss). These span 2023-2025 and remain unresolved.

**Implications for OK:**

- Any system accepting typed components should ship schema evolution tooling from day one — Tina's gap is a cautionary tale
- `resolveLegacyValues`-style preservation is the minimum viable protection; OK should ensure unknown fields survive ALL write paths, not just some
- An `open-knowledge audit` command that detects schema-content mismatches (not just round-trip failures) would address a real gap

**Decision triggers:**
- If OK ships typed MDX component schemas → schema evolution is a day-one requirement, not a follow-up
- If OK targets teams with evolving content models → "zero data loss on schema change" is a differentiating promise

**Remaining uncertainty:**
- Whether Tina Cloud has unpublished schema migration tooling — unlikely given community pain signals, but not confirmed

---

### D8: Tina Cloud Coordination Layer

**Finding:** CONFIRMED — Tina Cloud adds zero collaboration primitives beyond the OSS layer. No real-time presence, no cursor sharing, no awareness broadcasting, no document locking, no merge intelligence, no optimistic concurrency control. The Editorial Workflow is pure branch+PR automation where GitHub handles all merging. Locking was described as "down the road" in a blog post but was never shipped.

**Evidence:** [evidence/d8-tina-cloud-coordination.md](evidence/d8-tina-cloud-coordination.md)

**This resolves the D3 remaining uncertainty gap.** The D3 analysis noted: "Unknown whether closed-source TinaCloud adds server-side edit-lock or presence on top of OSS Tina." The answer is definitively no. The only cloud feature flag in the OSS client code is `'editorial-workflow'`. The `Bridge.put` interface has no version parameter. `IsomorphicBridge` uses `force: true` on `writeRef`. `tinaLockVersion` is schema format metadata, not concurrency control.

RBAC exists (Admin/Editor roles, Enterprise SSO via WorkOS on the roadmap), but these are authorization gates (who CAN edit), not coordination mechanisms (who IS editing). A competitor (React Bricks) publicly contrasts their document locking against Tina's absence — external corroboration.

**Implications for OK:**

- OK's CRDT differentiation is not just vs OSS Tina — it is vs the entire Tina product including the commercial tier. There is no hidden collaboration layer behind the paywall.
- The "branch per editor" model is Tina's ceiling for multi-editor workflows at every pricing tier. OK's real-time CRDT collaboration is a structural upgrade, not a feature-parity catch-up.
- Marketing can state definitively: "Tina Cloud does not offer real-time collaboration" without qualifier

**Decision triggers:**
- If OK targets enterprise teams where concurrent editing is routine → CRDT + live presence is the qualifying feature Tina cannot match at any tier
- If OK pursues a hosted mode → the collab story is a genuine commercial differentiator, not just an OSS nicety

**Remaining uncertainty:**
- Whether the "MCP Server (Coming Soon)" roadmap item might bundle locking/presence — no signals either way, but would require fundamental architectural changes

---

### D9: Typed GraphQL Write API Depth

**Finding:** TinaCMS exposes 5 generic mutations (`addPendingDocument`, `createDocument`, `updateDocument`, `deleteDocument`, `createFolder`) plus 2 per collection (`create<Collection>`, `update<Collection>` — no per-collection delete). Input types are fully typed, schema-generated `InputObjectTypeDefinition`s with multi-layer validation (GraphQL types → Yup assertShape → collection validation → path traversal security → glob matching → field matching → existence checks). But rich-text fields require Plate AST JSON (not raw markdown), there are no batch mutations, no dry-run mode, no error codes, and no concurrency control.

**Evidence:** [evidence/d9-graphql-write-api.md](evidence/d9-graphql-write-api.md)

**The Plate AST requirement is the key friction point for agents.** The `serializeMDX` function throws on string input — agents must construct valid Plate AST trees with correct node types, children arrays, and text leaves. This is substantially harder than writing raw markdown. An agent writing a blog post must know the Plate schema for headings, paragraphs, lists, code blocks, and any MDX components defined in the collection's templates. No documentation exists for this input format beyond GraphQL schema introspection.

Errors are plain text strings with no error codes — an agent must pattern-match on messages like `"Document does not exist at path posts/foo.md"` to determine failure type. Error messages are developer-facing debug strings, not stable API contracts. Document rename is only possible via the generic `updateDocument` (not the typed per-collection mutations), and requires a separate `deleteDocument` call to remove the old path.

**Implications for OK:**

- OK's markdown-native agent-write API (`agent-write-md` with append/prepend/replace, `agent-patch` for targeted find/replace) is more agent-friendly despite weaker type safety — agents write markdown, not AST
- If OK adds typed component writes, offering both markdown-string AND AST input modes avoids Tina's friction
- Structured error codes (machine-readable, stable across versions) should be a day-one API design choice
- Batch mutations (update N documents atomically) are a real gap in Tina that OK could fill

**Decision triggers:**
- If OK ships a public HTTP/GraphQL API → include both markdown-string and structured-AST input modes for rich text
- If OK targets agent consumers explicitly → error codes + dry-run mode are high-value differentiators

**Remaining uncertainty:**
- Whether the Plate AST input format is documented for external consumers — no dedicated documentation found

---

## Cross-Cutting Synthesis: What OK Should Take Away

Five distinct takeaways emerge from the dimensions together:

1. **The `Bridge` + `GitProvider` interface is the single most transferable architectural idea.** A narrow 4-method I/O contract (`glob`, `get`, `put`, `delete`) + a dual-hook write path (`bridge.put` + `gitProvider.onPut`) gives Tina serverless deployability, pluggable git backends, and in-memory tests — at the cost of no atomicity across files. OK's existing file-watcher + persistence architecture is structurally similar; making the seam explicit and symmetric would get architectural optionality for free.

2. **`invalid_markdown` is the load-bearing fail-soft pattern.** On any parse failure, wrap the entire source in one opaque node. Round-trip is data-safe even when the editor is blind. Pair it with a "raw-mode" escape hatch (Monaco with inline error markers). OK should adopt this as-is — it's cleaner than anything in OK's current fidelity contract for the "editor can't parse this" case.

3. **TinaCMS validates the CRDT bet from the negative.** Zero collab primitives in OSS. Official answer to "multiple users overwriting" is "branch per editor." The only official acknowledgement of the branch-model pain (Draft Documents, 2022) has sat unanswered for 4 years. OK's CRDT + shadow-repo + rescue-buffer is a structurally different answer to the problem — durable differentiation for 12–18 months minimum under SSW stewardship.

4. **MCP is a 6–12 month lead window for OK.** Tina's "Coming Soon" MCP server plus zero implementation plus a 1-star third-party C# prototype means the JS ecosystem is wide open. OK's typed mutation API is a worthwhile addition (stronger field-level validation than free-form markdown patches) — but OK's interactive-editor agent posture is orthogonal to Tina's GitHub-Action batch posture. Don't compete on Tina's axis.

5. **Trajectory favors OK.** SSW's stewardship reframes Tina as preservation-mode rather than growth-mode. Apache 2.0 safe; commercial moat lives in closed-source Tina Cloud; no CRDT/agent-native items on the roadmap. OK has room to grow as a next-generation successor.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Self-hosted production scaling** — OSS `IsomorphicBridge` commits locally but has no push path. The 15-minute `waitForIndexStatus` timeout hints at large-repo indexing pain but no public benchmarks exist.
- **Closed-source Tina Cloud behavior** — server-side branch coordination, PR orchestration, indexing FSM are not visible in OSS. Claims about Tina Cloud internals are inferred from client-side FSM states.
- **Tina Cloud revenue and FTE allocation** — not publicly disclosed; commit-log analysis suggests ~4–6 SSW FTEs but dual-hatting with consulting is plausible.

### Out of Scope (per Rubric)

- MDAST↔Plate parse/serialize mechanics (covered in [mdx-crdt-roundtrip-fidelity/.../tinacms-plate-mdx/](../mdx-crdt-roundtrip-fidelity/fanout/2026-04-03-initial/tinacms-plate-mdx/REPORT.md))
- Schema/template field-type registration (covered in [cms-custom-components-landscape/.../tinacms-mdx-components/](../cms-custom-components-landscape/fanout/2026-04-03-initial/tinacms-mdx-components/REPORT.md))
- Pricing comparison vs Payload/Sanity/Contentful

### Watch Items

- **TinaCon 2026 slate** — signal of SSW commitment to MCP/agent-native
- **MCP Server roadmap slot velocity** — "Coming Soon" → "In Development" transition window
- **Tina Cloud customer case studies** — customer gallery is currently 404; any launch of a public customers page would signal commercial traction

---

## References

### Evidence Files
- [evidence/d1-git-integration-and-branching.md](evidence/d1-git-integration-and-branching.md) — `Bridge`/`GitProvider` architecture, Editorial Workflow FSM, `IsomorphicBridge` vs `GitHubProvider`, conflict-free write path
- [evidence/d2-unknown-component-degradation.md](evidence/d2-unknown-component-degradation.md) — `invalid_markdown` sentinel, error UX, raw-mode escape, schema drift failure modes
- [evidence/d3-collaboration-story.md](evidence/d3-collaboration-story.md) — Absence of CRDT/locking/OCC, "use branches" official answer, Draft Documents proposal (4 years stale)
- [evidence/d4-agent-mcp-api-surface.md](evidence/d4-agent-mcp-api-surface.md) — AGENTS.md/CLAUDE.md as contributor docs, typed GraphQL mutations, no official MCP, GitHub Action content auditor
- [evidence/d5-trajectory-and-sustainability.md](evidence/d5-trajectory-and-sustainability.md) — SSW acquisition, contributor/commit velocity, Apache 2.0, roadmap signals
- [evidence/d6-next-parser-track.md](evidence/d6-next-parser-track.md) — Dual-parser architecture, "next" markdown parser vs legacy MDX, shortcode support, zero-error degradation
- [evidence/d7-schema-evolution.md](evidence/d7-schema-evolution.md) — No schema migration tooling, resolveLegacyValues, audit behavior, open issues
- [evidence/d8-tina-cloud-coordination.md](evidence/d8-tina-cloud-coordination.md) — CONFIRMED: Tina Cloud adds zero collab primitives, no locking, no presence, no OCC
- [evidence/d9-graphql-write-api.md](evidence/d9-graphql-write-api.md) — Full mutation surface, typed input types, validation layers, rich-text via Plate AST, error handling

### External Sources
- [TinaCMS GitHub repo](https://github.com/tinacms/tinacms) — primary source code
- [TinaCMS Issue #885](https://github.com/tinacms/tinacms/issues/885) — isomorphic-git migration motivation
- [TinaCMS Discussion #2962](https://github.com/tinacms/tinacms/discussions/2962) — Draft Documents proposal (4-year-stale)
- [TinaCMS Discussion #4639](https://github.com/tinacms/tinacms/discussions/4639) — maintainer "use branches" answer
- [TinaCMS Roadmap](https://tina.io/roadmap) — MCP "Coming Soon"
- [TinaCMS Pricing](https://tina.io/pricing) — OSS/commercial split
- [TinaCMS Joins SSW blog post](https://tina.io/blog/Tina-Joins-SSW) — acquisition announcement
- [calumjs/TinaMCP](https://github.com/calumjs/TinaMCP) — third-party C# MCP prototype
- [tinacms/github-content-auditor](https://github.com/tinacms/github-content-auditor) — official AI GitHub Action
- [TinaCMS Issue #6156](https://github.com/tinacms/tinacms/issues/6156) — AI content auditor epic

### Related Research (navigation aids only — do not depend on for evidence)
- [../mdx-crdt-roundtrip-fidelity/fanout/2026-04-03-initial/tinacms-plate-mdx/REPORT.md](../mdx-crdt-roundtrip-fidelity/fanout/2026-04-03-initial/tinacms-plate-mdx/REPORT.md) — MDX parse/serialize pipeline
- [../cms-custom-components-landscape/fanout/2026-04-03-initial/tinacms-mdx-components/REPORT.md](../cms-custom-components-landscape/fanout/2026-04-03-initial/tinacms-mdx-components/REPORT.md) — Schema/template model
- [../mdx-crdt-roundtrip-fidelity/REPORT.md](../mdx-crdt-roundtrip-fidelity/REPORT.md) — CRDT + MDX round-trip synthesis
- [../cms-custom-components-landscape/REPORT.md](../cms-custom-components-landscape/REPORT.md) — 12-CMS comparative landscape
- [../openknowledge-competitive-landscape/REPORT.md](../openknowledge-competitive-landscape/REPORT.md) — OK competitive positioning
