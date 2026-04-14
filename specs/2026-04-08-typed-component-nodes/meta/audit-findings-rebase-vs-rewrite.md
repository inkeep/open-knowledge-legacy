# Audit Findings — Rebase vs Rewrite for T1 (typed-component-nodes) + T3 (block-editor-ux)

**Artifacts audited:**
- T1: `.claude/worktrees/pr23-rebase/specs/2026-04-08-typed-component-nodes/SPEC.md` (1042L, baseline 12f49c9)
- T3: `.claude/worktrees/block-editor-ux/specs/2026-04-10-block-editor-ux/SPEC.md` (642L, baseline 41cee87)

**Audit date:** 2026-04-14
**Current main HEAD:** db8a6d6 (115 commits ahead of `rebase/typed-component-nodes`)
**Total findings:** 13 (7 high, 4 medium, 2 low)

---

## High Severity

### [H1] T1 SPEC's entire Phase 0 is obsolete — the parsing pipeline it proposes to integrate with no longer exists on main

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** T1 §3.5 (Markdown Serialization), §4 Phase 0 (Raw JSX Serialization), §3.3 (TipTap Node Spec — "markdownTokenName" field + custom tokenizer)
**Issue:** T1 SPEC proposes to "wire the existing `jsxTokenizerB` into `JsxComponent`" (§4 Phase 0 step 1), change `markdownTokenName` from `'code'` to `'jsxBlock'`, and register a custom `markdownTokenizer` field (§4 Phase 0 step 2). None of these surfaces exist anymore on main.
**Current text (§4 Phase 0 step 1):** *"Wire the existing `jsxTokenizerB` into `JsxComponent`. ... Change `markdownTokenName` from `'code'` to `'jsxBlock'`, register `jsxTokenizerB` via TipTap's `markdownTokenizer` field, delete the orphaned `fenceFor` helper ... once migration completes."*
**Evidence:**
- `packages/core/src/extensions/jsx-tokenizer*` → does not exist on main (removed in PR #83)
- `marked` package → removed from all `packages/*/package.json` on main (PR #83)
- `@tiptap/markdown` → removed from all `packages/*/package.json` on main (PR #83, #94)
- PR #83 (`ee030b5`, 2026-04-13) migrated from `marked + @tiptap/markdown` to `unified + remark + @handlewithcare/remark-prosemirror`
- Main already parses JSX via remark-mdx's `mdxJsxFlowElement` → `jsxComponent` PM node handler in `packages/core/src/markdown/index.ts:429-436`
**Status:** CONTRADICTED (the pipeline this phase targets does not exist)
**Suggested resolution:** Phase 0 is not needed — rewrite as "update the existing `mdxJsxFlowElement` handler in `packages/core/src/markdown/index.ts` to destructure JSX attrs into typed node attributes instead of stashing the raw source string."

---

### [H2] T1's §3.5 custom-tokenizer / `parseMarkdown` / `renderMarkdown` hook design is obsolete — serialization goes through mdast handlers, not TipTap extension hooks

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** T1 §3.3 (parent-chain invariant), §3.5 (Parse/Serialize), §3.8 (Factory signature), Phase 0 §5a (cycle-1 byte-identity via `serialize(parse(jsx))`)
**Issue:** T1 relies on TipTap's `parseMarkdown` / `renderMarkdown` / `markdownTokenName` extension fields (from `@tiptap/markdown`). The post-#83 pipeline uses mdast-side handlers (in `packages/core/src/markdown/index.ts` lines 417-462 for parse, 590-596 for serialize) — the TipTap extension no longer participates in markdown serialization at all.
**Current text (§3.3):** *"TipTap's `.extend()` preserves non-standard extension fields via `getExtensionField()`'s parent-chain walk... When `MarkdownManager.registerExtension()` reads `markdownTokenName` / `parseMarkdown` / `renderMarkdown` from the app's extended extension, it finds them undefined on the child config, falls back to `extension.parent`, and returns the core implementation. This is verified by source read of `@tiptap/markdown@3.22.3/src/MarkdownManager.ts:113-120`."*
**Evidence:**
- `@tiptap/markdown` removed from main's dependencies
- Current `MarkdownManager` (`packages/core/src/markdown/index.ts`) takes `{ extensions }` but uses them only to build the ProseMirror schema, not to read `parseMarkdown`/`renderMarkdown` from extensions
- Paths from mdast → PM and PM → mdast are defined in `handlers.ts` and `to-markdown-handlers.ts`, keyed by mdast type and PM node name — NOT looked up from extensions
**Status:** CONTRADICTED
**Suggested resolution:** The factory should only produce TipTap node schemas (`Node.create(...)`). All parse/serialize logic lives in the unified pipeline handlers.

---

### [H3] The current `jsxComponent` node uses `sourceRaw` byte-identity, a fundamentally different round-trip strategy than T1 SPEC assumes

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** T1 §2 "Tertiary: Observer sync is transparent", §3.5 "Parse (Markdown → ProseMirror)"
**Issue:** T1 SPEC assumes round-trip stability comes from "serialize(parse(jsx)) === jsx byte-for-byte" via a custom tokenizer that re-emits JSX from parsed attrs. Main achieves byte-identity via `sourceRaw` — the position-slice walker attaches the raw source string to `node.data.sourceRaw`, and the PM node's `content` attribute stores that raw string verbatim. On serialize the node is emitted as raw HTML directly. This means restructuring the node's attrs (the whole point of Layer 2) breaks the current byte-identity contract unless the new handler generates a fresh MDX JSX mdast subtree.
**Current text (T1 §4 Phase 0 step 5a):** *"For every production-shape JSX input, assert `serialize(parse(jsx)) === jsx` byte-for-byte — NO `.trim()` normalization."*
**Evidence:**
- `packages/core/src/markdown/index.ts:419-436` — handlers.mdxJsxFlowElement reads `data.sourceRaw` and stores it directly in `content` attribute
- `packages/core/src/markdown/index.ts:590-596` — jsxComponent node handler emits `{ type: 'html', value: pmNode.attrs.content }` — zero re-synthesis
- `packages/core/src/markdown/handlers.mdx.test.ts:55` — *"Paired components with children require handling mdxJsxFlowElement children... **Deferred until schema supports children.**"* — the current pipeline explicitly punts on the exact problem T1 Layer 3 is trying to solve
**Status:** CONTRADICTED (byte-identity strategy on main is different) + INCOHERENT if T1 SPEC is merged as-is
**Suggested resolution:** Either (a) keep raw-source byte-identity for Layer 2 (store componentName + primitive prop attrs AND retain sourceRaw for serialize) or (b) switch serialize to full mdast re-synthesis via `mdxJsxFlowElement` with structured children. Option (b) is the real Layer 3 plan. Both options require rewriting the mdxJsxFlowElement handler.

---

### [H4] The `rebase/typed-component-nodes` branch is NOT actually rebased onto the post-migration main — it is stuck on pre-PR-#83 main

**Category:** FACTUAL
**Source:** T1 (own codebase) + git state
**Location:** The rebase branch itself (and the e61cfa1f session's "fix-pr23-post-merge" label)
**Issue:** The branch called `rebase/typed-component-nodes` last pulled main on 2026-04-11 12:28 UTC. PR #83 (markdown engine migration) landed 2026-04-13 05:41 UTC — **two days later**. The rebase branch therefore still contains the old `marked` dep, `@tiptap/markdown` dep, and `jsx-tokenizer.ts` files that were deleted from main by PR #83. The branch is 115 commits behind main, missing PRs #83, #94, #95, #98, #101, #99, #39 (Timeline), #112 (image upload), #111, #110, #109, #116, #117, and others.
**Evidence:**
- `git merge-base --is-ancestor ee030b5 rebase/typed-component-nodes` → NO (PR #83 not in rebase branch)
- `git merge-base --is-ancestor 6887d34 rebase/typed-component-nodes` → NO (PR #101 not in rebase branch)
- `git rev-list --count origin/main...rebase/typed-component-nodes` → `115 60` (115 main-only, 60 rebase-only)
- `grep '"marked"' packages/core/package.json` on rebase branch → present (`"marked": "^18.0.0"`)
- `ls packages/core/src/extensions/jsx-tokenizer*` on rebase branch → files present
- Rebase branch still has no `packages/core/src/markdown/` directory (the unified pipeline lives there on main)
**Status:** STALE
**Suggested resolution:** The "rebase" that e61cfa1f did was a rebase onto PR #51 (slash-cmd-generalization), not onto the post-#83 main. The actual rebase onto current main was never attempted.

---

### [H5] T1 SPEC assumes `packages/core/src/extensions/jsx-component.ts` is the single schema site — current main has 10+ fidelity extensions that interact with jsxComponent schema

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** T1 §3.3 "Current (Layer 1)", §3.3 Location clause, §4 Phase 1 step 0 (9-site schema construction refactor)
**Issue:** T1 SPEC lists 9 sites where `getSchema(sharedExtensions)` is called and must be deferred until manifest loads. Main's `sharedExtensions` array in `packages/core/src/extensions/shared.ts` now contains 13 extensions including `EmphasisFidelity`, `StrongFidelity`, `CodeBlockFidelity`, `HeadingFidelity`, `HardBreakFidelity`, `HtmlBlockFidelity`, `LinkFidelity`, `LinkRefDefFidelity`, `ThematicBreakFidelity`, `List`, `ListItem`, `EscapeMark`, `WikiLink` — none of which existed when T1 SPEC was written. Several of these carry schema invariants (D15, D16, D17, D20 in CLAUDE.md) that interact with how rich-text children are serialized. Any Layer 3 content-spec change that introduces children must respect those invariants.
**Current text (T1 §3.3):** *"Current (Layer 1) — `packages/core/src/extensions/jsx-component.ts`: addAttributes() { return { content: { default: '' } }; }"* [unchanged — still accurate as of current main]
**Evidence:**
- `packages/core/src/extensions/shared.ts` on main — imports EscapeMark, EmphasisFidelity, StrongFidelity, CodeBlockFidelity, HeadingFidelity, HardBreakFidelity, HtmlBlockFidelity, LinkFidelity, LinkRefDefFidelity, ThematicBreakFidelity, List, ListItem, WikiLink (none of these existed at baseline 12f49c9)
- CLAUDE.md (main) §Storage-layer fidelity contract § I1-I7 invariants + NG1-NG11 irreducible gaps — behavior that T1 Layer 3 children serialization must preserve
**Status:** STALE (list of sites and invariants is incomplete)
**Suggested resolution:** Any revised SPEC must enumerate the full current set of fidelity extensions and run the 7-invariant PBT suite in Phase N QA.

---

### [H6] T1 §4 Phase 1 Step 0 lists 9 schema-construction sites that must be refactored — current main has materially different files; at least one site no longer exists

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** T1 §4 Phase 1 Step 0 table
**Issue:** Table lists e.g. `packages/app/src/editor/observer-sync.test.ts:20` (site 3), `packages/app/src/server/agent-flow.test.ts:24` (site 5), etc. Main has `bridge-matrix.test.ts`, many added stress tests, fidelity tests, and restructured observer files — the 9-site list is no longer an accurate census.
**Evidence:**
- `packages/app/src/editor/observer-sync.test.ts` — still exists but likely different line
- `packages/app/src/server/agent-flow.test.ts` — exists on main
- Main also has `packages/app/tests/integration/bridge-matrix.test.ts`, `packages/app/tests/fidelity/*.test.ts`, `packages/app/tests/stress/*` — all containing `getSchema(sharedExtensions)` or `new MarkdownManager({ extensions })` call sites
- CLAUDE.md lists `bun run check:full:parallel` as the canonical full-suite gate — not present when T1 SPEC was written
**Status:** STALE
**Suggested resolution:** Rerun the scan on current main before any implementation plan is finalized. Expect the true site count to be higher than 9.

---

### [H7] T3 baseline commit 41cee87 is no longer on origin/main — the branch is 67 behind main and includes neither PR #83 nor subsequent PRs

**Category:** FACTUAL
**Source:** T3 (own codebase) + git state
**Location:** T3 SPEC header (Baseline commit)
**Issue:** T3 declares baseline `41cee87 (finalized — includes PR #51 pluggable slash commands, PR #50 multi-file documents, PR #48 Floating UI polish, research-grounded SideMenu architecture + "/" trigger pattern)`. `41cee87` is on the `worktree-block-editor-ux` branch (a descendant of pre-#83 main). Current main is `db8a6d6`, 67 commits ahead of T3's branch and — more importantly — on a completely different parsing-pipeline foundation.
**Evidence:**
- `git worktree list` — block-editor-ux branch is 103 ahead / 67 behind main
- T3 SPEC §3.2 cites node type name `jsxComponentEditable` (line 110) and parent detection `parent.type.name === 'jsxComponentEditable'` (line 114) — this node type doesn't exist on main (main has `jsxComponent`, and T1's new `jsxComponentEditable` / `jsxComponentVoid` split doesn't exist anywhere yet)
- `@tiptap/extension-drag-handle-react` (cited as T3's §3.1 foundation) is not installed on main
**Status:** STALE (baseline is stale + depends on T1 which isn't on main)
**Suggested resolution:** T3 is architecturally intact at the product-requirement level (it's pure view-layer UX), but every code-level reference in the SPEC (node names, file paths, extension installs) needs to be re-grounded against whatever T1 lands on the new pipeline.

---

## Medium Severity

### [M1] T1 SPEC's D7 decision (acorn + acorn-jsx for prop extraction) is now redundant — remark-mdx already supplies structured attrs on `mdxJsxFlowElement.attributes`

**Category:** FACTUAL
**Source:** T1 (own codebase) + T3 (remark/mdast ecosystem)
**Location:** T1 §3.4 "Resolved (D7): acorn + acorn-jsx for JSX parsing"
**Issue:** T1 SPEC adds `acorn` + `acorn-jsx` (23KB gzipped) to parse JSX content strings into structured attrs. Main's remark-mdx already exposes `node.attributes: Array<MdxJsxAttribute>` with name/value/expression decomposition on every `mdxJsxFlowElement`. No secondary JSX parser is needed — the structured data is already one field access away.
**Evidence:**
- `mdast-util-mdx-jsx` types (`packages/core/src/markdown/mdast-augmentation.ts`, `packages/core/src/markdown/handlers.mdx.test.ts`) — attributes array is part of the mdast node
- Current `mdxJsxFlowElement` handler at `index.ts:429-436` has access to `node.attributes` but currently ignores it and stashes `sourceRaw`
**Status:** STALE
**Suggested resolution:** Drop the acorn dependency. Read `node.attributes` directly from mdast. Use the structured attrs to populate typed PM node attributes at parse time.

---

### [M2] T1 §2 Tertiary observer-sync claims reference commits (9f215ef, 99ea308, b289cc6) that are on a divergent branch, not current main

**Category:** COHERENCE / FACTUAL
**Source:** L3 (Missing conditionality) + T1 (own codebase)
**Location:** T1 §2 Tertiary ("Both observers are LOCAL-ONLY. As of commits 9f215ef + 99ea308…")
**Issue:** These SHAs are from the pre-migration branch and may or may not correspond to commits on current main (the post-migration observer code in `packages/app/src/editor/observers.ts` is materially different — handles `transaction.local`, typing-defer, `lastSyncedXmlMd` baseline refresh, and integrates with the fidelity layer).
**Status:** UNVERIFIABLE from SHA alone — the behavior claims may still hold; the citation is stale
**Suggested resolution:** Re-verify the "both observers skip remote transactions" claim against current `observers.ts` on main. Update SHAs or replace with behavior references (`packages/app/src/editor/observers.ts:247`-area).

---

### [M3] T1 SPEC's `unregistered fallback` as a `contentEditable={false}` void node is coherent but overlaps with main's current `jsxComponent atom` behavior — resolution requires defining the split on the new pipeline

**Category:** COHERENCE
**Source:** L1 (cross-finding contradictions)
**Location:** T1 §3.9 (JsxComponentView Evolution) + §3.8 (Unregistered Component Fallback)
**Issue:** Current main's jsxComponent is already `atom: true` (void). Main's behavior = T1's proposed "unregistered fallback." The registered-component path (Layer 2/3) becomes the new case. Splitting the node into `jsxComponentEditable` + `jsxComponentVoid` would be a schema change that can't be done without a coordinated rewrite across `handlers.ts`, `to-markdown-handlers.ts`, the fidelity-extension schema parity check, and the mdxJsxFlowElement handler. T1 SPEC doesn't flag this integration.
**Status:** INCOHERENT when read against current main (not when read in isolation)
**Suggested resolution:** Decide up-front whether Layer 2/3 extends the existing jsxComponent node with optional children content (single-node approach) or forks into two nodes (two-extension approach). The two-node approach as SPEC'd adds integration surface without obvious payoff in the remark-mdx world.

---

### [M4] T3 §3.4 "Escape key priority chain" item 2 references `wiki-link-suggestion` as a separate plugin — post-PR #53 it's the same `@tiptap/suggestion` plumbing as the slash command, sharing all handlers

**Category:** FACTUAL
**Source:** T3 (own codebase)
**Location:** T3 §3.4 (Escape priority chain, item 2: "If wiki-link suggestion is open → Escape closes the wiki-link menu (custom `wikiLinkSuggestionKey` plugin handler wins — triggers on `[[`, separate from slash command)")
**Issue:** PR #53 (wiki-link-suggestion migration, merged 4-12) migrated the wiki-link suggestion from a custom ProseMirror plugin to `@tiptap/suggestion` to match the pattern PR #51 established. There's no longer a `wikiLinkSuggestionKey` plugin; both slash-command and wiki-link-suggestion run through the same Suggestion plugin with different `char` triggers.
**Evidence:** `specs/2026-04-11-wiki-link-suggestion-migration/SPEC.md` on main, PR #53 merged state.
**Status:** STALE
**Suggested resolution:** T3's escape chain needs to collapse items 1 and 2 — one Suggestion-plugin Escape handler covers both menus.

---

## Low Severity

### [L1] T1 §3.6 typing-defer protocol references `@/editor/observers` path aliasing — alias still works on main but should be spot-verified

**Category:** COHERENCE
**Source:** L7 (source attribution)
**Location:** T1 §3.6 "imported from `@/editor/observers`"
**Issue:** Minor — verify vite.config.ts on main still aliases `@/` → `packages/app/src/`.

---

### [L2] T3 SPEC references `reports/block-editor-component-ux-patterns/` with "12 evidence files" — count unverified but likely matches

**Category:** L7
**Location:** T3 §1 Complication
**Status:** UNVERIFIABLE (didn't count), **LOW PRIORITY**

---

## Confirmed Claims (summary)

- **T1 §2 Primary/Quaternary success criteria** — still reflect sound product goals; pure UX language, no dependency on the obsolete pipeline.
- **T1 §3.1 three-way registry split** — still architecturally sound and package-boundary-safe on main (core React-free constraint still holds; `packages/core/` still has no React imports).
- **T1 §3.4 ProseMirror content-hole design for Layer 3** — correct; this is the pattern remark-mdx explicitly defers (see `handlers.mdx.test.ts:55` comment).
- **T1 §3.7 slash command items for component insertion** — implemented on the rebase branch as `component-items.ts`; directly portable to main's `slash-command/items.ts` pluggable API (PR #51).
- **T3 §3.1 SideMenu (BlockNote pattern)** — product direction is sound; the `@tiptap/extension-drag-handle-react` foundation needs to be installed on main.
- **T3 §3.2 child badge suppression** — logic intact; parent-detection via doc.resolve still works.
- **T3 §3.3 "+"-insertion pattern** (vendor-endorsed by TipTap's SlashCommandTriggerButton) — valid and works on main's pluggable slash-cmd.
- **T3 §3.4 keyboard navigation** — ProseMirror-level design is unaffected by the parsing migration; Esc-priority chain needs one correction (M4).

## Unverifiable Claims

- Performance claims in T1 (<1s cold extraction for 15 built-ins) — depends on `react-docgen-typescript` + disk speed, not re-verified.
- T3 quantitative competitive-research claims (85% of editors have X, 90% have Y) — references `reports/block-editor-component-ux-patterns/` which was not re-read in this audit.
