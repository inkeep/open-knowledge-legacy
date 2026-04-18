# Component Blocks v2 — Typed Props + Inline Children + Block UX — Spec

**Status:** Draft (D1–D10 locked; baselined on post-#136 main; ready for audit + challenger)
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-14 (post-#136 rebase)
**Baseline commit:** 699a27e
**Supersedes:** PR #23 (typed-component-nodes), `specs/2026-04-10-block-editor-ux/SPEC.md`
**Foundation (shipped on main):** PR #136 / MDX Tolerant Parsing (merged 2026-04-14 22:29 UTC) landed the full #105 implementation: `jsxInline` at Layer 3 target shape (`packages/core/src/extensions/jsx-inline.ts`), `rawMdxFallback` (`packages/core/src/extensions/raw-mdx-fallback.ts`), agnostic MDX mode (`packages/core/src/markdown/remark-mdx-agnostic.ts`), `parseWithFallback` (`packages/core/src/markdown/parse-with-fallback.ts`), schema add-only invariant (`packages/core/src/schema-invariant.test.ts` + `schema-snapshot.json`), y-prosemirror patch (`patches/y-prosemirror@1.3.7.patch`), `remark-directive` removal, observability metrics (`packages/core/src/metrics/parse-health.ts`). **Our spec is fully additive on top of #136 — no coordination needed.**
**Related recent PRs affecting us:**
- **PR #128 (merged 2026-04-14):** Observer A origin-aware diff — `applyUserDelta` rewritten to preserve CRDT Items when content matches. Origin constants exported as `ORIGIN_TREE_TO_TEXT` (`'sync-from-tree'`) and `ORIGIN_TEXT_TO_TREE` (`'sync-from-text'`). Our source-dirty observer consumes this origin model.
- **PR #126 (merged 2026-04-14):** extension-aware docName — `.mdx` files are first-class peers alongside `.md`. Our component editing applies to both extensions uniformly.
- **PR #127 (merged 2026-04-14):** file-tree "+" button for new file/folder. Our block-level SideMenu "+" is a different UX surface (in-editor vs sidebar) — no conflict.
- **PR #39 (merged 2026-04-14):** Timeline with rollbacks — adds `'rollback-apply'` LocalTransactionOrigin. Handled in our source-dirty observer's non-user-intent guard list.
**Links:**
- Parent PRs on main: #83, #94, #101, #51, #53, #95, #98, #76, #39, #128, #126, #127, #136
- Foundation spec (now on main): `specs/2026-04-13-mdx-tolerant-parsing/SPEC.md`
- Audit driving this spec: `specs/2026-04-08-typed-component-nodes/meta/audit-findings-rebase-vs-rewrite.md`
- Salvage source: `.claude/worktrees/pr23-rebase/` (registry + PropPanel + component-items)
- Competitive research: `reports/block-editor-component-ux-patterns/`
- Evidence: `./evidence/` — worldmodel.md, mdx-editor-component-patterns.md, serialize-roundtrip-probe.md, prosemirror-schema-evolution.md
- Changelog: `./meta/_changelog.md`

---

## 1) Problem statement

**Situation:** open-knowledge ships a CRDT-collaborative MDX editor. Post-PR-#83 (remark-prosemirror migration), MDX JSX parses to atom-only `jsxComponent` PM nodes that store raw source in a `content` attribute. `JsxComponentView.tsx` regex-matches for a hardcoded `Callout` branch — every other JSX component renders as opaque raw-looking code. There is no prop editing UI, no inline-children editing, no visual insertion, no block-level affordances. Two in-flight feature lines can't land:
- **PR #23 / typed-component-nodes:** scaffolded against the pre-migration pipeline that PR #83 deleted; 13 audit findings (7 high) confirm internal incoherence against post-#83 main.
- **block-editor-ux SPEC:** explicitly depends on T1 landing first.

**Complication:** Rebasing PR #23 is strictly worse than a clean rewrite (audit findings H1-H4). The greenfield directive forbids carrying stale scaffolding (jsxTokenizer remnants, acorn, custom tokenizer fields). The competitive gap stays sharp: opaque JSX blocks vs Notion/Gutenberg/GitBook which ship prop panels, editable children, drag-handle UX as table-stakes. And the MDX tolerant parsing work (#105, ready for implementation) explicitly scopes typed-component editing TO this spec per its NG3.

**Resolution:** One combined SPEC baselined on post-#136 main that ships Layer 2 (typed props) + Layer 3 (inline rich-text children, **both block and inline**) + block UX interaction layer in a single coordinated cutover, additive on top of #136's shipped primitives. Three architectural pillars:

1. **Widen `jsxComponent` to one non-atom node with runtime descriptor dispatch.** Follows the MDXEditor pattern (confirmed convergent prior art for runtime-registration editors — `evidence/mdx-editor-component-patterns.md`). Registration is a render-time lookup against a descriptor registry (with a wildcard `'*'` for unregistered), not a schema-level distinction. Adding a descriptor upgrades every existing instance of that component name at render time, with zero schema migration. The one-node shape is chosen so the descriptor registry can later extend to user-registered custom components (NG13) without any schema change.
2. **Dirty-tracking hybrid serialization (γ pattern).** Pristine nodes serialize via `sourceRaw` → byte-identical round-trip (preserves #136's invariant: *"raw content passes through unchanged"*). Edited nodes serialize via `mdxJsxFlowElement` mdast reconstruction. A `sourceDirty: boolean` attr + a transaction-origin-aware observer plugin tracks the distinction. Applies uniformly to both `jsxComponent` (block) and `jsxInline` (inline) — sets one architectural precedent for all editable MDX nodes.
3. **Symmetric Layer 3 for block and inline.** Same descriptor registry, same dirty-tracking, same prop-panel architecture. Block uses a floating Radix popover; inline uses an anchored Radix popover over the inline span. Users edit any registered MDX component in WYSIWYG; the unregistered fallback (wildcard descriptor) renders a name badge and keeps children editable as markdown.

Our spec is fully additive on #136's shipped primitives. Baseline locked: `699a27e`.

---

## 2) Goals

- **G1. Native block-component editing.** Slash-insert a Callout → click → PropPanel with auto-generated controls from TS interface; click into children → full WYSIWYG editing (bold, links, lists, nested components).
- **G2. Inline JSX round-trips byte-identically as source text.** Single-line MDX JSX (`<Icon />`, `<Badge>x</Badge>`, etc.) renders as visible inline source text in WYSIWYG — characters editable like any prose. No descriptor dispatch, no PropPanel popover, no chrome chip. The thin `jsxInline` PM node exists ONLY to preserve `<` and `>` characters through the serializer without escape (technical fidelity requirement). Live-rendered inline-component editing — descriptor-dispatched React render with click-to-popover PropPanel — is **deferred per NG14**; full prior design preserved in `evidence/inline-component-editing-deferred.md`.
- **G3. Registration is configuration, not code.** Adding any built-in component requires adding a descriptor to the committed built-ins manifest (one object literal in `packages/core/src/registry/built-ins.ts`). No regex edits, no conditional render branches, no schema files, **no document migration for existing instances of the newly-registered component.** (User-registered custom components deferred per NG13; the Map-keyed descriptor registry is designed as a stable extensibility seam for that future re-spec — see `evidence/custom-components-deferred.md`.)
- **G4. Concurrent editing is structurally correct.** Different props of the same component: attribute-level LWW. Different children regions: char-level CRDT merge. Works for both block and inline.
- **G5. Byte-identical round-trip for pristine nodes; idempotent normalization for edited nodes (NG12).** `sourceRaw` authority for pristine. Reconstruction via `mdxJsxFlowElement` for edited. Custom flush-left to-markdown handler prevents indentation stacking. Subsequent saves after first-edit are stable (probe evidence: 10/10 cases idempotent).
- **G6. Block UX Phase 1.** SideMenu drag handle + "+" insertion + child-badge suppression + floating PropPanel via `@tiptap/extension-drag-handle-react`.
- **G7. Block UX Phase 2.** Esc/Enter keyboard dual-mode, custom command for isolating-boundary Enter, Suggestion-aware Escape priority chain (collapses slash+wiki-link paths per #53).
- **G8. Clean cutover.** PR #23 closes with "superseded by #NNN"; block-editor-ux SPEC archives with SUPERSEDED-BY.md; no carry-over tech debt.
- **G9. Per-node rendering independence (ancestor-chain locality).** A broken node affects only its own ancestor chain — never its siblings, nor descendants of siblings, nor unrelated subtrees. Both modes (source + WYSIWYG) always render the current Y.Text state. No document-wide "freeze" or "pause"; broken blocks render as `rawMdxFallback` chrome in place, with structured siblings + ancestors (where the ancestor is recoverable) unaffected. Achieved via Observer B using `parseWithFallback` (replaces current bare `parse`) + a single-pass structural enumeration in `findFallbackRegion` (stack-based enumeration of pairs + unmatched-opens) that produces the tightest fallback region containing a broken node — preserving outer structure whether the broken node is properly paired OR an unclosed partial.

  **Explicit design trade-off (anti-freeze bias):** Always-live trades WYSIWYG stability during source-mode partial typing (the one block containing a partial tag appears as `rawMdxFallback` chrome that resolves when syntax completes) for document-wide liveness (no broken region anywhere in the doc blocks unrelated edits from propagating to WYSIWYG). We accept this trade-off because freeze's all-or-nothing behavior is strictly worse for brownfield authoring than transient visual instability during intentional source editing. Mitigation: `DEBOUNCE_MS=50ms` coalesces rapid keystrokes; the rawMdxFallback chrome renders the user's raw text in-place (not a disruptive layout shift); only the block being typed in flickers (surroundings stable per G9).

## 3) Non-goals

- **[ABSORBED INTO NG13] NG1:** File-system scanning for user component discovery (auto-scan `mdx-components.tsx` at project root). Absorbed into NG13 because it's meaningful only once user-registered custom components re-enter scope. See NG13 and `evidence/custom-components-deferred.md`.
- **[NOT NOW] NG2:** Multi-content-hole components (e.g., `<Card>` with `title: ReactNode` AND `children: ReactNode` as separate editable regions). P0: only `children` is inline-editable; other ReactNode props fall back to text input in the panel. Revisit: >10% of usage shows secondary ReactNode prop pain.
- **NG3 (refined):** Per-block code editing for structured nodes (editing `<Callout>`/`<Tabs>`/etc. source inline in WYSIWYG) is **NG10** (see below) — the per-block source-mode toggle. For `rawMdxFallback` (the parse-failure PM node type), nested CodeMirror IS provided via FR-30..FR-34 and §9.14 — parse-failure content is inherently source-level, and the source editor is the natural tool for editing source.
- **[NOT UNLESS] NG4:** Context-aware slash-command filtering by parent container. Only if: UX testing shows invalid-child insertion is a real friction pattern.
- **[NEVER] NG5:** Separate `.json` wire-format alongside the generated `components.ts`. TypeScript IS the wire format; MCP endpoints derive JSON at request time.
- **[NEVER] NG6:** Two-node schema split (`jsxComponentEditable` + `jsxComponentVoid`). Evidence: MDXEditor and Plate (runtime-registration editors) use ONE node type with descriptor dispatch; only compile-time-schema editors (BlockNote, Sanity) use per-block types. Our custom-component requirement rules out the compile-time pattern. See §10 D1.
- **[NEVER] NG7:** "Normalize on every serialize" (Option α from rejected prior design). Violates #105's invariant *"raw content passes through unchanged"* for pristine nodes on unrelated saves. The γ dirty-tracking pattern preserves byte-identity for pristine and normalizes only on edit.
- **[NEVER] NG7a:** Silent content hiding. No `display: none` on NodeViewContent, no read-only sourceRaw chrome covering broken-component children, no `data-*` attribute hiding of tag names. Per Precedent #24, all user content is always visible AND editable. Chrome (toolbars, badges, panels, error-state borders) is conditional and may be hidden; CONTENT is unconditional and always rendered. If a state would otherwise hide content, it must instead surface the embedded source editor (nested CM, §9.14) so the user can fix in place.
- **[NOT UNLESS] NG8:** Custom drop-target restriction via `handleDrop` editor prop. Schema `content: 'block*'` permits any block inside any component; invalid cross-container drops (dragging a Callout into a Steps container expecting Step children) fail silently via schema validation — no UI feedback, no error. Paired with NG4. Drop-target highlighting + custom `handleDrop` is a single future surface ("structural cross-container restrictions"). Only if: real authoring friction emerges from invalid-drop silent-fail.
- **[NOT NOW] NG9:** Component rename/transformation UI (changing `<Callout>` → `<Note>` via right-click / PropPanel menu). P0 users rename in source mode. Transformation as an editor affordance is reserved for a future spec. Future Work (Explored tier).
- **[NOT NOW] NG10:** Per-block source-mode toggle (right-click any block → "Edit as source" → swap to embedded CodeMirror inline). The nested CodeMirror infrastructure shipped in FR-30..FR-34 for `rawMdxFallback` is forward-compatible, but exposing it as a per-block affordance is deferred. Aligned with NG9 — the primary use case is transformation, which stays deferred.
- **[NOT NOW] NG11:** Conditional prop visibility (`hidden(props)` callbacks on PropDef — e.g., show `icon` control only when `type !== 'info'`). Convergent pattern across Framer (`hidden(props)`), Plasmic (`hidden: (props) => ...`), and Storybook (`if: { arg: 'type', eq: 'warning' }`), but no concrete built-in component in our P0 set (swept: Callout, Card, Tabs, Accordion, Steps, Files — none have a conditional dependency between props) demands it. Adding it speculatively is over-engineering; revisit only when a registered built-in needs conditional control.
- **[ACCEPTED] NG12:** Edited-node quoting normalization. When a jsxComponent is edited (`sourceDirty: true`), the γ serialization path reconstructs the tag via `mdast-util-mdx-jsx`, which produces minor normalization in attribute quote style (single → double quotes for string attrs), intra-tag whitespace, and blank-line count inside container bodies. Verified idempotent per M5 probe (10/10 cases: `serialize(parse(serialize(parse(X)))) === serialize(parse(X))`). Matches NG1/NG2/NG5 storage-layer fidelity-gap pattern. Formally named here for the cross-section references in §2 G5, §5 journeys, §6 Non-functional Reliability, §7 M6, §15 Risks. (jsxInline is exempt from NG12 — the thin shape per NG14 has no reconstruction path; text content IS the source, byte-identical round-trip.)
- **[NOT NOW] NG13:** User-registered custom components (beyond the 18-component built-ins manifest). Includes: `.open-knowledge/components.ts` loader, file-system `mdx-components.tsx` scanning, styling isolation for user components, MCP discoverability extension to user components, collision-resolution policy when a user-declared name shadows a built-in. **Complete prior analysis preserved in `evidence/custom-components-deferred.md` — do NOT lose that work; the re-spec reads it first.** Flipped from LOCKED P0 by user directive 2026-04-14 ("supporting a customer's custom components is a later out of scope issue"). Wildcard descriptor `'*'` path still handles non-built-in component names in user documents (legacy MDX, future fumadocs additions not yet in our manifest).
- **[NOT NOW] NG14:** Live-rendered inline-component editing (descriptor-dispatched React render of inline MDX JSX + click-to-popover inline PropPanel + InlineBadge chrome). Includes: `isInline: true` descriptors, JsxInlineView NodeView with chrome, inline PropPanel anchored to the span, inline-specific bridgeId, inline error boundary, inline slash menu insertion. **Complete prior analysis preserved in `evidence/inline-component-editing-deferred.md` — do NOT lose that work; the re-spec reads it first.** Deferred by user directive 2026-04-14 ("can inline jsx elements just be editable as normal inline text? i.e., don't pretty or special render them?") after investigation confirmed (a) fumadocs ships zero inline MDX components, (b) the 18-component manifest is entirely block-level, (c) the cost (inline NodeView + PropPanel + bridge + tests) was not justified by any concrete demand. P0 retains a thin `jsxInline` PM node for fidelity (preserves `<`/`>` chars through serialize); inline JSX renders as visible source text in WYSIWYG, editable like any prose.
- **[NOT NOW] PF04:** Tier-level timing regression gate for `bun run check:full:parallel` (no tier regresses > 10% vs main-branch baseline, refreshed quarterly). Requires bespoke turbo-timing capture infrastructure (parsing `.turbo/runs/*.json` or wrapping `time` around each tier) plus a quarterly baseline-refresh workflow. Quarterly cadence is not load-bearing for correctness — tier budgets drift slowly and are caught by per-test thresholds (PF01-PF03, PF05-PF06) before they aggregate into a tier-level 10% regression. The sister-spec perf regression gate (`packages/core/tests/perf/regression-gate.ts`) covers parse/serialize hot paths directly. Revisit only if tier-level regressions start occurring that aren't caught by per-test gates.

### Deferred to stacked follow-up PR (not non-goals, just post-#165)

> **Status at 2026-04-16.** PR #165 shipped the full architecture + 18 built-in components + nested-CM convergence, but the **full test suite specified in §6 (perf) + §7.1 (invariants) was not fully implemented before merge.** A stacked follow-up PR addresses the scope gap. **Not [NOT NOW]** — these remain P0 tests in the committed contract, deferred only in implementation sequence.
>
> - **Fidelity invariants I13-I17** — tests specified at §7.1 lines 249-253 but not yet implemented. Fixture registries are in place (commit `5bdc3870`).
> - **Perf tests PF01 + PF02** — specified at §6 lines 672-673 but deferred pending a DOM test environment setup (`happy-dom` + React.Profiler harness).
> - **`jsx-pristine-byte-identity.test.ts` refactor** — consume `loadBuiltInFixtures()` instead of inline literals.
> - **`ng-pinned.test.ts` NG12 extension** — wire 10 probe cases from the NG12 fixture.
>
> Full research context, per-test implementation patterns, DOM env decisions, risks, and verification checklists: [`evidence/deferred-invariants-and-perf.md`](evidence/deferred-invariants-and-perf.md).

## 4) Personas / consumers

- **P1: Authoring humans.** Writing MDX content. Care about: fast insertion, visual component editing (block + inline), inline text flow, keyboard shortcuts, concurrent collaboration, byte-identity for unedited content.
- **P2: AI coding agents / MCP clients.** Programmatic MDX authoring. Care about: predictable markdown output, structured component insertion, unambiguous prop shapes.
- **P3: Component contributors (Open Knowledge maintainers).** Adding components to the committed built-ins manifest. Care about: low-ceremony registration, auto-generated prop controls, no document migration when adding/removing a component. (End-user contributors via user-owned config files are out of P0 scope per NG13 — see `evidence/custom-components-deferred.md`.)
- **P4: Downstream consumers of the component manifest.** Agent docs generators, MCP tool schemas, docs site rendering. Care about: typed, stable, programmatically-queryable registry.

## 5) User journeys

**P1 block editing — typed prop + children:**
1. User types `/callout` → slash menu offers Callout (icon, category).
2. Enter → Callout block inserted with defaults; cursor lands in children content hole.
3. Types "Always run tests before deploying." → CRDT sync, live React render updates.
4. Clicks the block → floating PropPanel opens with `type: "warning|error|info"` dropdown.
5. Changes `warning → error` → JsxComponentView re-renders live.
6. Save → `<Callout type="error">\nAlways run tests before deploying.\n</Callout>` on disk (`sourceDirty: true` → reconstruction path).

**P1 inline JSX as source text (NG14 — no chrome, no popover):**
1. In prose (source OR WYSIWYG), user types `Click <Icon name="check" /> to submit.`
2. Both modes show the literal source characters (`<`, tag name, attrs, `/>`). No live React render of the Icon, no chrome chip, no popover.
3. User edits the `name` attr by placing the cursor inside `"check"` and typing `"star"`. Character-by-character text editing — same as any prose.
4. Save → `<Icon name="star" />` on disk byte-identical to what's in the editor.
5. (When the docs-site renders this MDX in production, the `<Icon />` renders as a real icon. In WYSIWYG, the source IS the rendering — fidelity-divergence by design per NG14.)

**P1 unrecognized inline component** (this is the `<CodeBlock> Hello </CodeBlock>` single-line case observed during #136 testing):
1. Source mode: user writes `<CustomThing>Some text</CustomThing>` on one line.
2. Micromark tokenizes as inline → jsxInline PM node (single-line JSX always lands here, even if stands alone).
3. WYSIWYG: renders the literal source `<CustomThing>Some text</CustomThing>` as inline text (jsxInline thin shape per NG14) — characters editable like prose. No chip, no chrome.
4. User doesn't touch it → save → sourceRaw emitted byte-identical.

**P1 unrecognized block component:**
1. Source mode: user writes `<CustomThing>\n\nSome **bold** text\n\n</CustomThing>` multi-line.
2. Micromark tokenizes as block → jsxComponent PM node.
3. WYSIWYG: renders name badge + editable children block.
4. User doesn't touch it → save → sourceRaw emitted byte-identical.
5. User edits children → save → `sourceDirty: true` → reconstruction path, NG12 applies.

**Note on single-line vs multi-line JSX tokenization (micromark rule):** JSX on a single line is always tokenized as `mdxJsxTextElement` (inline); multi-line JSX is `mdxJsxFlowElement` (block). This is structural to micromark-extension-mdx, not our choice. Users who want block rendering (e.g., a `<Chart />` as its own vertical element) write the multi-line form. Our NodeView renders both correctly with descriptor-appropriate affordance.

**P3 adding a new built-in (Open Knowledge maintainer):**
1. Maintainer writes React wrapper component with TypeScript props (or imports from fumadocs-ui directly).
2. Adds a descriptor entry to `packages/core/src/registry/built-ins.ts`:
   ```ts
   { name: 'DataViz', hasChildren: true, props: [...], Component: DataViz }
   ```
3. `bun run build-registry` extracts prop metadata via react-docgen-typescript. Ships on next release. **Every existing `<DataViz>` in user documents upgrades** at render-time — runtime descriptor lookup. PropPanel appears, live preview renders.
4. **No document migration. No Y.Doc mutation. No schema change.** Verified by y-prosemirror research: sync doesn't distinguish atom vs non-atom; descriptor lookup is pure render-time (evidence: `prosemirror-schema-evolution.md` Q1).

(End-user registration of non-built-in components is deferred — see NG13 and `evidence/custom-components-deferred.md`. The registry's `Map<string, JsxComponentDescriptor>` is designed as a stable extensibility seam for that future re-spec.)

**P3 de-registering:**
1. User removes `DataViz` from registry.
2. Existing `<DataViz>` instances downgrade at render-time to the wildcard descriptor — name badge + editable children + no PropPanel. Content preserved. Serialization path: if never edited since registration change, `sourceDirty: false` → sourceRaw emitted byte-identical.

### Interaction state matrix

| Surface | Pristine (sourceDirty=false) | Edited (sourceDirty=true) | Unregistered (wildcard) | Parse failure |
|---|---|---|---|---|
| Block JSX | sourceRaw serialize; full PropPanel + children editable via NodeView | Reconstruct serialize; PropPanel + children editable | Name badge, editable children, no PropPanel | Handled by #105 R6 → rawMdxFallback |
| Inline JSX (jsxInline thin per NG14) | Visible source text in WYSIWYG; round-trip byte-identical via raw-source-slice parser + html-mdast serializer | N/A — no `sourceDirty` for jsxInline; the text content IS the source | Same as registered — no chrome distinction (descriptor doesn't apply) | Inline malformed JSX falls through micromark to plain text; never reaches jsxInline. Block-level parse failures still go to rawMdxFallback. |

## 6) Requirements

### Functional (Must)

- **FR-1** Parse: `mdxJsxFlowElement` handler destructures `MdxJsxAttribute[]` into typed PM node attrs via descriptor's PropDef; `node.children` recurses via standard mdast→PM walker; `sourceRaw` stored on the node; `sourceDirty: false` on fresh parse.
- **FR-2** Parse: `mdxJsxTextElement` handler emits a `jsxInline` PM node containing a single text child whose value is the raw source slice — `originalSource.slice(node.position.start.offset, node.position.end.offset)`. The mdast children of `mdxJsxTextElement` are intentionally discarded; raw source wins. No descriptor lookup, no attr destructuring, no `sourceDirty` (per NG14 / FR-4). Round-trip fidelity guaranteed via byte-equal source preservation.
- **FR-3** Schema: `jsxComponent` widened from `atom: true` to `atom: false, content: 'block*', isolating: true, selectable: true, defining: true`. Existing `content: string` attr preserved (R10). New attrs added: `componentName`, `kind`, `attributes`, `sourceRaw`, `sourceDirty`.
- **FR-4** Schema: `jsxInline` thin shape per NG14 — `atom: false, content: 'text*', isolating: false, selectable: true`, **zero attrs**. No `sourceDirty`, no `sourceRaw`, no `name`, no `bridgeId`. The text content IS the source. Generic `<span data-jsx-inline="">{children}</span>` rendering — no NodeView component, no chrome, no descriptor dispatch. Greenfield directive: prior shipped `jsxInline` (#136) shape is replaced; no migration. Full §9.8 spec.
- **FR-5** Serialize (γ pattern, applies to `jsxComponent` only): nodeHandler computes `effectiveDirty(node) = node.attrs.sourceDirty || hasDirtyDescendant(node)` and emits `{ type: 'html', value: sourceRaw }` ONLY when `!effectiveDirty && sourceRaw` is non-empty; otherwise reconstructs `mdxJsxFlowElement` mdast from structured state + recursively-serialized children. **The `hasDirtyDescendant` walk is load-bearing** — a pristine parent whose descendant is dirty must NOT emit its own stale sourceRaw (which contains the descendant's old text), because that would silently drop the descendant's edit on save. During top-down serialization the walk is amortized: a parent forced to reconstruct then calls `state.all(node)` which recursively serializes each child through the same handler, so pristine children still emit their own sourceRaw inside the parent's reconstruction (composition preserves byte-identity for any still-pristine subtree). Implementation: `hasDirtyDescendant` is a bounded `node.descendants()` walk that short-circuits on first dirty find; cached per serialize cycle if hot. Walk skips `jsxInline` (no `sourceDirty` attr; trivially pristine-equivalent).
- **FR-5b** `jsxInline` serialize (separate from γ): `toMarkdownHandlers.jsxInline = (node) => ({ type: 'html', value: node.children?.[0]?.value ?? '' })`. Routes through `'html'` mdast type to bypass `mdast-util-to-markdown`'s text-context safety escaping (which would turn `<Icon />` into `\<Icon /\>` and break re-parse). The `'html'` type emits raw output verbatim.
- **FR-6** Custom `mdxJsxFlowElement` to-markdown handler emits children flush-left (zero indentation per depth); preserves blank-line separation between tag and first child. Bypasses library's depth-based `containerFlow()` indentation. Prevents CommonMark 4-space code-block hazard at nesting depth 2+.
- **FR-7** Source-dirty observer plugin: registers at editor setup; observes PM transactions; for each transaction whose `origin` is a user-intent origin (not `sync-from-text`, not `sync-from-tree`, not `agent-write`, not `rollback-apply`), walks the doc for **jsxComponent** nodes whose content fragment or structured attrs changed, marks them `sourceDirty: true`. (jsxInline is excluded per NG14 / FR-4 — has no `sourceDirty` attr; the text content IS the source.)
- **FR-8** Descriptor registry: `Map<string, JsxComponentDescriptor>` with runtime lookup. Wildcard `'*'` descriptor is always registered and acts as fallback. Registry source: **committed built-ins manifest at `packages/core/src/registry/built-ins.ts`** (18 components: 16 fumadocs-ui + Mermaid + Audio shadcn wrappers per D3). User-registered custom components (formerly D9/D10, now NG13) are out of scope; full prior analysis preserved in `evidence/custom-components-deferred.md`. The wildcard path still serves any non-built-in component names encountered in user documents (legacy MDX, future fumadocs additions not yet manifested). **Extensibility seam:** the `Map<string, JsxComponentDescriptor>` interface is designed as a stable seam for NG13. A future re-spec merges user descriptors into the same Map at startup with zero schema or registry-structure change (`userDescriptors.forEach(d => registry.set(d.name, d))`). See `evidence/custom-components-deferred.md` §1 for the preserved design work this seam is intended to support.
- **FR-9** NodeView (block): descriptor-dispatch at render. **Per the always-visible-content invariant (Precedent #24): NodeViewContent is ALWAYS rendered, never `display: none`.** Branches:
  - Registered + `hasChildren: true` → live React + ComponentToolbar + PropPanel + `<NodeViewContent>` (normal case).
  - Registered + `hasChildren: false` + **zero PM children** → live React + PropPanel + `<NodeViewContent>` rendered with **CSS zero-footprint** when empty (`min-height: 0; margin: 0; padding: 0`). No content hidden — there's no content. The wrapper is invisible because it's empty, not because it's `display:none`.
  - Registered + `hasChildren: false` + **non-zero PM children** → live React render attempted with the unexpected children passed through. If the React component handles them gracefully (renders or ignores), great. If it crashes, the ErrorBoundary fires → the NodeView swaps to the **invalid-state nested CM** (per FR-19 / §9.7). Either way, the children are visible — either as the React component's rendered output or in the source-editing CM. Never hidden.
  - Wildcard → UnregisteredBadge + `<NodeViewContent>` (children editable, no PropPanel).
  
  `hasChildren` is a PropPanel/slash-menu hint, not a structural constraint. Schema permits `block*` always.
- **FR-10** NodeView (inline): NONE. Per NG14, inline JSX is rendered as visible source text via the thin `jsxInline` PM node — no NodeView chrome, no descriptor dispatch, no PropPanel. Generic span wrapper (`<span data-jsx-inline="">{children}</span>`) is sufficient. The "rich inline-component editing" scope (descriptor-dispatched live React + click-to-popover) is preserved in `evidence/inline-component-editing-deferred.md` for the NG14 re-spec.
- **FR-11** PropPanel (block): Radix popover floating near the block. Auto-generated controls from PropDef: string→text input, boolean→toggle, enum→dropdown, number→numeric input; ReactNode hidden (content hole is the edit surface); unknown types hidden. **Panel suppressed when no editable props exist** (descriptor with only ReactNode props, e.g. `<Step>` whose only prop is `children: ReactNode`) — empty panels waste visual space. Filter: `descriptor.props.filter(p => p.type !== 'reactnode').length > 0`.
- **FR-12** PropPanel (inline): NONE. Deferred per NG14. Inline JSX is editable as source text in WYSIWYG; users edit attrs by placing the cursor inside the tag and typing.
- **FR-13** PropPanel change handlers (block-only; inline has no PropPanel per NG14): write structured attrs via `editor.commands.updateAttributes('jsxComponent', { [propName]: value, sourceDirty: true })`; also call `markUserTyping(getYDoc(editor))` for Observer B typing-defer integration.
- **FR-13a** PropPanel is wrapped in `<div contentEditable={false} onMouseDown={(e) => e.stopPropagation()}>`. Without `stopPropagation`, every input click inside the panel deselects the node → PropPanel unmounts mid-interaction (mount-on-selected pattern). ProseMirror docs-standard pattern for clickable controls inside NodeViews.
- **FR-13b** When a selected component is a child of another jsxComponent (nested Step inside Steps), PropPanel renders a breadcrumb header showing the ancestor chain (e.g., "Steps > Step") with clickable segments that call `editor.commands.setNodeSelection(ancestorPos)`. Pairs with child-badge suppression (FR-17) — ensures users selecting a nested child have visible ancestor context.
- **FR-14** Slash menu: lists all registered (block) components with category grouping + `searchTerms` fuzzy matching (e.g., `/warning` → Callout). Pluggable `itemsSources` API from PR #51. The descriptor registry contains only block components per NG14 — no `isInline` field needed. Inline JSX is typed directly in source as text (jsxInline thin shape); inline slash insertion is in the NG14 deferred scope.
- **FR-14a** Slash-inserted components arrive with default attrs populated via fallback ladder: `descriptor.props[i].defaultValue` (if set) → first enum value (for enum) → `false` (for boolean) → `0` (for number) → `''` (for string). Users expect "insert Callout → see a Callout" (matches Notion/Webstudio convention); without defaults, newly-inserted components render empty or broken until the user fills in required props.
- **FR-15** SideMenu via `@tiptap/extension-drag-handle-react@3.22.3` + `@tiptap/extension-drag-handle@3.22.3` (peer). Drag handle grip + "+" button as sibling children in the `<DragHandle>` wrapper. Required `NodeViewWrapper` attrs: `data-drag-handle=""` + `draggable="true"`; handle elements use `contentEditable={false}`. `onNodeChange` dedups by block identity (safe to `setState` on each invocation). `lockDragHandle()` / `unlockDragHandle()` freeze visibility while context/slash menus are open.
- **FR-16** "+" button inserts empty paragraph after hovered block → inserts `/` character → triggers Suggestion slash menu (TipTap vendor-endorsed pattern).
- **FR-16a** Empty-container placeholder: when a registered container component (descriptor's `emptyChildName` is set — Steps/Tabs/Cards/Files in P0) has zero child components, render a clickable placeholder "Click to add a {child}". On click, insert one instance of `descriptor.emptyChildName` with default props (FR-14a ladder) and place cursor in its children. Hardcoded for the 4 known container patterns — general context-aware filtering remains NG4.
- **FR-17** Child badge suppression: NodeView reads parent via `doc.resolve(getPos()).parent.type.name === 'jsxComponent'`; if true, omits ComponentToolbar on that instance. Paired with FR-13b breadcrumb so selection context remains visible.
- **FR-17a** `setNodeSelection(getPos())` click induction: clicking the ComponentToolbar on a non-atom `jsxComponent` block programmatically sets a `NodeSelection` via `editor.commands.setNodeSelection(pos)`. ProseMirror does NOT auto-NodeSelect on click to `contentEditable={false}` regions of non-atom nodes — without this explicit handler, clicks can't open the PropPanel (mount-on-selected) and Esc/arrow keyboard-nav state machine can't start. (Inline `jsxInline` doesn't need this — it has no NodeView chrome and no PropPanel per NG14.)
- **FR-18** Keyboard nav Phase 2 (L1-L4 tiered — see §9.11): L1 Esc → `selectParentNode`, L2 Arrow Up/Down between blocks in nav mode, L3 custom Enter command for container-exit (with return-false error contract), L4 Escape priority chain coordination. L1+L2+L4 is the MVP floor; L3 descopes to Explored Future Work only if implementation-time edge cases surface beyond A5 source verification.
- **FR-19** Third-party component render errors are isolated per-instance via `ComponentErrorBoundary` wrapping the rendered React component (block jsxComponent NodeView only — inline jsxInline doesn't render React per NG14). On catch, the NodeView swaps from "live React render" to **invalid-state nested CodeMirror editor** showing the block's source (reconstructed from attrs+children if `sourceDirty`, or `sourceRaw` if pristine). User edits the source in CM → on commit (blur or throttled), the block is re-parsed via block-scoped `parseWithFallback`; if it parses cleanly to the same component name, attrs+children update and the NodeView re-attempts the live React render; if still throws, returns to CM; if parses to a different valid component, dispatches replaceNode to the new type; if parses to rawMdxFallback, dispatches replaceNode to rawMdxFallback. **Per the always-visible invariant (Precedent #24): the source is always editable in the CM editor — no read-only chrome, no Retry button (auto-retry happens on every commit).** Class-component boundary triggers state to swap render branch. Per-instance isolation: one bad component → only that instance shows CM chrome; siblings continue rendering normally. Detail in §9.7.
- **FR-20** Hover outline on registered component blocks + inline elements: subtle dashed border on hover (`:hover:not(.is-selected)`), solid accent border when selected. ~10 lines CSS per §9.7/§9.8. Discoverability affordance for "this is interactive" before the SideMenu appears (SideMenu has ~200ms hover delay).
- **FR-21** `reconstructAttrs` has merge semantics for unknown-attr preservation: starts from the mdast `attributes` array preserved at parse time, overlays descriptor-mapped structured attrs on top (descriptor wins only for PropDef-declared keys; all other keys pass through). Prevents γ-dirty path from silently dropping user-supplied attrs not known to the descriptor (e.g., agents-docs `<Card color="#F05032" external>` when fumadocs Card PropDef has neither).
- **FR-22** Observer B bridge always-live (G9). `packages/app/src/editor/observers.ts:461` replaces its bare `mdManager.parse(body)` call (and the associated *inner* try/catch that swallows `SyntaxError | VFileMessage | RangeError`) with `mdManager.parseWithFallback(body)`. The outer try/catch at `observers.ts:529` (which routes genuinely unexpected errors to `onSyncError`) remains — only the parse-failure freeze path is removed. `parseWithFallback` never throws (verified line-by-line against `parse-with-fallback.ts`) — it always produces a valid `JSONContent` tree, falling back to `rawMdxFallback` for unparseable spans. The surrounding `applyJsonToFragment` call becomes unconditional; no freeze path remains.

  Rationale: every other caller of the parse pipeline (persistence.ts:358, external-change.ts:39, api-extension.ts:1457, agent-sessions.ts:58) already uses `parseWithFallback` — Observer B is the sole outlier. The freeze on Observer B was a #136 flicker-avoidance choice that becomes unnecessary once `findFallbackRegion` is ancestor-aware via single-pass enumeration (FR-23) — broken blocks stay rawMdxFallback-chromed in place; structured siblings/ancestors keep rendering. Eliminates document-level liveness denial where one broken region anywhere in the doc (legacy typo, unregistered custom with malformed attr, mid-edit partial JSX) otherwise freezes all WYSIWYG preview.

  **Observer A already handles rawMdxFallback nodes.** Since #136 shipped, `rawMdxFallback` nodes have existed in XmlFragment via persistence load and external-change paths. Observer A's serializer for `rawMdxFallback` emits `{ type: 'html', value: pmNode.textContent }` at `packages/core/src/markdown/index.ts:696-699` — byte-preserving. FR-22 adds Observer B's re-parse as a third source of rawMdxFallback in XmlFragment but introduces no new node type or serialization path; round-trip through Observer A is already exercised.

  **Two-layer idempotence mitigation (addresses C-H3).** For pristine jsxComponent/jsxInline nodes (`sourceDirty: false`, verbatim sourceRaw), Observer B's re-parse is idempotent and does not churn CRDT state:
  1. **`observers.ts:442` early-exit** — `currentBody = mdManager.serialize(currentJson); if (currentBody === body) { ...; return; }`. When XmlFragment already serializes to the same markdown as Y.Text, `parseWithFallback` + `applyJsonToFragment` are skipped entirely. Covers the common case where an unrelated Y.Text change triggered Observer B but the content affecting the pristine node hasn't changed.
  2. **y-prosemirror `equalYTypePNode` deep-equal** (`node_modules/y-prosemirror/src/plugins/sync-plugin.js:993-1007`) — when re-parse does run, this function compares both attributes (via recursively deep-equal `equalAttrs` at line 929) and children. For pristine nodes, parse is deterministic (sourceRaw extracted verbatim from unchanged source position; `attributes` array structurally identical across parses); `equalYTypePNode` returns true; the child-matching loop in `updateYFragment` skips unchanged Y.XmlElements. No attr mutation, no delete+reinsert, no CRDT traffic for unchanged pristine nodes.

  The CLAUDE.md precedent #10 warning about "atom nodes trigger delete+reinsert on any attr change" does NOT apply to our widened `jsxComponent` (`atom: false, content: 'block*'`); for content-bearing nodes `updateYFragment` recurses via `setAttribute` (surgical, non-destructive) at sync-plugin.js:1171-1189 when a Y.XmlElement needs attr updates.
- **FR-23** `findFallbackRegion` single-pass structural enumeration (G9). `packages/core/src/markdown/parse-with-fallback.ts:findFallbackRegion` (currently at line 214) is rewritten to compute the fallback region from a single stack-based enumeration of the source's MDX structure. No widen loop, no try-excision-validate dance, no iteration cap. Algorithm:

  1. **`enumerateFallbackRegions(src)`** — fence-aware single scan of `src`. Walks open/close tag events in source order against an open-tag stack:
     - Open tag → push onto stack. Self-closing `<Foo />` (terminator `/>` in source) does **not** push.
     - Close tag → pop stack to matching name. For each tag between the top of stack and the match, emit an **unmatched-open region** with `start = open.start, end = min(close.start, nearestBlankLineAfter(src, open.start) ?? src.length)` — the evicting close's position, capped by the nearest blank line so unmatched spans don't swallow downstream paragraphs. Emit the matched tag as a **paired region** with `start = open.start, end = close.end`. Close tags that find no matching open in the stack are dropped as orphans.
     - At EOF, each remaining open on the stack emits an unmatched-open region with `end = min(src.length, nearestBlankLineAfter(src, open.start) ?? src.length)`.
  2. **`findFallbackRegion(src, errorOffset)`** — returns the smallest region (pair or unmatched-open) whose span contains `errorOffset`. If no region contains the offset, falls back to blank-line block bounds (current-main behavior, retained for purely-prose position-less errors).

  **Why this algorithm works in one pass:** a broken inner node is always contained by either (a) a properly-paired ancestor, or (b) an unmatched-open region representing its own partial structure — whichever is innermost. The chosen region encompasses exactly the tag span whose presence unbalances the parse; excising it always leaves a structurally-balanced surround. No validation loop needed.

  **Complexity:** `enumerateFallbackRegions` is O(n) (one regex scan + O(1) stack work per tag event); `findFallbackRegion` is O(regions) per call. No iteration. No `parse()` invocations inside `findFallbackRegion` (contrast with any widen-iterative approach that would re-parse per ancestor step).

  **Ancestor-chain locality property (G9):** the emitted region is the tightest structural boundary around the broken node.
  - **Properly-paired inner broken** (State-3 of today's recursive split, e.g. `<Image src="` inside `<Accordion>` inside `<Accordions>`): innermost pair = broken inner `<Accordion>` → only that Accordion degrades. Sibling Accordion + outer Accordions preserved.
  - **Unmatched-open inner child** (child never closes, but outer wrapper does, e.g. `<Accordions><Accordion>First</Accordion><Accordion broken</Accordions>`): unmatched-open region = second `<Accordion>.start` to `</Accordions>.start` → only that partial child degrades. Outer wrapper and its closed sibling preserved.
  - **Top-level orphan** (tag mismatch with no enclosing structure): unmatched-open region bounded by blank line → only that paragraph becomes rawMdxFallback. Surrounding paragraphs preserved.

  FR-23 applies to the algorithm used by *every* `parseWithFallback` caller — persistence, external-change, rollback, agent-sessions, and (per FR-22) Observer B. The improvement is unified, not Observer-B-specific.

  **Safe-coarsening guarantee (v1).** The algorithm has two known coarsening cases, both empirically traced against `micromark-extension-mdx` agnostic mode. In each case the fallback is safe (never loses content, never degrades unrelated structure) but may be wider than ideal:

  1. **Unclosed attribute quote in an open tag** (e.g. `<Accordion broken attr="`). `scanTagEvents`'s forward-scan tracks double-quote state to avoid splitting on `>` inside attribute values. When a quote never closes, the scanner never finds `>` outside quotes and emits no TagEvent for that open tag — the malformed tag is invisible to the stack. micromark reports error offset at EOF (not at the malformed tag's position), so the error falls into the innermost well-formed enclosing pair (e.g., the outer `<Accordions>`) and that whole pair becomes the rawMdxFallback. This is safe (the enclosing pair's siblings and ancestors still render) but coarser than "only the broken child degrades."
  2. **JSX expression attributes with `>` inside braces** (e.g. `<Comp filter={x > 5}>`). The forward-scan doesn't track brace depth in v1. If such a tag appears in a document that ALSO has an unrelated error elsewhere, `scanTagEvents` may misidentify the intra-brace `>` as the tag terminator and produce a conservative (superset) fallback region for the well-formed tag. If the document has no errors, `scanTagEvents` never runs and this case doesn't trigger.

  **Precision enhancements (Future Work, reversible):**
  - **Malformed-open TagEvent:** `scanTagEvents` could emit a synthetic `malformed-open` event at tag-start-position when forward-scan reaches EOL/EOF without finding `>` outside quotes. `findFallbackRegion` would treat such events as unmatched-open regions and, when the micromark error offset is past the malformed span but inside an enclosing pair, snap the effective offset to the innermost malformed-open inside the pair. Recovers case 1 precision. Estimated ~30-40 LoC.
  - **Brace-depth tracking:** add `{`/`}` depth counter alongside quote state in the forward-scan; recognize `>` as tag-terminator only at depth 0 outside quotes. Recovers case 2 precision. Estimated ~10 LoC.

  Both enhancements are additive (do not change the v1 algorithm's safety properties) and can be added based on real-world telemetry showing the coarsening is too aggressive. Neither is required for the G9 contract at the paired-ancestor level.
- **FR-24** Render-failure editability — **invalid-state nested CodeMirror** (Precedent #24 unified mechanism). `ComponentErrorBoundary` catches a thrown render → NodeView swaps render branch from "live React" to "nested CM editor" showing the block's source (reconstructed from attrs+children if `sourceDirty`, or `sourceRaw` if pristine). User edits the source in CM (per the always-visible-content invariant — source IS visible AND editable, never read-only). On commit (blur or throttled), block-scoped `parseWithFallback` re-parses; if the result re-renders cleanly, NodeView switches back to live React; if still throws, returns to CM; if parses to a different valid component, dispatches replaceNode; if parses to rawMdxFallback, dispatches replaceNode to rawMdxFallback. **Symmetric with rawMdxFallback (parse failure)** — both invalid states use the same nested CM mechanism (§9.14). No Retry button (auto-retry happens on every commit). No read-only chrome. No childrenFallback separate path (children are part of the source the user is editing).
- **FR-25** CSS variable bridge for fumadocs-ui. `packages/app/src/globals.css` declares `--color-fd-*` variables mapping fumadocs's CSS variable namespace to the existing shadcn design tokens, plus static callout semantic colors, plus `fd-steps`/`fd-step` utility classes, plus `fd-accordion-*` + `fd-collapsible-*` keyframes, plus a `@source` directive for Tailwind to scan fumadocs-ui dist. Full content in §9.7a. Without this, fumadocs components render unstyled in the editor. Does NOT import `fumadocs-ui/style.css` (3296 lines, conflicts with our base layer) or `preset.css` (conflicts with our `@custom-variant dark`).
- **FR-26** `fumadocs-core/link` Link and `fumadocs-core/framework` Image gracefully degrade to `<a>` and `<img>` respectively without a FrameworkProvider — verified via source read at `node_modules/fumadocs-core/dist/chunk-K4WNLOVQ.js` (see `reports/fumadocs-container-behavior/REPORT.md` §3). No shim or provider is required. Only `useRouter()`, `usePathname()`, `useParams()` throw without FrameworkProvider — none of our P0 built-ins call these.
- **FR-27** Context Bridge Registry. Ancestor NodeViews of compound-component parents (Tabs, Accordion) publish their scope-resolved React Context values to an editor-scoped bridge store keyed by a stable `bridgeId` sourced from a ProseMirror PluginState (Q10 LOCKED → Option A; see FR-29). A `ContextCapture` helper rendered inside the compound's real React subtree reads the live Context values via `use()` / `useContext()` and calls `usePublishContexts` in `useLayoutEffect`. Descendant NodeViews walk `$pos.node(depth)` from immediate parent to root, collect ancestor entries via `useAncestorContexts(store, editor, getPos)`, and unconditionally wrap their rendered component in a `<ContextBridgeProvider entries={ancestorEntries}>` chain — **no consumer opt-in required**. Subscribes via `useSyncExternalStore` for React-Compiler-compatible reactivity. Cleans up published entries on parent unmount via the `usePublishContexts` cleanup fn. Full contract + reference implementation in §9.15. Evidence in `reports/context-bridge-registry-architecture/REPORT.md` (754 lines, 7 evidence files).
- **FR-29** `bridgeId` via PM PluginState (Q10 LOCKED → Option A). `bridgeId` is NOT a PM schema attr. Instead, an editor-scoped `bridgeIdPlugin` maintains a `PluginState<WeakMap<Y.XmlElement, string>>` (or equivalent stable-identity-keyed map) that assigns `bridgeId = 'b' + ++counter` to any `jsxComponent` whose backing Y.XmlElement has no entry yet. Publishers/consumers read the id via a plugin accessor (e.g. `bridgeIdPluginKey.getState(editorState).getFor(node, getPos)`) — never via `node.attrs`. Advantages over attr storage: (a) Observer B re-parse cycles don't churn bridgeIds (parse output has no attr to diff; Y.XmlElement identity preserves the PluginState entry); (b) no `equalYTypePNode` drift; (c) no schema migration needed; (d) satisfies CB23 acceptance by construction. Leaf nodes (Callout, Steps, etc.) get a bridgeId too but have no `contextCapture` in their descriptor → the store has no entry for that ID → no publish happens → `ContextBridgeProvider` renders zero wrappers (no-op). Rationale + mitigation alternatives (Options B/C) in Q10.
- **FR-28** build-registry diagnostic emission. `packages/core/scripts/build-registry.ts` emits a structured warning when `react-docgen-typescript` produces an empty PropDef array for a component source that contains a non-trivial Props interface (heuristic AST check). Warnings name the likely cause (forwardRef wrapper — Storybook Issue #15334, Omit<>/Pick<> utility types — Issue #14798, generic `<T>` parameters — community-confirmed unresolvable) and a suggested remediation (hand-authored PropDef override in the built-ins manifest). Prevents silent empty-registration → confusing empty PropPanel for the affected component.
- **FR-30** `rawMdxFallback` NodeView embeds a CodeMirror 6 editor for inline editing of raw MDX source (replaces current plain PM-text editing). NG3 addressed. Nested editor uses the canonical ProseMirror + CodeMirror pattern (official PM tutorial at prosemirror.net/examples/codemirror/). Detail in §9.14.
- **FR-31** Nested CM undo/redo MUST delegate to PM history. No per-block undo stack. Cmd-Z in the nested CM invokes `undo(view.state, view.dispatch)` at the PM level. Unified undo across the document.
- **FR-32** Nested CM MUST forward `markUserTyping()` calls on CM contentDOM keydown/paste/drop/cut events, so Observer B's typing-defer correctly suppresses tree replacement during active nested editing (mirrors the main SourceEditor.tsx pattern).
- **FR-33** Each nested CM instance MUST create its own `Compartment` for theme reconfiguration. Module-scoped theme singletons cause cross-instance reconfigure conflicts. Theme-change observation uses a single document-level MutationObserver on `<html>` class dispatching a custom event; each NodeView subscribes.
- **FR-34** `stopEvent() => true` and `ignoreMutation() => true` on all nested-CM NodeViews. Prevents PM's DOM observer from interpreting CM's internal DOM mutations as PM content changes (which would cause duplication / bridge-invariant violations). Standard ProseMirror-embedded-CM pattern.
- **FR-35** Direct PM dispatch for nested editors (NOT y-codemirror.next). CM changes are forwarded to PM as transactions via `tr.replaceWith()`/`tr.delete()`; PM-side changes flow back via the NodeView `update(node)` method with character-diff (`computeChange`) minimizing CM-level mutations. Single `updating: boolean` flag prevents feedback loops. Establishes a new architectural precedent (#22) — embedded editor instances inside PM NodeViews always dispatch PM transactions rather than binding directly to Y types. Avoids dual-observer conflicts between y-codemirror.next and y-prosemirror observing the same Y.XmlText with independent origin guards. Rationale + evidence in `reports/cm-in-pm-nested-editor-architecture/REPORT.md` §8.

### Non-functional

- **Performance:** Cold parse of 100-block mixed doc within +10ms of current main. Registry: O(1) Map lookup. Source-dirty observer: O(n) walk per transaction, bounded by depth + node count; for typical documents negligible; profiled during implementation to confirm <1ms per transaction.
- **Reliability:** R10 schema add-only invariant satisfied (all additions are add-only; widening jsxComponent from atom to `block*` is content-expression widening, not narrowing — verified). All I1-I11 fidelity invariants stay green with documented NG12 extension for edited-node quoting. `bun run check:full:parallel` stays green.
- **Security:** Inherits #105 NG4 (raw content passes through unchanged at storage layer). For pristine nodes, byte-identity is preserved → zero new attack surface. For edited nodes, reconstruction goes through mdast-util-mdx-jsx serializer → same security properties as #105's jsxInline + rawMdxFallback.
- **Operability:** Drift-detector CI job (`bun run build-registry && git diff --exit-code`) catches built-ins manifest staleness. `sourceDirty` state is visible in dev-tools PM node attrs for debugging.

## 7) Success metrics & instrumentation

- **M1:** Block Layer 2+3 end-to-end: Callout + Steps + Card render in WYSIWYG with live React, PropPanel controls, editable children. Verified via Playwright E2E.
- **M2:** Inline JSX round-trip end-to-end (per NG14 thin shape): `<Icon name="check" />`, `<Badge>x</Badge>`, `<Badge>**bold**</Badge>` all render as visible source text in WYSIWYG; per-keystroke text editing inside; serialize byte-identical; re-parse produces identical jsxInline. Playwright E2E + I12 fidelity invariant.
- **M3:** Built-ins hot-add: add descriptor to `packages/core/src/registry/built-ins.ts` → existing instances of that name upgrade without re-parse. Y.Doc state comparison before/after is byte-identical. (Validates the runtime-descriptor-dispatch invariant that NG13 custom components would later depend on.)
- **M4:** Byte-identity for pristine: open a file with registered JSX → save without editing → disk byte-identical to source. Regression fixture + bridge-matrix test.
- **M5:** Dirty-then-reconstruct path: edit a prop → save → normalized output matches probe's idempotent signature; re-save stable (fixed point).
- **M6:** Fidelity suite stays green: I1-I11 + NG12 entry + **this spec extends with I12-I17** (below). Round-trip through our pipeline exercises both pristine (sourceRaw) and edited (reconstruction) paths.

### 7.1) Fidelity invariant extensions (I12-I17)

Spec-introduced fidelity invariants specific to Component Blocks v2. Live alongside the CLAUDE.md-level I1-I11 in the fidelity suite (`packages/app/tests/fidelity/`).

| ID | Invariant | Verification method |
|---|---|---|
| **I12** | **Pristine jsxComponent/jsxInline byte-identity.** For each of the 18 P0 built-in components, writing `parse(md) → PM → serialize === md` (byte-exact) where `md` is the component's canonical form. Applies when no user edit has occurred (sourceDirty=false). | `jsx-pristine-byte-identity.test.ts` — 18 fixtures × {block form, inline form where applicable}. |
| **I13** | **Edited jsxComponent/jsxInline idempotence.** `serialize(parse(serialize(parse(X_edited))))) === serialize(parse(X_edited))` — NG12 normalization converges on first serialize; double-round-trip stabilizes. Holds for all 18 built-ins under each PropDef control's edited state. | `jsx-edited-idempotence.test.ts` — property-based over prop-edit operations. |
| **I14** | **rawMdxFallback byte-identity.** When a PM node is in rawMdxFallback state, `serialize(rawMdxFallback) === sourceRaw` (no decoration, no transformation — raw passthrough). Preserves NG4 (HTML) and NG5 (entity references) and NG9 (PUA sentinels). | `rawmdx-fallback-byte-identity.test.ts` — 20 malformed-MDX fixtures; each must serialize byte-identical to input. |
| **I15** | **Cross-path consistency for jsx nodes (I5 extension).** Agent-write-md path (Y.Text → Observer B → XmlFragment) and source-mode-edit path produce semantically identical PM trees for the same MDX input. Asserts: `parseViaObserverB(md) ≡ parseViaMdManager(md)` at the PM-structure level. | `jsx-cross-path-consistency.test.ts` — shared fixture corpus; diff PM-JSON outputs. |
| **I16** | **Nested-dirty serialization (FR-5 effectiveDirty — M17 counterpart).** For any PM tree where at least one jsxComponent descendant has `sourceDirty=true`, the enclosing pristine ancestors MUST reconstruct (not emit stale sourceRaw). Invariant: no subtree edit is lost on save. | `jsx-nested-dirty.test.ts` — property-based over (tree, dirty-subset) pairs; serialize and re-parse; assert descendant edits are preserved. |
| **I17** | **All-user-content-visible (Precedent #24).** For any PM doc state, every text-bearing node's text content is present in the rendered DOM (as visible text or as editable nested-CM content). No `display: none` on user content, no read-only chrome that covers content. PBT: fuzz doc states (including invalid components, descriptor mismatches, broken parses), render to DOM, diff rendered text content against PM text content — must match modulo chrome insertions (toolbar labels, error badges) which are themselves visible. | `content-visibility-invariant.test.ts` — DOM-rendered fuzz harness; assertion: `extractRenderedText(dom) ⊇ extractDocText(pmDoc)`. |

Failure of any I12-I17 fails CI in `bun run test:fidelity`, which is part of the `bun run check` gate.

> **⚠️ Implementation status (2026-04-16):** PR #165 shipped **I12 only** (`jsx-pristine-byte-identity.test.ts`). Tests for **I13, I14, I15, I16, I17** are deferred to a stacked follow-up PR. The 18 built-in fixtures have been lifted into canonical `fixtures/mdx/built-ins.json` (commit `5bdc3870`) and the 10 NG12 probe cases into `fixtures/ng-pinned/component-blocks-v2.json`, with typed loaders — so the fixture groundwork is ready. Full follow-up context including per-test patterns, research findings (DOM env choice, React.Profiler gotchas, I17 novelty), verification checklists, and the 8-item dependency graph is in [`evidence/deferred-invariants-and-perf.md`](evidence/deferred-invariants-and-perf.md). **CI currently gates on I12 + NG1 + NG11 only for the Component Blocks v2 surface.** The "Failure of any I12-I17 fails CI" contract above becomes enforceable after the follow-up PR lands.
- **M7:** Concurrent editing: two clients, one edits prop, other edits children → both changes merge cleanly (attr-level LWW + char-level CRDT).
- **M8:** Source-dirty observer correctness: origin-guard matrix test — user-keyboard transaction sets dirty, sync-from-text does not, agent-write does not, rollback-apply does not.
- **M9:** Isolating-boundary safety: port `jsx-component-isolating.test.ts` from pr23-rebase (274L, 6 PM-command tests). Asserts schema has `isolating: true`; `joinBackward` from start of first child is blocked by boundary; `deleteSelection` spanning into the component from outside is clamped; `joinForward` at end of last child is blocked; selecting all text inside children + Backspace preserves the wrapper; `joinBackward` on an empty paragraph inside component is STILL blocked. Direct PM-command tests, no DOM — guards against accidentally dropping `isolating: true` during `.extend()` merges (silent regression to "backspace deletes the component wrapper").
- **M10:** Unknown-attr preservation on γ-dirty path: open a file with `<Card color="#F05032" external>` (fumadocs Card has neither `color` nor `external` in its PropDef), edit children → save → serialized output still contains `color="#F05032" external`. Regression test + fidelity-suite integration.
- **M11:** ComponentErrorBoundary isolation: render a component that throws (e.g., fumadocs Tab outside Tabs context) → error box appears for that instance; other component instances in the same document continue rendering; no red editor crash overlay.
- **M13:** Per-node rendering independence (G9). Run MR04-MR08, NB01-NB11, TP01-TP06. Assertions: (a) any broken node degrades only its own *tightest structural region* (innermost containing pair or unmatched-open) to rawMdxFallback — subject to safe-coarsening when tokenization can't isolate the malformed tag; (b) sibling subtrees and descendants-of-siblings stay structured whenever the broken node's region can be localized; (c) Observer B's `parseWithFallback` path never leaves WYSIWYG frozen — both modes always render current Y.Text state; (d) `enumerateFallbackRegions` completes in a single O(n) scan with no retry/widen loop (asserted via exactly-one-`parse()`-per-`parseWithFallback`-invocation check in NB08); (e) two-layer mitigation for idempotent re-parse on unchanged content — `observers.ts:442` early-exit + y-prosemirror `equalYTypePNode` deep-compare preserves Y.XmlElement identity across Observer B cycles when source hasn't changed. No pre-existing broken region anywhere in the doc blocks an unrelated edit from propagating to WYSIWYG.
- **M14:** Context Bridge Registry fidelity (FR-27, FR-29, §9.15, Precedent #23). Run CB01-CB15. Assertions: (a) store unit tests pass (publish, unpublish, subscribe, getSnapshot monotonic); (b) fumadocs Tabs + Tab renders correctly in editor with all 3 contexts bridged (Radix + fumadocs styled + fumadocs unstyled); (c) clicking a Tab trigger updates Radix state; (d) fumadocs Accordion + AccordionItem renders correctly with all 4+ per-item contexts bridged; (e) keyboard navigation between AccordionItems works (Arrow Up/Down/Home/End) via Collection context bridging; (f) inserting or deleting a compound child correctly assigns/cleans up `bridgeId` and store entries; (g) two independent `<Tabs>` blocks in same document have independent state; (h) nested compound (Tabs inside Accordion) bridges all contexts from both ancestors; (i) leaf NodeView (Callout) incurs zero ancestor-walk cost when no ancestors publish.
- **M15:** Nested CodeMirror fidelity (FR-30..FR-35, §9.14, Precedent #22). Run unit tests for `computeChange`, `forwardUpdate` offset math, `update(node)` PM→CM sync, `updating` flag loop prevention, `maybeEscape` boundary logic. Integration (bridge matrix): nested CM keystroke → Y.Text via PM → Observer A propagation; remote CRDT update → CM via y-prosemirror → PM → NodeView.update. Playwright E2E: click rawMdxFallback → CM mounts, type → source mode reflects, arrow escape to surrounding PM, theme toggle reconfigures per-instance Compartment, Cmd-Z invokes PM undo across nested and outer content. Bridge invariant (`stripTrailingWhitespace(ytext) === stripTrailingWhitespace(serialize(fragment))`) holds after nested-CM-originated changes settle.
- **M16:** fumadocs-ui rendering fidelity (FR-25, D12). Run Playwright E2E: render a document containing each of the 18 built-in components (from D3 manifest) → compare rendered DOM structure + computed styles + interactive affordances (tab switching, accordion expand, folder toggle) against the same MDX rendered on the fumadocs docs-site reference. Acceptable deltas: editor chrome (SideMenu, hover outline, selection border, PropPanel) layered on top; NOT acceptable: components rendering unstyled, broken interaction, or differing structural output for the same prop set.
- **M12:** Empty-container UX (FR-16a): insert `<Steps>` via slash → placeholder "Click to add a step" renders → click inserts `<Step>` with default props → cursor lands in children. Repeat for Tabs/Cards/Files.
- **M17:** Nested-dirty correctness (FR-5 effectiveDirty rule). 4×4 matrix of (parent-state × child-state) ∈ {pristine, dirty-props, dirty-children, dirty-nested-grandchild} — for each cell, open a two-level container (e.g. `<Steps>` > `<Step>`), apply the state combination, save, diff the output against expected. **Zero edits lost** in any cell. Corresponds to scenarios DT-nested-01..04. Without this metric green, the γ pattern silently drops nested edits — a correctness-critical regression.
- **M18:** bridgeId PluginState invariant: after every transaction settles, every `jsxComponent` node's backing Y.XmlElement has a non-empty unique `bridgeId` in `bridgeIdPluginKey.getState(editor.state)`'s map. (bridgeId is NOT a schema attr per Q10 Option A — lookup via plugin accessor, not `node.attrs`.) (jsxInline has no bridgeId at all per NG14.) Runs on every integration test via a shared `assertBridgeIdInvariant(editor)` helper that walks the doc and queries the plugin. Catches regression paths where paste, undo, programmatic insert, or cross-NodeView operations skip PluginState assignment.
- **M19:** Nested CodeMirror unified undo (Precedent #22). Scripted 10-step interleaved edit sequence across outer PM content + nested CM source + PropPanel attr edits; Cmd-Z N times reverses in the exact reverse order of insertion, producing identical document state to before any edits. Validates `Mod-z` → PM `undo(state, dispatch)` delegation and UndoManager tracked-origins coverage for nested-origin transactions.
- **M20:** Visual-regression parity (D12 fidelity-first). Playwright-driven screenshot diffing per-component between editor render and docs-site production render. 18 components × {light, dark} × {selected, unselected} → ~72 image assertions. Tolerance threshold `≤1% pixel delta` (accommodates anti-aliasing/subpixel rendering); any fixture exceeding that threshold fails CI. This is the only metric that *actually* enforces the D12 fidelity directive — without it, "fidelity" is aspirational.
- **M21:** Context Bridge HMR resilience. Dev-mode: with editor mounted and a compound (Tabs) rendered and interactive, save an edit to `context-bridge/hooks.tsx` → Vite HMR fires → active editor's bridge store preserves entries; bridgeIds unchanged; no remount cascade; Tabs interaction still works. Catches HMR regressions that would otherwise only surface during dev-loop and slowly erode developer feedback.

## 7a) Test scenarios

Behavior-level scenarios organized by feature area. These are the acceptance-criteria layer the implementer works from — §7 M-series above is the outcome layer.

### Test-pyramid assignment (which series lives at which tier)

| Series | Area | Primary tier | Location |
|---|---|---|---|
| HH / BS / PI / KN / FP / ES / HO / IN / DD | Block + inline UX | Layer C (Playwright) | `packages/app/tests/stress/ux-interactions.e2e.ts` |
| EB / PD / MR (1-8) / NB / TP | Boundaries, panels, multi-client, G9 fallback | Layer A (unit) + Integration (bridge-matrix) + Layer C (MR only) | `packages/app/src/editor/observers.test.ts`, `packages/app/tests/integration/bridge-matrix.test.ts` |
| **SC** (scanTagEvents) | Tag scanner unit | Layer A | `packages/core/src/markdown/parse-with-fallback.test.ts` |
| **DT** (dirty-tracking + nested) | Origin-guard + γ correctness | Layer A + Integration | `packages/app/src/editor/source-dirty-observer.test.ts`, bridge-matrix |
| **CH** (content holes) | NodeView rendering variants | Layer C | `ux-interactions.e2e.ts` |
| **EX** (expression attrs) | Destructure + reconstruct | Layer A (fidelity) | `packages/app/tests/fidelity/jsx-expression-attrs.test.ts` |
| **SH** (schema widening) | Runtime schema behavior | Layer A + Integration | `packages/core/src/schema-invariant.test.ts`, bridge-matrix |
| **PS** (paste / copy / cross-editor) | bridgeId + store isolation | Integration | bridge-matrix |
| **AG** (agent interactions) | agent-write / agent-patch + γ | Layer B (HTTP) + Integration | `packages/app/tests/stress/stress-api.ts`, bridge-matrix |
| **CB** (Context Bridge) | Publish/subscribe, ancestor walk, fumadocs fidelity | Layer A (store) + Integration (ancestor walk) + Layer C (render) | `packages/app/src/editor/context-bridge/store.test.ts`, bridge-matrix, `ux-interactions.e2e.ts` |
| **NCM** (Nested CodeMirror) | PM↔CM sync, undo, boundary | Layer A (sync math) + Layer C (interactive) | `packages/app/src/editor/extensions/RawMdxFallbackCMView.test.ts`, `ux-interactions.e2e.ts` |
| **VR** (Visual regression) | Editor-vs-docs-site pixel parity | Layer C (Playwright screenshot) | `packages/app/tests/visual/component-parity.e2e.ts` |
| **PF** (Performance) | Benchmarks with thresholds | Stress | `packages/app/tests/stress/component-blocks.perf.ts` |
| **A11Y** (Accessibility) | WCAG-level keyboard + SR | Layer C (Playwright with axe-core) | `packages/app/tests/a11y/component-blocks.e2e.ts` |
| **CC** (Custom Components) | DEFERRED — NG13 | — | `evidence/custom-components-deferred.md` §8 |

Scenarios below are grouped by series. Tier tables above determine where each series' tests live.

### HH — Hover Handle (SideMenu)
| # | Scenario | Expected |
|---|---|---|
| HH01 | Hover anywhere over a top-level `jsxComponent` | SideMenu fades in at left gutter after ~200ms |
| HH02 | Move mouse between two sibling components | SideMenu smoothly transitions to new hovered block |
| HH03 | Hover on a child `jsxComponent` inside another | SideMenu attaches to the outer (not inner) block |
| HH04 | Click grip → context menu opens | Delete/Duplicate/Move up/Move down options |
| HH05 | Drag grip → block reorders via ProseMirror drag | Valid positions accept drop; invalid positions fail silently (schema validation) |
| HH06 | Hover on a non-jsxComponent paragraph | SideMenu appears (drag-handle supports all blocks) |
| HH07 | `lockDragHandle()` called during PropPanel open | SideMenu frozen on the current block during panel interaction |
| HH08 | Mouse leaves editor while handle locked | Handle stays visible; unlocks on next `unlockDragHandle()` |

### BS — Badge Suppression + Breadcrumb
| # | Scenario | Expected |
|---|---|---|
| BS01 | Top-level Callout | ComponentToolbar visible with "Callout" badge |
| BS02 | Step inside Steps | ComponentToolbar suppressed (`isChildOfComponent === true`) |
| BS03 | Deeply nested (Step inside Steps inside Cards) | Suppression applies at every level below the outermost |
| BS04 | Selecting a nested Step | PropPanel shows breadcrumb "Steps > Step" in header |
| BS05 | Click breadcrumb segment | `setNodeSelection(ancestorPos)` selects the ancestor; PropPanel refreshes to show ancestor's props |
| BS06 | Top-level component selected | No breadcrumb (empty chain) |

### PI — "+" Insertion
| # | Scenario | Expected |
|---|---|---|
| PI01 | Click "+" between paragraphs | Empty paragraph inserted; `/` triggers Suggestion; slash menu opens |
| PI02 | Click "+" while another slash menu is open | Existing menu closes first (Suggestion's single-active invariant); new menu opens at new position |
| PI03 | "+" at position 0 (document start) | Paragraph inserted at position 0; slash menu opens |
| PI04 | Empty `<Steps>` container placeholder | "Click to add a step" rendered inside; clicking inserts `<Step>` with defaults |
| PI05 | Repeat for `<Tabs>`, `<Cards>`, `<Files>` | Respective child (Tab/Card/File) inserted with defaults |
| PI06 | Slash-insert Callout | Callout arrives with `type: 'warning'` (first enum value) per FR-14a ladder |
| PI07 | Slash search "warning" | Callout surfaces via `searchTerms` fuzzy match |

### KN — Keyboard Navigation (L1-L4)
| # | Scenario | Expected |
|---|---|---|
| KN01 | Cursor inside Callout children, press Esc | NodeSelection on Callout (L1) |
| KN02 | NodeSelection on Callout, press Arrow Down | NodeSelection moves to next sibling block (L2) |
| KN03 | NodeSelection on Callout, press Arrow Up at document start | Selection stays; no wrap |
| KN04 | NodeSelection on Callout, press Enter | TextSelection at first editable position inside children |
| KN05 | NodeSelection on Callout, press Backspace | Callout deleted (entire block) |
| KN06 | Empty trailing paragraph in last Step of Steps, press Enter | L3: paragraph created as sibling AFTER `<Steps>`; cursor there |
| KN07 | Cursor at start of first child, press Backspace | Blocked (isolating boundary); no merge with previous block |
| KN08 | Slash menu open, press Esc | Suggestion closes the menu (L4 priority 1); does not trigger L1 |
| KN09 | PropPanel open, press Esc | Radix closes the popover (L4 priority 2); does not trigger L1 |
| KN10 | No menu/popover open, cursor in prose after a component, press Esc | L1 selectParentNode → no-op (cursor not inside component); default behavior |

### FP — Floating PropPanel
| # | Scenario | Expected |
|---|---|---|
| FP01 | Click registered component block | PropPanel opens, anchored below the block |
| FP02 | Click text input inside PropPanel | Input receives focus; node stays selected; panel stays mounted (onMouseDown stopPropagation) |
| FP03 | Type into input | Character appears; `markUserTyping(getYDoc(editor))` fires; Observer B typing-defer respects the signal |
| FP04 | Change enum dropdown from "warning" to "error" | Component re-renders live with new variant; `sourceDirty: true` set |
| FP05 | Click outside the PropPanel | Panel closes; node deselects |
| FP06 | Descriptor with no editable props (e.g., `<Step>` — only has `children: ReactNode`) | PropPanel suppressed; NodeSelection still works for drag/delete |

### EB — Error Boundaries
| # | Scenario | Expected |
|---|---|---|
| EB01 | `<Tab>` rendered outside `<Tabs>` context | Boundary catches; bordered error box for that Tab; other components render |
| EB02 | `<AccordionItem>` rendered outside Accordion | Same — isolated error |
| EB03 | A built-in component throws on render (e.g., bad prop shape passed through agent edit) | Boundary catches; other instances of the same component unaffected; message surfaces the component name + error message |
| EB04 | Error clears when the user edits source in the invalid-state CM (per Precedent #24) OR when attrs change from outside (key-on-attrs auto-retry) | On every CM commit, block-scoped parseWithFallback re-attempts; if render succeeds, NodeView returns to live React render; children content is the source text the user edits in CM. No Retry button — commit IS retry. |

### ES — Empty PropPanel Suppression
| # | Scenario | Expected |
|---|---|---|
| ES01 | Select a component whose only prop is `children: ReactNode` | No PropPanel rendered; component remains selected (drag/delete/keyboard nav work) |
| ES02 | Wildcard (unregistered) component selected | No PropPanel; UnregisteredBadge + editable children only |
| ES03 | Registered component with 3 editable props + 1 ReactNode | PropPanel shows 3 controls; ReactNode hidden |

### HO — Hover Outline
| # | Scenario | Expected |
|---|---|---|
| HO01 | Hover registered component (not selected) | Dashed 1px outline appears |
| HO02 | Select the component | Outline transitions to solid 2px accent border |
| HO03 | Hover unregistered (wildcard) component | No hover outline (UnregisteredBadge provides chrome) |

### MR — Multi-client Replication + Multi-region Independence (G9)
| # | Scenario | Expected |
|---|---|---|
| MR01 | Client A edits `type` prop; Client B editing children | Both merge cleanly (attr-level LWW for prop, char-level CRDT for children) |
| MR02 | Client A in source mode fixes `<Foo>...</Bar>` tag mismatch; Client B in WYSIWYG | Client B sees rawMdxFallback until A's fix syncs; then structured Callout renders |
| MR09 | **Delete vs edit race:** Client A deletes a `<Tab>` while Client B is actively typing into its children | CRDT semantics: delete wins (tombstone wipes B's concurrent edits to the deleted subtree). This is documented expected behavior, not a bug. B's local state shows the delete after sync; B's in-flight edits are lost. Test asserts no divergence, no throw, no orphaned bridge store entries for the deleted Tab's bridgeId. |
| MR10 | **Layered concurrent edit:** A edits Tabs's `className` prop; B edits inner Tab's children content | Attr-level LWW for Tabs's `className` (A wins on that attr); char-level CRDT for Tab's children (B's edits preserved). Both changes visible in final merged state. |
| MR11 | **Undo + concurrent bridge subscription:** A undoes a Tabs insertion while B has a descendant Tab rendered (subscribing to the bridge store) | A's undo fires `store.unpublish(bridgeId)`. B's `useSyncExternalStore` subscriber re-runs → ancestor walk returns empty → Error boundary catches (no Tabs context) for the sub-frame between unpublish and node removal. Once A's delete of the Tabs subtree propagates via CRDT, B's Tab node itself is removed, NodeView unmounts. Final state: no render errors persist, no stale store entries. |
| MR12 | **Network partition → reconnect with diverged bridge states:** two clients on the same doc, network partitions, each edits their local bridge state (clicks Tabs triggers, expands Accordions) | Bridge state is per-client (NOT CRDT-synced) — it's transient runtime state derived from PM ancestor walks. Document content merges via Y.js on reconnect. Each side's bridge state reflects its own local interaction history (Tabs position, Accordion open/closed). Expected: no divergence in PM content; bridge-state divergence is natural and acceptable. |
| MR13 | **Server-side agent write triggers client-side bridgeId PluginState assignment:** server's agent-session writes `<Tabs>` to Y.Doc | New jsxComponent Y.XmlElement arrives at each client via Y.js sync. Each client's `bridgeIdPlugin` transaction-apply handler detects the new Y.XmlElement without a map entry → assigns a fresh client-local bridgeId in its WeakMap. bridgeId is per-client (PluginState is not CRDT-synced) — this is correct; each client publishes/consumes contexts via its own store keyed by its own bridgeId. Assertion: after a server agent-write, the client's `assertBridgeIdInvariant` passes (every jsxComponent has a plugin entry). |
| MR03 | Client A on a newer build has `<DataViz>` in its built-ins manifest; Client B on an older build doesn't | Client B's view falls back to wildcard (UnregisteredBadge) for that component's name; content preserved; B upgrades build → component renders on next mount. (Validates runtime-descriptor-dispatch invariant — no document migration required; a precondition for NG13 custom components.) |
| MR04 | Doc loads with 3 built-in Callouts + 2 wildcard `<CustomThing>` + 1 broken `<DataViz chartTyp="bar">` at widely-spaced positions | All 6 nodes render independently: 3 live React + PropPanel, 2 UnregisteredBadge + editable children, 1 rawMdxFallback chrome. No cross-node coupling. Each NodeView invocation is independent. (G9 per-node rendering independence) |
| MR05 | With the MR04 doc open, edit an attribute on Callout #2 via PropPanel | Only Callout #2 re-renders. The other 5 node instances (including the rawMdxFallback'd DataViz and the two wildcards) are untouched — their DOM persists, their NodeView closures are not re-invoked. Verified via React DevTools render-count assertions. |
| MR06 | With the MR04 doc open, fix the DataViz typo in source mode (`chartTyp` → `chartType`) | rawMdxFallback for DataViz converts to wildcard UnregisteredBadge (DataViz itself still unregistered) on the next Observer B cycle. The 3 Callouts and 2 wildcard nodes are unaffected. |
| MR07 | Two independently broken regions (separate ancestor chains) in one doc — e.g. `<Foo>...</Bar>` tag mismatch in §1 AND `<Baz attr="` unclosed attr in §3, with clean content between | parseWithFallback's recursion produces 2 independent rawMdxFallback blocks. Neither region affects the other's parse. Content between them renders structured. (G9 sibling independence at the top level) |
| MR08 | Edit a paragraph entirely unrelated to MR07's broken regions in source mode (keystroke in middle of clean content) | Observer B's `parseWithFallback` succeeds for the clean paragraph's parse cycle; the two rawMdxFallback regions stay stable; the edited paragraph propagates to XmlFragment. Under pre-G9 freeze-based Observer B this would silently hold the WYSIWYG update hostage to the unrelated broken region. |

### PD — PropDef Controls
| # | Scenario | Expected |
|---|---|---|
| PD01 | String prop with no default | Text input, empty initial value |
| PD02 | String prop with default | Text input, pre-filled with default |
| PD03 | Boolean prop | Toggle switch, reflects current attr value |
| PD04 | Enum prop with `enumValues` + default | Dropdown, pre-selected to default |
| PD05 | Enum prop without default | Dropdown, first enum value pre-selected (FR-14a ladder) |
| PD06 | Number prop | Numeric input; coerces to number on change |
| PD07 | ReactNode prop | Hidden from panel; editable via `<NodeViewContent>` |
| PD08 | Unknown prop (spread, function, complex) | Hidden from panel (callback filter + type-name `(` prefix filter) |

### IN — Inline JSX as source text (NG14 — thin jsxInline)

P0 inline JSX is rendered as visible source text via the thin `jsxInline` PM node — no chrome, no PropPanel, no descriptor dispatch. These scenarios validate fidelity round-trip and integration with the markdown pipeline. Rich live-rendered inline component editing scenarios (the original IN01-IN03) are preserved in `evidence/inline-component-editing-deferred.md` §7 for the NG14 re-spec.

| # | Scenario | Expected |
|---|---|---|
| IN01 | `<Icon name="check" />` self-closing inline in prose | Renders as literal inline text `<Icon name="check" />`. No React render of Icon, no chrome chip, no popover. Editable character-by-character like any text. |
| IN02 | Save the doc containing `<Icon name="check" />` and reopen | Source on disk is byte-identical to what user typed. Re-parse produces identical jsxInline node containing the same raw-text content. (I12 invariant — pristine round-trip.) |
| IN03 | Edit `name="check"` → `name="star"` by placing cursor mid-attr | Per-keystroke text editing inside jsxInline. Y.Item identity preserved per Precedent #10 (`content: 'text*'`). On save, source is `<Icon name="star" />`. |
| IN04 | Unregistered `<CustomInline>content</CustomInline>` paired form | Whole construct (`<CustomInline>content</CustomInline>`) is the raw text content of one jsxInline node. No badge chip; no special chrome; just visible source. |
| IN05 | Single-line `<Callout>Hello</Callout>` tokenizes as inline per micromark | Lands in jsxInline as raw text `<Callout>Hello</Callout>`. No live React Callout render in WYSIWYG (because we're using thin jsxInline path, not block jsxComponent). User who wants live Callout uses multi-line block form per IN07. |
| IN06 | `<Badge>**bold**</Badge>` paired with markdown children | jsxInline content is raw text `<Badge>**bold**</Badge>` — `**bold**` is literal asterisks in WYSIWYG (no markdown rendering inside inline JSX). Production docs-site rendering still bolds correctly on output. WYSIWYG-vs-production divergence is documented + acceptable per NG14. |
| IN07 | Multi-line JSX (`<Callout>\n\nHello\n\n</Callout>`) | Tokenizes as block → jsxComponent (NOT jsxInline); block rendering path applies. Validates the inline-vs-block dispatch happens correctly at the micromark layer (single-line → inline; multi-line with blank lines → block). |
| IN08 | Malformed inline JSX `<Icon name="che` (unclosed) typed in prose | Micromark's tokenizer falls through to literal text at the mdast level — no `mdxJsxTextElement` produced. Lands as plain PM text (not jsxInline, not rawMdxFallback). Validates: inline malformed-JSX needs no special handling; the tokenizer absorbs it. |
| IN09 | Serializer must not escape `<` / `>` inside jsxInline | When the `jsxInline` toMarkdown handler emits `{ type: 'html', value: source }`, the result preserves `<` and `>` raw. Compare against a plain PM text node containing `<Icon />` — that path WOULD escape (`\<Icon /\>`). Asserts the routing-through-html-mdast mechanism is in place. |
| IN10 | Adjacent jsxInline + text + jsxInline `<a /><b />` | Two separate jsxInline nodes. Each has its own raw-text content. Round-trip preserves the order + the text-or-no-text gap between them. |

### CC — Custom Components (DEFERRED — NG13)

Custom-component test scenarios (CC01-CC06 covering user registration, de-registration, search, error boundaries, fumadocs-in-custom, multi-client) are preserved verbatim in `evidence/custom-components-deferred.md` §8 for the future re-spec. They are not in P0 scope — the built-ins path (FR-8, §9.2) exercises the same runtime-descriptor-dispatch invariant (see MR03, MR04) that those scenarios would re-validate.

### DD — Descriptor Dispatch
| # | Scenario | Expected |
|---|---|---|
| DD01 | Parse block JSX with registered name → renders via descriptor | Descriptor's Component invoked; PropPanel available |
| DD02 | Parse block JSX with unregistered name → renders via wildcard | UnregisteredBadge + editable children |
| DD03 | Parse inline JSX (any name, registered or not) | Lands as visible source text in jsxInline thin shape per NG14. No descriptor lookup, no React render, no PropPanel. The registry's `isInline` field doesn't exist — registry is block-only. |
| DD04 | Parse inline JSX with unregistered name → renders via thin jsxInline (NG14) | Visible source text in WYSIWYG; no chip, no chrome; editable like prose |

### CB — Context Bridge Registry (FR-27, FR-29, §9.15, Precedent #23)

Unit tests against the bridge store + integration tests through rendered compound components. Verifies that fumadocs/Radix compound components render correctly across TipTap NodeView portal boundaries.

| # | Scenario | Expected |
|---|---|---|
| CB01 | `createContextBridgeStore`: publish → get → unpublish → get | `publish('b1', entries)` stores; `get('b1')` returns entries; `unpublish('b1')` removes; subsequent `get('b1')` returns undefined. `getSnapshot()` increments on each mutation. |
| CB02 | Store subscriptions | `subscribe(cb)` registers; `publish` / `unpublish` both fire cb exactly once. Unsubscribe cleanup fn removes listener; subsequent mutations don't fire. |
| CB03 | Render `<Tabs>` with 2 `<Tab>` children in editor | Both Tab panels render without throwing. Radix `TabsContext`, fumadocs styled `TabsContext`, and fumadocs unstyled `TabsContext` all bridged. Visual output matches production render for the same MDX. |
| CB04 | Click Tab 2 trigger in editor | Tabs state updates via Radix's `onValueChange`; Tab 1 panel hides (`data-[state=inactive]:hidden`); Tab 2 panel shows. Bridged `onValueChange` reaches the parent Tabs state from the child Tab's trigger click. |
| CB05 | Render `<Accordions>` with 3 `<Accordion>` children; click AccordionItem 2 trigger | AccordionItem 2 expands; `AccordionValueContext.onValueChange` fires on Accordions root. `AccordionItemContext` per-item published; `CollapsibleContext` per-item published. No context-missing throw. |
| CB06 | Keyboard navigation between AccordionItems (Arrow Down from item 1 → item 2) | `@radix-ui/react-collection` Collection context is bridged. `itemMap` contains all AccordionItem refs. Arrow Down navigates to next item; Home/End navigate to first/last. (FR-27 R2 regression guard — ensures we don't regress to mouse-only interaction.) |
| CB07 | Insert new `<Tab>` into existing `<Tabs>` (structured editing) | New Tab's PM node gets fresh `bridgeId` from the assignment plugin. New Tab's NodeView calls `useAncestorContexts` → finds parent `<Tabs>`'s published entries → renders with full context. No editor reload needed. |
| CB08 | Delete a `<Tab>` from `<Tabs>` | When the Tab NodeView unmounts, `usePublishContexts`'s cleanup fn calls `store.unpublish(tabBridgeId)` (if Tab was a publisher — AccordionItem case). Siblings update via store subscription; no stale entries remain in the store. |
| CB09 | Two `<Tabs>` blocks in same document | Each Tabs has unique `bridgeId`. Two independent stores entries. Clicking Tab 1 in block A doesn't affect block B's state. Ancestor walk from any Tab correctly finds its own Tabs parent, not the other one. |
| CB10 | Tabs inside Accordion (compound within compound) | Child Tab's `useAncestorContexts` walk finds both `<Accordions>` and `<Tabs>` ancestors with published contexts. `collected` array contains all 7+ bridged Context entries (4 Accordion + 3 Tabs). `ContextBridgeProvider` wraps in order outermost-first. Tab renders with both TabsContext AND AccordionItemContext/CollapsibleContext available. |
| CB11 | **FR-27 R1 regression (scope-resolved Context capture):** two sibling `<Tabs>` blocks with different scope props (e.g., `__scopeTabs`) | Each `<Tabs>` captures its own scope-resolved Context references via `ContextCapture`'s `use()` call inside the live component tree. Descendant Tab children see the correct scope-specific Context. Verification: mutate state in Tabs 1 → only Tabs 1 children see the update; Tabs 2 state unchanged. |
| CB12 | Parent NodeView unmounts before children (edge case) | During the unmount window, children may briefly render with missing context → fumadocs throws → `ComponentErrorBoundary` (FR-19, FR-24) catches → error chrome shows. When parent's cleanup fires (`useLayoutEffect` cleanup), subscribers re-render. If R4 mitigation's 50ms grace is added, window closes without visible flicker. |
| CB13 | Non-compound leaf NodeView (Callout) renders without bridge overhead | `Callout` descriptor has no `contextCapture`. Its NodeView still wraps in `ContextBridgeProvider`, but `useAncestorContexts` returns empty (no publisher ancestors). `ContextBridgeProvider` with `entries=[]` renders children unchanged — zero-cost path. |
| CB14 | Depth-limit performance (R5) | Stress: 10-level deeply nested compound structure. Ancestor walk time measured; must stay under 5ms per render. |
| CB15 | Concurrent editing: two clients each with their own editor instance, both editing the same `<Tabs>` content | Each editor has its own bridge store (WeakMap keyed by editor). No cross-editor state pollution. Y.js CRDT merges content normally; each client's bridge store independently populates via their local NodeView renders. |
| CB16 | **Nearest-ancestor shadowing (M2 audit-fix regression guard):** `<Tabs>` outer containing `<Tabs>` inner containing a `<Tab>` leaf. Both Tabs publish the same `TabsContext` identity with different values. Leaf Tab consumes via `use(TabsContext)`. | Leaf receives INNER Tabs's value (nearest-ancestor wins, matching React Context shadowing). Explicit assertion that `useAncestorContexts` uses `push` (not `unshift`) and `ContextBridgeProvider` wraps nearest-last-→-innermost. **Without this test, the audited `unshift→push` fix can silently re-regress on any refactor.** |
| CB17 | **Publish/subscribe ordering on first render:** editor mounts, fresh `<Tabs>` inserts, child Tab renders alongside parent Tabs in same commit. | Parent's `useLayoutEffect` fires after children render but before paint. Children's `useSyncExternalStore` reads empty store on initial render → re-renders after parent's publish. No "missing context throw" visible to user; error boundary optionally catches during sub-frame window. Assertion: final render shows correct context; intermediate error boundary flash, if any, is sub-frame. |
| CB18 | **bridgeId PluginState invariant enforcement (Q10 Option A).** After every integration test's `await wait(500)`, call `assertBridgeIdInvariant(editor)`: walk the doc, collect all jsxComponent nodes (jsxInline excluded per NG14), assert `bridgeIdPluginKey.getState(editor.state).getFor(node, pos)` returns a non-empty string AND the multiset of bridgeIds has no duplicates within this editor. | Runs piggybacked on every bridge-matrix and Playwright test; any failure indicates a code path (paste, undo, programmatic insert, NodeView remount) where PluginState assignment was missed. |
| CB19 | **Undo a compound insertion.** User inserts `<Tabs>` via slash → 2 Tab children auto-populate → Cmd-Z. | Undo rolls back the insertion. Store entries for the three bridgeIds (Tabs + 2 Tabs) are cleaned up via `usePublishContexts`'s cleanup fn (triggered by NodeView unmount). `store.get(bridgeId)` returns undefined for all three after undo settles. No stale entries in subsequent interactions. |
| CB20 | **HMR of `hooks.tsx` while compound is live** (M21 metric). Dev mode only. Mount editor, render Tabs, edit `hooks.tsx` and save. | Vite HMR reloads the module; `WeakMap<Editor, BridgeStore>` entry preserved because the Editor instance is stable; `bridgeIds` unchanged; active Tabs re-renders through the updated hooks without content loss or interaction break. If HMR causes full editor remount (which would be a regression), this test fails. |
| CB21 | **Aborted concurrent render does not leak store entries.** Simulate React 19 concurrent render abort via synthetic `useTransition`-style interruption before commit. | `usePublishContexts` uses `useLayoutEffect` — only fires on committed renders, never on aborted ones. Store remains empty; no stale `publish` without matching `unpublish`. Assertion via store's `entries.size` after aborted transition. |
| CB22 | **Editor destroy → WeakMap GC.** Mount editor, render 3 Tabs blocks, destroy the editor via `editor.destroy()`. | Bridge store for that editor becomes garbage-collectable (WeakMap entry is dropped when Editor reference disappears). Use `FinalizationRegistry` in test to assert GC eligibility after forced GC (`global.gc()` under `--expose-gc`). Catches accidental strong references (e.g. a global singleton holding the store). |
| CB23 | **Observer B re-parse preserves bridgeId identity across unrelated agent edits (Q10 Option A — structurally guaranteed).** Doc contains `<Tabs>` with bridgeId `"b3"` in PluginState. Agent writes to an unrelated paragraph via agent-write-md. Observer B re-parses entire Y.Text. | bridgeId is in PluginState (WeakMap keyed by Y.XmlElement), NOT a PM schema attr. The Y.XmlElement for `<Tabs>` is preserved by y-prosemirror across the re-parse (unchanged content → no delete+reinsert). Therefore the WeakMap entry is preserved → `bridgeIdPluginKey.getState(editor.state).getFor(tabsNode)` returns `"b3"` before AND after. Consumers' subscriptions NOT invalidated. **Structurally guaranteed by the Q10 Option A design — no attr-drift churn possible.** Assertion: capture bridgeId via plugin accessor before + after agent write; must be identical. |
| CB24 | **Two editors side-by-side in same tab** (split-view use case, or a second editor in a modal). Each editor has independent state. | Each editor's `WeakMap<Editor, BridgeStore>` is disjoint. `bridgeIds` can collide across editors (both start from 0) but don't interact. Tab click in editor A does not affect editor B. Assertion: mutate A's Tabs state, snapshot B's Tabs store — unchanged. |
| CB25 | **Hybrid Fallback 2 smoke (conditional on Phase 0 retreat).** Only runs if the Phase 0 prototype determines scope-resolved capture fails and we adopt the pattern-copy compound fallback. Mirrors CB03-CB08 behavior against the pattern-copied `<Tabs>` / `<Accordion>`. | If Fallback 2 adopted: pattern-copied Tabs renders with fidelity ≥95% vs fumadocs Tabs (visual diff ≤5%); tab switching, accordion expand, keyboard nav all work. If Primary path succeeds (Phase 0 prototype passes), this test is not runnable and the test file is skipped with explanatory comment. |

### SC — scanTagEvents unit correctness (FR-23)

Pure unit tests against the `scanTagEvents` tokenizer inside `enumerateFallbackRegions`. Validates the audit-resolved malformed-open emission + the challenger-resolved brace-depth tracking. These are the primitives NB01-NB11 assert against; if SC breaks, NB breaks indirectly. No PM doc, no Y.Doc — pure string input.

| # | Input | Expected event stream |
|---|---|---|
| SC01 | `<Foo bar="baz">text</Foo>` | OPEN(Foo, pos=0) → CLOSE(Foo, pos=15) |
| SC02 | `<Foo bar="` (EOL before close) | Under v1 safe-coarsening: NO event emitted (documented — see NB09). Future precision upgrade: MALFORMED-OPEN(Foo, pos=0, end=EOL-boundary). |
| SC03 | `<Foo bar={x > 5}>text</Foo>` | Brace-depth tracking skips `>` inside `{…}`. OPEN(Foo) terminates at the outer `>` (after `}`), NOT at the inner `>`. Assertion: one OPEN event, not two. |
| SC04 | `<Foo bar={items.map(x => <span>{x}</span>)}>` | Brace-depth tracking handles nested `{`/`}`. Forward-scan does NOT treat `<span>` or `{x}` as tag events (they're inside an expression attr). Single OPEN(Foo) event. |
| SC05 | ``` ``` ```mdx\n<Foo>\n``` ``` — tag inside fenced code block | Fence-aware scan: NO events for tokens inside fence. Asserts fence entry/exit tracking. |
| SC06 | `<!-- <Foo> -->` comment-like MDX | No OPEN(Foo) event. (MDX doesn't have HTML comments, but the scanner shouldn't be confused by `<!--` as a tag start.) |
| SC07 | `< 5` (whitespace after `<`) | No events — `<` followed by space is not a tag start. |
| SC08 | `<5>` / `<123>` numeric tag names | No events — tag names must start with `[A-Za-z]`. |
| SC09 | Self-closing `<Foo />` with whitespace variants (`<Foo/>`, `<Foo  />`, `<Foo  \n/>`) | SELF-CLOSE(Foo) event for each (no push onto stack). All three whitespace variants recognized. |
| SC10 | Multi-line tag `<Foo\n  bar="baz"\n  baz="qux"\n>` | Single OPEN(Foo) event spanning from `<F` to final `>`. Line breaks within the tag don't split it. |

### DT — Dirty-tracking + Origin-guard matrix (FR-5, FR-7, D6)

Concrete assertions for the origin-guard truth table + γ serialization, including the FR-5 nested-dirty rule. Replaces the abstract M8 matrix test with named fixtures.

**Origin-guard matrix** (five transaction origins, assertion: does source-dirty observer mark node dirty?):

| # | Transaction origin | sourceDirty after | Rationale |
|---|---|---|---|
| DT01 | user-keyboard (typing into children) | **true** | User intent; reconstruction path wanted |
| DT02 | user-keyboard (PropPanel control change) | **true** | Same user intent; attrs changed |
| DT03 | `sync-from-text` (Observer B write to fragment) | **false** | Bridge-internal; pristine state must survive Y.Text → XmlFragment sync |
| DT04 | `sync-from-tree` (Observer A write to text) | **false** | Bridge-internal; pristine state must survive XmlFragment → Y.Text sync |
| DT05 | `agent-write` (server agent-sessions) | **false** | Server-authored content is treated as pristine (sourceRaw populated via Observer B parse); dirty observer respects agent origin |
| DT06 | `rollback-apply` (Timeline rollback) | **false** | Rolled-back state is "as-was"; dirty flag reverts to original |
| DT07 | undefined (WebSocket remote update) | **false** | Remote updates don't flip local dirty state |

**Nested-dirty serialization correctness (FR-5 effectiveDirty rule — M17):**

Fixture: `<Steps>\n\n<Step>A</Step>\n\n<Step>B</Step>\n\n</Steps>` loaded pristine. Apply the state combination, save, diff output.

| # | Parent state | Child state | Expected serialized output |
|---|---|---|---|
| DT-nested-01 | pristine | pristine | Parent emits sourceRaw (byte-identical input). Children not re-serialized because parent's sourceRaw is authoritative. |
| DT-nested-02 | pristine | **dirty** (edited Step B's text "B" → "B-new") | **Parent forced to reconstruct** because `hasDirtyDescendant=true`. Parent reconstructs as `mdxJsxFlowElement` with attrs from structured state. During reconstruction, each child is recursively serialized: Step A (pristine) emits its own sourceRaw; Step B (dirty) reconstructs via mdxJsxFlowElement with "B-new" content. Output contains "B-new", not "B". **Without FR-5 effectiveDirty rule, Step B's edit is silently dropped.** |
| DT-nested-03 | **dirty** (edited Steps's props) | pristine | Parent reconstructs. Children recursively serialized: both Step A and Step B emit their own pristine sourceRaw (unchanged content). Output reflects new Steps attrs but preserves both Steps' raw children. |
| DT-nested-04 | **dirty** | **dirty** | Both reconstruct via mdxJsxFlowElement path. Output fully reconstructed with new attrs + new content. NG12 normalization applies to both levels. |
| DT-nested-05 | pristine | pristine grandchild, **dirty great-grandchild** | Any-descendant-dirty propagates through arbitrary depth. Top-level parent reconstructs, cascading down until the pristine subtree boundary where `hasDirtyDescendant=false` — at which point sourceRaw emission resumes. Depth-independence assertion. |

**Deny-list integration tests (these combine origins with real transactions):**

| # | Scenario | Expected |
|---|---|---|
| DT08 | Open doc with pristine `<Callout>`; agent writes text into an unrelated paragraph via agent-write-md | Callout's `sourceDirty` remains `false` (agent-write is deny-listed). Observer B re-parse does not mutate Callout's attrs. On save, Callout emits byte-identical sourceRaw. |
| DT09 | Edit Callout's `type` prop from `warning` → `error` via PropPanel (user-keyboard origin) | Callout's `sourceDirty` flips to `true`. On save, serializer reconstructs via mdxJsxFlowElement; NG12 quoting normalization visible. |
| DT10 | Undo the edit in DT09 | `sourceDirty` reverts to `false` (the mutation that set it is itself undone). Byte-identity restored. Assertion: undo origin should be distinct from user-keyboard, so the observer doesn't re-mark dirty on the undo transaction. |
| DT11 | Client A edits `type` prop; Client B edits Callout children concurrently | Both arrive via WebSocket as `undefined`-origin transactions. Neither flips `sourceDirty` on the receiving side (already true locally where the edit originated). Final merged state: sourceDirty=true on both clients; attrs merged via LWW; content merged via char-level CRDT. |
| DT12 | Byte-identity corpus regression: open 30-file content corpus; save each file without editing | Zero byte changes across all 30 files. Known-exceptions list documented (files where NG5/NG8/NG10/NG11/NG12-labeled normalizations are expected). If any non-exception file drifts → fail CI with a diff. |

### CH — Content-hole rendering variants (FR-5a, FR-9, FR-16a)

Explicit scenarios for the four descriptor × PM-children combinations.

| # | Descriptor state | PM children | Expected NodeView behavior |
|---|---|---|---|
| CH01 | Registered + `hasChildren: true` + container (`emptyChildName` set) | zero | Empty-container placeholder "Click to add a {child}". Click inserts one `descriptor.emptyChildName` with default props (FR-14a ladder). (FR-16a.) |
| CH02 | Registered + `hasChildren: true` + non-container | zero | Live React render + empty `<NodeViewContent>` typeable. Cursor on click lands inside content hole. |
| CH03 | Registered + `hasChildren: true` + container | non-zero | Live React render + `<NodeViewContent>` populated by PM children. Empty-container placeholder NOT shown. |
| CH04 | Registered + `hasChildren: false` | zero | Live React render + `<NodeViewContent>` with **CSS zero-footprint** (`min-height: 0; margin: 0; padding: 0`) — NEVER `display: none` per Precedent #24 / NG7a. No collapsed-margin artifacts; content always DOM-present for Y.js sync. NodeSelection still works; drag/delete/PropPanel work. |
| CH05 | Registered + `hasChildren: false` + **non-zero PM children** (FR-5a edge case) | non-zero | **Degrade to wildcard rendering** for that instance: UnregisteredBadge chrome + visible `<NodeViewContent>` showing the children + no PropPanel. Prevents silent content loss. |
| CH06 | Wildcard (unregistered) | zero | Empty UnregisteredBadge chrome; `<NodeViewContent>` typeable. |
| CH07 | Wildcard (unregistered) | non-zero | UnregisteredBadge chrome + visible `<NodeViewContent>` with children. |

### EX — Expression attr round-trip (D5, FR-1, FR-5)

Pure fidelity tests for the five expression-attr shapes defined in D5. Lives in `packages/app/tests/fidelity/jsx-expression-attrs.test.ts`. Applies to both block and inline.

| # | Attr form | Parse → structured attr | Pristine serialize | Dirty serialize (after unrelated prop edit) |
|---|---|---|---|---|
| EX01 | `num={3}` | `{ num: 3 }` (JSON.parse literal) | byte-identical `num={3}` | reconstruction keeps `num={3}` expression form |
| EX02 | `prop={values}` | raw-string passthrough; sourceRaw path for this attr | byte-identical `prop={values}` | reconstruction preserves expression as-is (identifier passthrough) |
| EX03 | `arr={[1,2,3]}` | `{ arr: [1,2,3] }` (JSON.parse of array literal) | byte-identical | reconstruction emits `arr={[1,2,3]}` (not `arr="1,2,3"`) |
| EX04 | `complex={items.map(x => <span>{x}</span>)}` | raw-string passthrough | byte-identical — brace-depth tracking in `scanTagEvents` (SC04) does NOT confuse inner `<span>` as a separate tag | reconstruction preserves the whole expression raw |
| EX05 | `{...rest}` spread attr | sourceRaw path (spread isn't destructurable) | byte-identical | reconstruction emits `{...rest}` unchanged |
| EX06 | `bool` boolean shorthand (no value) | `{ bool: true }` | byte-identical `bool` (no `={true}`) | reconstruction emits shorthand `bool`, not `bool={true}` (preserves authoring style) |

### NCM — Nested CodeMirror in ProseMirror (FR-30..FR-35, §9.14, Precedent #22)

Ported from `reports/cm-in-pm-nested-editor-architecture/REPORT.md` §10 test plan. Covers sync math, loop prevention, boundary behavior, theming, unified undo.

| # | Scenario | Expected |
|---|---|---|
| NCM01 | Boot: broken MDX produces rawMdxFallback → NodeView mounts nested CM instance | CM instance visible; initial source from PM node's `sourceRaw` attr; markdown-language highlighting active; cursor lands in CM on click. |
| NCM02 | **PM→CM sync:** external process (agent, peer) mutates rawMdxFallback's `sourceRaw` attr | CM view updates via `update(node, decorations)` → `computeChange(old, new)` produces minimal CM transaction → CM cursor does NOT jump unless the edited region overlaps the current selection. Assertion: cursor position invariant under off-region edits. |
| NCM03 | **CM→PM sync:** user types in CM | CM transaction → `forwardUpdate` computes offset math → PM transaction dispatches targeted `tr.replaceRange` on just the changed range → `sourceRaw` attr updates. `updating` flag prevents immediate PM→CM re-sync. |
| NCM04 | **Loop-prevention stress:** 1000 alternating CM-origin and PM-origin dispatches (simulating concurrent peer + local typing) | No infinite loop, no stack overflow, no dropped events. `updating` flag correctly brackets each sync direction. Final state matches linearized application order. |
| NCM05 | **Unified undo (M19):** scripted 10-step interleaved edit sequence — type in outer PM, edit PropPanel, type in nested CM, type more in outer PM, edit rawMdxFallback, etc. Cmd-Z N times. | PM's UndoManager unwinds in exact reverse order. Nested-CM edits undo at correct points (because CM dispatches land as PM transactions via `forwardUpdate`). Document state identical to pre-edit. |
| NCM06 | **Boundary escape:** arrow-up pressed at first line of nested CM | `maybeEscape('line', -1)` returns true; PM selection moves to end of block above. CM loses focus; PM gains focus. Conversely arrow-down at last line → moves to block below. |
| NCM07 | **Typing-defer forwarding:** user types rapidly in nested CM | `markUserTyping(ydoc)` fires on each CM keydown. Observer B sees `typing-defer` window active; defers its re-parse cycle. No mid-type XmlFragment obliteration of the nested CM's outer block. |
| NCM08 | **Theme compartment hot-swap:** three nested CM instances rendered; user toggles dark → light on `<html>` class | Document-level MutationObserver dispatches custom event; each NodeView subscribes; each instance's own `Compartment` reconfigures to the light theme. No cross-instance conflict. Assertion: all three CM instances show light syntax highlighting simultaneously. |
| NCM09 | **Rapid-fix unmount:** user types `>` to close a tag → raw MDX becomes valid → next Observer B cycle converts rawMdxFallback to jsxComponent | Nested CM NodeView unmounts cleanly via PM NodeView lifecycle. No orphaned CM view. No focus bugs (focus transfers to the new jsxComponent NodeView or surrounding PM text). |
| NCM10 | **CRDT merge of nested CM edits (M15):** two clients with diverged nested CM content on same rawMdxFallback block | CM edits dispatch as PM transactions on `sourceRaw` attr. y-prosemirror merges the attr via char-level CRDT (treating it as a Y.Text-like value? Actually attrs are LWW for primitive values — for string attrs with frequent edits, this IS an LWW merge). Document state: last-writer's version of sourceRaw wins; document-level merge otherwise. If true char-level merge is needed for nested CM source, adopt the Y.Text-as-attr pattern or upgrade to full CRDT-backed nested source — flag as implementation-time decision. |
| NCM11 | **Decoration + completion:** `[[` in nested CM source | CM completion source fires → wiki-link autocomplete dropdown shows → selection inserts `[[Page Title]]`. Click on an existing `[[link]]` in the nested CM → navigation fires (via shared wiki-link decoration extension). |
| NCM12 | **Copy from nested CM:** user selects text in nested CM and Cmd-C | Clipboard contains the selected raw MDX text (not CM internal format, not HTML). Paste into another editor reproduces the raw MDX. |
| NCM13 | **Outer drag-handle + inner nested CM:** hover near rawMdxFallback's left gutter | Outer TipTap drag-handle appears at the block's gutter. Drag moves the whole rawMdxFallback block (with its nested CM) to a new position. Nested CM state survives the move; focus restores correctly. |



Unit tests against `enumerateFallbackRegions` + `findFallbackRegion` in `parse-with-fallback.ts` + integration tests through Observer B. Verifies that a broken node — properly paired or unmatched — localizes to its tightest structural region.

| # | Scenario | Expected |
|---|---|---|
| NB01 | `<Accordions>\n<Accordion title="First">ok</Accordion>\n<Accordion title="Second"><Image src="\n</Accordion>\n</Accordions>` — broken `<Image src="` inside second Accordion (both Accordions properly closed) | `enumerateFallbackRegions` produces pairs = [Accordion₁, Accordion₂, Accordions]. Error offset inside broken attr → innermost pair containing offset = Accordion₂. Only Accordion₂ → rawMdxFallback; first Accordion and outer Accordions stay structured. |
| NB02 | `<Cards>\n<Card>clean first</Card>\n<Card><Image src="broken</Card>\n</Cards>` — broken `<Image src="` inside second Card (Image's broken attr prevents its tokenization as a valid open; second Card still properly closed) | Pairs = [Card₁, Card₂, Cards]. Error offset inside second Card → innermost pair = Card₂. Only Card₂ → rawMdxFallback; Card₁ + outer Cards preserved. |
| NB03 | `<Tabs>\n<Tab>a</Tab>\n<Tab><Image src="broken</Tab>\n<Tab>c</Tab>\n</Tabs>` — broken attr inside middle Tab | Pairs = [Tab₁, Tab₂, Tab₃, Tabs]. Innermost pair containing error = Tab₂. Only Tab₂ → rawMdxFallback; first + third Tabs + outer Tabs preserved. (Regression guard: today's recursive split shatters all three Tabs.) |
| NB04 | `<Outer>\n<Mid>\n<Inner>x<Image src="</Inner>\n</Mid>\n</Outer>` — broken attr deep in nested pairs | Pairs = [Inner, Mid, Outer]. Innermost = Inner. Only Inner → rawMdxFallback; Mid + Outer preserved. |
| NB05 | Error in purely-prose block with no enclosing MDX tags | `enumerateFallbackRegions` emits no regions containing the offset → `findFallbackRegion` returns blank-line block bounds (current-main behavior retained for non-MDX errors). |
| NB06 | Two independent broken regions in separate ancestor chains (e.g. broken attr in an `<Accordions>` block and another in an unrelated `<Tabs>` block) | `parseRecursive` handles each independently: each recursive invocation runs `enumerateFallbackRegions` on its sub-source, finds its own innermost region. Two rawMdxFallback blocks; all surrounding structure preserved. |
| NB07 | Broken tag inside a fenced code block (``` ```mdx ``` with `<Foo` text) | `enumerateFallbackRegions`'s fence-aware scan excludes tokens inside fences. No regions emitted for fenced content. (remark-mdx shouldn't error inside fences anyway; test asserts that IF an error offset lands inside a fence, `findFallbackRegion` falls through to blank-line bounds rather than selecting a phantom tag region.) |
| NB08 | Deep nesting stress: 8-level ancestor chain (`<A><B><C><D><E><F><G><H>x<Image src="</H>...</A>`) | Stack enumeration produces 8 pairs in one O(n) scan; `findFallbackRegion` selects innermost pair (H) in O(regions). **Test asserts exactly one `parse()` call per `parseWithFallback` invocation at depth 0** — verifies no validation loop, no re-parse during region search (contrast with widen-iterative approach which would parse per ancestor level). |
| NB09 | **Unmatched-open inner child with unclosed attribute quote (safe-coarsening case):** `<Accordions>\n<Accordion>First</Accordion>\n<Accordion broken attr="\n  orphan text\n</Accordions>` — second Accordion's open tag has unclosed quote; `</Accordions>` balances `<Accordions>`. | Under v1 safe coarsening (documented in FR-23): `scanTagEvents`'s forward-scan enters quote state at `attr="` and never exits → second Accordion's open emits NO TagEvent → stack sees only `<Accordions>` + first `<Accordion>` pair + `</Accordions>`. Pairs = [Accordion₁, Accordions]; unmatched = []. micromark's error offset is at EOF. Innermost containing pair = Accordions. Result: **entire `<Accordions>` block becomes rawMdxFallback** (first Accordion's structured rendering is sacrificed to the safe-coarsening boundary). Test asserts: (a) content outside `<Accordions>` is unaffected; (b) raw text of both Accordion children visible inside the fallback chrome; (c) no throw, no freeze. Precision upgrade (malformed-open TagEvent) documented as Future Work in FR-23 — would recover "only second Accordion degrades" UX. |
| NB10 | **Self-closing tags don't enter stack:** `<Outer>\n<SelfClose attr="x" />\n<Inner>x<Image src="broken</Inner>\n</Outer>` | Stack scan: `<Outer>` push, `<SelfClose />` detected via `/>` terminator and skipped (no push), `<Inner>` push, `</Inner>` pop → pair, `</Outer>` pop → pair. Pairs = [Inner, Outer]. `SelfClose` NOT present as a region. Error inside Inner → innermost = Inner → Inner → rawMdxFallback; Outer + SelfClose preserved. |
| NB11 | **Top-level unmatched-open bounded by blank line:** `# Intro\n\n<Foo>content</Bar>\n\n# Outro` — tag-name mismatch at top level | Stack scan: `<Foo>` push; `</Bar>` orphan close (name mismatch, dropped); at EOF, `<Foo>` still on stack → unmatched with `end = nearestBlankLineAfter(<Foo>.start) = blank line before # Outro`. Error offset inside bad paragraph → innermost containing = Foo's unmatched region. Result: `# Intro` and `# Outro` structured; only the `<Foo>content</Bar>` paragraph → rawMdxFallback. |

### SH — Schema widening runtime behavior (Precedent #9, Precedent #10)

Runtime-level tests for schema widening. Static `schema-invariant.test.ts` catches schema shape drift; these tests catch behavioral regressions the snapshot can't see.

| # | Scenario | Expected |
|---|---|---|
| SH01 | Load a document persisted under pre-widening schema (jsxComponent atom=true, no `block*` content) into the widened schema | Document opens without error. No Y.Item destruction events emitted. `y-prosemirror`'s patch (per CLAUDE.md precedent #9) provides safety net. Assertion: Y.Doc's updateLog before/after load has zero delete ops for jsxComponent items. Document renders structurally (wildcard path for unknown names, registered path for built-ins). |
| SH02 | Post-widening schema (Q10 Option A — bridgeId NOT a schema attr). Verify old documents don't break. | No schema attr to migrate. On doc load, `bridgeIdPlugin`'s initial state.apply walks the doc and populates its WeakMap<Y.XmlElement, bridgeId> for every jsxComponent. `assertBridgeIdInvariant` passes. No error, no content loss. Schema add-only compliance trivial (no attr to add). |
| SH03 | Widen content expression from `''` (atom) to `block*`: pre-existing jsxComponent nodes with no children (they couldn't have children pre-widening) render as empty containers | No crash on load. Wildcard path applied for unknown names. Empty-container placeholder (FR-16a) or **CSS zero-footprint `<NodeViewContent>`** (FR-9 — NEVER `display: none` per Precedent #24 / NG7a) applies depending on descriptor and hasChildren flag. Assertion: PM doc validates against widened schema; no schema-check throws. |
| SH04 | Per-keystroke Y.Item identity preservation (Precedent #10): rapidly edit a jsxInline's children content (10 keystrokes) | Y.Item count for that jsxInline's inner Y.Text should grow only by the character delta, NOT multiply by 10 (which would indicate full Y.XmlElement replacement per keystroke). Content-based shape (FR-3: `content: 'text*'`) preserves parent Y.XmlElement identity. Assertion: Y.Doc update count before + after is `≤ keystroke_count + small_constant_overhead`, not `≥ keystroke_count × items_per_node`. |
| SH05 | Cross-peer Y.Item preservation for jsxInline: Client A types inside a jsxInline's text content → Client B receives via WebSocket → B's XmlElement for the jsxInline parent preserves its Y.ItemID across A's keystroke burst | Y.ItemID stable on B per Precedent #10 (`content: 'text*'`). No bridgeId concern because jsxInline has no bridgeId per NG14. Validates the thin shape's Item-preservation property under multi-peer load. |

### PS — Paste / Copy / Cross-editor (FR-29 bridgeId, Precedent #10)

Tests the bridgeId assignment + store isolation through clipboard + programmatic insertion paths.

| # | Scenario | Expected |
|---|---|---|
| PS01 | Copy `<Tabs>...</Tabs>` MDX source → paste into editor via Cmd-V | TipTap's paste handler → parse → insert PM nodes. `bridge-id-plugin`'s `appendTransaction` fires on the paste transaction → assigns fresh bridgeIds to all jsxComponent nodes in the inserted subtree (jsxInline excluded — no bridgeId per NG14). No empty bridgeIds. Ancestor walks resolve correctly for the pasted Tabs's children. |
| PS02 | Copy a Callout from editor A (WeakMap entry A), paste into editor B (WeakMap entry B) | Editor A's bridge store untouched. Editor B's `appendTransaction` assigns bridgeIds from B's counter (starts from B's current max, not clashing with anything in B). Two separate stores; no cross-editor pollution. Assertion: `storeA.size` unchanged; `storeB.size` grows by the number of inserted publishers; no bridgeId collision within B. |
| PS03 | Undo a paste operation | Inserted PM nodes roll back via PM's undo. NodeViews unmount → `usePublishContexts` cleanup fires → `store.unpublish(bridgeId)` for each inserted node. Store entries cleaned up cleanly. Re-do restores the subtree; bridgeIds are re-assigned on re-insertion (may or may not match the original IDs — spec does not require stable-across-undo bridgeIds; assertion is just invariant preservation). |
| PS04 | Paste HTML clipboard content (e.g., rich content copied from a browser page) | TipTap's paste handlers normalize → mostly plaintext + structural nodes fall out; no foreign attrs leak into jsxComponent schema. No `bridgeId=""` orphans from malformed paste inserts. |
| PS05 | Programmatic insert via `editor.commands.insertContent({type: 'jsxComponent', attrs: {name: 'Callout', type: 'warning'}, content: [...]})` | Same bridgeId plugin path as paste. Inserted node gets fresh bridgeId. `assertBridgeIdInvariant` passes. |

### AG — Agent write interactions (agent-write / agent-write-md / agent-patch × γ pattern)

| # | Scenario | Expected |
|---|---|---|
| AG01 | `agent-write-md` writes `<Callout type="warning">text</Callout>` to Y.Text | Observer B parses Y.Text → produces pristine jsxComponent PM node with `sourceRaw` populated + `sourceDirty: false`. On save, serializer emits byte-identical to agent's input. |
| AG02 | `agent-write` via Y.Text (full-document replace) | Same path as AG01 — Observer B re-parses; all jsxComponent/jsxInline nodes post-write have `sourceDirty=false` with `sourceRaw` matching the new content. No reconstruction-path serialization needed on next save unless user edits subsequently. |
| AG03 | `agent-patch` matches inside a pristine Callout's children (user-visible text replacement) | agent-patch mutates Y.Text → Observer B re-parses whole document → produces a NEW pristine Callout node whose `sourceRaw` reflects the PATCHED content (not the pre-patch content). sourceDirty stays `false`; no effectiveDirty drift because the re-parse re-derives sourceRaw from Y.Text. On save, serializer emits the patched content byte-identical. **Key insight: every agent write path goes through Y.Text, so Observer B always re-derives pristine sourceRaw — no stale-sourceRaw case from agent writes.** |
| AG04 | Agent writes malformed MDX via agent-write-md | parseWithFallback produces rawMdxFallback PM node. Agent reads back via `/api/document` → sees the raw malformed text (the fallback preserves the input verbatim). Parse-health metric (`packages/core/src/metrics/parse-health.ts`) increments the fallback counter for this docName. Structured `console.warn` event emitted per CLAUDE.md logging conventions. |
| AG05 | Agent patches across a jsxComponent boundary (match spans outside + inside a component) | agent-patch operates on Y.Text (raw string). No boundary awareness — the replacement happens at the string level. After patch, Observer B re-parses; whatever the post-patch string parses to is the new PM tree. If the patch was structurally invalid (mid-tag, broken), rawMdxFallback lands. Assertion: agent's responsibility to not break structure; editor's responsibility is graceful degradation (which parseWithFallback + G9 already provide). |
| AG06 | Undo an agent write (user Cmd-Z on the editor after agent writes) | PM undo rolls back the Y.Text mutation (since agent-write origins are typically in UndoManager's tracked origins per agent-sessions). Observer B re-parses the reverted Y.Text → produces the pre-agent-write PM state. Byte-identity restored to pre-agent-write content. |
| AG07 | Agent-write vs user-edit race: agent writes to doc while user is editing a Callout's children in WYSIWYG | CRDT merge: agent's Y.Text mutation and user's PM-origin edits both apply. If they overlap, CRDT char-level merge handles it. If they're disjoint regions, both land. Observer B re-parse produces the merged state. No lost writes. |

### TP — Typing Preserves Principle (G9, FR-22)

Integration tests through Observer B — source-mode keystrokes drive Y.Text updates → Observer B re-parses → XmlFragment updates observed.

| # | Scenario | Expected |
|---|---|---|
| TP01 | Type `<Callo` into an empty line mid-doc; keep typing one char at a time through `<Callout>Hi</Callout>` | Every keystroke produces a valid XmlFragment via `parseWithFallback`. During partial states (`<Callo`, `<Callout`, `<Callout>`, `<Callout>H`, `<Callout>Hi`, `<Callout>Hi<`, ...) the block containing the typed text renders as rawMdxFallback with the user's raw text visible. On completion of `<Callout>Hi</Callout>`, the block resolves to a structured jsxComponent (or, if `Callout` registered, live React). Surrounding paragraphs never flicker, never freeze, never lose their structure. |
| TP02 | Edit a clean paragraph's content (no JSX involved) while a DIFFERENT pre-existing broken region exists elsewhere in the doc | Paragraph edit propagates to WYSIWYG immediately on each keystroke (through Observer B's typing-defer). The pre-existing broken region stays as rawMdxFallback, unchanged. Under pre-G9 freeze, the same keystroke would not propagate until the broken region is fixed — this test is the regression guard for the document-level liveness denial described in §9. |
| TP03 | Rapid multi-keystroke typing inside a container component's children (e.g. typing a long sentence inside `<Callout>...</Callout>`) | TYPING_DEFER_MS (300ms) debouncing still applies: Observer B defers re-parse while user types in WYSIWYG; only `parseWithFallback` invocations land after the defer gate fires. No per-keystroke flicker of surrounding structure. |
| TP04 | Paste a block of malformed MDX (e.g. a snippet with an unclosed `<Foo>`) into the middle of a doc via source mode | On paste, Observer B's `parseWithFallback` immediately produces an XmlFragment with the pasted region as rawMdxFallback and surrounding content preserved. No try/catch freeze, no silent drop. |
| TP05 | Mode toggle (WYSIWYG ↔ source) while a region is mid-partial | Both modes always show the current Y.Text state (source mode: raw text; WYSIWYG: rawMdxFallback chrome + structured surrounds). Toggle is a no-op at the data layer — no data-loss vector, no "pause", no blocking dialog. Consistent with bridge always-live contract (FR-22). |
| TP06 | Observer A DMP merge (PR #128) + Observer B parseWithFallback interaction under concurrent cross-mode edits (local source-mode partial + local WYSIWYG edit to structured region) | Three-way merge on Observer A preserves both sides' content. Observer B's parseWithFallback renders whichever state resulted from the merge. No freeze, no silent overwrite. |

### VR — Visual regression (D12 fidelity-first — M20)

Playwright screenshot diffing per built-in component, editor render vs docs-site reference render. Lives in `packages/app/tests/visual/component-parity.e2e.ts`. Requires the docs-site dev server running on a known port during CI (spun up via playwright `webServer` config). Tolerance: ≤1% pixel delta per fixture (accommodates anti-aliasing).

| # | Fixture | Assertion |
|---|---|---|
| VR01 | `Callout` (types: note, warning, error, info, success) × {light, dark} × {selected-in-editor, unselected} | Editor render matches docs-site render within tolerance. |
| VR02 | `Card` (with/without `external`, with/without `title`) × {light, dark} | Same. |
| VR03 | `Cards` wrapping multiple Card children × {light, dark} | Same; layout (grid/stack) preserved. |
| VR04 | `Steps` with 3 Step children × {light, dark} | Same; step numbering + indicator bars visible. |
| VR05 | `Tabs` with 2 and 4 tabs × {light, dark} × {tab 1 active, tab N active} | Tab bar chrome + active indicator matches docs-site. |
| VR06 | `Accordions` wrapping 3 Accordion items × {light, dark} × {all closed, item 1 open, items 1+3 open} | Expand/collapse chrome + icon state matches. |
| VR07 | `AccordionItem` standalone (if ever rendered without Accordions — edge case) | ErrorBoundary chrome if context missing (defined expected error state). |
| VR08 | `Files` + `Folder` + `File` tree visualization × {light, dark} | Tree indentation + icons + hover states match. |
| VR09 | `ImageZoom` with a test image × {light, dark} × {unzoomed, zoomed-modal} | Zoom modal chrome + overlay match docs-site. |
| VR10 | `Banner` × {light, dark} | Color + padding + placement match. |
| VR11 | `TypeTable` with 5-row fixture × {light, dark} | Table rendering including monospace columns + code highlighting match. |
| VR12 | `InlineTOC` × {light, dark} × {0 headings, 3 headings, 10 headings} | TOC generation + link styling match. |
| VR13 | `Mermaid` with a flowchart fixture × {light, dark} | Diagram renders; colors match (Mermaid's own theme must match docs-site's Mermaid theme). |
| VR14 | `Audio` with test MP3 × {light, dark} | Audio player chrome (shadcn wrapper) matches reference. |
| VR15 | `Icon` (inline) with various names × {light, dark} | Icon rendering matches fumadocs-core Icon. |
| VR16 | `Badge` (inline) × {variants: default, secondary, etc.} × {light, dark} | shadcn Badge rendering matches docs-site. |
| VR17 | Mixed: a doc containing 6 different components in sequence × {light, dark} | Whole-document screenshot; no layout interference between components. |
| VR18 | Wildcard unregistered `<CustomThing>content</CustomThing>` | UnregisteredBadge chrome renders as specified by §9.7/§9.8 (no docs-site equivalent — self-referential snapshot). |

**Baseline management:** `packages/app/tests/visual/__snapshots__/` stores approved baselines. First run creates; subsequent runs diff. Golden-file updates require explicit `bun run test:visual:update` + PR review (cannot silently regenerate in CI). When fumadocs-ui ships a visual change, the corresponding VR## snapshot updates in the same PR that bumps the dep.

### PF — Performance benchmarks

Thresholds are informative (not hard failures) but regression > 10% vs baseline fails CI. Lives in `packages/app/tests/stress/component-blocks.perf.ts`. Run via `bun run test:perf` (new turbo task).

| # | Benchmark | Threshold |
|---|---|---|
| PF01 | 100 jsxComponent nodes in one doc; edit one prop via PropPanel | Only that node re-renders (React DevTools profiler render-count assertion: 1 NodeView render, 0 sibling renders). p99 render time < 50ms. |
| PF02 | 10-level deeply nested compound structure; trigger one NodeView render | Child-side compound-wrapper DOM-attr lookup (`closest('.editor-tabs-root')` + `data-active-tab` read) < 5ms per render. p99 < 10ms. **Re-scoped 2026-04-16** after the Context Bridge Registry (`useAncestorContexts` + `ContextBridgeProvider`) was removed as dormant infrastructure in PR #165's review-pass fixup; Fallback 2 DOM-attr path is what's shipped (SPEC §9.15.7 R1). See [`evidence/deferred-invariants-and-perf.md`](evidence/deferred-invariants-and-perf.md) §J for the re-scoped test approach. |
| PF03 | 500 keystrokes in source mode on doc containing 20 jsxComponents (broken and unbroken mix) | Observer B's `parseWithFallback` average cycle < 20ms; p99 < 50ms. No cycle exceeds 200ms. |
| PF04 | Whole `bun run check:full:parallel` suite | No test tier's warm-replay time regresses > 10% vs main-branch baseline. Baseline refreshed quarterly. |
| PF05 | Y.Item count growth under 100-keystroke typing in jsxInline children | Y.Item delta ≤ `keystroke_count + constant_overhead` (per Precedent #10 + SH04). If delta scales super-linearly, indicates Y.XmlElement churn; fails PF05. |
| PF06 | Store publish/unpublish throughput under load: mount 50 compounds simultaneously | All publishes settle within 16ms (one frame). No dropped subscriptions. |

> **⚠️ Implementation status (2026-04-16):** PR #165 shipped **PF03, PF05, PF06** in `packages/app/tests/stress/component-blocks.perf.test.ts`. **PF01 and PF02** are deferred to a stacked follow-up PR — both require a DOM test environment (happy-dom + React.Profiler + TipTap layout mocks) that's being set up in that follow-up. **PF04** is formally [NOT NOW] (see non-goals above). The **max(2σ, 10%) variance formula** from `packages/core/tests/perf/regression-gate.ts` is NOT adopted for component-blocks perf — research confirmed emulator timings under happy-dom don't reflect render cost; instead PF01/PF02 split into ordinal/relative assertions in Bun and absolute-ms assertions in Playwright. Full follow-up context in [`evidence/deferred-invariants-and-perf.md`](evidence/deferred-invariants-and-perf.md).

### A11Y — Accessibility (WCAG 2.1 — §14)

Playwright + axe-core scenarios. Lives in `packages/app/tests/a11y/component-blocks.e2e.ts`. §14 spells out the keyboard nav + focus management + live region guidance; these tests assert it.

| # | Scenario | Assertion |
|---|---|---|
| A11Y01 | Tab key cycles through PropPanel controls in visual DOM order | Focus moves through each control; Shift+Tab reverses; no control skipped. axe-core reports no focus-order violations. |
| A11Y02 | NodeSelection on Callout via click or keyboard Shift+Arrow | Screen reader announces "Callout component selected" via `aria-live="polite"` region. Assertion: aria-live region's textContent updates within 100ms. |
| A11Y03 | PropPanel open → Esc key | Panel closes; focus returns to the NodeSelection anchor (the block itself). `document.activeElement` matches the jsxComponent's NodeViewWrapper. |
| A11Y04 | Inline PropPanel popover | Has `role="dialog"` + `aria-labelledby` pointing to a label containing the component name. axe-core + manual DOM assertion. |
| A11Y05 | rawMdxFallback nested CodeMirror has `aria-label="Raw MDX source edit region"` | Screen reader context signals the editing mode. |
| A11Y06 | Keyboard navigation between Accordion items (ArrowDown/Up/Home/End) in nav mode | Focus moves between items. Screen reader announces "Accordion item N of M" via Collection a11y semantics (Radix's built-in `aria-current` + `aria-setsize`). |
| A11Y07 | Empty-container placeholder "Click to add a step" is keyboard-activatable | Tab lands on the placeholder; Enter/Space inserts the child (not just mouse click). |
| A11Y08 | ComponentErrorBoundary invalid-state CM (Precedent #24) | Error badge has `role="alert"` + `aria-live="assertive"` announcing "`<{componentName}>` render error — editing source." Embedded CodeMirror is keyboard-accessible: Tab focuses the editor, Esc exits to surrounding PM, screen reader announces "Raw MDX source edit region" (same pattern as A11Y05). Error message is in text content, not only a tooltip. No "retry" affordance — edit-and-commit auto-retries. |
| A11Y09 | Wildcard block component chrome (UnregisteredBadge for unregistered jsxComponent) | Has accessible name via `aria-label="Unregistered component: {name}"`; focusable via Tab so keyboard users can navigate to it. (jsxInline has no chrome per NG14 — accessible because it's plain text.) |
| A11Y10 | No axe-core violations on a realistic content corpus | Run axe on a 20-component fixture document in both light and dark modes; zero violations at WCAG 2.1 AA. |

## 8) Current state (post-#136 — our baseline)

**What shipped and is available to us:**

| Shipped artifact | Purpose |
|---|---|
| `packages/core/src/extensions/jsx-component.ts` | Block JSX PM node — currently `atom: true, isolating: true`, attrs `{ content }`. We widen this. |
| `packages/core/src/extensions/jsx-inline.ts` | Inline JSX PM node — shipped from #136 with attrs. **We rewrite to a thin zero-attr shape** (`atom: false, content: 'text*', isolating: false, selectable: true`) per NG14 / FR-4. No NodeView, no descriptor dispatch, no chrome — inline JSX renders as visible source text. Preserves `<`/`>` chars through serializer via `'html'` mdast. Greenfield directive: no migration needed. See `evidence/inline-component-editing-deferred.md` for the deferred rich-editing scope. |
| `packages/core/src/extensions/raw-mdx-fallback.ts` | Parse-failure fallback — `atom: false, content: 'text*', isolating: true, defining: true`. Orthogonal to us; we don't modify. |
| `packages/core/src/markdown/index.ts` | mdast→PM handlers at line 429+ (`mdxJsxFlowElement` → jsxComponent atom with sourceRaw). We replace this handler for Layer 2/3 parsing. |
| `packages/core/src/markdown/parse-with-fallback.ts` | R6 block-level split-then-rejoin. Used by server persistence + external-change + rollback + agent-sessions — but NOT Observer B (the sole outlier; see below). We rewrite `findFallbackRegion` to single-pass structural enumeration (FR-23) so one broken inner node — whether properly paired or an unmatched open — no longer shatters its ancestor into multiple rawMdxFallback chunks. |
| `packages/core/src/markdown/remark-mdx-agnostic.ts` | R1 agnostic mode on both parse + serialize. Expression attrs come through as raw strings (no acorn). |
| `packages/core/src/schema-invariant.test.ts` | R10 enforcement. Key finding: content expression check has `if (expected.content !== '')` exception, so widening from `atom` (content: '') to `'block*'` passes. `atom` field is NOT checked against snapshot. Snapshot regeneration is the standard path for additive changes. |
| `packages/core/src/schema-snapshot.json` | Captures current shape + extension ordering. We'll regenerate when widening jsxComponent + adding SourceDirtyObserver extension. |
| `patches/y-prosemirror@1.3.7.patch` | R13 patch — schema-throw fallback substitution. Protects our widening. |
| `packages/core/src/metrics/parse-health.ts` | R14 observability — aggregate counters exposed at `/api/metrics/parse-health`. |
| `packages/app/src/editor/observers.ts` | Post-#128. `ORIGIN_TREE_TO_TEXT = 'sync-from-tree'` and `ORIGIN_TEXT_TO_TREE = 'sync-from-text'` exported as constants. `applyUserDelta` rewritten to DMP three-way merge with Item-preservation gate. Observer B (Y.Text → XmlFragment) currently calls bare `mdManager.parse(body)` at `observers.ts:461` inside a try/catch — on parse failure, swallows `SyntaxError \| VFileMessage \| RangeError` and keeps the last valid XmlFragment (freeze). We flip this to `mdManager.parseWithFallback(body)` (FR-22) so WYSIWYG always renders the current Y.Text state — in concert with FR-23's ancestor-aware widening to preserve sibling/ancestor structure around broken nodes. |
| `packages/server/src/doc-extensions.ts` | Post-#126. `.mdx` first-class alongside `.md`. Our component editing applies to both. |

**What's still missing that we add:**

- `jsxComponent` widened (atom → non-atom, `content: 'block*'`, additional attrs)
- `jsxInline` rewritten to thin shape per NG14 (zero attrs, no NodeView, generic span — see FR-4 + §9.8)
- Descriptor registry (`packages/core/src/registry/*`) — block-only per NG14
- Component built-ins manifest (18 components)
- `JsxComponentView.tsx` with descriptor dispatch (block-only — no JsxInlineView)
- PropPanel (block floating only — no inline popover per NG14)
- Custom `mdxJsxFlowElement` to-markdown handler (flush-left)
- Source-dirty observer plugin
- Block UX (SideMenu via `@tiptap/extension-drag-handle-react`, "+", keyboard nav)
- Observer B flip to `parseWithFallback` (FR-22) — one-line call-site change at `observers.ts:461` + removal of the now-unreachable catch block
- `findFallbackRegion` single-pass structural enumeration (FR-23) in `parse-with-fallback.ts` — adds `enumerateFallbackRegions` helper; enumerates pairs + unmatched-opens once per parse cycle; delivers ancestor-chain locality (G9) for both properly-paired and unmatched-open broken nodes

**18-of-21 components resolve:** 16 fumadocs (verified in `node_modules/fumadocs-ui@16.1.0/dist/components/`) + 2 shadcn wrappers to write (`packages/app/src/components/ui/{mermaid,audio}.tsx`). 3 docskit deferred to Future Work (`@inkeep/docskit` not installed).

## 9) Proposed solution

### 9.0 Architectural precedents introduced by this spec

Two new precedents land with Component Blocks v2. They extend the 11 established precedents in `CLAUDE.md §Architectural precedents`.

- **Precedent #22 — Direct PM dispatch for nested editors.** Embedded editor instances (CodeMirror 6 today; Monaco or any future nested editor) within ProseMirror NodeViews use the direct PM transaction dispatch pattern, never direct CRDT bindings (y-codemirror.next, y-monaco, etc.) on shared Y types. CM → PM transaction → y-prosemirror → CRDT. Single owner per Y type. Avoids dual-observer conflicts where two CRDT bindings observe the same Y type with independent origin guards. Established by FR-30..FR-35 and §9.14 for `rawMdxFallback`; carries forward to any future nested-editor use case (per-block source toggle, embedded code blocks, etc.). Rationale + evidence in `reports/cm-in-pm-nested-editor-architecture/REPORT.md` §8.

- **Precedent #23 — Context Bridge Registry for compound React components across NodeView portals.** When a compound component (container that provides React Context to its descendants via `<Context.Provider>`) is rendered as a NodeView, its descendant NodeViews render as sibling React portals under `<Portals>` — NOT as React-tree descendants of the parent NodeView. Per React Portal semantics, descendants do not inherit context from the parent portal's subtree. The Context Bridge Registry (FR-27, §9.15) publishes per-PM-node-identity context values from ancestor NodeViews and re-provides them in descendant NodeView React subtrees via `<Context.Provider>`. Applies to any compound component pattern (Radix Tabs/Accordion/Collapsible, future fumadocs containers, any user-facing compound in a later custom-component spec). Alternative architectures (render in-tree bypassing contentDOM, fork @tiptap/react portal model, top-level Provider from store) rejected during design — rationale pending `reports/context-bridge-registry-architecture/REPORT.md`.

- **Precedent #24 — All user content always visible; invalid states surface the embedded source editor.** Two coupled invariants:
  1. **No silent content hiding.** No `display: none` on NodeViewContent. No read-only fallbacks for content. No "show error chrome instead of the broken content." If bytes exist in the PM tree (or its underlying source), they are rendered on screen and editable. Chrome (toolbars, badges, hover outlines, PropPanels) is conditional; *content* is unconditional.
  2. **Invalid states use the embedded source editor (nested CodeMirror, §9.14).** When a block is in an invalid state — parse failure (rawMdxFallback), render failure (component throws), descriptor mismatch — the NodeView surfaces a nested CM editor containing the block's source. User edits in CM → on commit, parser re-attempts → if valid, transitions back to structured render; if still invalid, stays in CM. Same mechanism for every invalid state. Symmetric, predictable, recoverable in place. No "Retry" buttons (commit IS retry). No read-only chrome (source is always editable).
  
  Rationale: the editor is a tool for working with content. Hiding content prevents the user from fixing it. Surfacing the embedded source editor turns "invalid state" into "fix-it-in-place" — same affordance regardless of which invalid state was hit. Established by user directive 2026-04-14 ("we ALWAYS want to show all content so that the user is aware and can edit/fix/read all content. that's an invariant. ... when something is in an invalid state, i think we need to use the same 'render embedded source editor' thing"). Applies repo-wide, not just to Component Blocks v2 — any future NodeView (custom components NG13, inline-component-editing NG14, etc.) inherits both halves.

### 9.1 Architecture

```
Schema (post-#105 + our additions):
  jsxComponent (BLOCK) — WIDENED BY US
    atom: false, content: 'block*', isolating: true
    attrs: componentName, kind, attributes, sourceRaw, sourceDirty, content (R10-retained)
    (bridgeId is NOT a schema attr — lives in bridgeIdPlugin PluginState per Q10 Option A)

  jsxInline (INLINE) — REWRITTEN TO THIN SHAPE BY US (NG14 / FR-4 / §9.8)
    atom: false, content: 'text*', isolating: false, selectable: true
    attrs: { } (zero attrs — text content IS the source)
    NodeView: NONE — generic <span data-jsx-inline=""> rendering
    Parser: emits raw source slice as text content
    Serializer: emits as 'html' mdast (bypasses text-escape safe list)
    No descriptor dispatch, no PropPanel, no chrome, no bridgeId, no Context Bridge.
    Greenfield: replaces #136's shipped jsxInline shape; no migration code needed.

  rawMdxFallback (BLOCK) — INHERITED FROM #105 (parse failures; orthogonal to our work)

Serialization (γ pattern, applies to jsxComponent only — jsxInline is handled separately by FR-5b):
  if kind === 'expression' → html pass-through (sourceRaw / content)
  if !effectiveDirty && sourceRaw → html pass-through (sourceRaw) — BYTE-IDENTICAL
  else → reconstruct mdxJsxFlowElement → mdxToMarkdown (custom flush-left handler)

  effectiveDirty(node) = node.attrs.sourceDirty || hasDirtyDescendant(node)
  (FR-5: pristine parent + dirty descendant must reconstruct, never emit stale sourceRaw)

  jsxInline serializer (FR-5b): always html-mdast pass-through of text content.
    Bypasses text-escape safe list; preserves <, > characters raw.

Source-dirty observer plugin (runs at editor level, jsxComponent only):
  On every transaction:
    if transaction.origin ∈ {sync-from-text, sync-from-tree, agent-write, rollback-apply}:
      skip — not a user edit
    else:
      walk doc; for each jsxComponent whose content or structured attrs changed:
        mark sourceDirty: true
  (jsxInline excluded — no sourceDirty attr per NG14 / FR-4)

bridgeId PluginState (Q10 LOCKED → Option A; NOT a schema attr):
  An editor-scoped bridgeIdPlugin maintains PluginState<WeakMap<Y.XmlElement, string>>.
  On every transaction (appendTransaction or plugin.state.apply):
    walk doc; for each jsxComponent whose backing Y.XmlElement has no entry in the map:
      assign bridgeId = 'b' + ++editorCounter; store in WeakMap
    no schema mutation — PluginState-only update
  Publishers/consumers read via bridgeIdPluginKey.getState(editorState).getFor(node):
    NEVER via node.attrs.bridgeId (no such attr exists)
  → stable keys for Context Bridge Registry (FR-27/FR-29/§9.15)
  → Observer B re-parse does not churn bridgeId (parse output has no attr to diff;
     Y.XmlElement identity preserved by y-prosemirror → WeakMap entry preserved)
  (jsxInline excluded — no bridgeId at all per NG14 / FR-4)

Context Bridge flow (FR-27, FR-29, §9.15):
  Compound-parent NodeView renders:
    const bridgeId = bridgeIdPluginKey.getState(editor.state).getFor(node, getPos);
    <RealFumadocsComponent>              ← sets up Radix + fumadocs contexts
      <ContextCapture bridgeId={bridgeId} contexts={descriptor.contextCapture.contexts}>
        ↑ reads live scope-resolved Context values via use() / useContext()
        ↑ publishes to bridge store in useLayoutEffect
      </ContextCapture>
      <NodeViewContent />                  ← PM children DOM slot
    </RealFumadocsComponent>

  Any NodeView (auto-wrap):
    ancestorEntries = useAncestorContexts(store, editor, getPos)
      → walks $pos.node(depth) from depth-1 (nearest PM ancestor) down to 0
      → collects each ancestor's published ContextEntry[] via push (nearest-last)
      → ContextBridgeProvider wraps entries[0] first → entries[last] (nearest) becomes
        INNERMOST React provider, shadowing outer ancestors (correct React semantics)
    <ContextBridgeProvider entries={ancestorEntries}>
      <ComponentErrorBoundary>
        <Component {...primitiveProps}><NodeViewContent /></Component>
      </ComponentErrorBoundary>
    </ContextBridgeProvider>

  When entries is empty (non-compound scope), ContextBridgeProvider renders children
  unchanged — zero-cost no-op.

Bridge always-live contract (G9, FR-22 + FR-23):
  Observer B (Y.Text → XmlFragment) calls parseWithFallback(source) at observers.ts:461
    — parseWithFallback NEVER throws; always returns a valid PM doc tree
    — unparseable spans become rawMdxFallback nodes via findFallbackRegion
    — findFallbackRegion is a single-pass structural enumeration:
        · stack-based scan emits pairs (<X>...</X>) + unmatched-opens
          (tags evicted from stack; span ends at evictor or blank-line cap)
        · self-closing <Foo /> never enters the stack
        · fallback region = smallest region (pair or unmatched-open) containing
          the error offset, else coarsest blank-line bounds
        · no iteration, no widen loop, no cap, no re-parse inside the region search
    — WYSIWYG always renders current Y.Text state; NO freeze, NO pause
    — per-node rendering independence: a broken node degrades only its own
      ancestor chain; siblings + sibling-descendants stay structured whether
      the broken node is properly paired OR an unclosed partial
    — Observer A (XmlFragment → Y.Text) + DMP three-way merge (#128) preserves
      concurrent edits across modes and peers (unchanged from current main)
```

### 9.2 Descriptor registry (MDXEditor-pattern adapted)

**PropDef is a discriminated union** — illegal states like `{ type: 'enum' }` without `enumValues` are compile-time errors. Each variant narrows `defaultValue` to the correct primitive type. `PropDefReactNode` has no `defaultValue` (ReactNode is a content hole, not a prop value):

```typescript
// packages/core/src/registry/types.ts
// (salvaged verbatim from pr23-rebase — production-hardened under Layer-1; nothing post-#136 invalidates it)
export interface PropDefBase {
  name: string;
  required: boolean;
  description?: string;
  /**
   * Suppresses the prop from the auto-generated PropPanel UI, while keeping
   * it in the descriptor for documentation and MCP queries. Useful for extracted
   * props that shouldn't surface to authors (className, ref, style, internal-only
   * fields). Analogous to Storybook's `argTypes.X.control: false`. The
   * build-registry JSDoc extractor populates this from an `@hidden` tag on the
   * source prop.
   */
  hidden?: boolean;
}
export interface PropDefString  extends PropDefBase { type: 'string';   defaultValue?: string; }
export interface PropDefBoolean extends PropDefBase { type: 'boolean';  defaultValue?: boolean; }
export interface PropDefNumber  extends PropDefBase { type: 'number';   defaultValue?: number; }
export interface PropDefEnum    extends PropDefBase { type: 'enum';     enumValues: string[]; defaultValue?: string; }
export interface PropDefReactNode extends PropDefBase { type: 'reactnode'; }
export type PropDef = PropDefString | PropDefBoolean | PropDefNumber | PropDefEnum | PropDefReactNode;
```

**PropPanel filter (FR-11 update):** the panel renders controls for `descriptor.props.filter(p => !p.hidden && p.type !== 'reactnode')`. ReactNode props are hidden because content-hole editing is the right affordance (validated independently by Storybook Issue #13551, #11429 — see `reports/storybook-ecosystem-component-blocks-reuse/evidence/failure-modes-lessons.md`). Hidden-flagged props are suppressed by the same filter.

**Descriptor — core/app split** (core must stay React-free per CLAUDE.md):

```typescript
// packages/core/src/registry/types.ts — React-free metadata (lives in core)
// NG14: registry tracks block components only. No isInline field — inline JSX is the
// thin jsxInline node and doesn't use descriptors.
export interface JsxComponentMeta {
  name: string | '*';                     // '*' = wildcard fallback for unregistered block jsxComponent
  hasChildren: boolean;                   // PropPanel/slash-menu hint; NodeViewContent always renders per Precedent #24
  isSelfClosing?: boolean;                // hint: component is typically self-closing (e.g. <Chart />)
  props: PropDef[];                       // auto-generated by react-docgen-typescript
  icon?: string;                          // slash menu icon (resolved to Lucide in app)
  category?: 'content' | 'layout' | 'media' | 'data';
  displayName?: string;                   // slash menu label
  description?: string;                   // one-line summary for slash menu + MCP agent discovery (P4)
  searchTerms?: string[];                 // slash-command aliases (e.g. Callout → ['note','warning','tip','info','alert'])
  emptyChildName?: string;                // for empty-container placeholder UX (§9.10) — Steps → 'Step', Tabs → 'Tab'
}

// packages/app/src/editor/components/componentMap.ts — browser-only React impl map
import { Callout } from 'fumadocs-ui/components/callout';
// ... 15 more imports
export const componentMap: Record<string, React.ComponentType<any>> = {
  Callout, Tabs, Tab, /* ... */
  '*': UnregisteredBadgeRender,  // wildcard visual fallback
};

// packages/app/src/registry/index.ts — merged descriptor (core meta + app Component)
export interface JsxComponentDescriptor extends JsxComponentMeta {
  Component: React.ComponentType<any>;  // app-only
}
```

**Rationale for split:** core is React-free (CLAUDE.md invariant). Core owns the typed metadata; app owns the runtime React mapping. Merged descriptors materialize at app startup by zipping core's `JsxComponentMeta[]` with app's `componentMap`.

**Runtime lookup (block-only per NG14 — inline doesn't use descriptors):**
```typescript
function getDescriptor(name: string): JsxComponentDescriptor {
  return registry.get(name) ?? registry.get('*')!;
}
```

**Wildcard descriptor** (registered at editor bootstrap; block-only — inline doesn't use descriptors per NG14):
```typescript
const wildcardDescriptor: JsxComponentDescriptor = {
  name: '*',
  hasChildren: true,                      // markdown children editable — "bring your own markdown" principle
  props: [],
  Component: UnregisteredBadgeRender,    // generic: name badge + children passthrough
};
```

**`description` + `searchTerms` populated for all 18 P0 built-ins** (T1 curation ported verbatim — e.g. `Callout → ['note','warning','tip','info','alert']`, `Card → ['link','preview']`, `Steps → ['guide','tutorial','howto']`). CI drift detector catches missing entries when new built-ins are added. The descriptor schema's optional `searchTerms?: string[]` is a stable extensibility seam — NG13 custom components would supply their own without schema change.

### 9.3 Parse handler additions (packages/core/src/markdown/index.ts)

```typescript
// REPLACE handlers.mdxJsxFlowElement at line 429:
handlers.mdxJsxFlowElement = (node: MdxJsxFlowElement) => {
  const name = node.name ?? '';
  const descriptor = getDescriptor(name);
  const structuredAttrs = destructureAttrs(node.attributes, descriptor.props);
  const children = state.all(node).flat();
  return n.jsxComponent.createAndFill(
    {
      componentName: name,
      kind: 'element',
      attributes: node.attributes,               // preserve mdast shape for serialize
      sourceRaw: rawFromData(node.data) ?? '',   // bytes-from-parse
      sourceDirty: false,                        // fresh parse
      ...structuredAttrs,                        // typed prop attrs (descriptor-aware)
    },
    children.length ? children : undefined,
  );
};

// REPLACE handlers.mdxJsxTextElement at line 429 (NG14 / FR-2 / FR-4 — thin jsxInline):
// NOTE (2026-04-15 spec correction): raw source is recovered via rawFromData(node.data),
// which the position-slice walker (packages/core/src/markdown/position-slice.ts:187-192)
// attaches to mdast nodes before handlers run. Handlers do NOT receive an
// `originalSource` parameter — the walker is the source-of-truth mechanism.
handlers.mdxJsxTextElement = (node: MdxJsxTextElement) =>
  n.jsxInline.createAndFill(
    {},                                            // zero attrs per FR-4
    [schema.text(rawFromData(node.data) ?? '')],   // single text child = raw source
  );
```

**Why single-line JSX lands in jsxInline (micromark-extension-mdx tokenization rule):** balanced JSX that fits on one line tokenizes as `mdxJsxTextElement` (inline) regardless of whether it stands alone on the line. Flow-context `mdxJsxFlowElement` only triggers when open/close tags are on different lines or the inner content is block-like. This means:
- `<Callout type="info">Hello</Callout>` (single line) → jsxInline → **visible source text in WYSIWYG** per NG14; no live render
- `<Callout type="info">\n\nHello\n\n</Callout>` (multi-line) → jsxComponent → **live React render as block**, editable via floating PropPanel

The authoring form is preserved on round-trip. **Users who want live-rendered block components must write the multi-line form** — this is micromark's rule, not ours to override (overriding would break byte-identity). Documented in §5 user journeys; no workaround needed.

`destructureAttrs` is ~15 LoC: reads MdxJsxAttribute[], maps per PropDef (string-literal → value; `value == null` → true for boolean shorthand; expression → JSON.parse if simple literal, else raw string per D5).

### 9.4 Serialize handler additions (packages/core/src/markdown/index.ts)

```typescript
// REPLACE nodeHandlers.jsxComponent at line 590:
nodeHandlers.jsxComponent = (pmNode: PmNode): MdxJsxFlowElement | Html => {
  // Expression passthrough
  if (pmNode.attrs.kind === 'expression') {
    return { type: 'html', value: pmNode.attrs.content || pmNode.attrs.sourceRaw };
  }
  // γ: pristine → sourceRaw (byte-identical)
  if (!pmNode.attrs.sourceDirty && pmNode.attrs.sourceRaw) {
    return { type: 'html', value: pmNode.attrs.sourceRaw };
  }
  // γ: dirty → reconstruct
  return {
    type: 'mdxJsxFlowElement',
    name: pmNode.attrs.componentName,
    attributes: reconstructAttrs(pmNode.attrs),
    children: state.all(pmNode).flat(),
    data: {},
  };
};

// ADD nodeHandlers.jsxInline (FR-5b — thin shape per NG14; zero γ participation):
// Text content IS the source. Emit as 'html' mdast to bypass text-context escape safe list
// (prevents mdast-util-to-markdown from escaping '<' → '\<' and breaking re-parse).
nodeHandlers.jsxInline = (pmNode: PmNode): Html => ({
  type: 'html',
  value: pmNode.textContent ?? '',
});
```

`reconstructAttrs` has **merge semantics** (critical for unknown-attr preservation — addresses T1 §3.8 collision policy under γ-dirty path):

1. **Start from the preserved mdast `attributes` array** stored on `pmNode.attrs.attributes` (the full `MdxJsxAttribute[]` parsed from the source). This includes any attrs the user's JSX had that aren't in the registered descriptor's PropDef (e.g., user's agents-docs `<Card color="#F05032" external>` when fumadocs Card has no `color`/`external` in its PropDef).
2. **Overlay descriptor-mapped structured attrs** for each PropDef-declared attr whose current PM node value differs from the mdast-preserved value. Descriptor attrs win ONLY for keys present in PropDef; all other keys pass through from `attributes` verbatim.
3. **Emit the merged `MdxJsxAttribute[]`** with matching value-type per attr (string-literal for strings, `MdxJsxAttributeValueExpression` for numbers/expressions, null for booleans).

**Test invariant (M-series):** "edit a `<Card>` with unknown `color="#F05032" external` → save → `color` and `external` still present in serialized output." Without this merge, the γ-dirty path silently drops unknown attrs — a correctness bug, not cosmetic.

### 9.5 Custom flush-left to-markdown handler

```typescript
// packages/core/src/markdown/to-markdown-handlers.ts
export const mdxJsxFlowElementHandler: Handle = (node, _parent, state, info) => {
  // Bypass library's containerFlow depth-indentation.
  // Emit: <Tag attr="value">\n\nchildren-serialized-flush-left\n\n</Tag>
  // Preserves fumadocs/Obsidian authoring convention; avoids 4-space CommonMark code-block
  // ambiguity at depth 2+.
  // ~30 LoC.
};
```

Probe evidence: library's default indents children 2-space-per-depth; our handler emits flush-left. Idempotent in both directions.

### 9.6 Source-dirty observer plugin

```typescript
// packages/app/src/editor/extensions/source-dirty-observer.ts
const userIntentOrigins = new Set<string>([]);  // empty allowlist = "any not in deny-list"
const nonUserOrigins = new Set<string>([
  'sync-from-text',     // Observer B re-applying parse result
  'sync-from-tree',     // Observer A → Y.Text
  'agent-write',        // server-side agent write
  'rollback-apply',     // PR #39 Timeline rollback
]);

export const SourceDirtyObserver = Extension.create({
  name: 'sourceDirtyObserver',
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction(transactions, oldState, newState) {
        // Only fire on user-intent transactions
        if (transactions.some(tr => nonUserOrigins.has(tr.getMeta('origin') ?? ''))) return;
        // Walk doc, find jsxComponent/jsxInline nodes whose content OR structured attrs changed
        const updates: {pos: number; }[] = [];
        newState.doc.descendants((node, pos) => {
          if (node.type.name !== 'jsxComponent') return;  // jsxInline excluded per NG14 / FR-4
          const oldNode = oldState.doc.nodeAt(pos);
          if (!oldNode || !contentEqual(oldNode, node) || !attrsEqual(oldNode, node)) {
            if (!node.attrs.sourceDirty) updates.push({ pos });
          }
        });
        if (updates.length === 0) return null;
        const tr = newState.tr;
        for (const { pos } of updates) {
          tr.setNodeAttribute(pos, 'sourceDirty', true);
        }
        return tr;
      },
    })];
  },
});
```

**Origin-guard lineage:** uses #105's established transaction-origin model (see CLAUDE.md Origin-guard truth table). Adds `rollback-apply` from PR #39. Plugin registered in both `packages/app/src/editor/TiptapEditor.tsx` and `packages/app/src/server/hocuspocus-plugin.ts` (server-side agent-write path also needs dirty tracking if agents ever mutate structured attrs directly — though agents currently write via markdown, not PM commands).

### 9.7 NodeView (block) — JsxComponentView.tsx

**Per Precedent #24 (always-visible content; invalid states surface the embedded source editor):** the NodeView has three render branches and ALL of them keep user content visible. No `display: none` on NodeViewContent. No read-only chrome covering broken-component children. Render-failure path uses the same nested CodeMirror mechanism as parse-failure (rawMdxFallback) — unified invalid-state editor.

**Branches:**

1. **Wildcard (unregistered name)** — UnregisteredBadge chrome + visible editable `<NodeViewContent>` + no PropPanel. (Always-visible: children always editable.)
2. **Registered, healthy render** — live React component + ComponentToolbar (when not a child-of-component per FR-17) + PropPanel (when selected + has editable props per ES01-03) + `<NodeViewContent>` always rendered (CSS zero-footprint when descriptor is `hasChildren: false` AND children are empty; visible whenever children exist regardless of descriptor).
3. **Registered, render failure (invalid state)** — `ComponentErrorBoundary` catches → NodeView swaps to **invalid-state nested CodeMirror** (per FR-19, §9.14) showing the block's source for in-place editing. No retry button (commit IS retry). No read-only chrome.

**ComponentErrorBoundary — minimal class component**, just routes to invalid-state render branch:

```tsx
// packages/app/src/editor/components/ComponentErrorBoundary.tsx
// Simpler than pr23-rebase version: no internal chrome, no retry button, no sourceRaw display.
// All it does is catch + signal "swap render branch in JsxComponentView."
class ComponentErrorBoundary extends Component<
  { onError: (error: Error) => void; children: ReactNode },
  { errored: boolean }
> {
  state = { errored: false };
  static getDerivedStateFromError() { return { errored: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn(JSON.stringify({  // structured event per CLAUDE.md logging convention
      event: 'jsx-render-failure',
      error: String(error),
      stack: info.componentStack,
    }));
    this.props.onError(error);
  }
  render() {
    // When errored, render nothing — JsxComponentView reads the local errored state
    // (via setState callback in onError) and switches to invalid-state CM branch.
    return this.state.errored ? null : this.props.children;
  }
}
```

**Invalid-state nested CodeMirror** uses the same `createNestedCMExtensions` factory + NodeView pattern as `rawMdxFallback` (§9.14, Precedent #22). The CM instance is initialized with the block's effective source — `sourceRaw` if pristine, otherwise reconstructed via the γ pattern. On commit (blur, throttle, or Cmd+Enter), `parseWithFallback` re-parses the CM text scoped to this block:

- Re-parses cleanly to the same component name → dispatch `updateAttributes` + replace children + reset `errored` → next render re-attempts live React.
- Re-parses cleanly to a different component name (e.g., user changed `<Callout>` to `<Note>`) → dispatch `replaceNode` to a new jsxComponent with the new name → next render dispatches via descriptor for the new name.
- Re-parses to `rawMdxFallback` (structurally invalid) → dispatch `replaceNode` to rawMdxFallback → user continues editing in the rawMdxFallback's nested CM (same UX, different node type).
- Component re-throws on next render → ErrorBoundary catches → stays in invalid-state CM.

**Render-failure ≡ parse-failure (Precedent #24 unified mechanism):**

Pre-Precedent-#14, render failure and parse failure used different mechanisms (Option C4 chrome vs rawMdxFallback). Now they're symmetric.

| Property | Parse failure (`rawMdxFallback`) | Render failure (registered jsxComponent throws) |
|---|---|---|
| PM node type | `rawMdxFallback` | `jsxComponent` (unchanged — render branch swap is local NodeView state) |
| Editable surface | Nested CodeMirror (§9.14) | Nested CodeMirror (§9.14) — SAME factory, SAME extensions, SAME unified-undo |
| Trigger | Observer B parse fails → produces rawMdxFallback PM node | React render throws → ErrorBoundary sets local `errored=true` |
| Recovery | User edits CM source → on commit, parseWithFallback → if valid, replaceNode to jsxComponent | User edits CM source → on commit, block-scoped parseWithFallback → updateAttributes or replaceNode + reset errored |
| User affordance | None special — CM is the affordance | None special — CM is the affordance |
| Read-only chrome | None | None |
| Retry button | None — every commit IS a retry | None — every commit IS a retry |

Same mechanism for every invalid state. No mode-switching, no buttons to click, no chrome to read. The user sees the source, edits the source, and the editor figures out the rest.

**Acknowledged trade-off — render-failure loses PropPanel affordance (vs. pre-Precedent-#14 "Option C4" design):** Under the previous Option C4 design, the PropPanel remained available during render failure — the user could click a prop control to edit typed attrs even while the component crashed. Under Precedent #24's unified CM, the PropPanel is not shown in the invalid-state branch; the user edits attrs by modifying raw JSX source in the CM. This is a UX regression for the narrow case of a registered component that throws but whose props are otherwise structurally valid. It's accepted because (1) built-in components in the P0 manifest are tested and rarely throw; (2) a hybrid chrome (CM + PropPanel simultaneously) re-introduces exactly the surface complexity Precedent #24 removes; (3) the unified single-mechanism mental model ("invalid → source editor") is more predictable than case-by-case chrome selection; (4) the user directive that established Precedent #24 explicitly authorized this trade-off.

**Behavioral contract for the commit handler** (the normative spec — implementer hits these outcomes; the code shape below is one way to achieve them):

| Parse result on commit | Action | Post-condition |
|---|---|---|
| Same component name, valid | Update attrs + children; reset error flag; re-attempt live render | Node preserves identity; dirty flag set |
| Different component name, valid | Replace node with new jsxComponent of the new type | New descriptor dispatch; old node removed |
| Invalid (parse failure) | Replace node with `rawMdxFallback` | User continues editing in rawMdxFallback's nested CM (same UX, different PM node type) |
| Component re-throws on next render | ErrorBoundary catches; stays in invalid-state CM | Same UX as initial render failure |

**Example potential implementation** — adjust as architecturally best given implementation-time deep-level context (e.g., different PM transaction shapes, React state management, or CM lifecycle integration may suggest cleaner patterns):

```tsx
// packages/app/src/editor/extensions/JsxComponentView.tsx
function JsxComponentView({ node, editor, getPos, selected }: NodeViewProps) {
  const descriptor = getDescriptor(node.attrs.componentName);
  const $pos = editor.state.doc.resolve(typeof getPos === 'function' ? getPos() : 0);
  const isChildOfComponent = $pos.parent.type.name === 'jsxComponent';

  // Suppress empty panel: if descriptor has no editable (non-reactnode) props, skip PropPanel entirely
  const hasEditableProps = descriptor.props.some(
    (p) => p.type !== 'reactnode',
  );

  // Ancestor chain for breadcrumb when selected as a nested child.
  // Plain computation per CLAUDE.md React Compiler convention — no useMemo.
  const ancestorChain: Array<{ name: string; pos: number }> = isChildOfComponent
    ? (() => {
        const chain: Array<{ name: string; pos: number }> = [];
        for (let d = $pos.depth; d > 0; d--) {
          const ancestor = $pos.node(d);
          if (ancestor.type.name === 'jsxComponent') {
            chain.unshift({ name: ancestor.attrs.componentName, pos: $pos.before(d) });
          }
        }
        return chain;
      })()
    : [];

  // Local state: render-failure flag (set by ErrorBoundary callback)
  const [renderError, setRenderError] = useState<Error | null>(null);

  if (descriptor.name === '*') {
    return (
      <NodeViewWrapper className="jsx-component-wrapper jsx-component-wrapper--unregistered">
        <UnregisteredBadge name={node.attrs.componentName} />
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  // BRANCH 3: Invalid-state nested CM (Precedent #24)
  // On render failure, swap to embedded source editor — same mechanism as rawMdxFallback.
  if (renderError) {
    const source = node.attrs.sourceRaw || reconstructSource(node, descriptor);
    return (
      <NodeViewWrapper className="jsx-component-wrapper jsx-component-wrapper--invalid-state">
        <div className="jsx-component-error-badge" contentEditable={false}>
          <strong>&lt;{descriptor.name}&gt;</strong> — render error (editing source)
        </div>
        <InvalidStateCMEditor
          source={source}
          extensions={createNestedCMExtensions({ language: mdxLanguage, mode: 'nested' })}
          onCommit={(newSource) => {
            // Block-scoped parseWithFallback → update or replaceNode
            const result = parseBlockScoped(newSource);
            if (result.type === 'jsxComponent' && result.attrs.componentName === descriptor.name) {
              // Same component — update attrs + children, reset error
              editor.commands.updateAttributes(node.type.name, { ...result.attrs, sourceDirty: true });
              setRenderError(null); // re-attempt live React
            } else if (result.type === 'rawMdxFallback') {
              // Invalid parse — transition to rawMdxFallback node
              editor.commands.replaceNode(getPos(), result);
            } else {
              // Different valid component — replaceNode to new type
              editor.commands.replaceNode(getPos(), result);
            }
          }}
        />
      </NodeViewWrapper>
    );
  }

  // BRANCH 2: Healthy registered render
  const Component = descriptor.Component;
  const primitiveProps = extractPrimitiveProps(node.attrs, descriptor.props);

  return (
    <NodeViewWrapper className={`jsx-component-wrapper ${selected ? 'is-selected' : ''}`}>
      {!isChildOfComponent && (
        <button
          type="button"
          contentEditable={false}
          className="jsx-component-toolbar-button"
          onClick={() => {
            const pos = getPos();
            if (typeof pos === 'number' && editor) {
              editor.commands.setNodeSelection(pos);
            }
          }}
        >
          <ComponentToolbar componentName={descriptor.name} displayName={descriptor.displayName} />
        </button>
      )}

      {/* FR-19: ErrorBoundary catches → sets renderError → next render takes Branch 3.
       *  key-on-attrs: attr change resets the boundary, re-attempting live render.
       *  Precedent #24: no Retry button, no read-only chrome, no childrenFallback —
       *  invalid state always surfaces the embedded source editor. */}
      <ComponentErrorBoundary
        key={`${descriptor.name}::${JSON.stringify(primitiveProps)}`}
        onError={setRenderError}
      >
        <Component {...primitiveProps}>
          {/* Precedent #24: NodeViewContent ALWAYS rendered. When empty (hasChildren:false + 0 children),
           *  CSS zero-footprint styling (min-height:0, margin:0). Never display:none. */}
          <NodeViewContent className="component-children" />
        </Component>
      </ComponentErrorBoundary>

      {selected && hasEditableProps && (
        <div
          className="jsx-prop-panel-wrapper"
          contentEditable={false}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {ancestorChain.length > 0 && (
            <Breadcrumb
              segments={ancestorChain}
              onNavigate={(ancestorPos) => editor.commands.setNodeSelection(ancestorPos)}
            />
          )}
          <PropPanel
            descriptor={descriptor}
            props={primitiveProps}
            markTyping={() => markUserTyping(getYDoc(editor))}
            onChange={(propName, value) => {
              editor.commands.updateAttributes(node.type.name, {
                [propName]: value,
                sourceDirty: true,
              });
            }}
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}
```

**Hover outline** — subtle discoverability affordance for "this block is interactive" before the SideMenu renders (SideMenu has a ~200ms hover delay by default). Single CSS rule:

```css
.ProseMirror .jsx-component-wrapper:hover:not(.is-selected) {
  outline: 1px dashed var(--color-border-subtle);
  outline-offset: 2px;
}
.ProseMirror .jsx-component-wrapper.is-selected {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

Only applies to registered components. Wildcard-rendered unregistered components get their own chrome via `UnregisteredBadge` — no hover outline to avoid double-chrome clutter.

### 9.7a Fumadocs CSS Integration (FR-25)

fumadocs-ui v16.1.0 components reference the `--color-fd-*` CSS variable namespace and `fd-steps`/`fd-step` utility classes. These are NOT in our editor's compiled CSS by default. Without them, components render structurally correct but visually unstyled (transparent backgrounds, missing borders, invisible step numbers).

**Required additions to `packages/app/src/globals.css`** (~80 LoC total):

```css
/* 1. Token bridge — map fumadocs variables to our existing shadcn design tokens.
 *    No new visual design; pure aliasing. Dark mode inherits via our existing
 *    `.dark` class overrides on shadcn tokens. */
:root {
  --color-fd-background: var(--background);
  --color-fd-foreground: var(--foreground);
  --color-fd-card: var(--card);
  --color-fd-card-foreground: var(--card-foreground);
  --color-fd-muted: var(--muted);
  --color-fd-muted-foreground: var(--muted-foreground);
  --color-fd-border: var(--border);
  --color-fd-primary: var(--primary);
  --color-fd-primary-foreground: var(--primary-foreground);
  --color-fd-secondary: var(--secondary);
  --color-fd-secondary-foreground: var(--secondary-foreground);
  --color-fd-accent: var(--accent);
  --color-fd-accent-foreground: var(--accent-foreground);
  --color-fd-ring: var(--ring);
}

/* 2. Static semantic callout colors — copied verbatim from fumadocs-ui/css/default.css. */
:root {
  --color-fd-info: oklch(62.3% 0.214 259.815);
  --color-fd-warning: oklch(76.9% 0.188 70.08);
  --color-fd-error: oklch(63.7% 0.237 25.331);
  --color-fd-success: oklch(72.3% 0.219 149.579);
  --color-fd-idea: oklch(70.5% 0.209 60.849);
}

/* 3. Steps utility classes — cherry-picked from fumadocs-ui/css/preset.css:260-280. */
.fd-steps {
  counter-reset: step;
  position: relative;
  padding-left: 1.5rem;
  margin-left: 0.5rem;
  border-left: 1px solid var(--color-fd-border);
}
@media (min-width: 640px) {
  .fd-steps { margin-left: 1rem; padding-left: 1.75rem; }
}
.fd-step::before {
  background-color: var(--color-fd-secondary);
  color: var(--color-fd-secondary-foreground);
  content: counter(step);
  counter-increment: step;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 0.875rem;
  line-height: 1.25rem;
  width: 2rem;
  height: 2rem;
  position: absolute;
  left: -1rem;
  border-radius: 9999px;
}

/* 4. Animation keyframes — required for Accordion + Files (Folder) expand/collapse. */
@keyframes fd-accordion-down {
  from { height: 0; opacity: 0.5; }
  to   { height: var(--radix-accordion-content-height); }
}
@keyframes fd-accordion-up {
  from { height: var(--radix-accordion-content-height); }
  to   { height: 0; opacity: 0.5; }
}
@keyframes fd-collapsible-down {
  from { height: 0; opacity: 0; }
  to   { height: var(--radix-collapsible-content-height); }
}
@keyframes fd-collapsible-up {
  from { height: var(--radix-collapsible-content-height); }
  to   { height: 0; opacity: 0; }
}

/* 5. prose-no-margin utility — margin reset for first/last children inside wrappers. */
.prose-no-margin > :first-child { margin-top: 0; }
.prose-no-margin > :last-child  { margin-bottom: 0; }

/* 6. Tell Tailwind v4 to scan fumadocs-ui dist for utility class generation.
 *    Required for `bg-fd-card`, `text-fd-card-foreground`, `divide-y`, etc.
 *    used internally by fumadocs components. */
@source "../../../node_modules/fumadocs-ui/dist/**/*.js";
```

**Explicitly NOT imported.** Three concrete conflicts (detail: `reports/fumadocs-container-behavior/REPORT.md` §5):
- `fumadocs-ui/style.css` (3296 lines):
  1. `body { background-color: var(--color-fd-background); color: var(--color-fd-foreground) }` — overrides editor-page body styling defined in our globals.
  2. `@layer base { *, *::before, *::after { border-color: var(--color-fd-border) } }` — globally resets border-color on ALL elements, including editor buttons, inputs, PropPanel, sidebar chrome, and every shadcn primitive.
  3. Bundles `@variant dark (&:where(.dark, .dark *))` — conflicts with our existing `@custom-variant dark (&:is(.dark *))` in globals.css; mixed variant strategies produce incorrect dark-mode scoping.
- `fumadocs-ui/css/preset.css` (312 lines) — the same `@variant dark` conflict from (3) above, plus additional base-layer resets. Skipped for the same reasons.

**Scope constraints:** this CSS integration serves ONLY the 18 built-in components (D3). Custom user components (NG13) would need additional styling-isolation work — explicitly deferred per `evidence/custom-components-deferred.md` §4.

**Evidence:** `reports/fumadocs-container-behavior/REPORT.md` §5 (CSS state analysis) + `reports/fumadocs-ecosystem-component-blocks-reuse/REPORT.md` §5.1.

### 9.8 jsxInline — thin shape (no NodeView, NG14-deferred)

Per NG14, inline JSX is rendered as visible source text in WYSIWYG. The `jsxInline` PM node exists only for one technical reason: to preserve `<` and `>` characters through the markdown serializer without escape. Without a dedicated node, `mdast-util-to-markdown`'s text handler escapes `<word` patterns (CommonMark safety) — `<Icon />` would serialize as `\<Icon /\>`, breaking re-parse fidelity.

**Schema (full definition — no NodeView, no chrome, no descriptor dispatch):**

```ts
// packages/core/src/extensions/jsx-inline.ts
const jsxInline = Node.create({
  name: 'jsxInline',
  group: 'inline',
  inline: true,
  atom: false,
  content: 'text*',           // Precedent #10: per-keystroke Y.Item identity preserved
  isolating: false,           // cursor enters/exits freely (normal text feel)
  selectable: true,
  addAttributes: () => ({}),  // intentionally zero attrs
  parseHTML: () => [{ tag: 'span[data-jsx-inline]' }],
  renderHTML: () => ['span', { 'data-jsx-inline': '' }, 0],  // generic span; default contenteditable
});
```

**Parser** (replaces FR-1's inline branch):

```ts
// packages/core/src/markdown/handlers.ts
handlers.mdxJsxTextElement = (node, state, originalSource) => {
  const raw = originalSource.slice(node.position.start.offset, node.position.end.offset);
  return [{ type: 'jsxInline', content: [{ type: 'text', text: raw }] }];
};
```

The mdast children of `mdxJsxTextElement` are intentionally discarded — we slice the original source instead. This works for self-closing (`<Icon />`), paired (`<Badge>x</Badge>`), and paired-with-markdown-children (`<Badge>**x**</Badge>`) — all cases land as literal source text in PM. Round-trip fidelity guaranteed via `node.position`.

**Serializer** (replaces FR-5's inline branch):

```ts
// packages/core/src/markdown/to-markdown-handlers.ts
toMarkdownHandlers.jsxInline = (node) => ({
  type: 'html',                                      // 'html' mdast bypasses text-escape safe list
  value: node.children?.[0]?.value ?? '',            // emit raw text verbatim
});
```

The `'html'` mdast type tells `mdast-util-to-markdown` "this is raw output, don't apply text-context safety escaping." Result: `<Icon />` serializes back to `<Icon />`, identical to input.

**No NodeView component.** Default span rendering. Cursor behaves like any inline text — enters, exits, types, deletes naturally. No `contenteditable=false` boundaries to fight. The `<` and `>` characters are visible in WYSIWYG; user knows it's inline JSX because they typed it.

**γ pattern (FR-5/FR-7) does NOT apply to jsxInline.** No `sourceDirty`, no `sourceRaw` attr, no reconstruction path. The text content IS the source — always pristine-equivalent. `effectiveDirty` walk skips jsxInline entirely (no dirty descendant possible).

**Context Bridge (FR-27/FR-29) does NOT apply to jsxInline.** No bridgeId attr. Inline can't be a publisher (no compound inline components in P0). `useAncestorContexts` walks past jsxInline transparently.

**Error boundary does NOT apply to jsxInline.** No React component to crash. Malformed inline JSX (`<Icon name="`) falls through micromark's tokenizer to literal text at the mdast level — never reaches our handler as `mdxJsxTextElement`. No invalid-state CM needed for inline.

**Behavior summary:**

| Scenario | Behavior |
|---|---|
| `<Icon name="check" />` in prose | Visible source text. Editable like prose. Round-trip byte-identical. |
| `<Badge>**bold**</Badge>` paired with markdown | Literal `<Badge>**bold**</Badge>` in WYSIWYG (asterisks visible, not bolded). Production docs-site bolds correctly on render. WYSIWYG-vs-production divergence acknowledged in NG14. |
| `<Icon name="` malformed | Tokenizer falls through to text. Lands as plain PM text. No special handling. |
| Single-line `<Callout>x</Callout>` | jsxInline raw text. To get block live-render, user uses multi-line form `<Callout>\n\nx\n\n</Callout>` (becomes jsxComponent). |

**Future re-spec (NG14) extension path:** `jsxInline` schema is preserved; the re-spec adds attrs (descriptor-related), reintroduces a NodeView with chrome, and registers inline descriptors. Schema-add-only (Precedent #9) compatible — no migration needed when re-spec lands.

### 9.9 Salvage map from PR #23 rebase branch

| Source file | Target | Portability |
|---|---|---|
| `packages/core/src/registry/types.ts` | same | ✅ adapt — discriminated-union PropDef (§9.2); split `ComponentMeta` (core) + `JsxComponentDescriptor` (app, adds `Component`); add `hasChildren`, `description`, `searchTerms`, `emptyChildName`. (No `isInline` field per NG14 — registry is block-only.) |
| `packages/core/src/registry/built-ins.ts` | same | ✅ adapt — 16 fumadocs + 2 shadcn wrappers (Mermaid, Audio); add `description`, `searchTerms` (verbatim T1 curation), `emptyChildName` for containers (`Steps→'Step'`, `Tabs→'Tab'`, `Cards→'Card'`, `Files→'File'`) |
| `packages/core/scripts/build-registry.ts` | same | ✅ verbatim (see `propFilter` + `resolveDts` notes below — critical correctness) |
| `packages/app/src/editor/components/PropPanel.tsx` | same | ✅ verbatim (uses `markTyping` prop from salvage commit `d69baec`) |
| `packages/app/src/editor/components/ComponentToolbar.tsx` | same | ✅ verbatim |
| `packages/app/src/editor/components/ComponentErrorBoundary.tsx` | NEW | ✅ verbatim from pr23-rebase `JsxComponentView.tsx:23-62` (class component, React Compiler compatible) |
| `packages/app/src/editor/slash-command/component-items.ts` | same | ✅ verbatim (already on PR #51 API; lists all registered descriptors — registry is block-only per NG14; use `getDefaultProps()` fallback ladder per FR below) |
| `packages/core/src/registry/jsx-component-factory.ts` | **DELETE** | Obsolete: "factory produces two extensions with parseMarkdown hooks" assumed the pre-#83 marked+@tiptap/markdown pipeline. Our one-node design + descriptor dispatch supersedes. |
| `packages/core/src/registry/jsx-parser.ts` + `jsx-parser.test.ts` | **DELETE** | Obsolete: acorn+acorn-jsx replaced by remark-mdx's native `MdxJsxAttribute[]` parse + D5 agnostic-mode expression passthrough. Drop the acorn + acorn-jsx deps from `packages/core/package.json`. |

**Critical build-registry correctness (do NOT get wrong — single most load-bearing detail):**

```typescript
// packages/core/scripts/build-registry.ts — react-docgen-typescript config (verbatim from pr23-rebase)
const parser = withDefaultConfig({
  shouldExtractLiteralValuesFromEnum: true,   // "warning"|"error" → PropDefEnum.enumValues, NOT PropDefString
  shouldRemoveUndefinedFromOptional: true,
  skipChildrenPropWithoutDoc: false,          // LOAD-BEARING: default-true drops `children: ReactNode`
  propFilter: (prop) => {
    // Filter ONLY @types/react and node_modules/react/ — NOT blanket node_modules.
    // Blanket node_modules filter DROPS fumadocs-ui's OWN props (they live under
    // node_modules/fumadocs-ui/dist/*.d.ts). First-try implementations without this
    // produce empty prop lists for all 16 fumadocs components. Single most important line.
    if (prop.parent?.fileName.includes('@types/react')) return false;
    if (prop.parent?.fileName.includes('node_modules/react/')) return false;
    if (prop.type.name.startsWith('(')) return false;  // callback signatures — no UI control
    return true;
  },
});
```

**FR-28: Emit diagnostic warnings for known `react-docgen-typescript` extraction failures:**

```typescript
// packages/core/scripts/build-registry.ts — after extraction, before emit
function emitExtractionDiagnostic(
  componentName: string,
  sourceFile: string,
  extractedProps: PropDef[],
): void {
  if (extractedProps.length > 0) return;

  const source = fs.readFileSync(sourceFile, 'utf8');
  // Heuristic: only warn if the source declares a non-trivial Props interface.
  // Components that legitimately have no props should not trigger the warning.
  if (!/\b(interface|type)\s+\w+Props\b/.test(source)) return;

  const suspectedReasons: string[] = [];
  if (/\bforwardRef\s*</.test(source)) {
    suspectedReasons.push('forwardRef wrapper (Storybook Issue #15334 — partial extraction)');
  }
  if (/\b(Omit|Pick)\s*</.test(source)) {
    suspectedReasons.push('Omit<>/Pick<> utility types (Storybook Issue #14798 — props may be silently dropped)');
  }
  if (/<\s*T\s*[,>]/.test(source)) {
    suspectedReasons.push('generic <T> parameter (community-confirmed unresolvable without instantiation hints)');
  }

  console.warn(JSON.stringify({
    event: 'component-extraction-empty',
    component: componentName,
    sourceFile,
    suspectedReasons: suspectedReasons.length > 0 ? suspectedReasons : ['unknown'],
    suggestion:
      'Hand-author a PropDef[] override in packages/core/src/registry/built-ins.ts ' +
      'for this component. Empty auto-extraction registers an empty PropPanel, which ' +
      'is typically a misconfiguration signal rather than intentional.',
  }));
}
```

Rationale: `react-docgen-typescript` has three documented silent-failure modes (verified via Storybook Issue archives — see `reports/storybook-ecosystem-component-blocks-reuse/evidence/react-docgen-pitfalls.md`). Without the diagnostic, a user adds a component → sees empty PropPanel → has no signal why → loses hours debugging. The heuristic is conservative: only warn when source shows a declared Props interface AND extraction returned empty.

**Published-package `.d.ts` resolution — `exports` field trap:**

```typescript
// Modern packages (including fumadocs-ui) have `exports` maps that block direct
// `dist/` subpath imports. `require.resolve('fumadocs-ui/dist/components/callout.d.ts')`
// fails with ERR_PACKAGE_PATH_NOT_EXPORTED. Workaround: always resolve package.json
// (always in exports) and construct dist/ paths relative to the package dir.
function resolveDts(packageName: string, relativePath: string): string {
  const pkgDir = path.dirname(require.resolve(`${packageName}/package.json`));
  return path.join(pkgDir, relativePath);
}

// Usage in built-ins.ts:
{ name: 'Callout', sourceFile: resolveDts('fumadocs-ui', 'dist/components/callout.d.ts'), ... }
```

**Default-props fallback ladder (for slash-insert UX — users expect "insert Callout → see a Callout"):**

```typescript
// packages/app/src/editor/slash-command/component-items.ts (verbatim from pr23-rebase)
function getDefaultProps(meta: JsxComponentMeta): Record<string, unknown> {
  const defaults: Record<string, unknown> = { componentName: meta.name };
  for (const prop of meta.props) {
    if (prop.type === 'reactnode') continue;  // handled by <NodeViewContent>, not attrs
    if (prop.defaultValue !== undefined) defaults[prop.name] = prop.defaultValue;
    else if (prop.type === 'enum' && prop.enumValues.length > 0) defaults[prop.name] = prop.enumValues[0];
    else if (prop.type === 'boolean') defaults[prop.name] = false;
    else if (prop.type === 'number') defaults[prop.name] = 0;
    else defaults[prop.name] = '';
  }
  return defaults;
}
```

**Dependency sanity — what's ADDED and what's REMOVED:**

| Change | Package | Notes |
|---|---|---|
| ADD (app) | `@tiptap/extension-drag-handle-react@3.22.3` | Block UX Phase 1 SideMenu foundation |
| ADD (app) | `@tiptap/extension-drag-handle@3.22.3` | Peer dep of the above |
| ADD (core devDep) | `react-docgen-typescript` | Build-registry script only; not shipped to users |
| REMOVE (core) | `acorn`, `acorn-jsx` | Obsolete — remark-mdx supplies structured attrs; D5 handles expressions |

`getYDoc(editor)` utility (lives at `packages/app/src/editor/utils/get-ydoc.ts` per pr23-rebase commit `d69baec`): **verify existence on main post-#128; add to scope if not present.** Signature: `function getYDoc(editor: Editor): Y.Doc` — extracts Y.Doc from the Collaboration extension via `editor.extensionManager.extensions.find(e => e.name === 'collaboration')?.options?.document`.

### 9.9a Extension shape & `.extend()` discipline

Jsx extensions registered in `sharedExtensions` (§9.1) use `.extend()` for app-side additions — NOT wholesale `Node.create(...)` replacement:

- **jsxComponent** (block): widened in `packages/core/src/extensions/jsx-component.ts` (add attrs + widen `atom: false, content: 'block*'` + isolating). NodeView attached app-side via `JsxComponent.extend({ addNodeView() { return ReactNodeViewRenderer(JsxComponentView); } })`.
- **jsxInline** (inline): rewritten to thin shape per NG14 + FR-4 in `packages/core/src/extensions/jsx-inline.ts` — `atom: false, content: 'text*', isolating: false, selectable: true`, zero attrs, generic span renderHTML, **no NodeView, no app-side `.extend()` for chrome**. Greenfield directive: replaces #136's shipped jsxInline shape; no migration code needed.

Wholesale `Node.create` replacement would:
1. Drop the `isolating: true` + `priority: 60` that #136's base extension set
2. Shift the registration order in `sharedExtensions` → R10 snapshot drifts unnecessarily
3. Require us to re-register the extension as a new entry

`.extend()` preserves parent fields via TipTap's parent-chain walk — only new/overridden fields need to be specified. Load-bearing for R10 snapshot stability.

### 9.10 Block UX Phase 1 — SideMenu + "+" + empty-container placeholder

**Dependencies (verified from npm registry):**
- `@tiptap/extension-drag-handle-react@3.22.3` — React wrapper
- `@tiptap/extension-drag-handle@3.22.3` — base peer dep (NOT currently in main)

*(Note: T3 SPEC mentioned `@tiptap/extension-node-range` as an additional peer. Worldmodel §2 checked the npm registry JSON and found it's NOT a listed peer. Treated as UNVERIFIED — Q8 probe during Phase 1 integration determines if it's actually needed.)*

**NodeViewWrapper contract** (required by the drag-handle extension to recognize blocks as draggable):
- `data-drag-handle=""` attribute on the `NodeViewWrapper` element
- `draggable="true"` on the same wrapper
- `contentEditable={false}` on the handle icon/button element (NOT on the wrapper itself — that would break children editing)

**Wiring:**
```tsx
<DragHandle
  editor={editor}
  onNodeChange={({ node, editor, pos }) => {
    // Fires on hovered-block change, deduplicated by block identity
    // (not every mousemove — safe to setState on each invocation)
    setHoveredBlock({ node, pos });
  }}
>
  <GripIcon />
  <PlusButton
    onClick={() => {
      // TipTap vendor-endorsed pattern: insert paragraph + "/" → Suggestion takes over
      const posAfterBlock = hoveredBlock.pos + hoveredBlock.node.nodeSize;
      editor.chain()
        .focus()
        .insertContentAt(posAfterBlock, { type: 'paragraph' })
        .insertContent('/')
        .run();
    }}
  />
</DragHandle>
```

**`lockDragHandle()` / `unlockDragHandle()` lifecycle** — freeze SideMenu visibility while popover/slash menu is open (prevents jump-to-different-block if mouse moves during menu interaction):
- Lock on PropPanel open, context-menu open, slash menu open
- Unlock on PropPanel close, menu close

**Child badge suppression** — see §9.7. NodeView computes `isChildOfComponent` via `doc.resolve(getPos()).parent.type.name === 'jsxComponent'`; omits `ComponentToolbar` + breadcrumb-in-parent-panel compensates.

**Empty-container placeholder (FR-16a):** registered container components with `emptyChildName` set (Steps, Tabs, Cards, Files per the 18 built-ins manifest) render a clickable placeholder when they have zero child components. Clicking inserts one instance of the mapped child type with default props:

```tsx
// inside JsxComponentView, after the ComponentErrorBoundary branch:
const hasNoChildren = node.childCount === 0;
if (descriptor.hasChildren && descriptor.emptyChildName && hasNoChildren) {
  return (
    <NodeViewWrapper className="jsx-component-wrapper">
      <ComponentToolbar /* ... */ />
      <ComponentErrorBoundary componentName={descriptor.name}>
        <Component {...primitiveProps}>
          <button
            type="button"
            contentEditable={false}
            className="jsx-empty-child-placeholder"
            onClick={() => {
              const childDesc = getDescriptor(descriptor.emptyChildName!);
              const childNode = editor.schema.nodes.jsxComponent.create(
                getDefaultProps(childDesc),
                editor.schema.nodes.paragraph.create(),
              );
              editor.chain().focus()
                .insertContentAt(getPos() + 1, childNode.toJSON())
                .run();
            }}
          >
            Click to add a {descriptor.emptyChildName.toLowerCase()}
          </button>
        </Component>
      </ComponentErrorBoundary>
    </NodeViewWrapper>
  );
}
```

Context-filtering (Gutenberg-level parent→allowed-children for the general case) is out of P0 per NG4. This hardcoded `emptyChildName` per built-in covers the 4 known container patterns without introducing filter infrastructure.

### 9.11 Block UX Phase 2 — keyboard nav (L1–L4 tiered)

T3's post-challenge revision defined four tiers for Phase 2. We ship them in order and commit to L1+L2+L4 as the **MVP floor**; L3 ships in the same PR if implementation is clean, OR descopes to Explored Future Work if edge cases beyond A5 source verification surface during implementation.

**L1 — Esc selects parent component (~10 LoC, A1 verified)**

```ts
// keyboard-nav extension: handleKeyDown for 'Escape'
if (event.key === 'Escape' && editor.view.state.selection instanceof TextSelection) {
  return editor.commands.selectParentNode();
}
```

Uses ProseMirror's built-in `selectParentNode`. No custom state machine. Cheapest win for "I'm inside a component, get me out."

**L2 — Arrow Up/Down between blocks in nav mode (~30 LoC)**

When a `NodeSelection` is active (i.e., user has already pressed Esc or clicked a component), Arrow Up/Down moves selection to previous/next top-level block. Implemented via `NodeSelection.create(doc, nextBlockPos)`.

**L3 — Custom Enter command at container-exit boundary (~50 LoC, RISKY)**

When cursor is in an empty trailing paragraph of the last container child (e.g., empty paragraph inside the last `<Step>` of a `<Steps>`), Enter lifts to a new sibling block AFTER the container. Uses `tr.insert($pos.after(depth), paragraph)` bypassing the `isolating: true` barrier (A5 verified from ProseMirror source: `tr.insert()` doesn't check `isolating`; only `join`/`lift`/`deleteBarrier` do).

**L3 error-handling contract (load-bearing safety):**

```ts
handleEnter: (state, dispatch) => {
  // Gate: cursor must be in an empty paragraph that's the last child of the last container child
  if (!isEmptyTrailingParagraphOfLastChild(state)) return false;

  // Compute position; bail if invalid
  const $pos = state.selection.$from;
  const insertPos = $pos.after($pos.depth - 1); // position after the enclosing container
  if (insertPos < 0 || insertPos > state.doc.content.size) return false;

  if (dispatch) {
    const tr = state.tr
      .delete($pos.before(), $pos.after())              // remove the empty paragraph
      .insert(insertPos, state.schema.nodes.paragraph.create())
      .setSelection(TextSelection.create(state.tr.doc, insertPos + 1));
    dispatch(tr.scrollIntoView());
  }
  return true;
}
```

**Contract:** command returns `false` (standard ProseMirror convention) in ALL unexpected states (cursor not in expected position, multiple empty paragraphs present, `$pos.after(depth)` invalid, schema rejects insertion). Fallback is default ProseMirror behavior — **NO partial DOM mutation on unexpected state.** This is load-bearing: a command that manipulates positions across isolating boundaries MUST fail closed, never half-apply.

**L4 — Escape priority chain coordination (~20 LoC)**

Registered at lower priority than Suggestion/Radix portals so overlays naturally intercept Escape first:

1. Suggestion plugin active (slash menu OR wiki-link menu — unified on `@tiptap/suggestion` post-#53) → Suggestion closes the menu
2. Radix popover open (PropPanel) → Radix handler closes the popover
3. Cursor inside component children (TextSelection) → L1 `selectParentNode`
4. Component already selected (NodeSelection) → clear to TextSelection outside the component
5. Default ProseMirror behavior

**Descope path:** L1+L2+L4 delivers the "Esc/arrow nav" story fully. L3 is the "Enter exits container to sibling" polish. If L3 surfaces edge cases (deeply-nested containers with multiple trailing empty paragraphs, cross-container Enter semantics, interaction with shift-Enter hard breaks), move L3 to `Explored` Future Work with trigger "L3 edge-cases resurface during implementation." L1+L2+L4 alone is narrower-but-correct, not broken.

### 9.12 Custom component registration — DEFERRED (was here pre-2026-04-14 flip)

This section previously defined a `.open-knowledge/components.ts` config file pattern for user-registered custom components. **Flipped to NG13 by user directive 2026-04-14.** Complete design work preserved — including the example config-file pattern, prop-extraction story, hot-reload behavior, de-registration flow, persona analysis, MCP discoverability, styling isolation concerns, prior-art references, open questions, and test scenarios — in [`evidence/custom-components-deferred.md`](evidence/custom-components-deferred.md). The re-spec reads that first.

**What this spec ships instead:** the built-ins manifest at `packages/core/src/registry/built-ins.ts` (18 components per D3), with the wildcard `'*'` descriptor serving any non-built-in component names encountered in user documents (graceful degradation — UnregisteredBadge + editable children + no PropPanel).

### 9.13 Bridge always-live: Observer B flip + `findFallbackRegion` single-pass enumeration (G9)

Two surgical edits deliver the ancestor-chain locality property. Each edit is scoped to one function.

**Edit 1 — `packages/app/src/editor/observers.ts:461` (FR-22).** Replace the bare parse + swallow-specific-errors pattern with `parseWithFallback`:

```typescript
// BEFORE (current main, observers.ts:458-480 approx):
let parsedJson: JSONContent;
try {
  parsedJson = mdManager.parse(body);
} catch (err) {
  if (
    err instanceof SyntaxError ||
    err instanceof VFileMessage ||
    (err instanceof RangeError && err.message.includes('Invalid content for node'))
  ) {
    // XmlFragment keeps its last valid state and the next keystroke will re-trigger Observer B.
    return;
  }
  onSyncError?.(err);
  return;
}
applyJsonToFragment(parsedJson, fragment);

// AFTER (FR-22) — NOTE (2026-04-15 spec correction): `applyJsonToFragment` does
// not exist in the codebase. The real post-parse pattern uses
// `schema.nodeFromJSON(parsedJson)` to construct the PM node, then calls
// `updateYFragment(doc, xmlFragment, pmNode, meta)` inside a `doc.transact(fn,
// ORIGIN_TEXT_TO_TREE)` block. Replace ONLY the inner try/catch lines 459-489
// (the `try { parsedJson = mdManager.parse(body) } catch (parseErr) { ... }`
// block that filters transient SyntaxError/VFileMessage/RangeError errors and
// returns). The surrounding code (convergence guard at line 442, nodeFromJSON
// at line 494, updateYFragment at line 498, post-sync baseline refresh at
// lines 508-528, outer catch at line 529) is preserved unchanged.
const parsedJson = mdManager.parseWithFallback(body);
// ... remaining flow at observers.ts:494+ is unchanged:
//   const pmNode = schema.nodeFromJSON(parsedJson);
//   doc.transact(() => { updateYFragment(doc, xmlFragment, pmNode, meta); ... }, ORIGIN_TEXT_TO_TREE);
```

No try/catch around the parse call — `parseWithFallback` is total over the input domain. No `onSyncError` callback on parse failure (that callback was a transitional error sink for the freeze path; genuinely catastrophic errors surface as errors inside `parseWithFallback`'s metrics instrumentation). `MarkdownManager.parseWithFallback` is the existing method on the manager (already used by persistence / external-change / rollback / agent-sessions) — no new API surface. The outer catch at observers.ts:529 (which routes genuinely unexpected errors to `onSyncError`) remains.

Everything else in `observers.ts` is untouched: Observer A, `applyUserDelta` (DMP three-way merge, PR #128), typing-defer state, origin guards, the bidirectional-sync setup.

**Edit 2 — `packages/core/src/markdown/parse-with-fallback.ts:214-221` (FR-23).** Rewrite `findFallbackRegion` as a single-pass structural enumeration. Add `enumerateFallbackRegions` helper. The existing `findEnclosingPairedTag` is superseded and may be removed (its use-cases are now subsumed).

```typescript
// BEFORE (current main):
function findFallbackRegion(src: string, errorOffset: number): Region {
  const enclosing = findEnclosingPairedTag(src, errorOffset);
  if (enclosing) return enclosing;

  const blockStart = nearestBlankLineBefore(src, errorOffset) ?? 0;
  const blockEnd = nearestBlankLineAfter(src, errorOffset) ?? src.length;
  return { start: blockStart, end: blockEnd };
}

// AFTER (FR-23 — reference sketch; implementer may adjust mechanics):
interface TagEvent {
  kind: 'open' | 'close';
  name: string;
  start: number;
  end: number;
  selfClosing: boolean;
}

interface FallbackRegion {
  start: number;
  end: number;
  source: 'pair' | 'unmatched';
}

function enumerateFallbackRegions(src: string): FallbackRegion[] {
  const fences = findFencedRegions(src);
  // scanTagEvents returns <Upper> opens, </Upper> closes, and <Upper ... />
  // self-closing marker in source order. Fence-aware (tags inside ``` fences
  // are skipped). Uses existing OPEN_TAG_RE / CLOSE_TAG_RE patterns plus a
  // forward-scan to the terminating `>` for self-closing detection.
  const events = scanTagEvents(src, fences);

  const stack: TagEvent[] = [];
  const regions: FallbackRegion[] = [];

  for (const ev of events) {
    if (ev.kind === 'open') {
      if (ev.selfClosing) continue; // <Foo /> never enters the stack
      stack.push(ev);
      continue;
    }

    // Close tag — pop to matching name
    let matchIdx = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].name === ev.name) { matchIdx = i; break; }
    }
    if (matchIdx === -1) continue; // orphan close with no matching open — drop

    // Tags above the match are evicted as unmatched-opens. Their span ends at
    // the evicting close's `start`, capped by the nearest blank line so the
    // span doesn't swallow downstream paragraphs.
    for (let i = stack.length - 1; i > matchIdx; i--) {
      const open = stack[i];
      const blankCap = nearestBlankLineAfter(src, open.start) ?? src.length;
      regions.push({
        start: open.start,
        end: Math.min(ev.start, blankCap),
        source: 'unmatched',
      });
    }

    // Emit the proper pair
    regions.push({
      start: stack[matchIdx].start,
      end: ev.end,
      source: 'pair',
    });

    stack.length = matchIdx;
  }

  // Anything still on the stack at EOF is an unmatched-open bounded by blank
  // line (or EOF if no blank line remains).
  for (const open of stack) {
    const blankCap = nearestBlankLineAfter(src, open.start) ?? src.length;
    regions.push({
      start: open.start,
      end: Math.min(src.length, blankCap),
      source: 'unmatched',
    });
  }

  return regions;
}

function findFallbackRegion(src: string, errorOffset: number): Region {
  const regions = enumerateFallbackRegions(src);

  // Innermost containing region wins (smallest span).
  let best: FallbackRegion | null = null;
  for (const r of regions) {
    if (r.start <= errorOffset && errorOffset <= r.end) {
      if (!best || (r.end - r.start) < (best.end - best.start)) best = r;
    }
  }
  if (best) return { start: best.start, end: best.end };

  // No MDX structure around the error — fall back to blank-line block bounds
  // (current-main behavior, retained for position-less errors in prose).
  return {
    start: nearestBlankLineBefore(src, errorOffset) ?? 0,
    end: nearestBlankLineAfter(src, errorOffset) ?? src.length,
  };
}
```

`findFallbackRegion` does NOT take a `parse` parameter — the single-pass enumeration produces enough information without validating against the actual parser. `findEnclosingPairedTag` is no longer called and may be removed (implementer's choice; keeping it as dead code is also acceptable).

**Complexity.** `enumerateFallbackRegions` is O(n) in source length (single scan + O(1) stack work per tag event). `findFallbackRegion` is O(regions) per call, which is effectively O(n). No iteration, no re-parse inside region search, no cap.

**Self-closing detection.** `scanTagEvents` must distinguish `<Foo />` from `<Foo>`. Reference mechanics: after each OPEN_TAG_RE match, forward-scan for the terminating `>` while tracking quote state (to skip `>` inside attribute values); check whether the character immediately before `>` is `/`. Implementer may adjust — exact mechanics aren't load-bearing.

**Behavior change summary:**

| State | Pre-G9 (recursive split, current main) | Post-G9 (single-pass enumeration) |
|---|---|---|
| Broken `<Foo>...</Bar>` at top level (neither in a pair) | Top-level rawMdxFallback spanning the bad text | Top-level unmatched-open region blank-line-bounded; sibling paragraphs preserved |
| Broken inner attr inside properly-paired ancestors | Recursive split shatters ancestors into multiple rawMdxFallback chunks (State-3) | Innermost pair = broken node; only that node degrades; ancestors + siblings preserved |
| Inner child never closes; outer wrapper properly closes | Outer collapses or shatters depending on blank-line layout | Inner's unmatched-open region spans `<Inner>.start` → `<parent-close>.start`; only that child degrades; outer + other children preserved |
| Observer B live typing | WYSIWYG frozen at last valid tree until source is valid | WYSIWYG always renders current Y.Text; only block being typed in shows rawMdxFallback |
| One broken region + unrelated edit | WYSIWYG propagation blocked by the bad region (freeze) | Unrelated edit propagates; broken region stays as localized rawMdxFallback |
| Multi-region independent broken spans | `parseRecursive` handles via recursion (already worked) | Unchanged — single-pass enumeration is per-recursive-call; top-level multi-region still via outer recursion |

### 9.14 Nested Editor Architecture (FR-30..FR-35) — rawMdxFallback via embedded CodeMirror

Establishes the foundational **CM-in-PM infrastructure** (Architectural Precedent #22) that serves both `rawMdxFallback` (P0, this spec) and the future per-block source-mode toggle (NG10, deferred). The investment is proportional to the platform primitive it creates, not just the one-document-per-broken-block rawMdxFallback use case. Without this infrastructure in place now, NG10 would require re-deriving the nested-editor integration from scratch, including the same y-prosemirror + CM-dispatch contracts.

Concretely in P0: the `rawMdxFallback` NodeView embeds a CodeMirror 6 editor instance for inline editing of raw MDX source. Replaces plain PM-text-node editing with syntax-highlighted, keybinding-consistent source editing — aligned with the architectural principle that source editing uses the source editor regardless of outer container.

**Full reference implementation + design:** `reports/cm-in-pm-nested-editor-architecture/REPORT.md` (1048 lines, code-level sketches, risks, test plan). Summary below.

**Canonical pattern:** ProseMirror's official tutorial at https://prosemirror.net/examples/codemirror/. Production-proven for plain-PM; novel in combination with y-prosemirror CRDT but the individual components (direct PM dispatch, `updating` flag, `computeChange` diff, `maybeEscape` boundary handling) are all proven.

**Sync architecture (direct PM dispatch, NOT y-codemirror.next — D13 + Architectural Precedent #22 below):**

```
  ┌─────────────────────────────────────────────────────────┐
  │  TipTap / ProseMirror  (outer editor)                   │
  │                                                         │
  │  ┌───────────────────────────────────────────────────┐  │
  │  │  rawMdxFallback NodeView                          │  │
  │  │  ├─ Chrome: badge, reason tooltip, border          │  │
  │  │  └─ CodeMirror 6 EditorView                        │  │
  │  │     · markdown() language, wikiLink/mdLink deco    │  │
  │  │     · per-instance theme Compartment               │  │
  │  │     · updateListener → forwardUpdate → PM tx       │  │
  │  │     · stopEvent: () => true                        │  │
  │  │     · ignoreMutation: () => true                   │  │
  │  └───────────────────────────────────────────────────┘  │
  │                                                         │
  │  y-prosemirror sync plugin owns the Y.XmlText CRDT      │
  │  binding. CM does NOT bind to Y — it dispatches PM      │
  │  transactions, and PM propagates through y-prosemirror. │
  └─────────────────────────────────────────────────────────┘
```

**Data flow (local keystroke in nested CM):**
1. User types in CM; CM internal tx updates its doc.
2. `updateListener.of(forwardUpdate)` fires; `this.updating === false` → proceed.
3. Compute PM offset = `getPos() + 1` (skip node open token).
4. `tr.replaceWith(offset+fromA, offset+toA, schema.text(text))` for each CM change.
5. `view.dispatch(tr)` — PM applies; y-prosemirror mutates Y.XmlText with `ySyncPluginKey` origin.
6. `NodeView.update(newNode)` fires; `this.updating = true`; `computeChange(cmDoc, newNode.textContent)` returns null (already applied); `this.updating = false`.
7. Observer A (XmlFragment → Y.Text) serializes + diffs; patches Y.Text with `ORIGIN_TREE_TO_TEXT`.

**Loop prevention:** single `updating: boolean` flag. `forwardUpdate` no-ops when `updating === true`. The ProseMirror tutorial's canonical approach.

**Keybinding contract (summary — full table in the research report §6):**
- All printable chars, Backspace/Delete, Tab/Shift-Tab, Cmd/Ctrl-A/D — handled by CM.
- Cmd-Z / Cmd-Y / Cmd-Shift-Z — delegated to PM via `undo(view.state, view.dispatch)` / `redo(...)`. **Unified undo across PM and nested CM.**
- ArrowUp/Down/Left/Right at CM boundary — `maybeEscape(unit, dir)` transfers focus to outer PM.
- Outer PM keymap has an `arrowHandler` that enters a nested CM when cursor is at the edge of an adjacent block (PM tutorial pattern).

**Extension reuse from `SourceEditor.tsx`:** the nested CM reuses the existing extensions (markdown language, wiki-link + md-link decorations, agent flash) via a new factory `createNestedCMExtensions(ydoc, resolvedTheme)`. Main `SourceEditor.tsx` is refactored to call the same factory with `mode: 'source'` (includes gutter + history + full keymap); nested calls with `mode: 'nested'` (excludes gutter + history — history is PM's; excludes awareness mode management). Each nested instance creates its own `Compartment` for theme swap (module-scoped singleton would cause cross-instance conflicts).

**Lazy-init strategy:** click-to-edit for v1. The NodeView renders a static `<pre>` with `node.textContent` on mount; on click/focus, swap to CM. Graduate to IntersectionObserver if performance profiling shows the mount delay is perceptible. Cost: ~10-50 CM instances per page, each ~50-100KB state.

**Forward-compatibility:** the `createNestedCMExtensions` factory accepts an optional `language: LanguageSupport` parameter. When Component Blocks v2 expands to per-block code editing (NG10, deferred), the same infrastructure serves JSX/TSX/Python highlighting per block with descriptor-driven language selection.

**NOT y-codemirror.next.** HIGH-confidence analysis in research report §8: binding y-codemirror.next to a Y.XmlText that y-prosemirror also manages creates dual-observer conflict (two CRDT bindings with independent origin guards observing the same Y type). Uncharted territory with no production precedent. The PM-dispatch pattern is single-owner, proven, and integrates cleanly with our typed-transaction-origin architecture.

**Test coverage (from research report §10):**
- Unit: `computeChange` correctness (insert/delete/replace/identical/empty), `forwardUpdate` offset math, `update(node)` PM→CM application, `updating` flag loop prevention, `maybeEscape` boundary logic.
- Integration (bridge matrix): CM edit → Y.Text sync, remote peer edit → CM update, agent-write → CM reflects, undo/redo from CM invokes PM undo, bridge invariant holds after CM settles.
- Fidelity: `rawMdxFallback` round-trip with nested edit; I5 equivalence (mdManager vs Y.Doc path).
- Playwright E2E: click → CM mounts, type → source mode reflects, arrow escape, theme toggle, Cmd-Z in CM.
- Stress: 50-keystroke burst, multi-client concurrent edit.

**Estimated effort:** 8 phases per research report §11. No new npm dependencies (all @codemirror/* + y-prosemirror + prosemirror-* already in package.json).

### 9.15 Context Bridge Registry (FR-27, FR-29) — concrete architecture

Enables fumadocs/Radix compound components (Tabs, Accordion) to render correctly inside our WYSIWYG editor despite TipTap's portal architecture placing child NodeViews in sibling React trees rather than nesting them under parent NodeView React subtrees.

**Full research:** [`reports/context-bridge-registry-architecture/REPORT.md`](../../reports/context-bridge-registry-architecture/REPORT.md) (754 lines) + 7 evidence files totaling ~150KB. This section summarizes the contract + references the research report for detail.

#### 9.15.1 Verified problem (all HIGH confidence)

- TipTap renders each NodeView as a `ReactDOM.createPortal(reactElement, domElement, id)` — the `Portals` component flatly renders `Object.values(renderers)` as sibling React children (`node_modules/@tiptap/react/src/EditorContent.tsx:25-35`). All NodeView portals are React-tree siblings; none are React-tree descendants of other NodeViews.
- Per React 18/19 documented behavior, portals inherit context from their **React-tree parent**, not their DOM-tree parent (react.dev/reference/react-dom/createPortal). React 19's `use()` hook walks up the React tree identically to `useContext()` — no change.
- No React API (`useContext`, `use`, `createPortal`, nothing in React 19) exists for subscribing to context from an arbitrary tree location. React RFC #13332 ("Support cross-renderer portals", filed 2018 by Dan Abramov) remains unresolved.
- This is a known open TipTap bug: issues **#6427** ("React Context Not Propagating Correctly in Nested Custom Tiptap Nodes", 2025-06-07) and **#6547** ("React context don't work with nested elements in NodeViews", 2025-07-xx). Both unresponded by maintainers as of v3.22.3.
- Fumadocs `Tabs` → `Tab` uses `useTabContext()` which throws "You must wrap your component in `<Tabs>`" if null (`fumadocs-ui/dist/components/tabs.js:9-12`). Same pattern for `Accordion` → `AccordionItem` via Radix context; same for Radix Collapsible.

**Net:** without a bridge, every compound component child NodeView throws at render time → ComponentErrorBoundary catches → user sees error chrome + editable children fallback. Incompatible with D12's fidelity priority.

#### 9.15.2 Prior art confirms the pattern

Four production libraries independently converged on the same two-phase "consume in providing tree → pass through external channel → re-provide in consuming tree" solution: PixiJS React (`@pixi/react`), FluentUI (`@fluentui/react-portal-compat-context`), `@react-three/drei`'s `useContextBridge`, and `use-context-selector`'s `BridgeProvider`. Our architecture aligns with this cross-ecosystem consensus.

Editor-ecosystem comparison confirms we're first-movers in the TipTap/ProseMirror space: BlockNote inherits the same TipTap limitation (not solved). MDXEditor (Lexical-based) sidesteps via independent nested editor instances. Plate (Slate-based) has no portal isolation at all — context flows naturally. TinaCMS has no compound structure.

#### 9.15.3 Architecture contract

**Store:** an external JS Map + event-emitter, keyed by stable `bridgeId` string, holding `Array<{ context: React.Context<unknown>, value: unknown }>` entries. Implements `useSyncExternalStore`'s `subscribe` + `getSnapshot` protocol. One store per editor instance (`WeakMap<Editor, BridgeStore>` — stores are GC'd when editors are destroyed). No global state.

**`bridgeId` via PM PluginState (Q10 LOCKED → Option A — FR-29):** bridgeId is NOT a PM schema attr. An editor-scoped `bridgeIdPlugin` maintains `PluginState<WeakMap<Y.XmlElement, string>>`. On every transaction, new jsxComponent Y.XmlElements without a map entry get assigned `'b' + ++editorCounter`. Publishers/consumers read via `bridgeIdPluginKey.getState(editorState).getFor(node, getPos)`. This architecture structurally prevents Observer B re-parse churn (no schema attr to drift under `equalYTypePNode`) and preserves identity across parse cycles via y-prosemirror's Y.XmlElement preservation of unchanged content. Every jsxComponent gets a bridgeId (no "empty" state — the plugin accessor returns a string or throws on missing, never `''`). Descriptor `contextCapture` presence determines whether the node publishes contexts; bridgeId existence just makes the node addressable in the store.

**Descriptor extension:**

```typescript
interface JsxComponentMeta {
  // ... existing fields ...

  /**
   * If set, this descriptor represents a compound-component parent (e.g., Tabs,
   * Accordions) whose children require access to React Context values this parent
   * provides. At render time, the NodeView captures those contexts from the rendered
   * component's React subtree and publishes them to the bridge store. See §9.15.4.
   *
   * The function receives the PM node; it returns a capture-React-subtree description
   * (not the final ContextEntry[] — the values must be read from within the live
   * React tree of the rendered component, since Radix's `createContextScope` binds
   * contexts to scope refs that aren't available at descriptor-definition time).
   */
  contextCapture?: {
    // List of React.Context objects (or scope-resolver fns) to capture from within
    // the rendered component's React subtree.
    contexts: Array<React.Context<unknown> | ((node: PmNode) => React.Context<unknown>)>;
  };
}
```

The "capture component" pattern (per research §10 R1 mitigation): the NodeView renders the real fumadocs component, and a hidden `<ContextCapture contexts={...} onCapture={entries => usePublishContexts(...)} />` component inside that subtree uses `useContext()` to read the live Context values and publish to the store. This ensures scope-resolved Context references are captured correctly, not the abstract Context objects from the descriptor.

**Hooks:**

- `usePublishContexts(store, bridgeId, entries)` — called by the capture component. Publishes in `useLayoutEffect` (not render) to avoid mutations during aborted concurrent renders. Cleans up on unmount via returned cleanup fn.
- `useAncestorContexts(store, editor, getPos)` — called by every NodeView. Walks `$pos.node(depth)` from `$pos.depth - 1` (nearest PM ancestor) down to 0 (doc root); collects each ancestor's published entries. Appends via `push` so nearest-ancestor entries are last in the array; `ContextBridgeProvider` then wraps them as the INNERMOST React providers — matching React Context shadowing (nearest ancestor wins). Subscribes to the store via `useSyncExternalStore` so publish/unpublish events trigger re-renders.
- `<ContextBridgeProvider entries={...}>` — wraps children in `<context.Provider value={value}>` chains. Renders noop (just children) when entries is empty — auto-opt-out for non-compound contexts.

**Consumer auto-wrap:** **no descriptor opt-in required on the consumer side.** Every `JsxComponentView` unconditionally wraps its rendered component in `<ContextBridgeProvider entries={ancestorEntries}>`. When there are no ancestor publishers, the provider renders children with zero context wrappers (cost is one array read + one conditional). When there are, it re-provides each bridged context. This eliminates the consumer-opt-in footgun ("author forgot to declare context dependency"). (jsxInline excluded per NG14 — it has no NodeView and renders as plain text; no Context Bridge needed.)

#### 9.15.4 Reference implementation

**Example potential implementation** — adjust as architecturally best given implementation-time deep-level context. Full reference in research report §7 (~250 LoC for core bridge — store + hooks + provider). Key sketches below show one viable shape; the normative contract is the behavior described in §9.15.1-§9.15.3 + §9.15.7, not the specific code here.

```typescript
// packages/app/src/editor/context-bridge/store.ts (~60 LoC)
type ContextEntry = { context: React.Context<unknown>; value: unknown };

function createContextBridgeStore() {
  const entries = new Map<string, ContextEntry[]>();
  const listeners = new Set<() => void>();
  let version = 0;
  const notify = () => { version++; listeners.forEach(cb => cb()); };

  return {
    publish(bridgeId: string, e: ContextEntry[]) { entries.set(bridgeId, e); notify(); },
    unpublish(bridgeId: string) { if (entries.delete(bridgeId)) notify(); },
    get(bridgeId: string) { return entries.get(bridgeId); },
    subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); },
    getSnapshot() { return version; },
  };
}
```

```typescript
// packages/app/src/editor/context-bridge/hooks.tsx (~100 LoC)
function usePublishContexts(store, bridgeId: string | undefined, entries: ContextEntry[]) {
  useLayoutEffect(() => {
    if (!bridgeId) return;
    store.publish(bridgeId, entries);
    return () => store.unpublish(bridgeId);
  }); // no dep array — re-publishes on every committed render (entries may change)
}

function useAncestorContexts(store, editor: Editor, getPos: () => number | undefined): ContextEntry[] {
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const pos = getPos();
  if (pos === undefined) return [];
  const $pos = editor.state.doc.resolve(pos);
  const collected: ContextEntry[] = [];
  for (let depth = $pos.depth - 1; depth >= 0; depth--) {
    const ancestorNode = $pos.node(depth);
    // Q10 Option A: bridgeId from PluginState, not node.attrs
    const ancestorBridgeId = bridgeIdPluginKey.getState(editor.state).getFor(ancestorNode, $pos.before(depth));
    if (!ancestorBridgeId) continue;
    const e = store.get(ancestorBridgeId);
    if (e) collected.push(...e); // nearest-ancestor entries pushed last → innermost React providers (shadowing)
  }
  return collected;
}

function ContextBridgeProvider({ entries, children }: { entries: ContextEntry[]; children: ReactNode }) {
  let result = children;
  for (const { context, value } of entries) {
    result = <context.Provider value={value}>{result}</context.Provider>;
  }
  return <>{result}</>;
}
```

Integration in `JsxComponentView.tsx` wraps the existing `<ComponentErrorBoundary>` inside the bridge provider. Parent NodeView capture uses a child `<ContextCapture>` inside the rendered component that reads scope-resolved Contexts via `use()` and calls `usePublishContexts`.

#### 9.15.5 Compound component specs (FR-27.1..FR-27.3)

From research §8 + `evidence/fumadocs-compound-components.md`:

| Component | Contexts to bridge | Complexity | LoC estimate |
|---|---|---|---|
| **fumadocs Tabs** | 3: Radix `TabsProvider` context + fumadocs styled `TabsContext` (items, collection) + fumadocs unstyled `TabsContext` (valueToIdMap) | Medium | ~40 LoC |
| **fumadocs Accordion (root)** | 4: Radix `AccordionValueContext` + `AccordionCollapsibleContext` + `AccordionImplContext` + `CollectionContext` (for keyboard nav) | High | ~30 LoC |
| **fumadocs Accordion (item)** | 2 per-item: `AccordionItemContext` + `CollapsibleContext` — each item publishes its own | Medium | ~20 LoC |
| **fumadocs Files/Folder** | 0 — each Folder is self-contained (`useState` + Radix Collapsible, local scope) | None | 0 |
| **Radix Collapsible (standalone)** | 0 — no children cross NodeView portals | None | 0 |

For each compound, a descriptor-side `contextCapture` config + a component-side `ContextCapture` helper reads the live values and publishes them.

#### 9.15.6 Alternative architectures rejected

Full matrix in research `evidence/alternative-architectures-comparison.md`. Summary:

| Alt | Why rejected |
|---|---|
| B: Render children in-tree, bypass PM contentDOM | Breaks PM's contentDOM / CRDT model |
| C: Fork @tiptap/react | ~500+ LoC + permanent fork maintenance |
| D: Single top-level Provider from global store | Converges on Option A with worse re-render scope once per-instance keying is added |
| E: PM plugin state propagation | Inverts layers; reinvents Option A's store with extra indirection |
| F: Imperative ref-based pattern | Requires rewriting fumadocs/Radix to stop using Context — infeasible |
| G: Polling | Wrong paradigm (push vs poll); fragile |

#### 9.15.7 Risks + mitigations (top-cited)

- **R1 (HIGH) — Radix scope-resolved Context capture.** `@radix-ui/react-context`'s `createContextScope` creates scope-specific Context instances; a generic bridge that provides the abstract `BaseContext` value won't reach scope-resolved consumers. **Mitigation:** the capture component renders inside the real Radix/fumadocs component tree and uses `use()` / `useContext()` on scope-resolved Context objects from the scope prop (`__scopeTabs` etc.) — we capture what React actually provides, not the abstract Context object. Requires hands-on prototyping during implementation — acknowledged and tracked.
- **R2 (MEDIUM) — Radix Accordion Collection hook.** Collection uses both React Context and DOM queries (`querySelectorAll`, `OrderedDict + compareDocumentPosition`). Context bridging + DOM nesting preservation via `contentDOM` should handle both, but keyboard navigation between AccordionItems across NodeView portal boundaries is a real risk. **Mitigation under greenfield + fidelity priorities: bridge the Collection context too.** No degradation of keyboard nav — this is an accessibility concern and §14 WCAG 2.1 compliance is load-bearing. If Collection proves unbridgeable, that's an implementation-time discovery that triggers a follow-up decision, not a pre-accepted deferral.
- **R3 (MEDIUM) — fumadocs `useCollectionIndex` mutable-array-push-during-render.** Fumadocs pushes to a mutable `collection` array during render (`tabs.js:56`) — violates React render purity. Bridge is transparent to this (passes the same array reference), but React Compiler or Concurrent Mode may flag / break it at fumadocs's layer independently. **Mitigation:** bridge passes the exact Context value (same array ref). If fumadocs upstream fixes this pattern, our bridge continues to work unchanged.
- **R4 (LOW) — Parent unmount before child.** Brief window where children see `undefined` from store after parent unpublishes. **Mitigation:** ComponentErrorBoundary (FR-19) catches any fumadocs throw from missing context during this gap. Typical duration <1 frame. Add a 50ms grace timeout on `unpublish` if profiling shows issues.
- **R5 (LOW) — O(depth) ancestor walk.** Per-render `$pos.node(depth)` walk. **Mitigation:** typical compound nesting is 2-3 levels. `useSyncExternalStore` caches subscription → subsequent updates are O(1). Add `maxDepth: 5` cap if profiling shows issues with pathological nesting.
- **R6 (LOW) — `getPos()` undefined during init.** Guard returns empty entries; component renders once without bridged context then re-renders when parent publishes.

#### 9.15.8 Estimated effort (from research §11)

| Component | Size |
|---|---|
| `context-bridge-store.ts` (pure JS store) | ~60 LoC |
| `use-context-bridge.ts` (React hooks + Provider) | ~100 LoC |
| Integration in `JsxComponentView.tsx` (block-only per NG14) | ~60 LoC |
| `bridgeIdPlugin` PluginState + counter + accessor (Q10 Option A; NOT a schema attr) | ~40 LoC |
| Tabs `contextCapture` config + `TabsContextCapture` component | ~40 LoC |
| Accordion `contextCapture` + `AccordionContextCapture` + per-item publish | ~50 LoC |
| Collection-context bridge for Accordion keyboard nav | ~30 LoC (R2 mitigation) |
| Unit tests (store) | ~80 LoC |
| Integration tests (ancestor walk + multi-compound) | ~100 LoC |
| Playwright E2E (visual compound rendering, keyboard nav) | ~100 LoC |
| **Total** | **~670 LoC** |

The core bridge (~250 LoC) is a one-time investment. Each additional compound component type adds ~30-50 LoC for its `contextCapture` + `ContextCapture` helper.

**Phase 0 budget (prototyping, not production code):** ~1-2 days beyond the ~670 LoC above. Covers the Q9 scope-capture prototype + per-compound integration probing + fallback evaluation if the primary path fails. The LoC estimate assumes the primary scope-capture path works; if Fallback 2 (hybrid retreat) is triggered, the ~670 LoC shrinks by ~420 (no Context Bridge core + no compound configs + no Collection bridge) and grows by ~300 (pattern-copied compound components) for a net ~550 LoC.

#### 9.15.9 Open items (research §13)

The research was explicit about what it didn't cover. These need hands-on prototyping during implementation:
1. Scope-resolved Context capture for Radix (R1 above) — **highest risk, prototype first**.
2. React Compiler interaction with dynamic `<Context.Provider>` chains in `ContextBridgeProvider`.
3. Performance profiling on real fumadocs content (theoretical analysis only so far).
4. Multi-instance stress tests (two `<Tabs>` blocks in the same document).
5. Hot Module Replacement — WeakMap-per-editor pattern should survive HMR but untested.
6. Non-fumadocs compound components (future custom-component NG13 re-spec).

Items 1 and 2 are implementation-gating; items 3-6 are progressive-hardening.

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way? | Rationale | Evidence |
|---|---|---|---|---|---|---|
| D0 | Supersede PR #23 + block-editor-ux SPEC | X | **LOCKED** | YES | Audit findings H1-H4; greenfield directive | `audit-findings-rebase-vs-rewrite.md` |
| D1 | One `jsxComponent` node, widened to `atom: false, content: 'block*'`, MDXEditor descriptor pattern | T | **LOCKED** | YES | Convergent prior art for runtime-registration editors. y-prosemirror has no isAtom gate; `block*` accepts zero children cleanly; custom-component requirement rules out type-level registration | `mdx-editor-component-patterns.md`, `prosemirror-schema-evolution.md` Q1/Q2/Q5 |
| D2 | Build additively on #105; no #105 amendments required | X | **LOCKED** | NO (evolvable) | Evolvability audit confirmed all proposed amendments are R10-additive in our scope; no one-way doors; coordination cost collapses to mechanical rebase after #105 merges | One-way-door analysis; R10 add-only text |
| D3 | Built-ins P0: 18 components (16 fumadocs + Mermaid + Audio shadcn wrappers). Docskit (Video/Frame/CodeGroup) → Explored-tier Future Work with package-install trigger | P | **LOCKED** | NO | worldmodel §1 — docskit dep absent; Mermaid/Audio wrapper files absent; 16 fumadocs resolve cleanly | `evidence/worldmodel.md` §1 |
| D4 | Block-UX Phase 2 (keyboard nav) IN P0 | P | **LOCKED** | NO | Greenfield: no deferred UX debt; T3 SPEC has the design; moderate LoC | T3 §3.4 |
| D5 | Expression attrs: JSON.parse simple literals; raw-string passthrough for complex; spread attrs → sourceRaw path | T | **LOCKED** | NO | Agnostic mode eliminates acorn; probe confirms `{3}`, `{values}`, `{[1,2,3]}` round-trip identically | `serialize-roundtrip-probe.md` cases 3, 8 |
| D6 | **Hybrid γ serialization: sourceRaw for pristine, reconstruction for edited.** Applies to **jsxComponent only** per NG14/FR-4 (jsxInline has zero attrs — text content IS the source, no γ path needed). `sourceDirty` attr + origin-aware observer plugin on jsxComponent. | T | **LOCKED** (narrowed by NG14) | YES | Option α normalizes pristine (violates #105 invariant); Option β's children-edit plumbing collapses to α; γ preserves byte-identity AND handles edits correctly for block components. Probe confirms reconstruction is idempotent. Matches codebase fidelity-pattern convention (sourceDelimiter, sourceFenceChar precedent). Original "uniformly jsxComponent AND jsxInline" language updated when D8 FLIPPED to NG14. | `/assess-findings` analysis; `serialize-roundtrip-probe.md`; NG14 rationale |
| D7 | Custom flush-left `mdxJsxFlowElement` to-markdown handler prevents indentation stacking | T | **LOCKED** | NO | Probe showed library default indents children 2-space-per-depth → CommonMark 4-space ambiguity at depth 2+; flush-left matches fumadocs/Obsidian authoring convention | `serialize-roundtrip-probe.md` cases 5, 6, 7 |
| D8 | ~~Inline Layer 3 (prop panel + editable structured attrs for jsxInline) IN P0.~~ **FLIPPED to NG14** (2026-04-14 user directive reversal). Inline JSX edits as source text in WYSIWYG; no PropPanel, no descriptor dispatch, no chrome. Prior design preserved in `evidence/inline-component-editing-deferred.md`. | P | **FLIPPED → NG14** | NO (reversible) | Original rationale: inline L3 incremental cost ~140 LoC; UX fragmentation. Flip rationale: fumadocs ships zero inline MDX components; 18-component manifest is entirely block-level; inline chrome cost (NodeView + PropPanel + bridge) unjustified without concrete demand. Thin jsxInline preserves round-trip fidelity + schema extensibility for re-spec. | User directive 2026-04-14 ("can inline jsx elements just be editable as normal inline text?") |
| D9 | ~~Custom component registration via `.open-knowledge/components.ts` explicit config file.~~ **FLIPPED to NG13** (2026-04-14 user directive reversal). Prior rationale preserved for the re-spec. | P | **FLIPPED → NG13** | NO (reversible) | Original lock rationale: explicit registration minimal ceremony; file-system scanning deferred. Flip rationale: user directive "supporting a customer's custom components is a later out of scope issue." Full prior analysis in `evidence/custom-components-deferred.md`. | User directive 2026-04-14 (post-Storybook+fumadocs-ecosystem research) |
| D10 | ~~Custom components (user-registered via config) are IN scope.~~ **FLIPPED to NG13** (2026-04-14 user directive reversal). Fidelity with production render of built-ins becomes the top priority; custom components + styling isolation deferred to follow-up spec. | P | **FLIPPED → NG13** | NO (reversible) | Original rationale: user-stated requirement; one-node architecture makes it zero-migration. Flip rationale: priority shift to rendering fidelity for the 18-component built-ins set. Styling isolation concerns for user components are non-trivial and deserve a dedicated spec. Prior analysis preserved in `evidence/custom-components-deferred.md`. | User directive 2026-04-14 |
| D12 | Fidelity priority: use fumadocs-ui components directly (no editor-local rewrites). Solve NodeView-portal-context-mismatch via Context Bridge Registry infrastructure rather than rewriting containers. | X | **LOCKED** | YES | (1) User directive: "fidelity with their rendering components is top priority. we want wyswig to feel as real as possible." (2) Tier 3 rewrite strategy (from fumadocs-ecosystem research §4) would diverge editor render from production render — violates fidelity. (3) Context Bridge Registry is the canonical pattern for cross-portal context propagation; architecturally-correct under "two staff engineers" test. Details pending `reports/context-bridge-registry-architecture/` research. | User directive 2026-04-14; React Portal context-inheritance rules (react.dev); fumadocs Tabs/Accordion source analysis confirming compound context dependency |
| D13 | CM-in-PM nested editor for `rawMdxFallback` is P0 (not Future Work). Direct PM transaction dispatch, NOT y-codemirror.next binding. | X | **LOCKED** | YES | (1) `reports/cm-in-pm-nested-editor-architecture/` research recommends with HIGH confidence: direct PM dispatch avoids dual-observer conflicts uncharted in y-codemirror.next+y-prosemirror simultaneous binding. (2) Architectural consistency: source editing uses source editor, everywhere; matches the tool to the content representation. (3) Greenfield principle: no deferred tech debt; architecture is correct and ready; implement now. (4) Strong reuse from `SourceEditor.tsx` via `createNestedCMExtensions` factory; ~350 LoC + tests. (5) User concurrence during conversation: "sounds good, lets go ahead and apply." | User directive 2026-04-14; ProseMirror CodeMirror tutorial (canonical pattern); `reports/cm-in-pm-nested-editor-architecture/REPORT.md` §1, §8 |
| D11 | Bridge always-live (G9): Observer B flips to `parseWithFallback`; `findFallbackRegion` rewritten as single-pass structural enumeration (stack-based enumeration of pairs + unmatched-opens; smallest region containing error offset wins). No document-level freeze; rawMdxFallback is localized to the tightest structural region around the broken node. | X | **LOCKED** | YES | (1) Observer B is the sole `mdManager.parse` caller that freezes on failure — every other caller (persistence, external-change, rollback, agent-sessions) already uses `parseWithFallback`. (2) Pre-existing broken regions anywhere in the doc hold the entire WYSIWYG preview hostage until fixed under freeze — incompatible with brownfield authoring and "author preservation where reasonable in either mode." (3) Current recursive split-and-rejoin shatters outer ancestors when an inner attr breaks; single-pass enumeration fixes this for every `parseWithFallback` caller. (4) Evidence audit on prior widen-iterative draft uncovered a concrete algorithmic bug (`findEnclosingPairedTag` doesn't track still-open-at-offset state, so widen-offset calls returned closed-sibling regions); single-pass enumeration with explicit pair + unmatched-open tracking sidesteps the entire bug class. (5) User-stated principle: "in view or editing, one broken node shouldn't affect nodes/elements not in its ancestor chain." (6) Two simpler alternatives rejected with evidence: (a) per-block (blank-line-separated) parsing would split multi-line JSX containers (Accordions, Tabs, Steps) across blocks because their open and close tags span multiple blank-line blocks, producing multiple rawMdxFallback chunks per container — strictly worse than single-pass enumeration; (b) deferring FR-22 to a separate PR would ship Component Blocks v2 with an immediately-worse authoring UX (widening jsxComponent from atom to `block*` creates more parse-fail surface area during partial typing, making freeze more user-visible than pre-spec). (7) Flicker-concern mitigation: Observer B's existing early-exit at `observers.ts:442` (`currentBody === body`) skips `parseWithFallback` entirely when XmlFragment already represents the same markdown as Y.Text — further bounding the flicker surface to actual content deltas, not every Y.Text transaction. | User directive 2026-04-14; `observers.ts:461` + `observers.ts:442` source inspection; `parse-with-fallback.ts:214` algorithm trace; `y-prosemirror/src/plugins/sync-plugin.js:993-1007` equalYTypePNode deep-compare verified; evidence walk-through of State 1/2/3 nested scenarios; widen-iterative algorithm bug surfaced during user-requested evidence audit and rejected in favor of single-pass enumeration; safe-coarsening boundary for unclosed-quote case empirically verified against micromark-extension-mdx agnostic mode |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan | Status |
|---|---|---|---|---|---|---|
| Q1 | Flush-left handler corner cases: deeply-nested JSX, mixed paragraph/heading/list children, preserved blank-line semantics | T | P0 | No | 15+ fixture matrix during implementation; add to fidelity suite. STOP_IF: flush-left produces serialization that fails I1-I11 invariants for the built-in components. | DELEGATED (implementation-time fixture matrix) |
| Q2 | `@tiptap/extension-drag-handle-react` × CollaborationCursor widget-decoration interaction | T | P0 | Yes (Phase 1) | Integration probe in sandbox before UI implementation. STOP_IF in §17 — if probe surfaces conflict, escalate before proceeding with Block UX Phase 1. | DELEGATED (Phase 1 integration probe) |
| Q3 | Source-dirty observer origin-guard completeness: enumerated origins are `ORIGIN_TEXT_TO_TREE` (`'sync-from-text'`, observers.ts:51), `ORIGIN_TREE_TO_TEXT` (`'sync-from-tree'`, observers.ts:52), `'agent-write'` (string literal, used server-side + tests), `'rollback-apply'` (PR #39 addition). | T | P0 | No | No V0-14 spec exists in `specs/` tree (verified at finalize). Enumeration confirmed complete. M8 origin-guard matrix test covers the 4 enumerated origins. | **RESOLVED — CLOSED** |
| Q4 | Inline PropPanel trigger UX: click vs Ctrl+click vs double-click — which feels most native given "click selects text" default? | P | P0 | No (Phase 1) | UX probe during implementation — default to click-to-open-popover; iterate if friction surfaces. Status: DELEGATED to implementation — not blocking on architecture. | DELEGATED (implementation-time) |
| Q5 | Inline slash menu insertion (`/icon` → insert `<Icon />` inline): in scope for P0 or source-mode-only? | P | P0 | No | **LOCKED: source-mode-only for P0.** Inline slash requires disambiguation from block slash (different trigger context — block-level `/` at start of line vs mid-prose `/` must be contextually routed). UX complexity > authoring gain for P0. Inline components are still insertable via source mode typing `<Icon name="..." />`. Revisit if authoring telemetry shows inline-slash as common operation. | LOCKED → source-mode-only |
| Q6 | Wildcard descriptor's `hasChildren: true` default vs false — when user has unknown paired component, editable or not? | P | P0 | No | **LOCKED: `hasChildren: true` default.** Consistent with "bring your own markdown" principle — if a user has `<CustomThing>some content</CustomThing>` in their doc, they should be able to edit the "some content" via `<NodeViewContent />`. Self-closing unknown components (`<CustomThing />`) route via the sibling `hasChildren: false` path based on source tokenization (mdxJsxFlowElement vs mdxJsxTextElement self-closing marker). | LOCKED → hasChildren default true |
| Q7 | Radix Popover anchoring inside NodeView — does portal placement conflict with ProseMirror contentDOM management? | T | P0 | No (Phase 1) | Probe during Phase 1 Q2 window; fallback is `@floating-ui/react` (already transitively present via drag-handle-react). Not a blocker — fallback path is clear. | DELEGATED (Phase 1 integration probe) |
| Q8 | `@tiptap/extension-node-range` peer dep verification — T3 SPEC claimed it's required; npm registry JSON for drag-handle-react@3.22.3 does NOT list it. Is it a transitive runtime need or stale doc? | T | P0 | No (Phase 1) | Install drag-handle-react + drag-handle only; integration-probe to confirm no runtime error; add node-range if probe reveals it's needed. Conditional path; not blocking. | DELEGATED (Phase 1 integration probe) |
| Q9 | FR-27 R1 — Radix `createContextScope` scope-resolved Context capture via `ContextCapture` helper. Does the helper rendered inside the real Radix component subtree correctly read scope-resolved Context references via `use()` / `useContext()`? | T | P0 | **YES (Phase 0, implementation-gating)** | **Phase 0 of implementation (see §13 Next actions step 1).** Build minimal `<Tabs>` + 2 `<Tab>` prototype; verify `ContextCapture` publishes the right Context identity and descendants consume correctly. **Fallback cascade** (pre-evaluated so Phase 0 failure is a routing decision, not a design restart): (1) **Primary:** scope-resolved capture via `use()` inside `ContextCapture`. (2) **Fallback 1:** scope-prop forwarding through the bridge store — forward `__scopeTabs`/`__scopeAccordion` through `ContextEntry` and let the child re-provide using the same scope object (§15 R1 mitigation). (3) **Fallback 2 (retreat path):** hybrid architecture — keep the 12-14 leaf components as direct fumadocs-ui imports (Callout/Card/Steps/etc. — zero compound-context dependency, 100% fidelity, no bridge needed); pattern-copy the 4-6 compound components (Tabs/Tab, Accordion/AccordionItem, possibly Files/Folder) into editor-owned code (~300 LoC per ecosystem research §4); eliminate the Context Bridge for compounds entirely. Retreat is scoped to compounds; leaf fidelity remains 100%. Budgeted at ~2 days of implementation; does NOT require a new spec cycle because the container-behavior + ecosystem research already validated the pattern-copy approach. STOP_IF: all three options fail — escalate before committing further. | DELEGATED → Phase 0 implementation-gating prototype |
| Q10 | **bridgeId storage — PM schema attr vs ProseMirror PluginState.** Cold analysis determined that declaring `bridgeId` as a PM schema attr causes Observer B re-parse churn: parse output produces PM nodes with `bridgeId=''` (default) while existing XmlFragment nodes have `bridgeId="3"` → `updateYFragment`'s `equalYTypePNode` deep-attr comparison sees drift → every jsxComponent is delete+reinserted → every bridgeId churns → every consumer resubscribes. Directly breaks CB23 acceptance. **LOCKED to Option A** (2026-04-14 user directive "agree with your option a for q10"). | T | P0 | **LOCKED — Option A** | **Design:** bridgeId lives in a ProseMirror `PluginState` (not in `node.attrs`), keyed by a stable identity — Y.XmlElement reference or equivalent per y-prosemirror binding. Publishers and consumers read bridgeId via `bridgeIdPluginKey.getState(editorState).getFor(node)` or equivalent accessor, NOT via `node.attrs.bridgeId`. Observer B re-parse does not affect PluginState; bridgeId is stable across parse cycles for any jsxComponent whose Y.XmlElement identity is preserved. **Consequences** (cascaded through spec):  (a) jsxComponent schema does NOT carry a `bridgeId` attr; (b) the bridge-id-plugin is now a PluginState manager, not a schema-attr assigner via `appendTransaction`; (c) CB23 acceptance is structurally guaranteed rather than contingent on `equalYTypePNode` behavior; (d) §9.15 reference code reads bridgeId via plugin accessor. **Phase 0 validation** (not gating, but worth verifying): mount editor, insert Tabs, type in source mode to trigger Observer B, assert bridgeId stable via plugin accessor. **STOP_IF:** PluginState approach reveals fundamental incompatibility with y-prosemirror's state model (e.g., Y.XmlElement refs not exposed) — escalate before implementing Option B (y-prosemirror patch) or Option C (parse-handler state-carry). | **LOCKED → Option A (2026-04-14 user directive)** |

## 12) Assumptions

| ID | Assumption | Confidence | Verification | Status |
|---|---|---|---|---|
| A1 | `MdxJsxAttribute.value` directly readable for literals + boolean shorthand; expressions raw-string | HIGH | worldmodel §3 | ✅ CONFIRMED |
| A2 | `mdxJsxFlowElement.children` standard mdast, reuses existing walker | HIGH | worldmodel §4 | ✅ CONFIRMED |
| A3 | `@tiptap/extension-drag-handle-react@3.22.3` MIT-licensed, TipTap-aligned, 2 packages required | HIGH | worldmodel §2 | ⚠️ Runtime CollaborationCursor probe still pending (Q2) |
| A4 | PR #105's primitives ship as specified | — | #136 merged 2026-04-14 22:29 UTC | ✅ SHIPPED |
| A5 | ~~jsxInline's structured attrs safe to mutate once `sourceDirty: true` is set.~~ **OBSOLETE per NG14** — jsxInline has zero attrs in P0 per FR-4. The thin shape uses `content: 'text*'` for Precedent #10 Y.Item identity preservation on per-keystroke text mutation. | — | Superseded | N/A (obsolete) |
| A6 | Atom→non-atom widening safe in y-prosemirror | HIGH | `prosemirror-schema-evolution.md` Q1/Q2 | ✅ CONFIRMED |
| A7 | `mdxJsxFlowElement` reconstruction serializes idempotently | HIGH | `serialize-roundtrip-probe.md` (10/10 idempotent) | ✅ CONFIRMED |
| A8 | Source-dirty observer can distinguish user-intent transactions from sync/agent/rollback origins without false positives | MEDIUM | Origin constants shipped: `ORIGIN_TREE_TO_TEXT`, `ORIGIN_TEXT_TO_TREE` (observers.ts:51-52); `'agent-write'` in observers.test.ts; `'rollback-apply'` per #39 | Enumeration confirmed; matrix test pending (M8 + Q3) |
| A9 | Observer A's new DMP three-way merge (`applyUserDelta` post-#128) remains correct when jsxComponent contains non-empty children fragment | MEDIUM-HIGH | #128 preserves CRDT Items via Item-preservation gate; handles nested content correctly. Integration probe during Phase 2 | PENDING PROBE |
| A10 | R10 snapshot-test allows widening jsxComponent from atom to `content: 'block*'` | HIGH | Shipped test at `schema-invariant.test.ts:118-130` has explicit exception: `if (expected.content !== '')` — widening from `''` (atom) to `'block*'` PASSES the strict-equality check. Snapshot regeneration handles atom-field and attr additions. | ✅ CONFIRMED via shipped test code |
| A11 | Our source-dirty observer does NOT conflict with #128's Observer A Item-preservation gate | MEDIUM | Our plugin runs on `appendTransaction` AFTER Observer A's write; reads `transaction.getMeta('origin')` to decide dirty-marking — doesn't mutate Items directly | PENDING INTEGRATION TEST |
| A12 | `.mdx` files on disk (post-#126) route through the same MarkdownManager pipeline as `.md`; file-watcher, content-filter, backlink-index, persistence, rescue API, and MCP tools all handle both extensions uniformly | HIGH | `packages/server/src/doc-extensions.ts` (`SUPPORTED_DOC_EXTENSIONS = ['.mdx', '.md']`, `isSupportedDocFile`, `stripDocExtension`); regression tests at `packages/app/tests/integration/mdx-extension.test.ts` (end-to-end watcher→CRDT) + `packages/server/src/api-create-page.test.ts:116` (`.mdx` creation via API) | ✅ CONFIRMED via shipped code + integration tests |

## 13) In Scope (implement now)

**File-level scope:**
- `packages/core/src/extensions/jsx-component.ts` — widen schema; add attrs
- `packages/core/src/extensions/jsx-inline.ts` — **override** #105's extension to add `sourceDirty` attr + custom NodeView
- `packages/core/src/registry/` — types.ts, built-ins.ts, index.ts
- `packages/core/src/generated/components.ts` — generated manifest
- `packages/core/scripts/build-registry.ts` — react-docgen-typescript extraction for the committed built-ins manifest only (user-config scanning is out of P0 scope per NG13)
- `packages/core/src/markdown/index.ts` — new parse handlers (FR-1, FR-2); new serialize handlers (FR-5)
- `packages/core/src/markdown/to-markdown-handlers.ts` — flush-left `mdxJsxFlowElement` handler (FR-6)
- `packages/app/src/editor/extensions/jsx-component.ts` — NodeView attachment (block)
- `packages/app/src/editor/extensions/jsx-inline.ts` — NodeView attachment (inline)
- `packages/app/src/editor/extensions/source-dirty-observer.ts` — origin-aware dirty-tracking plugin (FR-7)
- `packages/app/src/editor/extensions/bridge-id-plugin.ts` — editor-scoped ProseMirror plugin managing `PluginState<WeakMap<Y.XmlElement, string>>` (Q10 Option A). Assigns unique bridgeIds to `jsxComponent` nodes as their Y.XmlElements first appear; publishers/consumers read via `bridgeIdPluginKey.getState(editorState).getFor(node, getPos)`. Not a schema attr — no PM schema change. (FR-29)
- `packages/app/src/editor/context-bridge/store.ts` — pure JS bridge store (Map + event emitter); `WeakMap<Editor, BridgeStore>` lookup helper (FR-27, §9.15)
- `packages/app/src/editor/context-bridge/hooks.tsx` — `usePublishContexts`, `useAncestorContexts`, `ContextBridgeProvider`, `ContextCapture` helper (FR-27, §9.15)
- `packages/app/src/editor/extensions/RawMdxFallbackCMView.ts` — nested CodeMirror NodeView for rawMdxFallback (FR-30..FR-35, §9.14)
- `packages/app/src/editor/extensions/nested-cm-extensions.ts` — `createNestedCMExtensions(ydoc, theme)` factory; refactor main `SourceEditor.tsx` to reuse with `mode: 'source'` / `mode: 'nested'` (FR-33, §9.14)
- `packages/app/src/editor/extensions/arrow-handler.ts` — outer PM keymap for arrow-key entry into nested CodeMirror (§9.14)
- `packages/app/src/editor/observers.ts` — **scoped surgical edit only.** Flip Observer B's bare `mdManager.parse(body)` at line 461 to `mdManager.parseWithFallback(body)`; delete the now-unreachable try/catch that swallowed `SyntaxError | VFileMessage | RangeError` (FR-22, G9). No change to Observer A, `applyUserDelta`, typing-defer logic, or origin-guard truth table. Bridge invariants (bridge / baseline / item-preservation) remain load-bearing and are preserved — we're narrowing `observers.ts` from EXCLUDE to "edit-one-call-site only" with the boundary made explicit here.
- `packages/core/src/markdown/parse-with-fallback.ts` — **scoped surgical edit only.** Rewrite `findFallbackRegion` (line 214) as a single-pass structural enumeration (FR-23). Add `enumerateFallbackRegions(src)` helper that builds the pair + unmatched-open region list via stack-based scan. `findFallbackRegion` becomes "smallest region containing the error offset" with a blank-line-bounds fallback when no region contains the offset. `findEnclosingPairedTag` may be removed (superseded) or retained as dead code. No change to per-block fallback, metrics, ref-def hoist integration, fence awareness, or position-extraction. The file stays owned by the mdx-tolerant-parsing system; we improve one function + add one helper in-place.
- `packages/app/src/editor/components/{PropPanel,ComponentToolbar,componentMap,JsxComponentView,UnregisteredBadge}.tsx` (block-only per NG14 — inline has no NodeView chrome, no PropPanel, no BadgeChip)
- `packages/app/src/editor/slash-command/component-items.ts` — block slash integration
- `packages/app/src/editor/block-ux/{SideMenu,PlusButton,KeyboardNav,EscapePriorityChain}.tsx` — Block UX Phase 1+2
- `packages/app/src/editor/TiptapEditor.tsx` — register source-dirty observer + extensions
- `packages/app/src/server/hocuspocus-plugin.ts` — register source-dirty observer (server-side, covers agent-write scenarios in future)
- `packages/app/src/globals.css` — CSS variable bridge for fumadocs-ui (~80 LoC: token mapping + semantic colors + `fd-steps` utilities + accordion/collapsible keyframes + `@source` directive for Tailwind) (FR-25, §9.7a)
- `packages/server/src/agent-sessions.ts` — schema-parity touch only (ensure server-side schema matches client). Per Q10 Option A, bridgeId is NOT a schema attr, so schema parity is unaffected by the Context Bridge work — jsxComponent attrs are the same on server and client, with bridgeId managed client-side-only via PluginState.

**Test infrastructure (new test files + turbo tasks):**

- `packages/app/tests/fidelity/jsx-pristine-byte-identity.test.ts` — I12 invariant (18 built-ins byte-identity)
- `packages/app/tests/fidelity/jsx-edited-idempotence.test.ts` — I13 invariant (NG12 convergence PBT)
- `packages/app/tests/fidelity/rawmdx-fallback-byte-identity.test.ts` — I14 invariant (20 malformed fixtures)
- `packages/app/tests/fidelity/jsx-cross-path-consistency.test.ts` — I15 invariant (Observer B vs mdManager parity)
- `packages/app/tests/fidelity/jsx-nested-dirty.test.ts` — I16 invariant / M17 (effectiveDirty PBT)
- `packages/app/tests/fidelity/jsx-expression-attrs.test.ts` — EX01-EX06
- `packages/app/src/editor/context-bridge/store.test.ts` — CB02, CB17, CB18, CB21, CB22 (unit)
- `packages/app/src/editor/source-dirty-observer.test.ts` — DT01-DT12 (origin-guard + nested-dirty + integration)
- `packages/core/src/markdown/parse-with-fallback.test.ts` — SC01-SC10 (augments existing file)
- `packages/app/src/editor/extensions/RawMdxFallbackCMView.test.ts` — NCM01-NCM06 (sync math + boundary)
- `packages/app/tests/stress/ux-interactions.e2e.ts` — NCM07-NCM13, CB03-CB16, CB19, A11Y01-09 (augments existing file)
- `packages/app/tests/integration/bridge-matrix.test.ts` — CB23, CB24, DT05, DT11-12, PS01-PS05, AG01-AG07, SH01-SH05, MR09-MR13 (augments existing file)
- `packages/app/tests/visual/component-parity.e2e.ts` + `__snapshots__/` — VR01-VR18 (new; requires docs-site dev server in CI webServer config)
- `packages/app/tests/stress/component-blocks.perf.ts` — PF01-PF06 (new)
- `packages/app/tests/a11y/component-blocks.e2e.ts` — A11Y01-A11Y10 (new; axe-core integration)

**Gate wiring:**

- `bun run check` (canonical gate) — includes `test:fidelity` (I1-I17 + NG12), all unit tests (store/observer/parse-with-fallback), and bridge-matrix integration tests. **Does NOT include** visual regression, performance benchmarks, or a11y suites (these are too slow for warm-replay <30s gate).
- `bun run check:full:parallel` — includes the above PLUS visual regression + perf + a11y suites. Target < 5min warm.
- **New turbo tasks:** `test:visual`, `test:perf`, `test:a11y` — each with independent cache keys so editing one test tier doesn't re-run others. `test:visual` has a `webServer` dependency (docs-site dev server must be up).
- **CI matrix adjustment:** visual regression baselines (`__snapshots__/`) require dedicated golden-file-update PRs; `bun run test:visual:update` regenerates baselines (gated behind explicit user action, never runs in CI).

**Next actions (ordered):**
1. **Phase 0 — Prototype Context Bridge scope capture (FR-27 R1).** Build minimal prototype: `<Tabs>` PM node + 2 `<Tab>` children; verify `ContextCapture` helper correctly reads scope-resolved Radix Context references via `use()`. **Implementation-gating — do not proceed to Phase 2 without confirming this pattern works.** If Phase 0 fails, apply the pre-evaluated fallback cascade from Q9 (scope-prop forwarding → hybrid retreat to direct-import-leaves + pattern-copy-compounds). Phase 0 budget: ~1-2 days of prototyping work beyond the §9.15.8 LoC estimate. The LoC estimate is production-code only; prototyping is investigation, not production delivery.
2. Install `@tiptap/extension-drag-handle-react@3.22.3` + `@tiptap/extension-drag-handle@3.22.3` (peer); run Q2 integration probe against #128's updated observers.ts
3. Salvage commit from `../pr23-rebase/`: registry files + PropPanel + ComponentToolbar + component-items
4. Add CSS variable bridge to globals.css (FR-25); verify fumadocs components render styled in the editor
5. Implement γ pattern: schema widening + `bridgeId` attr + source-dirty observer + hybrid serialize; regenerate schema-snapshot.json
6. Implement bridgeId assignment plugin + Context Bridge store + hooks + ContextCapture helper
7. Implement NodeView (block-only per NG14; jsxInline is thin shape with no NodeView) + PropPanel (block) with Precedent #24 unified invalid-state CM (ComponentErrorBoundary + InvalidStateCMEditor per §9.7 Branch 3)
8. Implement Tabs `contextCapture` config + TabsContextCapture component
9. Implement Accordion `contextCapture` (root + per-item) + Collection bridge (R2 mitigation)
10. Implement Block UX Phase 1 (SideMenu) + Phase 2 (keyboard nav)
11. Implement FR-30..FR-35 nested CodeMirror in rawMdxFallback + refactor SourceEditor.tsx to share extension factory
12. Test suite (full): M1-M21; CB01-CB25; NCM01-NCM13; SC01-SC10; DT01-DT12 + DT-nested-01..05; CH01-CH07; EX01-EX06; SH01-SH05; PS01-PS05; AG01-AG07; NB01-NB11; TP01-TP06; IN01-IN08; MR01-MR13; VR01-VR18; PF01-PF03 + PF05-PF06 (PF04 [NOT NOW]); A11Y01-A11Y10; HH/BS/PI/KN/FP/EB/ES/HO/PD/DD series; fidelity invariants I12-I17 alongside I1-I11; Q1 fixture matrix for flush-left handler.
13. Stand up visual regression baselines (VR01-VR18); docs-site dev server integration in Playwright `webServer` config. Initial baseline-capture PR — review by maintainer before merging.
14. Stand up a11y suite (axe-core integration). Add `packages/app/tests/a11y/component-blocks.e2e.ts`.
15. Stand up perf suite (PF01-PF06); establish main-branch baselines for regression detection.

**Owner/DRI:** Nick Gomez.

## 14) Accessibility (WCAG 2.1)

Surface-by-surface A11y requirements. Ported + extended from T3 §14. Aligned with WCAG 2.1.2 (no keyboard trap), 2.4.3 (focus order), 4.1.2 (name, role, value), and 4.1.3 (status messages).

### Block NodeView + ComponentToolbar

- ComponentToolbar button has `aria-label="${displayName || componentName} component — click to edit properties"`; role=button; focusable via Tab
- Breadcrumb segments (FR-13b) are `<button>` elements with `aria-label="Go to ${ancestorName}"`; Tab-navigable left-to-right
- NodeSelection is announced via `aria-live="polite"` region: "${componentName} selected"
- Delete key / Backspace on NodeSelection announces: "${componentName} deleted"

### PropPanel (block, floating)

- Radix Popover provides `role="dialog"` + `aria-labelledby={componentName-header-id}` automatically
- Panel header: `<h2 id={componentName-header-id}>${displayName} properties</h2>`
- First control auto-focused on open; Esc returns focus to the ComponentToolbar button (source of the open)
- Tab cycles through controls; Shift+Tab reverse; Tab past last control wraps to first (focus trap inside panel — consistent with WCAG 2.4.3 within a modal-adjacent surface)
- Controls: standard semantics (text input, toggle switch with `aria-checked`, select with `aria-expanded`, numeric input with `inputmode="numeric"`)

### InlinePropPanel (popover)

Deferred per NG14 — inline JSX has no PropPanel in P0. See `evidence/inline-component-editing-deferred.md` §5 for the preserved accessibility design.

### SideMenu (drag handle + "+")

- Grip icon: `role="button"` + `aria-label="Drag handle for block"`
- "+" button: `aria-label="Insert block below"`
- Both focusable; Tab reaches them when the hovered block is NodeSelected
- Context menu (delete/duplicate/move) uses Radix Dropdown with standard arrow-key navigation

### UnregisteredBadge (block-only)

- Block: `<div aria-label="Unregistered component: ${name}">` + badge text; focusable via Tab
- Inline has no chrome per NG14 — inline JSX is visible source text, accessible as any prose text.

### Keyboard navigation mode (FR-18)

- NodeSelection is the a11y analog of `focus` for block-level selection; screen readers announce via live region
- Arrow Up/Down in nav mode announces each block transition: "${blockType}: ${shortDescription}"
- Enter→edit mode announces: "Editing ${componentName}"

### Tab key decision matrix

| Context | Tab behavior | Rationale |
|---|---|---|
| TextSelection inside prose | Default ProseMirror: insert 2 spaces (or do nothing per config) | Prose editing convention |
| TextSelection inside component children | Default (same as prose) | Children are just prose |
| NodeSelection on block component | Move focus to ComponentToolbar button → Tab cycles: Toolbar → SideMenu grip → "+" button | Let keyboard users reach interactive surfaces |
| Focus inside PropPanel | Cycle within panel controls (trap) | WCAG 2.4.3 focus order inside modal-adjacent dialog |
| Focus inside SideMenu context menu | Radix Dropdown arrow-key nav | Radix convention |

### Reduced-motion

- Hover outline transitions (FR-20) respect `prefers-reduced-motion: reduce` → instant state change, no fade
- SideMenu fade-in respects reduced-motion → instant appearance on hover

---

## 15) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `@tiptap/extension-drag-handle-react` × CollaborationCursor collision | LOW-MED | Phase 1 blocker | Q2 integration probe before committing UX work |
| Source-dirty observer false-positives (marks pristine as dirty) | MEDIUM | Breaks byte-identity guarantee | Q3 origin-guard matrix test — origins now fully enumerated from shipped code; fail-closed: if in doubt, DON'T mark dirty (safe degradation) |
| Source-dirty observer false-negatives (misses a user edit) | LOW-MED | Serialization emits stale sourceRaw on save | M8 test captures concurrent-edit scenarios; augment with property-based tests |
| Custom flush-left handler corner cases (deeply nested JSX, mixed block content) | MEDIUM | Serialization quality | Q1 fixture matrix: 15+ cases covering nesting, mixed content, self-closing; add to fidelity suite |
| NG12 quoting normalization surprises external (git-diff) users | LOW | Cosmetic diff | Documented in CLAUDE.md fidelity contract; matches NG1/NG2/NG5 pattern; only fires on edit |
| R10 snapshot test implementation blocks our widening | — | — | **Resolved by reading shipped test code**: `schema-invariant.test.ts:118-130` exempts content:'' from strict equality; widening is a snapshot-regeneration workflow (A10) |
| Our source-dirty observer conflicts with #128 Observer A Item-preservation gate | MEDIUM | Wrong dirty-state; peer origin confusion | A11 integration test during Phase 2 — our `appendTransaction` runs AFTER Observer A and only reads origin metadata, doesn't mutate Items |
| Widened jsxComponent content expression interacts unexpectedly with paragraph-lift behavior at index.ts:181-195 | MEDIUM | Schema mismatch or rendering glitch | Read the lift logic during implementation; paragraph lift is for block-in-inline cases — our block jsxComponent inside a paragraph shouldn't trigger. Test matrix for edge cases (paragraph containing only a jsxComponent reference). |
| FR-22 Observer B flip visibly updates the block being typed in as user types in source mode (the PM node for that block transitions from paragraph → rawMdxFallback → structured across the partial-complete lifecycle) | LOW | Noticeable only if the user is simultaneously looking at WYSIWYG and source (split view / second tab); single-block update is the expected always-render behavior, not a defect. G9 ensures surrounding blocks are untouched. | No new defer mechanism. Observer B's `DEBOUNCE_MS=50ms` (observers.ts:548) already coalesces rapid Y.Text updates; early-exit at observers.ts:442 already skips `updateYFragment` when XmlFragment already matches Y.Text. The existing `TYPING_DEFER_MS=300ms` is a cursor-protection guard for WYSIWYG typing (prevents `updateYFragment` from obliterating the user's in-flight keystrokes in XmlFragment); it doesn't translate to source typing because the user's cursor is in CodeMirror/Y.Text, not XmlFragment. Revisit ONLY if empirical measurement (TP01) shows disruption. |
| FR-23 single-pass enumeration changes `parseWithFallback` output shape for some inputs that previously recursed | MEDIUM | Existing `parse-with-fallback.test.ts` fixtures may produce different (but correct) trees | Snapshot-update any fixtures that change; new behavior is strictly finer or equal — never coarser than today's. Add NB01-NB11 as additions, not replacements. No other caller (persistence, rollback, external-change, agent-sessions) should observe semantic regression since they consume the tree by shape, not by snapshot. |
| FR-23 micromark tokenizer disagreement on malformed open tags (exotic attribute syntax fails tokenization → our regex scan doesn't see the span either) | LOW | Fallback widens to enclosing pair's region or blank-line bounds when the inner broken span can't be isolated via stack enumeration | Accepted as inherent to regex-based post-hoc tokenization. Degradation is graceful (coarser fallback, not crash; user still sees raw text). Measured empirically: if real fixtures trigger this beyond a rare tail, shipping our own MDX tokenizer would be warranted — but evidence doesn't support that cost today. |
| FR-23 enumerator emits overlapping-but-non-nested regions (pair and unmatched that partially overlap without containment) | LOW | "Smallest containing" selection becomes ambiguous | Should be impossible given stack-based construction (pair spans are proper subtrees; unmatched spans are bounded by evictor position which is always an ancestor's close). Add a sanity check during enumeration; on detection, log structured warning and fall back to blank-line bounds. |
| **FR-27 R1 — Radix scope-resolved Context capture** | HIGH | Implementation-gating: if the capture pattern can't correctly read scope-resolved Context references (Radix's `createContextScope` binds contexts to scope refs that aren't directly inspectable at descriptor-definition time), the bridge would publish the wrong Context identity and descendants would still miss the context. | **Pre-evaluated fallback cascade** (Q9) — Phase 0 failure is a routing decision, not a design restart. (1) **Primary:** the `ContextCapture` helper renders INSIDE the real fumadocs/Radix component tree; uses `use()` / `useContext()` on the scope-resolved Context objects from the `__scopeTabs`/`__scopeAccordion` props. We capture what React actually provides, not the abstract Context we think should be there. Hands-on prototype required as Phase 0. (2) **Fallback 1:** forward scope props through the bridge store and let descendants re-provide via the same scope prop (scope selects which Context instance is used, so forwarding preserves resolution). (3) **Fallback 2 (retreat):** hybrid architecture — direct-import the 12-14 leaf components as-is (full fidelity), pattern-copy the 4-6 compound components (Tabs/Tab, Accordion/AccordionItem, possibly Files/Folder) into editor-owned code (~300 LoC per ecosystem research §4). Eliminates the Context Bridge for compounds entirely. Compound visual fidelity drops from 100% to 95-99% (chrome-only difference; content rendering is identical). Retreat budget: ~2 days. Acknowledged in research report §10 R1 and §9.15.7 of this spec. |
| FR-27 R2 — Radix Accordion Collection hook bridging complexity | MEDIUM | Keyboard navigation between AccordionItems uses `@radix-ui/react-collection` which combines Context (`itemMap`) and DOM queries (`querySelectorAll`, `OrderedDict + compareDocumentPosition + MutationObserver`). Collection context must be bridged to preserve keyboard nav. | Under greenfield + fidelity priority, we bridge Collection context too (~30 LoC estimated). DOM ordering works natively because TipTap's `contentDOM` preserves DOM nesting. If Collection bridging surfaces unexpected complexity during implementation that can't be resolved without fork, re-evaluate — but no a-priori degradation. §14 WCAG 2.1 accessibility (keyboard nav + live-region announcements) is load-bearing. |
| FR-27 R3 — fumadocs `useCollectionIndex` mutable-array-push-during-render | MEDIUM | fumadocs `tabs.js:56` pushes to a mutable collection array during render — violates React render purity. Bridge is transparent (passes same array ref) but React Compiler or Concurrent Mode may flag/break this at fumadocs's layer independently. | Bridge passes exact same Context value (same array reference). If fumadocs upstream fixes the pattern, our bridge continues unchanged. As fallback, require explicit `value` props on Tab components instead of relying on render-order indexing (users already commonly do this). Monitor fumadocs upstream. |
| FR-27 R4 — Parent unmount before child during rapid edits | LOW | Brief <1-frame window where descendant NodeView's `useAncestorContexts` returns empty because parent has already unpublished. Descendant renders without bridged context → fumadocs throws → ComponentErrorBoundary catches → error chrome flickers for one frame. | ComponentErrorBoundary (FR-19) is the safety net. React batches unmounts so the gap is typically sub-frame. If profiling shows visible flicker, add a 50ms grace timeout before `unpublish` takes effect. |
| FR-27 R5 — O(depth) ancestor walk per NodeView render | LOW | Performance concern under pathological nesting (10+ levels). Typical compound nesting is 2-3 levels so negligible. | `useSyncExternalStore` caches subsequent renders at O(1). Cap `maxDepth: 5` during the walk if profiling surfaces issues. |
| FR-29 `bridgeId` assignment plugin misses nodes inserted via unusual paths (copy-paste from external source, programmatic insert) | LOW | Nodes without bridgeId can't publish; their descendants see missing ancestor entries. | `appendTransaction` runs on every transaction including paste + programmatic inserts. Plugin assigns bridgeId for any empty-string value, regardless of origin. Safety net: if a descendant tries to look up a non-existent bridgeId, the store returns undefined and `useAncestorContexts` skips that ancestor (no error, just missing context for that rung of the tree). |
| Observer B flip violates established `observers.ts` EXCLUDE boundary from the #105 coordination period | LOW | Perceived scope creep | Boundary narrowed explicitly in §17 (SCOPE: "observers.ts call-site flip only"). Bridge invariants (bridge / baseline / item-preservation) untouched. Single-line call-site change + deletion of now-unreachable catch; zero change to Observer A, `applyUserDelta`, typing-defer, or origin-guard truth table. |

## 16) Future Work

All non-goals classified by maturity tier per `/spec` protocol: **Explored** (clear path, could be promoted with minimal additional work), **Identified** (known to matter, needs its own spec), **Noted** (surfaced but not deeply investigated).

### Explored (clear path, not in P0)

- **NG2 — Multi-content-hole components.** Design sketch: `contentHoles: Record<string, ContentHoleSpec>` on descriptor. Requires TipTap NodePos API for multiple `<NodeViewContent />` regions per NodeView. Trigger: card-with-title pattern, sidebar-with-main pattern, or any component needing structurally-distinct editable children regions. Prior art: Plasmic's `slot` system with `allowedComponents` + `renderPropParams` (see `evidence/custom-components-deferred.md` §5 for reference).
- **Docskit components (Video, Frame, CodeGroup).** `@inkeep/docskit` not currently installed (see D3). Install + integrate = ~30 min of work. Trigger: first use-case for Video embedding OR first docskit-using content lands in a real document. Adds 3 to the 18-component P0 manifest.
- **Inline slash-menu insertion** (Q5-adjacent follow-up). `/icon` → insert `<Icon />` inline. P0 uses source-mode-only (Q5 LOCKED). Inline slash requires disambiguation from block slash (different trigger context — block-level `/` at line-start vs mid-prose `/` must be contextually routed). Trigger: authoring telemetry shows inline-slash as common operation.

### Identified (needs own spec)

- **NG9 — Component transformation UI.** Rename `<Callout>` → `<Note>` via right-click / PropPanel menu, or via a dedicated transformation affordance. Source-mode works for P0 but is clunky for frequent transformations. Prior-art: WordPress Gutenberg block transforms. Triggers a dedicated spec because: (a) product surface (UX design for transformation chrome), (b) descriptor coordination (prop migration rules when attrs differ between source and target components), (c) CRDT considerations (Y.XmlElement identity handling through transformation).
- **NG10 — Per-block source-mode toggle.** Generalize the CM-in-PM infrastructure (FR-30..FR-35 + §9.14) from rawMdxFallback to ANY block. Right-click any block → "Edit as source" → swap NodeView render to embedded CodeMirror → return to structured render on toggle-off. CM-in-PM factory (`createNestedCMExtensions`) already supports `language: LanguageSupport` per-block. Primary use case is transformation (aligned with NG9) plus debugging power users. Triggers a dedicated spec because: UX design for the toggle affordance + interaction with PropPanel state + content-round-trip guarantees when toggling back.
- **NG13 — User-registered custom components.** Complete prior analysis in `evidence/custom-components-deferred.md` (310 lines). Includes: `.open-knowledge/components.ts` config-file pattern, build-registry extension, hot-reload semantics, MCP discoverability extension, styling isolation (Shadow DOM / scoped CSS / Tailwind-in-Tailwind), collision resolution when user-declared names shadow built-ins, security/trust model for arbitrary user React components. Re-spec entry criteria + open questions enumerated in that evidence file §6 and §9.
- **Schema versioning gate (dmonad pattern).** R13 + R10 handle symptomatic cases; long-term safety for genuine schema evolution needs a `schemaVersion` attr on doc root + migration hooks. Trigger: first R10-blocking narrowing decision.

### Noted (surfaced but not deeply investigated)

- **NG1 — File-system component discovery.** Absorbed into NG13 (user-registered custom components). Auto-scanning `mdx-components.tsx` at project root is a convenience layer on top of explicit registration and ships in the same re-spec cycle.
- **NG4 — Context-aware slash-command filtering.** Only offer `<Step>` from slash menu when inside `<Steps>`. Hardcoded for 4 container patterns per FR-16a (Steps/Tabs/Cards/Files). General mechanism deferred. Trigger: >2 customer-reported friction cases with invalid-child insertion.
- **NG8 — Custom `handleDrop` drop-target restriction.** Today, schema `content: 'block*'` permits any block inside any component; invalid drops fail silently via schema validation. Drop-highlighting + restriction is a future UX surface. Trigger: authoring friction from invalid-drop silent-fail.
- **NG11 — Conditional prop visibility (`hidden(props)`).** `icon` control visible only when `type !== 'info'`. Convergent across Framer/Plasmic/Storybook, but no concrete built-in in P0 needs it. Trigger: a registered built-in needs conditional control.

### Not Future Work — formally accepted gaps or explicit NEVERs

- **NG12** — edited-node quoting normalization is an ACCEPTED trade-off (fidelity contract in §3), not a future work item.
- **NG5, NG6, NG7** — marked [NEVER] (separate JSON wire format, two-node schema split, normalize-on-every-serialize). Not revisited.

## 17) Agent constraints

- **SCOPE:** `packages/core/src/{extensions/jsx-component.ts, extensions/jsx-inline.ts, registry/, generated/, markdown/index.ts, markdown/to-markdown-handlers.ts, scripts/build-registry.ts, markdown/parse-with-fallback.ts, markdown/parse-with-fallback.test.ts}`; `packages/app/src/editor/{extensions/jsx-component.ts, extensions/jsx-inline.ts, extensions/source-dirty-observer.ts, extensions/source-dirty-observer.test.ts, extensions/bridge-id-plugin.ts, extensions/RawMdxFallbackCMView.ts, extensions/RawMdxFallbackCMView.test.ts, extensions/nested-cm-extensions.ts, extensions/arrow-handler.ts, context-bridge/store.ts, context-bridge/store.test.ts, context-bridge/hooks.tsx, components/*.tsx, slash-command/component-items.ts, block-ux/*.tsx, TiptapEditor.tsx, SourceEditor.tsx, observers.ts}`; `packages/app/src/globals.css` (CSS variable bridge for fumadocs per §9.7a); `packages/app/src/server/hocuspocus-plugin.ts` (observer registration); `packages/server/src/agent-sessions.ts` (schema-parity only); `packages/app/tests/{fidelity/jsx-*.test.ts, fidelity/rawmdx-fallback-byte-identity.test.ts, integration/bridge-matrix.test.ts, stress/ux-interactions.e2e.ts, stress/component-blocks.perf.ts, visual/component-parity.e2e.ts, visual/__snapshots__/, a11y/component-blocks.e2e.ts}`; turbo task definitions in `turbo.json` (new: `test:visual`, `test:perf`, `test:a11y`).
  - **Narrowed edits within SCOPE:**
    - `observers.ts`: Observer B call-site flip to `parseWithFallback` + removal of the unreachable catch (FR-22). No other edits to this file.
    - `parse-with-fallback.ts`: rewrite `findFallbackRegion` to single-pass structural enumeration via `enumerateFallbackRegions` (FR-23). No other edits.
    - `SourceEditor.tsx`: extract the extension list into `createNestedCMExtensions(ydoc, theme, mode)` factory (new file `extensions/nested-cm-extensions.ts`); SourceEditor calls the factory with `mode: 'source'`; the nested `RawMdxFallbackCMView` calls with `mode: 'nested'`. No changes to y-codemirror.next binding, origin guards, or theme compartment semantics.
    - `globals.css`: additive CSS variable bridge for fumadocs-ui per §9.7a (~80 LoC). Does NOT import `fumadocs-ui/style.css` or `preset.css`. No changes to existing shadcn tokens, existing `@custom-variant dark` declaration, or any other layer.
- **EXCLUDE:** `packages/core/src/markdown/{pipeline.ts, handlers.ts, fromProseMirror.ts, autolink-void-html-guard.ts}` (owned by #105), Timeline rollback path, image upload path, sidebar/panel UI.
- **STOP_IF:**
  - `@tiptap/extension-drag-handle-react` Q2 probe surfaces CollaborationCursor conflict
  - R10 schema-parity test fails after widening in ways beyond snapshot regeneration (expected path) — e.g. if our widening inadvertently narrows content for an OTHER node
  - Source-dirty observer causes byte-identity regression in M4 fidelity test
  - Our source-dirty observer interacts badly with #128 Observer A Item-preservation gate (A11)
  - FR-22 Observer B flip produces observable WYSIWYG disruption during source-mode typing beyond what `DEBOUNCE_MS=50ms` already coalesces — empirical measurement (TP01) contradicts the Q10 assumption. If seen, add a source-typing defer symmetric to `TYPING_DEFER_MS`. Do NOT revert to freeze.
  - FR-23 `enumerateFallbackRegions` emits regions that overlap without nesting (impossible under correct stack-based construction) — indicates a bug. Add a sanity check; fall back to blank-line bounds with a structured warning if detected.
  - FR-23 causes any caller of `parseWithFallback` (persistence, rollback, external-change, agent-sessions) to observe shape-level regression beyond snapshot updates — the FR-23 behavior promise is "strictly finer or equal"; any caller seeing coarser fallback is a regression.
  - **FR-27 R1 primary path fails** (Phase 0 in Next Actions): `ContextCapture` helper cannot correctly read scope-resolved Radix Context references via `use()` / `useContext()` from within the compound component's React subtree. **The preferred path (D12: direct fumadocs-ui import + Context Bridge) MUST be exhausted before any fallback is considered.** "Exhausted" means: the agent has (a) built the prototype, (b) identified the specific failure with code evidence (not "it's hard"), (c) web-searched for prior art on solving the exact failure pattern, (d) attempted at least Fallback 1 (scope-prop forwarding) with the same rigor. "This is taking longer than expected" or "the implementation is complex" are NOT valid triggers. Only "this is architecturally impossible because [specific code/websearch evidence]" qualifies. D12's direct-import path aligns with fumadocs's npm-import distribution model; retreating from it incurs ongoing upstream-sync maintenance cost.
    - **Per-component partial retreat (permitted under the same evidence bar):** if primary path fails for ONE specific compound but works for others, pattern-copy that specific compound while keeping the primary path for the rest. The evidence bar is unchanged — code evidence, web search, Fallback 1 attempt for that component. Per-component retreat is not a lowered bar; it's finer-grained application of the same bar.
    - **Escalation trigger — 2+ compounds fail primary path:** if two or more compounds independently fail, ESCALATE before continuing per-component retreats. A pattern across multiple compounds indicates an architectural question about D12 itself, not a collection of isolated issues. At that point the question shifts from "does this one work?" to "is the primary architecture right?" — which requires a conscious D12 reconsideration, not accumulated local decisions. Surface evidence from both failures for architectural review.
    - **Global failure:** if every prototyped compound fails the primary path, apply Fallback 1 (scope-prop forwarding) with the same bar; if that also fails globally, apply Fallback 2 (hybrid retreat — pattern-copy compounds, direct-import leaves).
  - FR-27 R2 Collection-hook bridging for Radix Accordion proves to require forking `@radix-ui/react-collection` or its parent package — do not silently degrade to mouse-only interaction; escalate.
  - **I16 / M17 nested-dirty invariant fails** (any DT-nested-0X scenario produces a diff where a descendant edit was silently dropped). This is a correctness regression, not a cosmetic issue — treat as highest priority.
  - **M18 bridgeId invariant fails** (any integration test finds an empty or duplicate bridgeId post-`appendTransaction`). Indicates a code path the plugin missed.
  - **Q10 bridgeId-attr-churn prototype fails** AND Options A/B/C in Q10 mitigation cascade cannot resolve it. Escalate — bridgeId architecture needs redesign.
  - **M20 visual-regression parity** fails for ≥3 components OR any single component diverges >5% (suggests systemic CSS integration regression, not per-fixture noise).
  - **PF01-03 p99 thresholds exceeded by >30%** on a steady-state doc (indicates bridge-store or ancestor-walk performance regression; profile before proceeding).
  - `bun run check:full:parallel` regression beyond documented NG12
- **ASK_FIRST:**
  - New 3P deps beyond `@tiptap/extension-drag-handle-react` + peer
  - Any change to `observers.ts` beyond the FR-22 call-site flip (bridge invariants are load-bearing — Observer A / applyUserDelta / typing-defer / origin-guard truth table are untouched)
  - Any change to `parse-with-fallback.ts` beyond the FR-23 rewrite of `findFallbackRegion` + addition of `enumerateFallbackRegions` helper (caller contracts, per-block fallback, metrics, ref-def hoist, fence-awareness, position extraction are untouched; `findEnclosingPairedTag` may be retained or removed — both are acceptable)
  - Changes to `sharedExtensions` ordering (R10 snapshot orders matter)
  - Any widening of non-JSX schema surface
  - Fork or monkey-patch of `@tiptap/react`, `@radix-ui/*`, or `fumadocs-ui` sources (Context Bridge architecture is designed to avoid this)
  - Changes to `SourceEditor.tsx` beyond the factory extraction (existing bridge semantics, theme compartment, y-codemirror.next binding untouched)
  - Any fumadocs CSS import OTHER than the explicit CSS variable bridge in §9.7a (`fumadocs-ui/style.css` and `preset.css` are explicitly NOT imported due to base-layer conflicts)
  - Reintroduction of `.open-knowledge/components.ts` or any user-registered-component surface (D9/D10 flipped to NG13; see `evidence/custom-components-deferred.md` for the re-spec entry criteria)
