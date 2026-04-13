# Markdown Engine Migration: marked + @tiptap/markdown → unified + remark + remark-prosemirror + micromark

**Status:** Ready for implementation — pre-flight probe (R1/D3 hard gate) PASSED 2026-04-12 (97/118 whitespace-only fidelity, 12/13 P0 entity/escape, all 6 hard gates green)
**Owner(s):** engineering (TBD)
**Last updated:** 2026-04-12
**Baseline commit:** 39fcd87
**Links:**
- Prior research: [reports/tokenizer-comparison-micromark-vs-marked/REPORT.md](../../reports/tokenizer-comparison-micromark-vs-marked/REPORT.md) — the greenfield comparison that concluded remark wins
- Prior research: [reports/markdown-roundtrip-fidelity-tiptap/REPORT.md](../../reports/markdown-roundtrip-fidelity-tiptap/REPORT.md) — 118-case empirical comparison
- Prior research: [reports/markdown-construct-fidelity-catalog/REPORT.md](../../reports/markdown-construct-fidelity-catalog/REPORT.md) — the 118-case catalog
- Prior research: [reports/mdx-crdt-roundtrip-fidelity/REPORT.md](../../reports/mdx-crdt-roundtrip-fidelity/REPORT.md) — MDX round-trip through remark-mdx
- Prior research: [reports/full-stack-pm-crdt-markdown-editor-ideal/REPORT.md](../../reports/full-stack-pm-crdt-markdown-editor-ideal/REPORT.md) — full-stack schema validation across 6 library dimensions (D1-D6)
- **Pre-flight probe (R1 gate — PASSED):** [tech-probes/r1-preflight-gate/REPORT.md](../../tech-probes/r1-preflight-gate/REPORT.md) — 97/118 whitespace-only fidelity, 12/13 P0 entity/escape, all 6 hard gates pass
- Probe: [tech-probes/wiki-link-micromark/REPORT.md](../../tech-probes/wiki-link-micromark/REPORT.md) — wiki-link micromark extension FEASIBLE (20/20 test cases pass)
- Probe: [tech-probes/plugin-ordering/REPORT.md](../../tech-probes/plugin-ordering/REPORT.md) — parser-plugin order is empirically commutative
- Predecessor spec: [specs/2026-04-11-markdown-source-text-fidelity/SPEC.md](../2026-04-11-markdown-source-text-fidelity/SPEC.md) — the fidelity spec that established the current patched-marked architecture
- Evidence: [evidence/](./evidence/)

> **Note on the tokenizer-comparison report link above:** the `reports/tokenizer-comparison-micromark-vs-marked/` report lives in the sibling `markdown-source-text-fidelity` worktree. **Pre-merge action (Q15):** either land it on `main` via a tiny separate PR before the migration PR merges, or copy it into this worktree as part of the migration PR. Either resolves the link. Do NOT merge the migration PR with the dangling reference.

---

## 1) Problem statement

**Situation.** Our markdown parse/serialize engine is `marked + @tiptap/markdown` with an accumulating layer of custom code compensating for the fact that neither library was designed for byte-exact source-text fidelity: a `bun patch` on vendor source modifying `encodeTextForMarkdown` + `parseInlineTokens`, a custom `jsx-tokenizer.ts` (because marked has no MDX support), a `frontmatter.ts` strip/prepend wrapper (because @tiptap/markdown has no frontmatter support), 11 fidelity extensions extracting authoring-form attributes from marked's `token.raw` field, plus tight/loose-list workarounds. The patched pipeline achieves 77/118 whitespace-only round-trips and passes the fidelity test suite — but the custom code is tech debt we own forever.

**Complication.** We're a knowledge platform with **greenfield data** (no stored documents to migrate, Y.Docs are ephemeral rebuilt from markdown-on-disk) but **brownfield behavior contracts** (695 passing fidelity tests, 7 invariants at 1000 PBT runs, an 118-case catalog, an observer sync layer built against the current pipeline). `no-deferred-tech-debt` is a stated principle, and MDX components are in the product roadmap (confirmed by the existing `jsx-tokenizer.ts` and the `mdx-crdt-roundtrip-fidelity` report). The prior architectural decision chose the patch path under a **brownfield** frame — "we already have @tiptap/markdown integrated, patching is cheaper than migrating." The comparison report concluded that in a **greenfield** frame, `unified + remark + @handlewithcare/remark-prosemirror + micromark` is architecturally better on every axis except empirically-tested fidelity-on-our-118-catalog (which hasn't been measured yet through a live remark pipeline). Specifically the remark stack delivers: 100% CommonMark compliance via micromark (vs ~90%+ marked at v4.2.3 per markedjs/marked#1202, with weak Images 68% / Links 83% categories that happen to be our fidelity pain points; current marked home page claims 98% at latest, but @tiptap/markdown@3.22.3 pins an older marked version — exact version to be confirmed in the probe), first-class MDX via remark-mdx (deletes our custom tokenizer), first-class frontmatter via remark-frontmatter (deletes our wrapper), principled handler-override extensibility (deletes the bun patch), first-class reference-link round-trip via mdast `linkReference` + `definition` nodes (fixes a broken-in-current-stack feature), remark-rehype bridge for future HTML output interop, and industry alignment with Docusaurus, Astro, Next.js MDX, Milkdown, BlockNote, Prettier.

**Resolution (subject to the pre-flight probe passing Q1+Q2 AND full-suite R13 gate; see §6 R1).** Migrate the markdown engine to the unified+remark stack. Keep every other layer unchanged (CRDT, editor bindings, observer sync, persistence, ProseMirror schema). The public `parse()` / `serialize()` API of `MarkdownManager` stays the same — only its internals are rewritten to delegate to a unified pipeline. 10 of 11 fidelity extensions keep their PM schema + attributes but lose their `parseMarkdown`/`renderMarkdown` methods (those move to a parallel `markdown/handlers.ts` registered with remark-prosemirror + mdast-util-to-markdown). `ListItemFidelity` is deleted entirely. `jsx-tokenizer.ts` is deleted. `frontmatter.ts` wrapper is deleted. The bun patch is deleted. Wiki-link is ported from a marked tokenizer extension to a micromark tokenizer extension. **This migration is gated by a pre-flight 118-case fidelity probe** that must demonstrate ≥77/118 whitespace-only round-trips plus all 13 P0 entity+escape cases passing before any production migration code is written.

## 2) Goals

- **G1.** Delete the bun patch on `@tiptap/markdown` vendor source. The one remaining vendored patch (`@handlewithcare/remark-prosemirror` PR #3 per R20/D18) is upstream-pending and cleanly removable once merged — it is a transitional mitigation, not structural tech debt.
- **G2.** Delete the custom `jsx-tokenizer.ts` (all 3 version variants). MDX support becomes a library concern via `remark-mdx`.
- **G3.** Delete the `frontmatter.ts` strip/prepend wrapper. Frontmatter becomes a first-class mdast node via `remark-frontmatter`.
- **G4.** Achieve byte-exact source-text fidelity equal to or better than the current patched @tiptap/markdown pipeline on the 118-case catalog. **Acceptance:** ≥77/118 whitespace-only round-trips through the new pipeline, **zero cases in the `old-stack: pass / new-stack: fail` regression bucket** (enforced via R1 per-case delta + R23 fixes for any identified regressions), all 13 P0 entity + backslash-escape cases pass, all 7 fidelity invariants (I1-I7) hold at 1000 PBT runs.
- **G5.** Enable first-class reference-link round-trip via mdast `linkReference` + `definition` nodes. **Acceptance:** `[text][label]` followed by `[label]: url` round-trips byte-identically (currently broken in our stack — renders reference links as inline).
- **G6.** Preserve the public `parse(markdown: string) → JSONContent` and `serialize(json: JSONContent) → string` API so that observers.ts, persistence.ts, agent-sessions.ts, external-change.ts, standalone.ts, and test-harness.ts require zero call-site changes.
- **G7.** Align with the industry-standard markdown pipeline (Docusaurus, Astro, Next.js MDX, Milkdown, BlockNote, Prettier all use unified+remark). Downstream: enables future `remark-rehype` HTML output, shared Shiki highlighting with docs site, Prettier-based markdown formatting.
- **G8.** The migration ships as a single atomic PR with `bun run check` green, all 695 fidelity tests passing, 118-case catalog pass rate match-or-beat current, and the pre-flight probe evidence attached.

## 3) Non-goals

- **[IN SCOPE] NG1 → D15-D17:** ~~Changing the ProseMirror schema~~ **Schema changes ARE in scope** per D15-D17: unified list (replaces 5 TipTap list-related extensions with a single `list`+`listItem` wrapping `prosemirror-flat-list`), mdast-canonical mark names (`bold`→`strong`, `italic`→`emphasis`), mdast-canonical block names (`horizontalRule`→`thematicBreak`). Wiki-link is already an inline atom node (no change needed). All fidelity attrs are already flat primitives (no change needed). See §17.
- **[NEVER] NG2:** Changing the CRDT layer, Hocuspocus, HocuspocusProvider, Y.Doc, Y.XmlFragment, Y.Text, or the observer sync mechanics (origin guards, typing defer, remote grace, bridge invariant, self-write detection).
- **[NEVER] NG3:** Changing the TipTap editor, CodeMirror source editor, or their bindings. Collaboration extension + yCollab stay as-is.
- **[NEVER] NG4:** Changing the persistence layers (L1 CRDT→disk, L2 disk→git, file watcher + self-write detection, agent session manager).
- **[IN SCOPE] NG5 → R19:** ~~Changing which extensions exist~~ **List extensions are replaced:** `BulletListFidelity`, `OrderedListFidelity`, `ListItemFidelity`, `@tiptap/extension-list`'s `TaskList`/`TaskItem` — all 5 replaced by a custom unified-list extension wrapping `prosemirror-flat-list` (see R19). Dead-weight `@tiptap/extension-task-list` swept. **Three extensions renamed per D16/D17** (`BoldFidelity`→`StrongFidelity`, `ItalicFidelity`→`EmphasisFidelity`, `HorizontalRuleFidelity`→`ThematicBreakFidelity`) — schema name change but same functional role. All other extensions (heading, table, image, highlight, etc.) are unchanged — only their markdown dispatch methods move.
- **[NOT UNLESS] NG6:** Adopting remark-rehype / hast interop in this migration. **Only if:** a concrete use case (Shiki highlighting for source mode, or docs-site sharing) materializes. The migration enables this but does not require it.
- **[NOT UNLESS] NG7:** Adopting remark-lint, remark-slug, remark-autolink-headings, remark-toc, or other opportunistic remark plugins. **Only if:** user surface demand emerges. Migration enables, does not require.
- **[NOT UNLESS] NG8:** Adopting remark-math, remark-github-blockquote-alert, remark-definition-list. **Only if:** the feature enters the product roadmap. Migration keeps the pipeline extensible for these. (`remark-directive` is **IN SCOPE** from day one per D12 — see R3; it is *not* part of NG8.)
- **[NOT NOW] NG9:** Changing the fidelity attributes on ProseMirror nodes/marks (emphDelimiter, bulletMarker, etc.). The attributes are the correct storage for authoring intent and stay.
- **[NOT NOW] NG10:** Changing the 118-case fidelity catalog or the 7 invariant tests or the PBT arbitraries. Test infrastructure remains; only the `mdRoundTrip` helper is rewired to use the new pipeline.
- **[NOT NOW] NG11:** Building a compat shim to run both stacks in parallel during migration. Single atomic PR; the pre-flight probe (on a branch, not in production) serves as the compat validation.

## 4) Personas / consumers

**P1 — Markdown author** (unchanged from predecessor spec). Writes/edits markdown via WYSIWYG, source mode, or external editor. Expects round-trip byte-fidelity on characters they typed. **Migration impact:** none — same fidelity guarantees preserved.

**P2 — Agent (LLM + MCP/HTTP)** (unchanged). Reads markdown via `/api/document`; writes via `/api/agent-write-md`; patches via `/api/agent-patch`. **Migration impact:** none — same API surface, same fidelity.

**P3 — Reviewer / git user** (unchanged). Runs `git diff` on `.md` files. Expects clean diffs. **Migration impact:** possibly improved — reference-link round-trip fixes a current noise source.

**P4 — Next contributor to the observer / markdown pipeline** (UPDATED). Inherits the markdown pipeline. **Migration impact:** significantly simpler mental model — one unified pipeline instead of marked+@tiptap/markdown+patches+custom-tokenizer, with industry-standard libraries instead of vendored patches.

**P5 — Docs site reader** (unchanged). Consumes rendered markdown via Fumadocs/MDX. **Migration impact:** none for current path; migration enables future shared Shiki highlighting if pursued.

**P6 — MDX author (SPRINT GOAL — confirmed explicit by user).** Writes markdown with embedded JSX components. **Migration impact:** this migration is the **prerequisite for MDX support this sprint.** Without it, our custom `jsx-tokenizer.ts` handles only the limited subset of JSX we wrote it for — nested fragments, member expressions `<Foo.Bar>`, spread attributes, expression props, and import/export blocks are all unsupported. `remark-mdx` delivers all of them as first-class citizens. The migration is sequencing-critical: we cannot ship full-featured MDX on the current jsx-tokenizer stack. **Scope boundary:** this spec covers the markdown engine's MDX parse/serialize support (the infrastructure); the MDX UX (WYSIWYG component picker, props editor, component library) is a separate follow-on spec that this spec unblocks.

## 5) User journeys

**J1 (P1 author):** Same as predecessor spec J1 — types `# H&M Store`, expects byte-identical on save/reload. **Migration preserves this.**

**J2 (P2 agent):** Same as predecessor spec J2 — agent writes markdown, patches via find/replace. **Migration preserves this.**

**J3 (P3 reviewer):** Same as predecessor spec J3 — clean `git diff` reflecting actual content changes. **Migration may improve this** (reference links stop drift).

**J4 (P4 contributor):** Opens `packages/core/src/markdown/pipeline.ts`, sees a unified pipeline construction. Opens `packages/core/src/markdown/handlers.ts`, sees parseMarkdown/renderMarkdown-equivalent handlers keyed on mdast node types. Adds a new mdast node type by writing a handler; doesn't need to patch vendor source or write a custom marked tokenizer. **Migration improves J4 significantly.**

**J5 (P5 docs reader):** Same as predecessor.

**J6 (P1 author, reference-link round-trip — previously broken):** Writes `Visit [docs][api-docs] for details.\n\n[api-docs]: https://example.com`. On save/reload, the reference-link form is preserved, not normalized to inline. **Migration fixes this gap.**

**J7 (P6 MDX author, sprint goal):** Writes `<Callout type="info"><Icon name="info" /> This is **important**.</Callout>` in source mode (or via a WYSIWYG inserter). Content round-trips byte-identically. Nested components, member expressions (`<Docs.Link>`), expression attributes (`type={variant}`), and import/export blocks all work without custom tokenizer code. **Migration delivers this.**

## 6) Requirements

### Functional

| # | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| **R1** | P0 | Pre-flight fidelity probe (gates migration code) | Run 118-case catalog through live `unified + remark-parse + remark-gfm + remark-frontmatter + remark-mdx + remark-directive + remarkProseMirror + remark-stringify` pipeline with custom delimiter-preserving handlers. Target: ≥77/118 whitespace-only. **Additionally (amendment from final challenger):** materialize a per-case delta between old-stack and new-stack results. Cases that are `old: pass / new: fail` are **regressions** (hard block — must be scoped as in-migration fixes per R23). Cases that are `old: fail / new: fail` are pre-existing, acceptable. Cases that are `old: fail / new: pass` are improvements. Aggregate "match-or-beat" alone is insufficient — per-case diff is the gate. Verify all 13 P0 entity + backslash-escape cases pass. Prototype wiki-link as a micromark extension. **STATUS:** completed 2026-04-12 — 97/118 aggregate + 12/13 P0. Per-case analysis surfaced 2 new-ERROR regressions scoped by R23. |
| **R2** | P0 | Internal rewrite of `MarkdownManager` | New implementation wraps a unified pipeline factory. Public API stays: `parse(markdown: string) → JSONContent`, `serialize(json: JSONContent) → string`. All call sites (observers, persistence, agent-sessions, external-change, standalone, test-harness) require zero changes. |
| **R3** | P0 | Unified pipeline composition | Pipeline registers: remark-parse, remark-gfm, remark-frontmatter, remark-mdx, remark-directive (registered day one per D12), remarkProseMirror (for parse direction). Reverse chain for serialize: fromProseMirror, remark-stringify with custom mdast-util-to-markdown handlers. |
| **R4** | P0 | Per-node source-form preservation handlers | Custom `mdast-util-to-markdown` handlers override defaults for: emphasis (reads emphDelimiter attr), strong (reads strongDelimiter attr), code (reads fenceDelimiter + fenceLength attrs), list (reads bulletMarker or listMarkerDelim attrs), thematicBreak (reads hrRaw attr). Each handler reads PM attr via node.data; falls back to remark-stringify default when attr missing. |
| **R5** | P0 | Position-slice delimiter recovery + backslash-escape preservation | **(a) Delimiter recovery:** parse-direction helper walks mdast before remarkProseMirror dispatch, slices original source at `node.position.start.offset` to recover delimiters mdast drops (emphasis marker, bullet char, fence char, atx/setext, etc.), attaches to `node.data.*`. **(b) Backslash-escape preservation (surfaced by R1 probe — `text \# more` round-trips to `text # more` because mdast consumes the backslash):** PM `text` runs whose source range contained a backslash escape carry a PM-level **`escapeMark`** (per D20). The mark is applied by the position-slice walker based on source inspection; the serialization handler emits the backslash back on round-trip. **(c) Coverage verification:** extend the position-walker check to all 118 catalog cases (not just the 9 probe samples) during R19's first commit, report any nodes with missing or out-of-bounds position data, verify the fallback-to-default path. |
| **R6** | P0 | remark-prosemirror handlers — 3 tiers | **Tier A — Passthrough registrations:** `root`, `paragraph`, `text`, `blockquote`, `table`, `tableRow`, `tableCell`, `image`, `imageReference`, `inlineCode`, `delete` (GFM), `containerDirective`, `leafDirective`, `textDirective` (directives). Standard `toPmNode(schema.nodes.X!)` calls with no custom logic. **Tier B — Fidelity handlers:** `emphasis`, `strong`, `heading`, `code`, `thematicBreak`, `break`, `list`, `listItem`. Each reads `node.data.*` fields populated by position-slice walker (R5) and maps to PM fidelity attrs (`sourceDelimiter`, `bulletMarker`, `sourceFenceChar`, `sourceFenceLength`, `sourceStyle`, `sourceRaw`). Falls back to remark-stringify defaults when `node.data` missing. **Tier C — Custom/simplified handlers:** `link` (reads native `href`/`title`; reference-style detection is a direct field read — mdast provides `linkReference.referenceType` natively, replacing regex in current LinkFidelity), **`definition`** (CRITICAL: library pre-ignores — must override; maps to `linkDefinition` PM atom per R12), `html` (simplified — no `token.block` filter needed; mdast `html` is block-level by position), `mdxJsxFlowElement`/`mdxJsxTextElement`/`mdxFlowExpression`/`mdxTextExpression`/`mdxjsEsm` (MDX nodes → PM atoms), `wikiLink` (custom type from micromark extension per R7). **Setup:** TypeScript module augmentation of mdast `Nodes` type for custom types. Pre-ignored types: `yaml`, `toml` (correct — frontmatter handled via Y.Map). **Net custom code decreases** — mdast eliminates ListItemFidelity paragraph-detection heuristic, LinkFidelity reference-link regex, and HtmlBlockFidelity block-filter logic. |
| **R7** | P0 | Wiki-link micromark extension | Port from current `wiki-link.ts` marked extension to a micromark tokenizer state machine + mdast-util extension (adds `wikiLink` node type) + remark-prosemirror handler (maps to the existing inline atom `wikiLink` PM **node** — not a mark; current `wiki-link.ts:63-65` is `inline: true, atom: true`). Tokenizes `[[Page]]`, `[[Page|Alias]]`, `[[Page#Heading]]`, `[[Page#Heading|Alias]]`. Preserves current wiki-link test coverage. |
| **R8** | P0 | MDX support via remark-mdx — enumerated acceptance | Register remark-mdx. Handler for `mdxJsxFlowElement` / `mdxJsxTextElement` maps to `jsxComponent` / `jsxInline` PM atoms; handler for `mdxFlowExpression` / `mdxTextExpression` / `mdxjsEsm` maps to their respective PM atoms. Delete `jsx-tokenizer.ts` (all 3 variants). **Acceptance (full attribute + child coverage — addresses the placeholder-passed-at-probe gap):** Each of the following MDX shapes must round-trip byte-identically, verified against the 22/23 cases from `reports/mdx-crdt-roundtrip-fidelity/`: (a) string literal attr `<X name="value" />`, (b) expression attr `<X name={value} />`, (c) multi-line object expression `<X data={{\n  key: value\n}} />` (must also satisfy I3 per mdx-js/mdx#2533), (d) spread attr `<X {...props} />`, (e) boolean shorthand `<X disabled />` (mdx-js/mdx#2608 — normalizes on first round-trip, then converges), (f) member expression tag `<Docs.Link />`, (g) self-closing vs paired `<X />` vs `<X></X>` (byte-identity on original form), (h) children — text, inline marks, nested components, block children. **Cross-reference:** R16(a) test coverage enumerates these same cases. |
| **R9** | P0 | Frontmatter via remark-frontmatter | Register remark-frontmatter with `['yaml']` (and optionally `'toml'`). Handler for mdast `yaml` node reads/writes our metadata Y.Map. Delete `frontmatter.ts` strip/prepend wrapper. Verify existing frontmatter tests pass incl. CRLF + empty-block cases. |
| **R10** | P0 | Delete bun patch | Remove `patches/@tiptap%2Fmarkdown@3.22.3.patch`. Remove `patchedDependencies` entry from `package.json`. Remove `@tiptap/markdown` and `marked` from direct dependencies. |
| **R11** | P0 | Delete ListItemFidelity + all list fidelity extensions | Subsumed by R19 (unified-list extension). `BulletListFidelity`, `OrderedListFidelity`, `ListItemFidelity` all deleted. Fidelity attrs (`bulletMarker`, `listMarkerDelimiter`, `spread`, `loose`) move to the unified `list`/`listItem` NodeSpec. Rendering logic moves to `listItem` mdast handler in `markdown/handlers.ts`. |
| **R12** | P0 | Reference-link round-trip | `[text][label]` + `[label]: url` round-trips byte-identically. **CRITICAL:** remark-prosemirror pre-ignores `definition` mdast nodes (source: `mdast-util-to-prosemirror.ts:215`). Must register an explicit `definition` handler that overrides the ignore and maps to `linkDefinition` PM atom node. Without this override, all `[label]: url` lines silently disappear. Covered by new invariant test case; `LinkFidelity`/`LinkRefDefFidelity` PM nodes coordinate via mdast's native `linkReference` + `definition` nodes. |
| **R13** | P0 | All kept fidelity + integration + stress + e2e tests pass | Test assertions unchanged for all KEPT tests. `mdRoundTrip` helper in `helpers.ts` + `test-harness.ts` rewired to new pipeline (2-file change propagating to 21 files). PBT arbitraries, invariant tests (I1-I7), CommonMark corpus (now a handler regression guard, not parser validation), GFM corpus, 118-case catalog, P0 entity/escape tests, bridge-matrix, conversion-fidelity, stress shards (s1-s9, s2, s4, s5-s6), fuzz, all 4 E2E (crdt-stress, paste-fidelity, ux-interactions, slash-command) all pass. Exception: `jsx-tokenizer-prototype.test.ts` is deleted (tests deleted code), and `jsx-component.test.ts` is rewritten (code-fence → native MDX). |
| **R14** | P0 | Y.Doc bridge invariant holds | `stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))` after every propagation path settles. Verified via existing bridge-matrix tests. |
| **R15** | P0 | Paste handler preserves behavior | `clipboardTextParser` in TiptapEditor.tsx routes text/plain through new `parse()` function. All 6 V1 Playwright paste baseline tests pass. |
| **R16** | P0 | TDD-aligned test coverage — per /tdd principles | **Test architecture:** All fidelity/integration/stress/e2e tests flow through 2 choke points (`tests/fidelity/helpers.ts` and `tests/integration/test-harness.ts`). Rewiring these 2 files propagates to 21 test files with zero assertion changes. **DELETE:** `jsx-tokenizer-prototype.test.ts` — tests a deleted module. **REWRITE:** `jsx-component.test.ts` — behavior changes from code-fence JSX (```` ```jsx-component ````) to native MDX (`<Component />`). **KEEP:** `frontmatter.test.ts` — `stripFrontmatter`/`prependFrontmatter` survive for observer sync. **IMPORT-ONLY REWIRE:** 21 test files change `@tiptap/markdown` → `@inkeep/open-knowledge-core`; zero assertion changes. **E2E:** 4 files unchanged — no pipeline coupling. **ADD new tests:** (a) MDX flow/text/expression/esm round-trip (22/23 cases from `mdx-crdt-roundtrip-fidelity` report), (b) MDX multiline expression I3 stability (mdx-js/mdx#2533 mitigation), (c) reference-link + definition round-trip (R12 — tests the `definition` handler override), (d) directive passthrough, (e) unified-list round-trip (bullet/ordered/task/nested), (f) mark-rename verification (`**bold**` → PM mark named `strong`), (g) position-slice delimiter recovery (`_emphasis_` stays `_` not `*`; `~~~` fences stay tildes; `+ item` stays `+`), (h) **escapeMark round-trip (D20)** — structurally-ambiguous escapes preserved on round-trip (`text \# more` stays `text \# more`; `\*literal\*` stays `\*literal\*`); **cross-mark composition** (`**bold\*word**` and `*em\*phasis*` round-trip byte-identically with `escapeMark` composed inside the surrounding mark); end-of-line trailing escape (`foo\` at line end) follows the documented NG rule (backslash drops, `foo`), (i) fail-fast on unknown mdast type (throws, not drops). **TDD principle: don't test library behavior.** Don't test remark-parse parses CommonMark (remark's own test suite does that). Don't test remark-mdx parses JSX. Don't test prosemirror-flat-list input rules. DO test: our handlers map correctly, our position-slice recovers delimiters, our fidelity attrs survive round-trip, our pipeline composes without silent data loss. CommonMark/GFM corpus tests stay as **handler regression guards** (lower-value than under marked since remark is 100% compliant, but handler bugs would still surface). |
| **R19** | P0 | Custom unified-list TipTap extension (`packages/core/src/extensions/list.ts`) | Wraps `prosemirror-flat-list@0.5.8`. Exposes `list` NodeSpec (attrs: `ordered`, `start`, `spread`, `bulletMarker`, `listMarkerDelimiter`) + `listItem` NodeSpec (attrs: `checked`, `spread`). Provides TipTap-idiomatic commands (`toggleBulletList`, `toggleOrderedList`, `toggleTaskList`) for existing UI callers (`slash-command/items.ts`, `bubble-menu/BlockTypeSelector.tsx`). Task checkbox NodeView. Input rules: `- `, `* `, `+ `, `1. `, `- [ ] ` → list. Keymap via flat-list's `createListKeymap`. **Tab/Shift-Tab accessibility gate (OQ1 — promoted to acceptance):** (1) Tab inside `listItem` indents, inside `tableCell` advances cells, inside `codeBlock` inserts a literal tab; Shift-Tab reverses each. (2) New Playwright keymap test covers all three surfaces (part of R16). (3) Manual screen-reader smoke pass noted in the migration PR comment. **R19 does not close until all three criteria pass.** Replaces: `BulletListFidelity`, `OrderedListFidelity`, `ListItemFidelity`, `@tiptap/extension-list`'s `TaskList`+`TaskItem`. |
| **R20** | P0 | remark-prosemirror PR #3 fix via bun patch | Apply `@handlewithcare/remark-prosemirror` PR #3 ("fix: Empty text nodes are not allowed" + whitespace preservation) as `patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch`. Pin exact version `0.1.5` in `packages/core/package.json`. Verify patch applies cleanly at install time via `patchedDependencies`. |
| **R21** | P0 | Schema renames (D16/D17) — full callsite audit | Rename `BoldFidelity`→`StrongFidelity` (schema name `strong`), `ItalicFidelity`→`EmphasisFidelity` (schema name `emphasis`), `HorizontalRuleFidelity`→`ThematicBreakFidelity` (schema name `thematicBreak`). **In scope — schema-level:** extension export names, file names, schema `name` field. **In scope — TipTap integration (surfaced by final challenger):** (a) `StarterKit.configure({ bold: false, italic: false, horizontalRule: false })` keys — the assertion is that these are TipTap extension keys (not schema names) and therefore **do NOT change** with the rename (extension keys stay `bold`/`italic`/`horizontalRule` since StarterKit's internal extensions keep their original names). **Grounding (per F4 amendment):** this is asserted from TipTap source-convention research, not a live smoke test. R21's smoke-test acceptance (below) IS the verification gate — if the assertion is wrong, the smoke test catches it before R21 closes. Optionally pre-flight as a 15-minute local script (import StarterKit, configure `{ bold: false }`, inspect `editor.schema.marks` and `editor.extensionManager.extensions`, confirm which name the key matches) and land as `evidence/starterkit-disable-key-verification.md`. (b) command names like `toggleBold()`, `toggleItalic()` — these target `this.name` in the extension body, so they correctly resolve to the renamed schema name on our fidelity extensions; (c) `editor.isActive('bold')` / `editor.isActive({ type: 'strong' })` callsites in `slash-command/items.ts`, `bubble-menu/BlockTypeSelector.tsx`, `PresenceBar`, etc. — MUST be updated to use the new schema names; (d) input rules (`**bold**`, `*italic*`, `---` → thematicBreak) — verify they still match since rules key off schema type, not mark name. **Acceptance:** smoke test the editor end-to-end after the rename: Cmd-B bolds, bubble menu highlights, serialization emits `**x**`, round-trip byte-identical. Land smoke results as evidence. |
| **R22** | P0 | Import path migration (26 files) | Change all `import { MarkdownManager } from '@tiptap/markdown'` to `import { MarkdownManager } from '@inkeep/open-knowledge-core'` across `packages/app` + `packages/server`. Add `export { MarkdownManager } from './markdown/index.ts'` to `packages/core/src/index.ts`. |
| **R23** | P0 | MDX-vs-autolink / MDX-vs-bare-HTML regression fix (surfaced by R1 probe per-case diff) | **Problem:** the R1 probe showed 2 cases that **pass** on the current stack now produce hard ERRORs on the new stack: (a) `Visit <https://example.com>.` — remark-mdx claims `<` as JSX start, crashes on `/`; (b) `Line one<br>Line two.` — remark-mdx expects closing tag for `<br>`. Both are commonly-written user content. **Acceptance options (pick one in implementation — `document as limitation` is NOT an option because G4 forbids `old: pass / new: fail` regressions):** **(i) Preprocess source before remark-mdx** — protect autolink-shaped `<url>` patterns and known-void HTML (`<br>`, `<hr>`, `<img>`) from JSX claiming. **Complexity flag (from challenger):** autolink-like content can appear INSIDE JSX children (`<Callout>see <https://example.com></Callout>`) — a naive preprocessor would break valid MDX. A preprocessor that distinguishes autolink-position from JSX-child-position effectively reimplements MDX tokenizer dispatch. Use with care or scope to block-level autolinks only. **(ii) Register a custom micromark extension that runs before mdx-jsx** — claim `<url>` and void-HTML-tags before mdx-jsx claims `<`. The wiki-link probe is only a partial precedent (wiki-link `[[` does not collide with `<`, so autolink/void-HTML protection is a different hazard class). A short R23 sub-probe is recommended to validate feasibility before locking. **Gate:** R1 probe re-run shows 0 cases in the `old: pass / new: ERROR` bucket. |
| **R17** | Should | Documentation update | Update `AGENTS.md` "Markdown Pipeline — System Design" section to reflect unified pipeline architecture. Update "Storage-layer fidelity contract" section. Add plugin registration order. Reference the new files (`packages/core/src/markdown/`). |
| **R18** | Should | Rollback path | If post-merge a critical regression surfaces (e.g., a 118-case we didn't probe starts corrupting content), a single-commit revert restores the patched @tiptap/markdown stack. This requires the migration to be a single atomic PR (no mixed-stack intermediate state in production). |

### Non-functional

- **Performance:** micromark is ~13× slower than marked on isolated tokenizer benchmarks, but our pipeline operates off the critical typing path (50ms debounced). Expected impact on document-save latency: single-digit ms on typical documents (<100KB). Acceptable. No specific throughput target; existing tests must pass within their timeouts.
- **Reliability:** same as predecessor spec — pinned exact versions, build-time assertion that expected mdast node types exist.
- **Security:** No storage-layer sanitization (NG same as predecessor). Entity corruption is already avoided. Potential new concern: remark's HTML block handling — investigate whether `html` mdast nodes are passed through raw (preserving fidelity) or escaped (possibly degrading). Included in pre-flight probe.
- **Cost:** Zero infra cost. Engineering time: dominated by the handler implementations; estimate ~2-3 weeks of focused work gated by the probe.

## 7) Success metrics & instrumentation

- **M1 — 118-case pass rate + per-case delta:** (a) aggregate whitespace-only diffs count — target **≥77/118** (match-or-beat); probe achieved 97/118. (b) **Per-case regression delta** — cases that are `old: pass / new: fail` must be zero. Probe identified 2 such cases (autolink, bare `<br>`) now scoped under R23. Measured by re-running the existing `reports/markdown-roundtrip-fidelity-tiptap/evidence/d2-ecosystem-comparison-118.md` probe harness through the new pipeline with side-by-side old/new verdict columns.
- **M2 — P0 hit list:** 13 entity + backslash-escape test cases from `packages/app/tests/fidelity/p0-entity-escape.test.ts`. Target: **13/13** pass.
- **M3 — PBT invariants:** I1-I7 at 1000 runs. Target: **7/7** green at default; **7/7** green at STRESS_FIDELITY=1 (10000 runs).
- **M4 — Reference link round-trip:** new test case — `[text][label]\n\n[label]: url "title"` serializes byte-identically. Target: **pass** (currently fails — renders inline).
- **M5 — Custom code footprint:** Net reduction in stack-specific custom code post-migration vs pre-migration. Expected shape: `jsx-tokenizer.ts`, `frontmatter.ts`, and three list-fidelity extensions deleted; bun patch on `@tiptap/markdown` deleted; ~8 fidelity handlers move from marked-token-reading to mdast-data-reading with similar complexity; link-reference regex and listItem paragraph-detection heuristic eliminated by mdast-native structure.
- **M6 — CI runtime:** `bun run check` end-to-end. Target: within 20% of pre-migration baseline (no regression).

## 8) Current state

- **Predecessor architecture documented in** `specs/2026-04-11-markdown-source-text-fidelity/SPEC.md` §8. Summary: marked@17 + @tiptap/markdown@3.22.3 + bun patch + 11 fidelity extensions + custom jsx-tokenizer + frontmatter wrapper.
- **Fidelity stats (patched current state):** 77/118 whitespace-only (baseline), 39 material diffs (most cosmetic), 695 fidelity tests passing, 7 invariants hold at 1000 PBT runs. *Probe measured 97/118 on the new stack — see §19.7.*
- **Extension architecture:** All 11 fidelity extensions extend `@tiptap/extension-*` originals preserving commands/shortcuts/input-rules, adding fidelity attributes.
- **Known gaps in current stack:**
  - Reference-link round-trip: BROKEN (renders inline regardless of source form) — documented in `LinkFidelity` source comment.
  - @tiptap/markdown issue #7258 OPEN upstream ~5 months (escape consumption). Our bun patch works around.
  - marked CommonMark compliance weakest in Images (68%) and Links (83%) — our fidelity pain points.

## 9) Proposed solution (vertical slice)

### Architecture overview

Single atomic PR migrating the markdown engine. Layered changes:

```
┌─────────────────────────────────────────────────────────────────────┐
│ UNCHANGED LAYERS (all 4 write surfaces + CRDT + editor + persistence)│
├─────────────────────────────────────────────────────────────────────┤
│  WYSIWYG (TipTap) │ Source (CodeMirror) │ Agent API │ File watcher   │
│         │                  │                │             │          │
│         ▼                  ▼                ▼             ▼          │
│    Y.XmlFragment ◄═════════════════════════════► Y.Text             │
│              Observer A / Observer B (unchanged)                    │
│         │                                                           │
└─────────┼───────────────────────────────────────────────────────────┘
          │ calls parse() / serialize() (public API unchanged)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ REWRITTEN INTERNALLY — MarkdownManager                              │
│                                                                     │
│  packages/core/src/markdown/                                        │
│    ├── pipeline.ts         unified pipeline factory                 │
│    ├── handlers.ts         remark-prosemirror + mdast-util-to-      │
│    │                       markdown custom handlers                 │
│    └── wiki-link-micromark.ts                                       │
│                                                                     │
│  Parse direction:                                                   │
│    remark-parse → remark-gfm → remark-frontmatter → remark-mdx →    │
│    remark-directive → wikilink micromark ext →                      │
│    delimiter-recovery walker (slices source@position.offset) →      │
│    remarkProseMirror (handlers map mdast → PM JSON)                 │
│                                                                     │
│  Serialize direction:                                               │
│    fromProseMirror (handlers map PM JSON → mdast) →                 │
│    remark-stringify + mdast-util-to-markdown with custom handlers   │
│    (emphasis, strong, code, list, thematicBreak read node.data)     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ EXTENSION LAYER — packages/core/src/extensions/                    │
│                                                                     │
│ KEPT (schema + attributes; parseMarkdown/renderMarkdown removed):   │
│   bullet-list-fidelity, ordered-list-fidelity, emphasis-fidelity,   │
│   heading-fidelity, code-block-fidelity, horizontal-rule-fidelity,  │
│   hard-break-fidelity, link-fidelity, html-block-fidelity,          │
│   link-ref-def-fidelity, jsx-component, wiki-link                   │
│                                                                     │
│ DELETED:                                                            │
│   list-item-fidelity.ts (plain ListItem suffices)                   │
│   jsx-tokenizer.ts (remark-mdx handles it, 3 version variants gone) │
│   frontmatter.ts (remark-frontmatter handles it)                    │
│                                                                     │
│ DELETED FROM patches/:                                              │
│   @tiptap%2Fmarkdown@3.22.3.patch                                   │
└─────────────────────────────────────────────────────────────────────┘
```

### Phasing (within one PR)

The PR is atomic, but internal commits follow a verifiable order:

1. **Commit 1: Dependencies.** Add `unified`, `remark-parse`, `remark-stringify`, `remark-gfm`, `remark-frontmatter`, `remark-mdx`, `remark-directive`, `@handlewithcare/remark-prosemirror` (pinned 0.1.5 + PR #3 bun patch per D18), `mdast-util-to-markdown`, `mdast-util-from-markdown`, `prosemirror-flat-list`, plus dev types. Remove `@tiptap/markdown`, `@tiptap/extension-list`, `@tiptap/extension-task-list` (D19). Remove old bun patch file; add new remark-prosemirror patch file. Update all 26 import paths from `@tiptap/markdown` → `@inkeep/open-knowledge-core` (R22). Build still green.
2. **Commit 2: Pipeline scaffold.** `packages/core/src/markdown/pipeline.ts` with a unified pipeline that parses and serializes plain markdown (no fidelity yet). `MarkdownManager` wrapper exposes `parse()` / `serialize()` matching current shape but delegating to unified. All existing non-fidelity-sensitive tests pass.
3. **Commit 3: Handlers.** `packages/core/src/markdown/handlers.ts` registers remark-prosemirror and mdast-util-to-markdown handlers for all 10 kept fidelity extensions. Position-slice delimiter recovery walker in place. P0 entity + escape tests pass.
4. **Commit 4: Delete obsoleted files.** Delete ListItemFidelity, jsx-tokenizer (all 3 versions), frontmatter.ts. Wire remark-mdx handler for JsxComponent. Wire remark-frontmatter for metadata Y.Map. Existing MDX and frontmatter tests pass.
5. **Commit 5: Wiki-link port.** `packages/core/src/markdown/wiki-link-micromark.ts` state-machine tokenizer + mdast-util extension + remark-prosemirror handler. Existing wiki-link tests pass.
6. **Commit 6: 118-case regression.** Run full fidelity suite including 118-case catalog, PBT invariants, paste e2e. All tests green.
7. **Commit 7: Documentation.** Update AGENTS.md Markdown Pipeline section. Update CLAUDE.md fidelity contract pointers.

### Alternatives considered

All rejected based on prior-research evidence:

- **Stay on marked + @tiptap/markdown with patches.** Architecturally worse on every axis per `tokenizer-comparison-micromark-vs-marked` report. Retains custom MDX tokenizer, bun patch maintenance, missing frontmatter as first-class concept. Rejected by user's explicit "no-deferred-tech-debt" stance.
- **Migrate to prosemirror-markdown (markdown-it).** Rejected in predecessor spec's I1 survey — breaks 9 GFM + custom extensions (task lists, strikethrough, wiki-links, tables). Still true.
- **Hybrid: marked for tokenization, remark-stringify for serialization.** Rejected. D13 (MDX is sprint goal) eliminates this option: marked has no MDX tokenizer, so any parse-side-marked approach requires keeping `jsx-tokenizer.ts` and the bun patch (escape-token handler lives in the parse path), contradicting G2 and D13. The hybrid becomes viable only if MDX drops from scope — at that point it would halve blast radius while retaining the battle-tested marked parser for 91/118 of our probe cases. See `evidence/dependency-activity-assessment.md` for the full marked vs remark comparison.
- **prosemirror-remark (marekdedic).** Rejected at source-code level. The library wraps unified internally via `UnifiedBuilder.build()` — creates a fresh `unified()` processor from extension hooks. Cannot compose with our existing `unified().use(remarkParse).use(remarkGfm).use(remarkMdx).use(remarkDirective)` pipeline. Every remark plugin would need to be wrapped in an Extension subclass. Also: class-per-handler boilerplate vs @handlewithcare's flat function handlers, and unknown types warn-and-drop instead of throwing (silent data loss). See `reports/mdast-prosemirror-bridge-source-comparison/REPORT.md`.
- **Wait for @tiptap/markdown v4.** Rejected in predecessor spec's I5 (roadmap analysis) — markdown is deprioritized on TipTap roadmap, no v4 imminent, no signal of entity-encoding becoming configurable. Still true.
- **Build from scratch.** Multiples more work than either stack; rejected by I1 survey.

### Test surface impact summary

| Action | Scope | Detail |
|---|---|---|
| **Choke-point rewire** | `tests/fidelity/helpers.ts` + `tests/integration/test-harness.ts` | Change `@tiptap/markdown` → `@inkeep/open-knowledge-core`. Propagates to 21 downstream tests with **zero assertion changes**. |
| **Import-only rewire** | 21 files (fidelity × 9, integration × 3, stress × 5, observer × 2, core-extension × 2) | Same import path change in each file's direct `MarkdownManager` import. Zero assertion changes. |
| **DELETE** | `packages/core/src/extensions/jsx-tokenizer-prototype.test.ts` | Tests the deleted `jsx-tokenizer.ts` module. |
| **REWRITE** | `packages/core/src/extensions/jsx-component.test.ts` | Behavior changes from code-fence JSX (```` ```jsx-component ```` ) to native MDX (`<Component />`). `fenceFor` helper tests deleted (helper unused after MDX adoption). |
| **ADD** | New test files or additions to existing fidelity suite | MDX flow/text/expression/esm round-trip (22/23 cases from `mdx-crdt-roundtrip-fidelity` report), MDX multiline expression I3 stability (mdx-js/mdx#2533), reference-link + definition round-trip (R12), directive passthrough, unified-list round-trip, mark-rename verification, position-slice delimiter recovery, fail-fast on unknown mdast type. |
| **NO CHANGE** | E2E tests (4 files), server tests, CLI tests, non-pipeline tests | Zero coupling to pipeline internals. E2E tests exercise browser/API — behavior, not implementation. |

**Key insight:** No behavior-level tests become redundant — they test our integration at system boundaries, not library internals. CommonMark/GFM corpus tests shift from validating the parser (marked had gaps) to serving as handler regression guards (remark is 100% compliant — a failing corpus case now indicates a handler bug, not a parser bug).

**TDD guardrails:**
- Don't add tests for library behavior (remark-parse CommonMark, remark-mdx JSX parsing, prosemirror-flat-list input rules) — their own test suites cover that
- Add tests at system boundaries (our handlers, our pipeline composition, our fidelity attribute mapping)
- Test names describe WHAT (`"emphasis with underscore delimiter round-trips as _ not *"`), not HOW (`"calls position-slice walker"`)
- No mocks — real unified pipeline, real Y.Doc, real observers in integration tests

### Rollback path

The migration ships as a single atomic PR. If a critical fidelity regression surfaces post-merge, a single-commit git revert restores the prior stack. Enabled by: (a) public `parse`/`serialize` API preserved so observers and call sites don't care which engine backs it; (b) greenfield means no data to migrate in either direction.

**Rollback rehearsal (required before merge):** on the migration branch immediately before merging, create a scratch branch that is `git revert HEAD`, run `bun install` + `bun run check`, confirm green. Land the proof as a comment on the PR. Takes ~15 minutes, makes the rollback real and verifies the `patchedDependencies` swap (from `@tiptap/markdown` patch back, remark-prosemirror patch removed) works without human intervention.

In practice the stronger risk management is the pre-flight probe — the rollback is a safety net, not the primary control.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way door? | Evidence |
|---|---|---|---|---|---|
| D1 | Use `@handlewithcare/remark-prosemirror` as the mdast↔PM mapper | T | LOCKED | No | Pin exact version 0.1.5; apply PR #3 fix via `bun patch` (D18). **Source-code-level verification** confirms: native remark plugin composability (`unified().use(remarkProseMirror, { schema, handlers })`), flat handler API, full position/data passthrough (R5 works), fail-fast on unknown types (throws, not warns — correct for fidelity). **Gotcha:** library pre-ignores `definition` + `footnoteDefinition` mdast types — must register explicit handlers to override (critical for R12 reference-link round-trip). Alternative `prosemirror-remark` disqualified at source level — wraps unified internally, cannot compose with our pipeline. See `reports/mdast-prosemirror-bridge-source-comparison/REPORT.md`, `evidence/dependency-activity-assessment.md`. |
| D2 | Migration ships as single atomic PR (not compat-shim parallel) | P | LOCKED | No | Enables git-revert rollback; compat-shim would create two maintenance surfaces and doubled test matrix |
| D3 | Pre-flight 118-case probe is a hard gate before production migration code | P | LOCKED | No | De-risks the one empirical uncertainty; failure conditions listed in R1 |
| D4 | ~~Keep ProseMirror schema unchanged~~ **Schema changes adopted** per D15-D17 | T | **Superseded** by D15-D17 | No (greenfield — no data to migrate) | Research + analysis surfaced a materially cleaner design. Greenfield + no-deferred-tech-debt = build it right now. y-prosemirror / PM core are fully name-agnostic; markdown-on-disk is canonical storage → zero migration risk. |
| D5 | Delete ListItemFidelity | T | **Subsumed by D15** | No | Originally stood alone (pure rendering logic moves to listItem mdast handler). Now subsumed: deletion happens as part of unified-list adoption per D15, not in isolation. Retained for traceability. |
| D6 | Use remark-mdx for MDX **parsing** (not a custom MDX tokenizer) | T | LOCKED | No | remark-mdx is the canonical path; our jsx-tokenizer.ts was a workaround for marked's lack of MDX. **Scope note:** D6 prohibits replacing MDX parsing with a custom tokenizer; it does NOT prohibit custom micromark extensions for other purposes (wiki-link per D7, or autolink/void-HTML guards per R23 option ii). |
| D7 | Port wiki-link to micromark extension (not mdast post-processing) | T | LOCKED | No | Tokenizer-level integration is correct layer; post-processing is hacky |
| D8 | Use position-slice for delimiter recovery (not a custom micromark fork) | T | LOCKED | No | Lowest-complexity path; mdast exposes position info per node; slicing reads `node.position.start.offset`/`end.offset` against the original source string |
| D9 | `parse()` / `serialize()` public API preserved | T | LOCKED | **Yes (internal API)** | Zero call-site changes; minimizes blast radius |
| D10 | No compat shim / staged rollout within the PR | P | LOCKED | No | Single atomic PR + git-revert rollback is cleaner than a dual-engine mode |
| D11 | No startup canary; use TDD-aligned integration test coverage of all critical paths | T | LOCKED | No | User direction: no runtime canaries; ensure test suite covers all key paths per `/tdd`. R16 rewritten accordingly. |
| D12 | Register `remark-directive` from day one | T | LOCKED | No | User direction: no-deferred-tech-debt. Adding it once now is cheaper than adding it later. Registration is a single `.use()` call; passthrough for unused syntax is free. |
| D13 | MDX is explicit sprint goal, unblocked by this migration | P | LOCKED | No | User direction. Reframes R8 (MDX via remark-mdx) from "unblocks future work" to "delivers this sprint's feature." |
| D14 | ProseMirror schema preservation is preference not constraint (greenfield) | T | **Reframed** → **Superseded by D15-D17** | No | User direction: no data to migrate. Research surfaced materially cleaner design; user directed "we're greenfield, we shouldn't leave dead code" → full redesign adopted. |
| D15 | Adopt unified `list` + `listItem` schema wrapping `prosemirror-flat-list` — replaces `BulletListFidelity`, `OrderedListFidelity`, `ListItemFidelity`, `@tiptap/extension-list`'s `TaskList`/`TaskItem` (5 extensions → 2) | T | LOCKED | **Yes (schema)** | Greenfield + no-deferred-tech-debt: 1:1 mdast mapping, zero bridge translation layer, 2 node types instead of 5. `prosemirror-flat-list@0.5.8` provides input rules + keymap + commands; 18.4k weekly DL, 384 commits, sponsored by Reflect, used by Remirror. Tab/Shift-Tab a11y mitigation on us (OQ1). See `evidence/dependency-activity-assessment.md`. |
| D16 | Rename marks to mdast-canonical: `bold`→`strong`, `italic`→`emphasis` | T | LOCKED | **Yes (schema)** | y-prosemirror + PM core are fully name-agnostic. Removes one translation layer in bridge handlers. Low-friction TipTap `extend({ name: '...' })` config. Milkdown uses `strong`/`emphasis` as precedent. |
| D17 | Rename blocks to mdast-canonical: `horizontalRule`→`thematicBreak` | T | LOCKED | **Yes (schema)** | Same rationale as D16. |
| D18 | Apply remark-prosemirror PR #3 fix via `bun patch` at install time | T | LOCKED | No | PR #3 fixes "Empty text nodes are not allowed" + whitespace preservation — the only open issue on the repo. Open 4 months, unreviewed. Pin `@handlewithcare/remark-prosemirror@0.1.5` + apply fix upfront. |
| D19 | Sweep dead-weight `@tiptap/extension-task-list` from `packages/app/package.json` | T | LOCKED | No | Not imported anywhere in our code. `toggleTaskList()` comes from `@tiptap/extension-list` (in core's `shared.ts`). Functionally redundant — extension-list now bundles TaskList/TaskItem subpath exports. |
| D20 | Backslash-escape preservation uses PM-level `escapeMark` (narrow scope: structurally-ambiguous escapes only) | T | LOCKED | **Yes (schema)** | R5's fix for the P0 `\#` miss needed a decision. `escapeMark` — a mark applied to the character that FOLLOWS a backslash-consumed escape (e.g., the `#` in `text \# more`) — is chosen over an `escapedText` atom because marks do not fragment text runs in Y.Doc (atoms would force a run split at every escape, changing collaborative editing deltas). **Narrow scope (per F1 amendment):** only structurally-ambiguous escapes are preserved — specifically, escapes of characters that would otherwise introduce a parse ambiguity (`\#`, `\*`, `\_`, `\[`, `\\`, `\` ` `\`, etc. per CommonMark §2.4). Non-ambiguous escapes (e.g., `\foo`) lose the backslash on round-trip; this is a documented NG (`\foo` → `foo`, acceptable degradation). **Unresolved boundary cases (deferred to R19 first commit as a concrete PM-schema probe, not to implementer R&D):** (a) trailing escape at end-of-line (`foo\` alone on a line) — no target character; spec: drop the backslash (treat as non-ambiguous, same NG rule); (b) cross-mark composition `**bold\*word**` — position-slice walker must emit `escapeMark` on the `*` inside the `strong` run so marks compose correctly. These two cases form the acceptance of a short D20 validation step during R19's first commit. **Rhetoric correction:** `escapeMark` is a new mark type, not an attribute on an existing mark — the earlier "aligns with sourceDelimiter pattern" framing was imprecise. The structural parallel is: both use the mark layer to carry authoring-form metadata on text runs. |

## 11) Open questions

| ID | Question | Type | Priority | Status |
|---|---|---|---|---|
| Q1 | Is the 118-case probe pass rate ≥77/118? | T | P0 | **RESOLVED:** 97/118 (82.2%) — 26% improvement over current baseline. See `tech-probes/r1-preflight-gate/REPORT.md`. |
| Q2 | Do all 13 P0 entity/escape cases pass through the new pipeline? | T | P0 | **RESOLVED:** 12/13 pass. The single miss (`text \# more` → backslash consumed by mdast) is fixable via a PM-level `escapeMark` on text runs whose source range contained a backslash (see R5 amendment); additive fix, not a pipeline blocker. |
| Q3 | Does mdast-util-to-markdown #12 (nested emphasis round-trip) affect any of our 118 cases or real content? | T | P0 | **RESOLVED:** Nested emphasis `***em*in em*` normalizes through the new pipeline — same behavior as current marked stack, NOT a regression. Pre-existing limitation, not newly introduced. |
| Q4 | Does remark emit `html` mdast nodes passing raw content, or does it escape? | T | P0 | **RESOLVED:** Raw HTML passes through. The 8 SEMANTIC_LOSS cases (HTML entities decoded to literals) are pre-existing per NG5 (storage-layer doesn't sanitize; render-time layers do). Raw HTML in MDX contexts collapses under `mdxJsxFlowElement` — known MDX semantics, documented in §19.5. |
| Q5 | Is the wiki-link micromark-extension port feasible as a tractable single-file extension? | T | P0 | **RESOLVED:** FEASIBLE. 20/20 test cases pass (4 shapes + 11 edge cases + 5 integration cases). ~100 SLOC. See `tech-probes/wiki-link-micromark/REPORT.md`. |
| Q6 | Do we want the R16 startup invariant assertion? | T | P0 | **RESOLVED:** No startup canary per D11. TDD-aligned integration tests cover critical paths. |
| Q7 | Do we need `remark-directive` from day one, or is it NOT UNLESS? | P | P0 | **RESOLVED:** IN SCOPE per D12. Registered day one. |
| Q8 | Are there 1P codebase call sites that access tokenizer-specific fields (e.g., `token.raw`, `token.lang`) outside the fidelity extensions? | T | P0 | **RESOLVED:** `evidence/call-site-inventory.md` — 27 references, 100% in `packages/core/src/extensions/`. Zero drift. |
| Q9 | Does `@handlewithcare/remark-prosemirror`'s handler API support all our node types, including custom ones like `mdxJsxFlowElement` from remark-mdx? | T | P0 | **RESOLVED:** 11/11 custom types resolve correctly — handlers registered where appropriate (mdxJsx*, mdxFlow/TextExpression, mdxjsEsm, wikiLink, container/leaf/textDirective, definition); explicit `ignore` retained for `yaml`/`toml` (correct — frontmatter handled via Y.Map). No library fighting. |
| Q10 | Does `backlink-index.ts` use MarkdownManager in any non-standard way? | T | P0 | **RESOLVED:** Same pattern as every other call site — `mdManager.parse(body)` returning a PM JSON node. Fully covered by R2. |
| Q11 | Do our extensions use `markdownOptions: { indentsContent: true, htmlReopen: true }` config that has no remark-prosemirror equivalent? | T | P0 | **RESOLVED:** R1 probe confirmed — no `markdownOptions` configuration needed. The unified pipeline composes cleanly without these escape hatches; equivalent behaviors are expressed via handler logic and `mdast-util-to-markdown` handler overrides (see R4). |
| Q12 | What migration-specific test additions make sense? | T | P0 | **RESOLVED:** see R16 for the full enumerated list (MDX, reference-link, directive, unified-list, mark-rename, position-slice, fail-fast). |
| Q13 | Is there a specific CI plan for the migration PR (turbo cache invalidation, parallel vs serial runs)? | T | P0 | **RESOLVED:** Turbo caches persist across the migration since the cache key is content-hash-based. Tests re-run once after the dep-swap commit. No special CI orchestration needed. |
| Q14 | Does the team accept single-atomic-PR or want a compat-shim alternative evaluated? | P | P0 | **RESOLVED:** Atomic swap per D2. D10 locks out compat shim. PR #65 precedent validates approach. |
| Q15 | Copy `reports/tokenizer-comparison-micromark-vs-marked/` from the sibling worktree? | P | P0 | **RESOLVED:** Merge report to `main` via separate tiny PR before migration PR. Report is evidence for multiple specs — should be on main regardless of migration outcome. |
| Q16 | Evaluate the hybrid alternative (marked parse + remark-stringify serialize)? | T | P0 | **RESOLVED:** Eliminated by D13 — marked has no MDX tokenizer, so any parse-side-marked approach requires keeping jsx-tokenizer.ts, contradicting G2 and D13 (MDX sprint goal). Rejection evidence now explicit in §9. |
| Q17 | Adopt the validated schema redesign? | T | P0 | **RESOLVED:** Full redesign adopted. Unified list (D15), mdast-canonical mark names (D16), mdast-canonical block names (D17). Wiki-link is already atom; fidelity attrs are already flat primitives. See §17. |
| OQ1 | prosemirror-flat-list Tab/Shift-Tab accessibility — can Tab/Shift-Tab be scoped to list context without hijacking outer editor bindings (tables, code blocks)? | T | P0 | **OPEN** — acceptance gate promoted to R19 (see R19 acceptance). **Concrete criteria:** (a) Tab inside a `listItem` indents the item; Tab inside a `tableCell` advances to the next cell; Tab inside a `codeBlock` inserts a literal tab character; Shift-Tab is the reverse operation in each case. (b) Playwright keymap test (new, part of R16) covers all three surfaces. (c) Manual screen-reader smoke pass (VoiceOver or equivalent) verifies no keyboard trap, noted in the migration PR comment. Referenced from R19, D15. |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan |
|---|---|---|---|
| A1 | Position-slice delimiter recovery works for all our fidelity attributes | **CONFIRMED (scope: 9 probe samples)** | R1 probe: 100% position data coverage across 9 diverse sample inputs (frontmatter/MDX/directives/tables/reference links). **Full 118-sample verification deferred to R19 first commit** — the probe harness already processes all 118 cases; adding a position-coverage assertion is a trivial extension (R5 acceptance). If any construct returns out-of-bounds positions, the fallback-to-default path (§14 risk mitigation) handles it safely. |
| A2 | remark-prosemirror handler API supports our full schema surface | **CONFIRMED** | R1 probe: all 30+ handlers registered cleanly. Full pipeline composes without library fighting. |
| A3 | mdast-util-to-markdown custom handlers can fully override default escape/delimiter behavior for our node types | **CONFIRMED** | R1 probe: custom `text` handler required to strip `&` and `<` from unsafe list (otherwise every literal gets backslash-escaped); custom `link` handler writes URLs verbatim. Both work as expected. |
| A4 | Wiki-link tokenizer ports cleanly to micromark state machine | **CONFIRMED** | Wiki-link probe: 20/20 tests pass as a ~100 SLOC micromark extension. See `tech-probes/wiki-link-micromark/`. |
| A5 | @tiptap/markdown can be removed cleanly (no hidden dependencies elsewhere) | **CONFIRMED** | Verified via `evidence/call-site-inventory.md`: 28 `MarkdownManager` import statements across 26 files (some files have multiple imports or re-exports), 100% use only `MarkdownManager`, zero internal type imports, all token-field access is in 11 fidelity extensions, zero direct marked imports |
| A6 | ~~Y.XmlFragment documents stored under the old engine round-trip cleanly through the new engine~~ **N/A — greenfield, no existing production data** | — | — |
| A7 | Performance delta (~13× slower tokenizer) is acceptable off the critical typing path | HIGH | 50ms debounce + non-blocking observer sync; confirmed in tokenizer-comparison report D7 |
| A8 | Team has bandwidth for the focused 2-3 week migration (once the probe passes) | MEDIUM | User confirmation after probe results |

## 13) In Scope

See §2 goals + §6 requirements + §9 architecture.

### Deployment / rollout

| Concern | Approach | Verify |
|---|---|---|
| `@tiptap/markdown` removed cleanly | 1P codebase grep confirms only `packages/core/src/markdown/` references markdown-engine internals | Pre-migration grep (done, `evidence/call-site-inventory.md`); post-migration grep returns zero |
| Pre-flight probe failure | Halt migration; user judgment whether to adjust rubric, extend probe, or abandon | Documented in R1 acceptance |
| Upstream remark / remark-prosemirror breaking change during 0.x | Pin exact versions; vendor via `npm pack` if needed | Pinned in package.json; upgrade protocol added to AGENTS.md |

*Greenfield note: no existing-document migration concern. First-save-after-deploy diff noise was a brownfield risk; removed.*

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Pre-flight probe shows <77/118 pass rate | Low-Medium | High | Gate catches it before migration code written. Fall back to current stack; rubric can be extended to narrower subset of cases to characterize the gap; user decides whether to proceed with fidelity regression. |
| mdast-util-to-markdown #12 (nested emphasis) affects real content | Low | Medium | Probe exercises nested emphasis cases; if hit, add a custom emphasis handler that avoids the #12 escape path for our specific inputs. **G4's byte-exact fidelity claim for nested emphasis specifically depends on this mitigation — not automatic from adopting the remark stack.** |
| **mdx-js/mdx#2533 multiline-JSX-expression indentation drift (non-converging)** | Medium | **High** | Documented in `reports/mdx-crdt-roundtrip-fidelity` as the only non-converging defect in 23 MDX edge cases. Upstream closed as "expected." **Violates invariant I3 (f(f(x)) === f(x))** for multiline expressions like `<Chart data={{\n  key: value\n}}>`. Mitigation: custom `mdast-util-mdx-expression` handler that strips accumulated indent on serialize (or a pre-normalization pass on load). Probe MUST include multiline-JSX-expression round-trip stability. |
| remark-prosemirror dormancy or upstream issue | Low-Medium | Medium | Pin `@handlewithcare/remark-prosemirror@0.1.5` exactly. Apply PR #3 fix via `bun patch` at install time (D18). Probe validates handler API for all node types before commitment (Q9). Library is 29 stars, 16.8k weekly DL, 16 months since last commit, bus factor 1 — but Marijn-endorsed on discuss.prosemirror.net, ex-NYT Oak maintainer, small-footprint library that is genuinely forkable if needed. React to issues as they arise; do not pre-plan fork. See `evidence/dependency-activity-assessment.md`. |
| Position-slice recovery returns invalid data (synthetic/plugin-mutated nodes have no `node.position`) | Medium | Medium | **Fallback:** when `node.position` is undefined or `start.offset` is out of bounds, walker falls back to remark-stringify defaults (never crashes, never emits wrong delimiters); logs a warning in debug mode. Acceptable degradation: `_emphasis_` may normalize to `*emphasis*` when positions are absent. Probe validates position data availability across all 14 node types through the full plugin chain (remark-parse + remark-gfm + remark-mdx + remark-frontmatter + remark-directive). |
| Performance regression on large documents | Low | Low | Off critical typing path (50ms debounced). Benchmark as part of probe. |
| Hidden @tiptap/markdown dependency discovered mid-migration | Low | Medium | Pre-migration codebase grep (A5 verification). |
| Wiki-link micromark port takes longer than expected | Medium | Low | Probe includes prototype — uncovers complexity before commitment. |
| Team bandwidth falls through during multi-week migration | Medium | Medium | Single atomic PR is resumable (commits in order); if paused, work so far remains on a branch without polluting main. |
| Reference-link round-trip works but surfaces new edge cases | Low | Low | Feature was broken anyway; any improvement is net positive. Add test cases as found. |

## 15) Future Work

### Explored

- **remark-rehype HTML output pipeline.** Enables shared Shiki highlighting between editor and docs site. Out of scope here; NG6.
- **remark-lint / remark-slug / remark-toc / remark-autolink-headings.** Opportunistic plugins. NG7.
- **remark-math / remark-directive / remark-github-blockquote-alert / remark-definition-list.** Feature extensions. NG8.

### Identified

- **MDX authoring UX (WYSIWYG component picker, props editor, component library).** The markdown engine migration delivers MDX *parse/serialize* infrastructure. The user-facing MDX authoring experience is a separate follow-on spec that this migration unblocks and that the user has flagged as a sprint goal after this one.
- **MDX v3 upgrade path.** remark-mdx tracks MDX's major-version cadence. If MDX ships a v4 with breaking changes, our handler registration may need updates. Non-urgent.
- **Prettier integration for markdown formatting.** remark-based. Future `bun run format` could format .md files via Prettier.

### Noted

- None. remark-prosemirror is pinned + patched (D1, D18); no speculative fork planning.

## 16) Agent constraints

- **SCOPE:**
  - `packages/core/src/markdown/` — new directory for unified pipeline factory, handlers, position-slice walker, wiki-link micromark extension
  - `packages/core/src/extensions/list.ts` — **NEW** unified-list TipTap extension wrapping `prosemirror-flat-list` (R19)
  - `packages/core/src/extensions/*-fidelity.ts` — REMOVE parseMarkdown/renderMarkdown methods, keep schema + attrs; RENAME `BoldFidelity`→`StrongFidelity`, `ItalicFidelity`→`EmphasisFidelity`, `HorizontalRuleFidelity`→`ThematicBreakFidelity` (D16/D17)
  - `packages/core/src/extensions/bullet-list-fidelity.ts` — DELETE (replaced by unified list)
  - `packages/core/src/extensions/ordered-list-fidelity.ts` — DELETE (replaced by unified list)
  - `packages/core/src/extensions/list-item-fidelity.ts` — DELETE (replaced by unified list)
  - `packages/core/src/extensions/jsx-component.ts` — REMOVE parseMarkdown/renderMarkdown; handler moves to markdown/handlers.ts
  - `packages/core/src/extensions/wiki-link.ts` — REMOVE markdownTokenizer; port moves to markdown/wiki-link-micromark.ts
  - `packages/core/src/extensions/shared.ts` — rewire to new extension names + unified list + remove TaskList/TaskItem imports
  - `packages/core/src/index.ts` — update exports; add `MarkdownManager` re-export
  - `packages/core/package.json` — add `unified`, `remark-*`, `@handlewithcare/remark-prosemirror`, `mdast-util-to-markdown`, `prosemirror-flat-list`; remove `@tiptap/markdown`, `@tiptap/extension-list`
  - `packages/server/package.json` — remove `@tiptap/markdown`
  - `packages/app/package.json` — remove `@tiptap/markdown`, `@tiptap/extension-task-list` (D19 dead-weight sweep)
  - `package.json` — remove patchedDependencies entry for @tiptap/markdown; add patchedDependencies entry for remark-prosemirror PR #3 (D18)
  - `patches/@tiptap%2Fmarkdown@3.22.3.patch` — DELETE
  - `patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch` — **NEW** (PR #3 fix)
  - 26 files across `packages/app` + `packages/server` — update import path `@tiptap/markdown` → `@inkeep/open-knowledge-core`
  - `packages/app/tests/fidelity/` — rewire `mdRoundTrip` helper; assertions unchanged
  - `AGENTS.md` — update Markdown Pipeline section
- **EXCLUDE:**
  - Any ProseMirror schema change **beyond** the specific renames (D16/D17), unified-list adoption (D15), and the `escapeMark` mark (D20) documented in §17
  - Any change to observer sync logic, origin guards, typing defer — NG2
  - Any change to TipTap editor, CodeMirror, paste handler wiring (only `mdManager.parse` call is rewired — NG3)
  - Any change to persistence, file watcher, agent-sessions — NG4
  - Any change to the 118-case catalog, invariant tests, PBT arbitraries (test assertions stay) — NG10
  - Adding remark-rehype, remark-lint, remark-math (beyond NOT UNLESS) — NG6, NG7, NG8. **Note:** `remark-directive` IS in scope per D12 / R3.
- **STOP_IF:**
  - Pre-flight probe fails <77/118 — STOP, surface to user, do not write migration code
  - Any P0 entity/escape test fails — STOP
  - Any bridge invariant test fails — STOP
  - Unexpected @tiptap/markdown dependency found outside `packages/core/src/markdown/` — STOP, surface
  - ProseMirror schema changes beyond D15-D17 or D20 scope — STOP, surface
- **ASK_FIRST:**
  - Adding any dependency beyond the ones listed in R3 (core unified chain)
  - Changing any public API signature (parse, serialize, or any exported type from `packages/core`)
  - Any situation where the Y.XmlFragment schema would change
  - Deviating from the commit sequence in §9 phasing

---

## 17) Adopted ProseMirror schema redesign

Derived from `reports/full-stack-pm-crdt-markdown-editor-ideal/REPORT.md` (6-dimension research) + `/analyze` session. All decisions LOCKED per D15-D17. User direction: "we're greenfield, we shouldn't leave dead code."

### 17.1 Verification: current schema already satisfies hard constraints

Both "corrections" identified in the research are constraints on a proposed redesign, **not** bugs in the shipping codebase:

| Constraint | Current codebase status | Action |
|---|---|---|
| `checked` on listItem, not list (mdast parity) | ✅ Already correct — `@tiptap/extension-list`'s `TaskItem` has `checked` at item level | Preserve in the unified-list extension (R19) |
| Fidelity attrs must be flat primitives (Y.js type contract) | ✅ Already correct — `bulletMarker`, `listMarkerDelimiter`, `loose`, `start` are all flat | Preserve in all extensions |
| Wiki-link as inline atom node | ✅ Already correct — `wiki-link.ts:63-65` is `inline: true, atom: true` | No change needed |

### 17.2 Adopted schema (17 blocks / 6 inline / 6 marks = 29 types, full 1:1 mdast mapping + escape preservation)

**Block nodes (17):** `doc` · `paragraph` · `heading` (attrs: `level`, `sourceStyle`) · `blockquote` · **`list`** (attrs: `ordered`, `start`, `spread`; via `prosemirror-flat-list` wrapper — D15) · **`listItem`** (attrs: `checked`, `spread`, `bulletMarker`, `listMarkerDelimiter`; D15) · `codeBlock` (attrs: `language`, `meta`, `sourceFenceChar`, `sourceFenceLength`) · `htmlBlock` (atom) · **`thematicBreak`** (atom; renamed from `horizontalRule` — D17) · `linkDefinition` (atom) · `table` · `tableRow` · `tableCell` · `jsxComponent` (atom; `mdxJsxFlowElement`) · `mdxExpression` (atom; `mdxFlowExpression`) · `mdxEsm` (atom; `mdxjsEsm`) · `footnoteDefinition`.

**Inline nodes (6):** `hardBreak` (attrs: `sourceStyle`) · `image` · `footnoteReference` · `jsxInline` (atom; `mdxJsxTextElement`) · `mdxInlineExpression` (`mdxTextExpression`) · `wikiLink` (atom; custom node produced by micromark extension per R7; attrs: `target`, `alias`, `anchor`).

**Marks (6):** **`strong`** (attr: `sourceDelimiter`; renamed from `bold` — D16) · **`emphasis`** (attr: `sourceDelimiter`; renamed from `italic` — D16) · `strikethrough` · `link` (attrs: `href`, `title`, `sourceStyle`, `sourceRefLabel`) · `code` · **`escapeMark`** (attrs: none; zero-width mark on text runs whose source contained a backslash escape — D20; scoped to structurally-ambiguous escapes only per D20 amendment).

**Frontmatter:** outside schema. Stripped before PM parse, stored in `Y.Map('metadata')`. Matches Marijn's recommendation and current architecture.

### 17.3 Changes from current schema (all LOCKED)

| Change | From → To | Decision | Rationale |
|---|---|---|---|
| Mark naming | `bold` → `strong`, `italic` → `emphasis` | D16 LOCKED | mdast-canonical; removes one translation layer in bridge handlers |
| Block naming | `horizontalRule` → `thematicBreak` | D17 LOCKED | mdast-canonical |
| List architecture | 5 extensions (`BulletListFidelity`, `OrderedListFidelity`, `ListItemFidelity`, `TaskList`, `TaskItem`) → 1 custom extension (`list` + `listItem`) | D15 LOCKED | 1:1 mdast mapping; zero bridge translation; greenfield = build it right |
| List dependency | `@tiptap/extension-list` → `prosemirror-flat-list` | D15 LOCKED | Validated library (69 stars, 384 commits, 18.4k DL/wk, Reflect-sponsored, Remirror uses it) |
| Wiki-link | Already inline atom node | No change | Confirmed by codebase inspection |
| Fidelity attrs | Already flat primitives | No change | Confirmed by codebase inspection |
| Dead-weight sweep | `@tiptap/extension-task-list` | D19 LOCKED | Not imported anywhere; extension-list bundles TaskList/TaskItem |

### 17.4 MDX model (5 node types, explicit handlers)

| mdast | PM node | Role | Example |
|---|---|---|---|
| `mdxJsxFlowElement` | `jsxComponent` (block atom) | Block-level JSX | `<Chart data={[...]} />` |
| `mdxJsxTextElement` | `jsxInline` (inline atom) | Inline JSX | `<Icon name="check"/>` |
| `mdxFlowExpression` | `mdxExpression` (block atom) | Block expression | `{someValue}` |
| `mdxTextExpression` | `mdxInlineExpression` (inline) | Inline expression | `the answer is {42}` |
| `mdxjsEsm` | `mdxEsm` (block atom) | Import/export | `import Chart from './chart'` |

Each MDX component gets an explicit bidirectional handler (Plate pattern). Unknown/unregistered components: surface as error, not silent pass-through.

### 17.5 Architectural constraints (copy the architecture, don't fight it)

1. **Schema naming is free** — y-prosemirror, PM core, Hocuspocus are all name-agnostic (CONFIRMED).
2. **Y.js schema evolution is destructive** — but markdown-on-disk canonical storage makes this irrelevant (Y.Docs are ephemeral, rebuilt from markdown on every load).
3. **Flat primitive attrs only** — Y.js type contract (already satisfied).
4. **Source-text fidelity is a genuine differentiator** — no reference editor (Milkdown, BlockNote, Plate) preserves per-node source form.
5. **Two-stage serialization** — remark-prosemirror produces mdast, remark-stringify emits markdown. Fidelity handlers live in `mdast-util-to-markdown`, not in the bridge.
6. **remark-prosemirror is the critical seam** — Marijn-approved, small-footprint library, stable handler API, bus factor 1, dormant 16 months. Pinned and patched (D1, D18). See `evidence/dependency-activity-assessment.md`.

---

## 18) Change manifest

A consolidated outline of every change the migration entails, organized by action. Implementer-facing index. See §6 requirements for acceptance criteria on each.

### 18.1 CREATE (new files)

**Markdown pipeline (`packages/core/src/markdown/` — new directory):**
- `index.ts` — new `MarkdownManager` wrapper preserving public `parse()`/`serialize()` API (D9, R2)
- `pipeline.ts` — unified pipeline factory composing remark-parse + remark-gfm + remark-frontmatter + remark-mdx + remark-directive + wiki-link micromark extension + remarkProseMirror + remark-stringify (R3)
- `handlers.ts` — mdast→PM handler table (Tiers A/B/C per R6) plus PM→mdast reverse handlers (via `fromProseMirror`)
- `to-markdown-handlers.ts` — fidelity-aware `mdast-util-to-markdown` serialization overrides (R4)
- `position-slice.ts` — source-form recovery walker populating `node.data.*` fields (R5, D8); includes fallback-to-default when `node.position` is absent
- `wiki-link-micromark.ts` — micromark tokenizer state machine for `[[Page]]`, `[[Page|Alias]]`, `[[Page#Heading]]`, `[[Page#Heading|Alias]]` (R7)
- `mdast-augmentation.ts` — TypeScript module augmentation of mdast `Nodes` type for custom types (`wikiLink`, MDX nodes, directive nodes)

**Extensions:**
- `packages/core/src/extensions/list.ts` — unified `list`/`listItem` TipTap extension wrapping `prosemirror-flat-list` (R19, D15)

**Patches:**
- `patches/@handlewithcare%2Fremark-prosemirror@0.1.5.patch` — PR #3 fix applied at install time (R20, D18)

**Tests (new coverage for new capabilities):**
- `packages/core/src/markdown/wiki-link-micromark.test.ts` — unit tests for the new micromark tokenizer (4 shapes + 11 edge cases + 5 integration cases, per wiki-link probe evidence)
- MDX flow/text/expression/esm round-trip cases (22/23 from `mdx-crdt-roundtrip-fidelity` report, enumerated per R8)
- MDX multiline-expression I3 stability (mdx-js/mdx#2533 mitigation)
- Reference-link + `definition` round-trip (R12 — exercises the `definition` handler override)
- Autolink + bare-HTML regression coverage (R23 — `<https://url>`, `<br>`, `<hr>`, `<img>` do not regress to errors)
- Directive passthrough
- Unified-list round-trip (bullet/ordered/task/nested)
- Mark-rename verification (PM mark named `strong` not `bold`)
- Position-slice delimiter recovery (`_` stays `_`, tilde fences stay tildes, `+` bullet stays `+`)
- Backslash-escape preservation via `escapeMark` (D20 — `text \# more` round-trips as `text \# more`)
- Fail-fast on unknown mdast type

### 18.2 DELETE (files removed entirely)

- `packages/core/src/extensions/jsx-tokenizer.ts` — replaced by remark-mdx (G2, R8)
- `packages/core/src/extensions/jsx-tokenizer-prototype.test.ts` — tests the deleted module (R13, R16)
- `packages/core/src/extensions/bullet-list-fidelity.ts` — subsumed by unified list (R11, R19)
- `packages/core/src/extensions/ordered-list-fidelity.ts` — subsumed (R11, R19)
- `packages/core/src/extensions/list-item-fidelity.ts` — subsumed (D5, R11, R19)
- `patches/@tiptap%2Fmarkdown@3.22.3.patch` — no longer needed; handler-override extensibility replaces the patch (G1, R10)

### 18.3 MODIFY — extensions (schema stays, markdown methods removed + renames)

- `packages/core/src/extensions/emphasis-fidelity.ts` — rename exports: `BoldFidelity` → `StrongFidelity`, `ItalicFidelity` → `EmphasisFidelity`; rename schema names to `strong`/`emphasis`; remove `parseMarkdown`/`renderMarkdown` methods (R21, D16)
- `packages/core/src/extensions/heading-fidelity.ts` — remove markdown methods; schema + `sourceStyle: 'atx'|'setext'` attr stay
- `packages/core/src/extensions/horizontal-rule-fidelity.ts` — **rename file** to `thematic-break-fidelity.ts`; rename export to `ThematicBreakFidelity`; rename schema name to `thematicBreak`; remove markdown methods (R21, D17)
- `packages/core/src/extensions/code-block-fidelity.ts` — remove markdown methods; schema + `language`/`sourceFenceChar`/`sourceFenceLength` attrs stay
- `packages/core/src/extensions/hard-break-fidelity.ts` — remove markdown methods; `sourceStyle: 'backslash'|'spaces'` attr stays
- `packages/core/src/extensions/link-fidelity.ts` — remove markdown methods; schema stays; reference-link detection logic moves to `link`/`linkReference` handlers where it reads `linkReference.referenceType` natively
- `packages/core/src/extensions/link-ref-def-fidelity.ts` — remove markdown methods; schema stays; handler in `markdown/handlers.ts` overrides remark-prosemirror's default `ignore` for `definition` (R12 CRITICAL)
- `packages/core/src/extensions/html-block-fidelity.ts` — remove markdown methods; simplified (no `token.block === true` filter needed — mdast `html` is block-level by position)
- `packages/core/src/extensions/jsx-component.ts` — remove markdown methods; handler moves to `markdown/handlers.ts` (maps `mdxJsxFlowElement`/`mdxJsxTextElement` → `jsxComponent`/`jsxInline`); `fenceFor` helper deleted
- `packages/core/src/extensions/wiki-link.ts` — remove `markdownTokenizer`; schema stays (already an inline atom node); port goes to `markdown/wiki-link-micromark.ts`
- `packages/core/src/extensions/frontmatter.ts` — **partial keep:** `stripFrontmatter`/`prependFrontmatter` functions survive (observer sync layer uses them for Y.Text ↔ Y.Map bridge); parse-time logic replaced by remark-frontmatter
- `packages/core/src/extensions/shared.ts` — rewire extension list: remove `BulletListFidelity`/`OrderedListFidelity`/`ListItemFidelity`, remove `TaskList`/`TaskItem` imports from `@tiptap/extension-list`, add unified `List` extension, update `StarterKit.configure()` to disable renamed built-ins
- `packages/core/src/index.ts` — update exports (remove deleted fidelity extensions, add unified `List`, add `MarkdownManager` re-export per R22, update type re-exports)

### 18.4 MODIFY — package.json files

- `packages/core/package.json` — ADD: `unified`, `remark-parse`, `remark-stringify`, `remark-gfm`, `remark-frontmatter`, `remark-mdx`, `remark-directive`, `mdast-util-to-markdown`, `@handlewithcare/remark-prosemirror` (pinned 0.1.5), `prosemirror-flat-list`. REMOVE: `@tiptap/markdown`, `@tiptap/extension-list`.
- `packages/server/package.json` — REMOVE: `@tiptap/markdown`
- `packages/app/package.json` — REMOVE: `@tiptap/markdown`, `@tiptap/extension-task-list` (D19 dead-weight sweep)
- `package.json` (root) — REMOVE `patchedDependencies` entry for `@tiptap/markdown`; ADD `patchedDependencies` entry for `@handlewithcare/remark-prosemirror@0.1.5` pointing to PR #3 patch file

### 18.5 MODIFY — import paths (mechanical, 26 files per R22)

Across `packages/app/` + `packages/server/` + core tests, change every:
```ts
import { MarkdownManager } from '@tiptap/markdown';
```
to:
```ts
import { MarkdownManager } from '@inkeep/open-knowledge-core';
```

No call-site changes beyond the import line — public API signatures preserved per D9.

### 18.6 MODIFY — tests

- **CHOKE-POINT REWIRE (2 files, propagates to 21 downstream with zero assertion changes):**
  - `packages/app/tests/fidelity/helpers.ts` — change `MarkdownManager` import path + constructor
  - `packages/app/tests/integration/test-harness.ts` — same
- **IMPORT-ONLY REWIRE (21 files):** direct `MarkdownManager` imports in fidelity, integration, stress, observer, and core-extension test files
- **REWRITE:** `packages/core/src/extensions/jsx-component.test.ts` — behavior changes from code-fence JSX (```` ```jsx-component ```` ) to native MDX (`<Component />`); `fenceFor` helper tests removed (helper deleted)
- **KEEP (schema tests unchanged):** `packages/core/src/extensions/wiki-link.test.ts` — schema + helper tests unchanged. Test coverage for the micromark tokenizer itself moves to `packages/core/src/markdown/wiki-link-micromark.test.ts` (NEW — per R7).
- **KEEP:** `packages/core/src/extensions/frontmatter.test.ts` — `stripFrontmatter`/`prependFrontmatter` survive
- **NO CHANGE:** all E2E tests, server tests, CLI tests, non-pipeline tests

### 18.7 MODIFY — documentation

- `AGENTS.md` — rewrite "Markdown Pipeline — System Design" section to reflect unified pipeline architecture; update "Storage-layer fidelity contract" pointers; add plugin registration order; reference new `packages/core/src/markdown/` files (R17)
- `CLAUDE.md` — update fidelity contract pointers; update "@tiptap/markdown version discipline" section to reflect new pinned dependency and patch model

### 18.8 Pre-merge checklist (consolidated for the implementer)

All of the following MUST be complete before the migration PR is merged. Cross-referenced to the governing requirement.

- [ ] **Tokenizer-comparison report landed on `main`** — either via tiny separate PR or copied into this worktree (Q15; §1 link note). The link in §1 must resolve at merge time.
- [ ] **Rollback rehearsal executed** — create scratch branch from migration branch, `git revert HEAD`, run `bun install` + `bun run check`, confirm green. Proof landed as a comment on the migration PR (§9 Rollback path; D2/R18).
- [ ] **R1 probe re-run shows zero `old: pass / new: fail` regressions** — per-case diff materialized; R23 fixes (autolink + bare-HTML) applied and verified (R1; R23; G4; M1).
- [ ] **R19 OQ1 three-surface keymap check** — Playwright test passes for listItem/tableCell/codeBlock Tab/Shift-Tab behavior; screen-reader smoke pass noted in PR comment (R19; OQ1).
- [ ] **R21 schema-rename smoke test** — editor renders after renames; Cmd-B bolds; bubble menu highlights; serialization emits `**x**`; `isActive` callsites all updated. Smoke results landed as evidence (R21; D16; D17).
- [ ] **D20 escapeMark validation** — `\#` P0 case round-trips; `**bold\*word**` cross-mark case round-trips; end-of-line trailing escape follows NG rule (D20; R16(h)).
- [ ] **Full `bun run check` green** — lint + typecheck + unit + integration + fidelity all pass, including new tests from §18.1 (R13).
- [ ] **118-case catalog re-run green** — ≥77/118 whitespace-only, all 13 P0 entity/escape pass (R1 gate already satisfied at probe time; re-verify on final implementation).

### 18.9 Unchanged (explicit non-scope)

For clarity on what does **not** change — anything not listed in 18.1-18.7 stays as-is, including:
- CRDT layer (`Y.Doc`, `Y.XmlFragment`, `Y.Text`, `Y.Map`) — NG2
- Hocuspocus server + provider — NG2
- Observer sync logic (Observer A, Observer B, origin guards, typing defer, remote grace, bridge invariant) — NG2
- TipTap editor, CodeMirror source editor, y-codemirror.next, @tiptap/y-tiptap — NG3
- Persistence layers (L1 CRDT→disk, L2 disk→git, file watcher, agent sessions) — NG4
- All non-list TipTap extensions (heading, table, image, highlight, link, collaboration, etc.) — NG5 (with naming renames per D16/D17)
- All test assertions (only test helpers change)
- All E2E tests
- Server API endpoints
- CLI + MCP server

---

## 19) Implementation grounding notes

Concrete context surfaced during research + source-code analysis that will save the implementer time. These are **hints, not prescriptions** — flagged because they're non-obvious and the implementer shouldn't have to rediscover them.

### 19.1 remark-prosemirror handler specifics (from source analysis)

- **Built-in handlers already present** — remark-prosemirror ships with built-in handlers for `root`, `text`, and `html` (the block form). Overriding them is a conscious choice. The spec's §18.3 `html-block-fidelity.ts` modifications need a handler that either overrides or augments the built-in — confirm which when implementing the probe (Q4).
- **Pre-ignored types** — `yaml`, `toml`, `definition`, `footnoteDefinition` are all mapped to `ignore` by default. `yaml`/`toml` being ignored is correct (frontmatter handled via Y.Map). `definition` being ignored breaks R12 — register an explicit handler that overrides the ignore. `footnoteDefinition` is acceptable as-ignored until footnotes enter the product roadmap.
- **Unknown-type error** — fail-fast error message is `Error: unknown markdown node: ${type}`. This is the signal that a plugin is producing a type we haven't registered a handler for. Probe should intentionally exercise this path to verify error clarity.
- **Mark handlers live in the same `handlers` map as node handlers** — keyed by mdast type, use `toPmMark(markType, getAttrs)` instead of `toPmNode(nodeType, getAttrs)`. Both helpers accept a `getAttrs` callback receiving the full mdast node.
- **Atom node pattern** — the `toPmNode` helper always calls `state.all(node)` to recurse children. For true atom nodes (`mdxExpression`, `thematicBreak` with `sourceRaw`, etc.), bypass the helper and use a raw handler that calls `nodeType.createAndFill(attrs)` directly. No children, no recursion.

### 19.2 Position-slice delimiter recovery (R5/D8)

The walker reads `node.position.start.offset` / `end.offset` against the original source string to recover authoring-form markers that mdast drops. Delimiter/marker recovery matrix:

| mdast type | What to recover | Source inspection |
|---|---|---|
| `emphasis` | `sourceDelimiter: '*' \| '_'` | `source[node.position.start.offset]` |
| `strong` | `sourceDelimiter: '**' \| '__'` | `source.slice(start.offset, start.offset + 2)` |
| `heading` | `sourceStyle: 'atx' \| 'setext'` | Presence of `\n[=-]+` after `end.offset` (setext) vs `#` prefix at `start.offset` (atx) |
| `list` parent of `listItem[0]` | `bulletMarker: '-' \| '*' \| '+'` OR `listMarkerDelimiter: '.' \| ')'` | `source[firstListItem.position.start.offset]` (bullet) OR find `\d+([.)])` at that offset (ordered) |
| `code` | `sourceFenceChar: '\`' \| '~'` + `sourceFenceLength: number` | `source[start.offset]` gives the char; count consecutive same chars |
| `thematicBreak` | `sourceRaw: string` | `source.slice(start.offset, end.offset)` verbatim |
| `break` (hardBreak) | `sourceStyle: 'backslash' \| 'spaces'` | Check char before the newline at `end.offset - 1` |
| `link` | `sourceStyle: 'inline' \| 'full' \| 'collapsed' \| 'shortcut'` + `sourceRefLabel: string \| null` | **Use mdast's native `linkReference.referenceType` and `identifier` fields** — no slicing needed |

Fallback behavior (already in §14 risk table): when `node.position` is undefined or out of bounds, skip attribution; handler falls back to remark-stringify default. Acceptable degradation — never crash, never emit wrong delimiter.

### 19.3 unified pipeline plugin order — RESOLVED (empirically commutative for parsers)

**Probe result:** parser-extension `.use()` order is empirically commutative for our stack. The plugin ordering probe ran 6 orderings across 15 ambiguous inputs and produced identical mdast trees for all of them. Micromark dispatches constructs via a fixed precedence table keyed on tokenizer character + type — not plugin registration order. See `tech-probes/plugin-ordering/REPORT.md`.

**Recommended order (readability convention, not correctness requirement):**

```ts
unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])   // 1. doc-level first
  .use(remarkMdx)                      // 2. MDX structural layer
  .use(remarkDirective)                // 3. alternative container syntax
  .use(remarkGfm)                      // 4. content constructs
  .use(remarkWikiLink)                 // 5. custom extension
  .use(positionSliceWalker)            // transformer — runs on mdast
  .use(remarkProseMirror, { schema, handlers })  // transformer
  .use(remarkStringify);
```

**What DOES matter:** transformer ordering. `positionSliceWalker` must run after all syntax extensions have produced their mdast (so position data is final) and before `remarkProseMirror` (so handlers can read `node.data.*`). `remarkProseMirror` must be the last transformer before `remarkStringify`.

**Known MDX semantics caveats (documented, not fixable by ordering):**
- `---` inside a JSX block parses as `thematicBreak` — escape to `\---` or wrap in code fence for literal preservation (user-facing limitation)
- Block-level GFM (tables, tasklists) inside inline `<Note>...</Note>` silently flattens to inline text — use `<Note>\n\nblock\n\n</Note>` form to get block children

### 19.4 MDX trio version pinning

`remark-mdx`, `mdast-util-mdx`, and `micromark-extension-mdxjs` move as a coupled unit (they share internal types). When pinning `remark-mdx@3.1.1`, **also pin the other two to their matching versions** to avoid ABI drift. Use `bun pm view <pkg>` to check the version-matrix in `remark-mdx@3.1.1`'s dependencies.

### 19.5 Known MDX edge cases (beyond #2533)

- **mdx-js/mdx#2608** — boolean JSX attributes serialize inconsistently (`<Icon disabled />` vs `<Icon disabled={true} />`). Closed as "not planned." Unlike #2533 (non-converging), this one normalizes to one form on first serialize and then converges. Less severe than #2533, but worth a test case in the MDX round-trip suite.
- **remark-mdx expression handling** — block expressions (`{value}` on own line) may re-indent their contents on parse. Verify the `mdxFlowExpression` handler preserves verbatim.

### 19.6 prosemirror-flat-list integration — nested NodeSpec wrapper (LOCKED per D15/§17.2)

**D15 locks the nested schema shape** (`list` containing `listItem+`, matching mdast). §17.2 reinforces this. §19.6 previously reopened this as an "implementer decision" — that was incorrect and has been retracted.

**Implementation guidance:** prosemirror-flat-list's native schema is flat (items are direct doc children with a depth attribute). Our `R19` wrapper defines a **nested** NodeSpec that matches mdast, and uses flat-list's utilities (input rules, keymap, commands) against that wrapper. This is a well-established TipTap pattern — extensions routinely define their own NodeSpec while delegating to lower-level prosemirror-* utilities.

**Open validation item (OQ1):** Tab/Shift-Tab scoping to list context. flat-list's `createListKeymap` assumes the flat schema; the wrapper must either (a) port the keymap logic against the nested shape, or (b) use flat-list's keymap verbatim and verify it traverses the nested structure correctly. First-day R19 work.

**Prior-pass concern now closed:** the R1 probe used `prosemirror-schema-basic` (not flat-list), so D15's schema choice hasn't been end-to-end validated against flat-list itself. A focused list-integration validation is part of R19's first commit (not a separate probe).

### 19.7 Probe (R1) checklist — COMPLETED 2026-04-12

All pre-flight gate checks completed via `tech-probes/r1-preflight-gate/` + `tech-probes/wiki-link-micromark/` + `tech-probes/plugin-ordering/`. Summary:

| Check | Result |
|---|---|
| 118-case round-trip (target ≥77/118) | **97/118 (82.2%)** — 26% improvement over baseline |
| 13 P0 entity/escape cases | 12/13 — fix path identified for `\#` (R5 amendment) |
| Position data coverage across full plugin chain | **100%** across 9 diverse inputs |
| `html` raw content preservation (Q4) | Confirmed — no new regressions vs. NG5 |
| `definition` override round-trip (R12) | Byte-identical for simple + titled forms |
| MDX multiline expression stability (#2533) | Converges — I3 stability holds |
| Wiki-link 4 shapes (Q5) | 20/20 tests pass as micromark extension |
| Unknown mdast type throws fail-fast | Confirmed — `Error: unknown markdown node: <type>` |
| Plugin ordering ambiguities | Empirically commutative for parser extensions |

**Implementation learnings carried into R5/R8 amendments:**
- Custom `text` handler must strip `&` + `<` from unsafe list (otherwise literals get backslash-escaped)
- Custom `link` handler writes URLs verbatim (avoid `&` escaping in `destinationRaw`)
- `mdxJsxFlowElement` handler is the single largest — must serialize attributes + children
- PR #3 patch equivalent (NBSP transform for whitespace-only text) confirmed working
