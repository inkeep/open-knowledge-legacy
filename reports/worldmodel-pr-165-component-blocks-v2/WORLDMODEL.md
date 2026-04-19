---
title: "World Model — PR #165 (Component Blocks v2)"
topic: "inkeep/open-knowledge#165 — descriptor-dispatched MDX editing + nested-CM convergence"
date: 2026-04-16
cutoff: "session 92e38657 line 4527 — dispatch of /spec for block-selection-indicator (PR #168 fork point)"
scope: "reconstruct full context for PR #165 to resume work"
---

# World Model — PR #165 (Component Blocks v2)

**What PR #165 is.** An 82-file, +25,736 / -464 landing that widens the `jsxComponent` PM node from an atom to a block container (`content: 'block*'`, `isolating: true`, `defining: true`), adds a runtime descriptor registry with 18 built-in fumadocs-ui components + wildcard fallback, embeds CodeMirror inside `rawMdxFallback` for parse-failure / render-error / unregistered cases, adds a severity taxonomy for degraded renders, introduces a Context Bridge Registry for compound components (Tabs / Accordion) across NodeView portal boundaries, bridges fumadocs `--color-fd-*` tokens into Tailwind v4's `@theme inline`, and adds five architectural precedents to CLAUDE.md (three new: #12, #13, #14). Branch `worktree-component-blocks-v2`. Base `main`. Opened 2026-04-16T09:22:11Z. Head commit `041603c6`.

**Who built it and how.** One session, 92e38657, ran `/ship` end-to-end on the pre-authored `specs/2026-04-14-component-blocks-v2/` spec, then continued ~15 hours of post-ship UX iteration driven by real-time testing against a live dev server (and `/agent-browser` for PM state verification). User = Nick. 4 compactions. Session ended cleanly — two commits, PR opened, worktree forked for the follow-up (`/spec` dispatched at line 4527 = our cut-off).

**Governing directive (verbatim at session lines 4 and 4414).** *"This is a greenfield project so in general, don't lean heavily on 'Defer to future', don't worry about breaking changes or blast radius, NO DEFERRED TECH DEBT — instead, optimize for (1) best architecture and correctness based on evidence, (2) clean codebase that sets or fixes right precedents, (3) best product experience without over-engineering."* This posture is non-negotiable for continuation work.

---

## 1. Scope boundary — what's in #165 vs #168

The session ran a single unbroken thread from `/ship` through post-ship UX polish, then split cleanly at line 4527 when the user said *"lets make new worktree and write /spec on what we discussed. ultrathink"* and dispatched `/spec` for the block-selection-indicator.

**In PR #165 (everything before line 4527):**
- The complete spec implementation for `specs/2026-04-14-component-blocks-v2/`
- Post-ship UX polish: chrome bars, PropPanel, Tabs cursor, Card cursor-trap, drag-prevention, auto-open, typed-children-guard, nested-CM convergence, fumadocs CSS token bridge, severity taxonomy, `emptyChildName` placeholders
- The **block-selection-indicator research report** (committed in `041603c6` at line 4484) — REPORT.md + 6 evidence files in `reports/block-selection-indicator-patterns/`
- AGENTS.md + CLAUDE.md sync of precedents #10–#14

**In PR #168 (after line 4527 — NOT part of this worldmodel):**
- `specs/2026-04-16-block-selection-indicator/SPEC.md`
- SelectionStatePlugin (first-class typed PM PluginState)
- `data-*` attribute API for selection state
- `::before` behind-content halo (T10) + transparent-outline placeholder (T3)
- Floating UI for selection-attached popovers
- **Deletes** the `.is-selected { box-shadow: 0 0 0 2px ... }` rule in `globals.css:1064-1066` that #165 ships with

So the box-shadow selection indicator in PR #165 is **provisional** — it lives until #168 lands.

---

## 2. The spec that drove the ship (`specs/2026-04-14-component-blocks-v2/SPEC.md` — 287KB)

### 2.1 Situation / Complication / Response

**Situation.** Post-PR #83 (#136 baseline), MDX JSX parses to atom-only `jsxComponent` storing raw source. Only hardcoded `Callout` renders; every other component is opaque. No prop UI, no rich children editing, no block affordances.

**Complication.** PR #23 (typed-component-nodes) has 13 audit findings and is architecturally incoherent post-#83. Greenfield directive forbids stale scaffolding. Notion/Gutenberg ship prop panels + drag-handle UX as table stakes. MDX-tolerant-parsing (PR #105, ready) explicitly scoped typed-component editing to this spec.

**Response.** One combined SPEC on post-#136 main shipping **Layer 2 (typed props) + Layer 3 (inline/block rich children) + block UX** in a coordinated cutover. Three pillars:
1. Widen `jsxComponent` to non-atom + runtime descriptor dispatch (MDXEditor pattern — convergent prior art)
2. Dirty-tracking hybrid serialization (γ pattern): pristine → `sourceRaw` byte-identical; edited → reconstruct
3. Symmetric block/inline Layer 3 with unified descriptor registry + floating/anchored prop panels

### 2.2 Personas (the spec uses personas + journeys, not US-xxx)

- **P1** — Authoring humans (insertion speed, visual editing, concurrent collab)
- **P2** — AI agents / MCP clients (programmatic authoring, predictable output)
- **P3** — Component contributors (low-ceremony registration)
- **P4** — Downstream consumers (docs sites, MCP schemas)

### 2.3 The 7-point architectural spine (§9.1)

1. **Schema:** `jsxComponent` widened from atom → non-atom block container; `jsxInline` rewritten to thin `content: 'text*'` shape
2. **Serialization (γ pattern):** pristine `sourceRaw` pass-through; edited reconstruction + NG12 normalization
3. **Source-dirty observer plugin:** tracks user-intent transactions, marks JSX nodes dirty
4. **bridgeId PluginState (Q10 Option A):** stable node identity via WeakMap, NOT schema attr — lives in PM PluginState
5. **Context Bridge flow:** ancestor NodeViews publish scope-resolved contexts; descendants walk `$pos.node(depth)` to collect and re-provide
6. **Bridge always-live (G9):** Observer B flips to `parseWithFallback`; FR-23 single-pass enumeration
7. **Nested Editor Architecture (FR-30..FR-35):** `rawMdxFallback` CM embed uses direct PM dispatch (NOT y-codemirror.next — avoids dual-observer conflict per Precedent #12)

### 2.4 Decisions (all LOCKED)

| # | Decision |
|---|---|
| D0 | Supersede PR #23 + block-editor-ux SPEC (audit H1-H4; greenfield) |
| D1 | One `jsxComponent` node, widened to `atom: false, content: 'block*'` |
| D2 | Build additively on #105; no amendments required |
| D3 | Built-ins P0: 18 components (16 fumadocs + Mermaid + Audio shadcn). Docskit deferred. |
| D4 | Block-UX Phase 2 (keyboard nav L1-L4) IN P0 |
| D5 | Expression attrs: JSON.parse simple; raw-string complex; spread → sourceRaw (agnostic mode) |
| D6 | Hybrid γ serialization (`sourceRaw` pristine, reconstruct edited); jsxComponent only |
| D7 | Custom flush-left `mdxJsxFlowElement` handler (prevents 4-space CM ambiguity at depth 2+) |
| D8 | **FLIPPED to NG14** (2026-04-14): inline JSX as source text, no PropPanel/dispatch |
| D9 | **FLIPPED to NG13** (2026-04-14): custom-component registration deferred |
| D10 | **FLIPPED to NG13** (2026-04-14): fidelity priority on 18-component built-ins |
| D12 | Use fumadocs-ui components directly + Context Bridge Registry |
| D13 | CM-in-PM nested editor for rawMdxFallback P0; direct PM dispatch |

The three D8/D9/D10 flips on the day before ship are load-bearing — they are the reason #165 is *block-only* and the reason inline JSX remains as source text without PropPanel.

### 2.5 Invariants (spec tags)

- **I-series (fidelity):** I12 pristine block JSX byte-identity; I13 edited idempotence (NG12 normalization); I14 rawMdxFallback byte-identity (20 malformed fixtures); I15 Observer B vs mdManager parity; I16 nested effectiveDirty (ancestor reconstructs if child dirty)
- **G-series (structural):** G1 native block-component editing; G2 inline JSX byte-identical as text; G3 registration-is-config; G4 CRDT concurrency; G5 γ pattern; G6 SideMenu + "+"; G7 keyboard nav; G8 clean cutover; G9 per-node render independence (no doc-wide freeze)
- **CB-series (Context Bridge):** 60+ scenarios CB01-CB25
- **DT-series (Dirty-tracking):** origin-guard matrix (5 origins) + nested-dirty rules
- **21 M-metrics + 60+ test scenarios** across HH, BS, PI, KN, FP, EB, ES, HO, MR, PD, DD, CB, SC, DT, CH, EX, NCM, SH, PS, AG, TP, VR, PF, A11Y, IN, CC

### 2.6 Fallback strategy (FR-27 R1) — "Fallback 2 pattern-copy"

Primary path: Radix scope-resolved context capture via `ContextCapture` helper inside live component tree. If it fails in Phase 0 prototype:

1. **Fallback 1:** Scope-prop forwarding through bridge store — forward `__scopeTabs`/`__scopeAccordion` through ContextEntry
2. **Fallback 2 (hybrid retreat):** Direct-import 12-14 leaf components as-is (full fidelity: Callout/Card/Steps/Files/Tab/AccordionItem/etc.); pattern-copy 4-6 compound components into editor-owned code (~300 LoC). Eliminates Context Bridge for compounds. Compound visual fidelity drops 100% → 95-99%. Budget: ~2 days
3. **Fallback 3 (global failure):** If ≥ 2 compounds fail globally, apply Fallback 1 globally; if that fails, apply Fallback 2 globally

The session research (8 parallel agents, session lines 533–758) confirmed **Fallback 2 is correct for built-ins** because Radix contexts are intentionally opaque (`createContextScope` closures) and `react-prosemirror` migration is architecturally required for future user-authored compounds (NG13). This is why #165 ships with the Bridge-Registry-via-DOM-data-attrs pattern rather than a React-context propagation pattern.

### 2.7 Non-goals + deferred scope

**[NEVER]** — rejected and not revisiting:
- NG5 Separate JSON wire-format (TypeScript IS the wire format)
- NG6 Two-node schema split (one node for runtime-registration)
- NG7 Normalize on every serialize (violates #136 invariant; γ only on edit)
- NG7a Silent content hiding (violates Precedent #14)

**[NOT NOW]** — clear path but deferred to re-specs:
- NG9 Component transformation UI (rename Callout → Note via PropPanel)
- NG10 Per-block source-mode toggle (right-click block → embedded CM edit) — full dedicated design in `evidence/`
- **NG13** User-registered custom components (`.open-knowledge/components.ts` config) — full prior design in `evidence/custom-components-deferred.md`. Confirmed requires `react-prosemirror` migration.
- **NG14** Live-rendered inline-component editing (descriptor-dispatched React + click-popover for inline) — full prior design in `evidence/inline-component-editing-deferred.md`

**[NOT UNLESS]** — triggers required:
- NG2 Multi-content-hole components (Trigger: >10% usage shows ReactNode prop pain)
- NG4 Context-aware slash-command filtering (Trigger: >2 customer friction cases)
- NG8 Custom drop-target restriction
- NG11 Conditional prop visibility

**The spec does NOT mention block-selection-indicator / PR #168 / stacking** — that emerged during Phase C of the ship cycle from Nick's "double outline" observation and the 8-agent research burst.

### 2.8 Evidence / meta files

`evidence/`:
- `inline-component-editing-deferred.md` — full NG14 prior design
- `serialize-roundtrip-probe.md` — 10/10 idempotent cases validated
- `custom-components-deferred.md` — full NG13 prior design
- `mdx-editor-component-patterns.md` — prior-art convergence (MDXEditor, Plate)
- `worldmodel.md` — feasibility audit

`meta/`:
- `_changelog.md` — spec revision history
- `design-challenge.md` — design rationale + trade-off analysis
- `audit-findings.md` — 13 findings vs PR #23 (7 high, 6 medium)
- `audit-findings-t1-carryforward.md`, `audit-findings-t3-carryforward.md` — triaging

---

## 3. Code topology — primitives introduced

### 3.1 `jsxComponent` NodeSpec — the load-bearing schema widening

**File:** `packages/core/src/extensions/jsx-component.ts:32-52`

```ts
export const JsxComponent = Node.create({
  name: 'jsxComponent',
  group: 'block',
  atom: false,              // widened from atom:true
  content: 'block*',        // NEW — block container
  isolating: true,          // prevents PM from dissolving at boundary
  selectable: true,
  defining: true,           // preserves identity across keystroke edits
  priority: 60,

  addAttributes() {
    return {
      content: { default: '' },         // R10 legacy (pre-#136 compat)
      componentName: { default: '' },   // 'Callout', 'Steps', etc.
      kind: { default: 'element' },     // 'element' | 'expression'
      attributes: { default: [] },      // preserved MdxJsxAttribute[] for reconstruct
      sourceRaw: { default: '' },       // byte-exact source (pristine path)
      sourceDirty: { default: false },  // γ flag — false=pristine, true=edited
      props: { default: {} },           // destructured props per descriptor
    };
  },
  // parseHTML/renderHTML redacted
});
```

This matches spec §9.1 and activates precedents #9 (add-only schema — every attr has `default`), #10 (opaque-but-content-bearing for Y.Item identity), #14 (all user content visible).

### 3.2 New files by role (all absolute, worktree path)

**Editor extensions (9 new):**
- `packages/app/src/editor/extensions/JsxComponentView.tsx` — main React NodeView; 3-branch descriptor dispatch (registered → live; wildcard → rawMdxFallback; render error → rawMdxFallback)
- `packages/app/src/editor/extensions/JsxComponentView.test.ts`
- `packages/app/src/editor/extensions/RawMdxFallbackCMView.tsx` — nested-CM NodeView consumer
- `packages/app/src/editor/extensions/RawMdxFallbackCMView.test.ts`
- `packages/app/src/editor/extensions/nested-cm-extensions.ts` — shared `createNestedCMExtensions` factory (wiki-link, md-link, agent-flash gated on `ydoc`, theme compartment)
- `packages/app/src/editor/extensions/typed-children-guard.ts` — PM `filterTransaction` plugin that replaces `contentEditable=false` (rejects block insertion at container boundary when depth is wrong; session line 2565 explains why `contentEditable=false` breaks BubbleMenu via `prosemirror-view:5630-5632` `hasFocus()` ancestor walk)
- `packages/app/src/editor/extensions/source-dirty-observer.ts` — tracks user-intent transactions, sets `sourceDirty` flag per §9.1 pillar 3
- `packages/app/src/editor/extensions/source-dirty-observer.test.ts`
- `packages/app/src/editor/extensions/bridge-id-plugin.ts` — bridgeId PluginState per §9.1 pillar 4, Q10 Option A (WeakMap-based, NOT a schema attr)
- `packages/app/src/editor/extensions/arrow-handler.ts` — keyboard nav for G7 (L1-L4 — Esc/Enter + arrow keys)

**Editor utils (4 new):**
- `packages/app/src/editor/utils/severity.ts` — `classifySeverity(reason: string): 'info' | 'warn' | 'error'`. `"Unregistered component:"` → info, `"Render error in"` → warn, anything else → error
- `packages/app/src/editor/utils/severity.test.ts` — 5 passing cases
- `packages/app/src/editor/utils/reconstruct-source.ts` — γ-path dirty-rebuild (calls MarkdownManager.serialize)
- `packages/app/src/editor/utils/get-ydoc.ts` — helper used by nested-CM to access Y.Doc for agent-flash decorations

**Core registry (6 new files across 2 dirs):**
- `packages/core/src/registry/types.ts` — `JsxComponentMeta`, `PropDef`, discriminated union of prop types
- `packages/core/src/registry/built-ins.ts` — 18 built-in descriptors (see 3.3)
- `packages/core/src/registry/index.ts` — registry export surface
- `packages/core/src/registry/registry.test.ts`
- `packages/app/src/editor/registry/types.ts` — app-side type re-exports
- `packages/app/src/editor/registry/index.ts` — app-side consumer

**Editor components (3 new) and block UX (2 new):**
- `packages/app/src/editor/components/compound-wrappers.tsx` — the Context Bridge Registry implementation for Tabs/Accordion. `EditorTabs` gets `contentEditable={false}` + `onMouseDown stopPropagation` on tablist (session line 4064 cursor-trap fix)
- `packages/app/src/editor/components/PropPanel.tsx` — popover-based prop editor
- `packages/app/src/editor/components/PropPanel.test.ts`
- `packages/app/src/editor/block-ux/SideMenu.tsx` — context-aware "+"
- `packages/app/src/editor/block-ux/drag-handle.ts`

**Slash command (1 new):**
- `packages/app/src/editor/slash-command/component-items.ts` — `createChildNode`, `focusInsertedComponent`, `setPendingAutoOpen`, `consumeAutoOpen`

**Styles (1 modified):**
- `packages/app/src/globals.css` — chrome CSS (z-index: 50 above fumadocs sticky z-40), `@theme inline` token bridge for `--color-fd-*`, `@source "./**/*.{ts,tsx}"` for Tailwind v4 class detection, `data-needs-config` attr rule, and the **provisional** `.jsx-component-wrapper.is-selected { box-shadow: 0 0 0 2px … }` at lines 1064-1066 that PR #168 will delete

**Tests added (12 files across unit/fidelity/stress/a11y/visual):**
- Unit: JsxComponentView, RawMdxFallbackCMView, severity, source-dirty-observer, PropPanel, registry
- Fidelity: `jsx-expression-attrs.test.ts`, `jsx-pristine-byte-identity.test.ts` (I12 invariant)
- Perf: `component-blocks.perf.test.ts` (M17+)
- A11y: `component-blocks.e2e.ts`
- Visual: `component-parity.e2e.ts` + `__snapshots__/` gitkeep — 16-component snapshot suite, dark/light, selected/unselected (M20)
- Context bridge store: `context-bridge/store.test.ts`

### 3.3 Descriptor registry — the 18 built-ins

**File:** `packages/core/src/registry/built-ins.ts` (561 lines)

| # | Name | hasChildren | isSelfClosing | emptyChildName | Group |
|---|---|---|---|---|---|
| 1 | Callout | true | — | — | simple |
| 2 | Card | false | true | — | self-closing |
| 3 | Cards | true | — | Card | **compound container** |
| 4 | Steps | true | — | Step | **compound container** |
| 5 | Step | true | — | — | compound child |
| 6 | Tabs | true | — | Tab | **compound container** (context-bridge) |
| 7 | Tab | true | — | — | compound child (context-bridge) |
| 8 | Accordions | true | — | Accordion | **compound container** (context-bridge) |
| 9 | Accordion | true | — | — | compound child (context-bridge) |
| 10 | Files | true | — | File | **compound container** |
| 11 | Folder | true | — | — | compound child |
| 12 | File | true | — | — | compound child |
| 13 | ImageZoom | false | true | — | self-closing |
| 14 | Banner | true | — | — | simple |
| 15 | TypeTable | true | — | — | simple |
| 16 | InlineTOC | true | — | — | simple |
| 17 | Mermaid | true | — | — | simple |
| 18 | Audio | true | — | — | simple |

`emptyChildName` is the descriptor-driven solution to the "React types can't distinguish freeform vs typed children" problem (session lines 2084-2096). When a container has zero children, render a clickable "Click to add a {child}" placeholder; on click, insert one instance of the mapped type with default props.

Compound containers that ship through the Context Bridge Registry (Tabs/Accordion/Accordions) require the `EditorTabs` / `EditorAccordion` wrappers in `compound-wrappers.tsx` to coordinate via the scope-resolved context store.

### 3.4 Commit history within #165

```
041603c6 docs: block-selection-indicator research + AGENTS.md CLAUDE.md mirror
634b073a feat(editor): component-blocks v2 polish + nested-cm convergence
2d9192d0 fix(nodeview): guard wildcard/error conversion with ref to prevent duplication
3e13535e feat(nodeview): wildcard + render errors convert to rawMdxFallback CM
78b324e6 feat(nodeview): unify wildcard chrome with registered components
f01f3a3a fix(nodeview): controlled popover with useEffect for reliable auto-open
6e6e64a8 fix(nodeview): simplify auto-open to boolean flag instead of position match
a508fcb7 fix(wrappers): remove overflow-hidden that clips child chrome bars
301d9168 fix(nodeview): reliable auto-open via module-level pending flag
f03e85a0 fix: replace contentEditable={false} with filterTransaction for typed containers
5d9f811b fix(nodeview): re-add defaultOpen={selected} for auto-open on insert
16ff7780 fix: popover editing + CSS drag prevention + invalid-children editable
761969fb fix(proppanel): use shadcn Switch for boolean props instead of Toggle
aed5ced3 fix(css): add-child pill shows on any container hover, not innermost-only
6bd6119f fix(nodeview): prevent native drag on child components via onDragStart
66889c61 fix(css): center chrome bar on top edge (50% above, 50% below)
00352e10 fix(nodeview): explicitly disable drag on child components
acd270b7 fix(nodeview): controlled popover + fix variable ordering for lint
79a2c3ff fix(nodeview): disable drag on children inside typed containers
5faf7a33 fix(nodeview): explicitly set contentEditable=true on freeform children
5e440294 fix(accordion): start expanded in editor so content is visible + editable
05198002 feat(nodeview): typed-children containers are non-editable at container level
cb2ea8ab fix(registry): Card and ImageZoom are self-closing, not containers
d861d975 feat(ux): auto-open PropPanel on insert + auto-focus children
69aa5c8f feat(nodeview): non-editable content for self-closing/childless components
594c6635 fix(icons): use ArrowUp/ArrowDown instead of ChevronUp/ChevronDown
0c6e9393 fix(ux): boundary-aware arrows + invisible hover zone for parent chrome
1d4c6ac8 fix(css): only show chrome on innermost hovered component
5298a8c5 fix(nodeview): up/down only for children + re-center add-child pill
e219b748 feat(nodeview): up/down/settings/delete chrome bar icons
```

Plus earlier `feat(editor)` commits from the `/ship` /implement phase (not shown above). The polish-iteration density is notable — ~25 of 30 commits after the initial ship landed are single-concern fixes or visual refinements. This is the pattern: ship fast, verify live, iterate by screenshot.

**CLAUDE.md is a symlink to AGENTS.md in this worktree** — so all documentation edits land on `AGENTS.md` and CLAUDE.md reflects them automatically. The `041603c6` commit did not modify CLAUDE.md as a separate file; it mirrored precedents into AGENTS.md.

---

## 4. Architectural precedents added to CLAUDE.md/AGENTS.md

All five relevant precedents are present in `AGENTS.md` of the #165 branch. Commit `e56f33c3` (Phase 4 /docs) added precedents #12, #13, #14; precedents #10 and #11 pre-existed from earlier PRs (#136 MDX-tolerant-parsing and #128 observer-a-origin-aware-diff respectively). Commit `041603c6` (Phase C end) re-synced AGENTS.md to carry the full block.

### Precedent #10 — Opaque-but-content-bearing nodes for Y.Item identity

Any PM node that stores user-editable raw content AND needs to be opaque in WYSIWYG MUST use `atom: false, content: 'text*'` (or equivalent content expression) — never `atom: true` with raw-content-in-attrs. Combine with `isolating: true`, `selectable: true`, `contenteditable: false` via NodeView to block WYSIWYG editing. Rationale: `updateYFragment` (`y-prosemirror@1.3.7/sync-plugin.js:1145-1298`) uses `equalYTypePNode` deep-attr-equality for atom nodes — any attr value change causes full delete+reinsert of the `Y.XmlElement`, tombstoning the old Y.Item. Applies to `rawMdxFallback` (R5 in tolerant-parsing spec) and `jsxInline` (Layer 3 target shape).

### Precedent #11 — Minimize CRDT mutation in sync bridges

Bridges between CRDT representations (Y.XmlFragment ↔ Y.Text) must avoid replacing Items unnecessarily via (a) content-comparison gate before delete+insert, (b) finer-grained merge via DMP `patch_make`/`patch_apply` over line-level, (c) origin-aware reconciliation at the bridge layer.

### Precedent #12 — Direct PM dispatch for nested editors **(NEW in this PR)**

Embedded editor instances inside PM NodeViews (CodeMirror inside `rawMdxFallback` or `jsxComponent` error-state) always dispatch PM transactions rather than binding directly to Y types. CM changes forward to PM via `tr.replaceWith()`/`tr.delete()`; PM-side changes flow back via the NodeView `update(node)` method with character-diff minimizing CM-level mutations. A single `updating: boolean` flag prevents feedback loops. Avoids dual-observer conflicts between y-codemirror.next and y-prosemirror observing the same Y.XmlText with independent origin guards. See `reports/cm-in-pm-nested-editor-architecture/REPORT.md`.

### Precedent #13 — Context Bridge Registry for compound components **(NEW in this PR)**

TipTap NodeViews render in isolated React portals — React Context from a parent NodeView does not propagate to child NodeViews. Compound components (Tabs/Tab, Accordions/Accordion) that depend on shared Context use an editor-scoped bridge store keyed by stable `bridgeId` (PM PluginState, not schema attr). Ancestor NodeViews publish Context values; descendant NodeViews walk `$pos.node(depth)` to collect and re-provide them. Subscribes via `useSyncExternalStore`. Cleanup on unmount. See `reports/context-bridge-registry-architecture/REPORT.md`.

### Precedent #14 — All user content visible and editable (no hidden content) **(NEW in this PR)**

No `display: none` on `NodeViewContent`, no read-only chrome covering user content, no `data-*` attribute hiding. Chrome (toolbars, badges, panels, error-state borders) is conditional; CONTENT is unconditional and always rendered. If a component render fails, the NodeView swaps to a nested CodeMirror editor showing the block's source — the user can fix in place. Applies to both `jsxComponent` (block) and `rawMdxFallback` (parse failure).

---

## 5. The 21 bugs fixed during post-ship polish (session Phase A post-/ship + Phase B)

These are the "ultrathink" moments and represent the hardest-earned decisions in the PR. Each is a load-bearing behavior for continuation work.

| # | Symptom | Root cause | Fix | Line |
|---|---|---|---|---|
| 1 | "Add Tab" didn't work | EditorTabs trigger bar read from props.items snapshot | MutationObserver on content panels | 1466 |
| 2 | "Add Card" required two clicks | Missing `onMouseDown stopPropagation` | Added stopPropagation | 1761 |
| 3 | Add-child layout shift | `left:50%; transform:translateX(-50%)` horizontal snap | `left:0 right:0 text-align:center` | compact-1 |
| 4 | Cards still draggable after `draggable=false` | TipTap `NodeViewWrapper` overrides JS onDragStart; fumadocs Card renders `<a>` (natively draggable) | `onDragStart={e => e.preventDefault()}` on wrapper + CSS `-webkit-user-drag: none` on children | 2168 |
| 5 | Step heading clipped | `.fd-step::before` counter overlaps h3 | `position:relative` on `.fd-step` + padding | 1700 |
| 6 | Accordion not editable when open | `contentEditable` inherited from Accordions (CE=false) | `TypedChildrenGuard` filterTransaction plugin replaces DOM-level CE=false | 2111 |
| 7 | **BubbleMenu not inside Step (root cause discovery)** | `prosemirror-view:5630-5632` `hasFocus()` walks ancestors, returns false on `contentEditable='false'` | Remove CE=false from containers; install filterTransaction plugin | **2558** |
| 8 | Popover couldn't be edited | Controlled state + useEffect interfering with input focus | Uncontrolled + ref-gated auto-open | 2445 |
| 9 | Popover didn't auto-open after insert | `defaultOpen` only reads on first mount | useEffect + `wasSelected` ref + `consumeAutoOpen()` boolean flag | 2672 |
| 10 | Wildcard duplication (4+ copies) | `requestAnimationFrame(convertToFallback)` in render body fires every re-render | `useEffect` + `convertedRef.current` guard | 2948 |
| 11 | **PropPanel typing does nothing (ultrathink bug)** | PM selection at pos 1 inside h1; `updateAttributes` silently no-ops | `tr.setNodeMarkup(pos, ...)` at explicit captured position | **4017** |
| 12 | **Tabs click drops caret, dies on next keystroke (ultrathink bug)** | (1) tablist missing CE=false + stopPropagation; (2) `typedChildrenGuard` off-by-one (was `$pos.depth === depth + 1`, needed `$pos.depth === depth` too) | CE=false + stopPropagation on tablist; guard extended | **4064** |
| 13 | Portal click stealing focus | `target.closest('.jsx-component-chrome')` uses DOM tree; Popover portal at document.body | `e.currentTarget.contains(target)` (React-tree native check) | 3976 |
| 14 | Cards tall nested CM | Global `.cm-editor { min-height: 200px }` | Scoped to `.source-editor .cm-editor` only | 3054 |
| 15 | Nested CM inner-shadow look | Background contrast white vs muted | Make CM transparent; inherit wrapper tint | 3560 |
| 16 | Card cursor stuck after popover close | `setTextSelection(pos + node.nodeSize)` lands inside Cards at non-textblock | `TextSelection.near(resolved, 1)` | 3490 |
| 17 | Step counter "4" on Tabs heading | Counter not resetting at Steps container boundary | Rewrote showcase (CRDT auto-save leftover) | 1755 |
| 18 | `extractPrimitiveProps` drops undeclared attrs (e.g. InlineTOC items) | Filtered to PropDef-declared props only | Pass through ALL keys from `attrs.props`, exclude only ReactNode-typed PropDef names | 1165 |
| 19 | **Callouts/Steps/Tabs rendering with no styling** | `--color-fd-*` in `:root` not `@theme`; Tailwind v4 can't generate `bg-fd-card`, `border-fd-primary` | Moved tokens into `@theme inline`; semantic colors into `@theme static`; added `@source "./**/*.{ts,tsx}"` | **3794** |
| 20 | Banner chrome hidden | Banner internal `<div class="sticky top-0 z-40">` painted over chrome (z:10) | Chrome z-index 10 → 50 | 3924 |
| 21 | Gear showing for all Cards | Boolean `external: undefined` triggering needsConfig | Narrowed to only string props with explicit `''` | 3969 |

**The three bold ones** — hasFocus + PropPanel + Tabs cursor — were the root-cause discoveries that required reading vendor source (ProseMirror + TipTap) and live PM-state tracing via `/agent-browser`. These are not cargo-cult fixes; they're the architectural truth-points of the PR.

---

## 6. Research dispatched during session (8 total research campaigns)

| # | What | Where | Who used | Report location |
|---|---|---|---|---|
| 1 | Context Bridge / Radix / TipTap / Fumadocs (8 parallel agents) | session L533-758 | FR-27 R1 — confirmed Fallback 2; react-prosemirror required for NG13 | `reports/mdx-editor-ecosystem-context-bridging/` |
| 2 | TipTap BubbleMenu / hasFocus | L2485 | `prosemirror-view:5630-5632` smoking gun | (inline analysis) |
| 3 | Spec-vs-impl gap (wildcard fallback) | L2800 | `/eng:assess-findings` — decision to unify wildcard + render-error into rawMdxFallback | (inline) |
| 4 | Fumadocs components-vs-custom audit | L3606+ | `/audit` — confirmed 12/18 real imports | (inline) |
| 5 | Fumadocs CSS / preset.css | L3715+ | `/explore` — `--color-fd-*` in `:root` not `@theme` | (inline) |
| 6 | Drag-outline diagnosis | L4082 | `/explore` — `globals.css:1064-1066` identified | (inline) |
| 7 | `/animate` + `/emil-design-eng` probe | L4285 | Skill listing + gtm:animate — 150–300ms timing, data-state pattern, @starting-style | (skill) |
| 8 | **Block-selection-indicator patterns (8 agents across 3 batches)** | **L4135 — the fork trigger** | `/eng:research` → REPORT.md + 6 evidence files | **`reports/block-selection-indicator-patterns/`** |

The session produced two research reports committed into #165 itself (as `docs: block-selection-indicator research + AGENTS.md CLAUDE.md mirror` in commit `041603c6`). The block-selection-indicator report is the seed for PR #168's spec.

---

## 7. Ecosystem position (prior art + 3P landscape)

### 7.1 Where #165 sits vs direct competition

| Aspect | MDX Editor (Lexical) | BlockNote (TipTap) | Plate-mdx (Slate) | **#165 (TipTap)** |
|---|---|---|---|---|
| Descriptor registry | `JsxComponentDescriptor[]` | `BlockConfig[]` | plugin-per-node | `ComponentDescriptor[]` |
| PM node shape | atom DecoratorNode + mdast attr | `isolating/defining/code` flags | Slate element types | block container (`block*`), `isolating`, `defining` |
| Wildcard / unknown | `name === '*'` + user Editor | closed schema — no unknown | raw-text fallback + warn log | **wildcard → rawMdxFallback + nested CodeMirror** |
| Nested content | `NestedLexicalEditor` | native block nesting | nested Slate | PM `block*` children |
| Compound coord. | ad-hoc React context in user Editor | native parent-child | ad-hoc | **Context Bridge Registry via bridgeId PluginState + DOM data-attrs** |
| Prop UI | `PropertyPopover` + `GenericJsxEditor` | per-block side panel | per-plugin toolbar | `PropPanel` popover |
| Severity | implicit (throw on unmatched) | N/A | flat warn log | **explicit info / warn / error** |
| Import-source injection | yes (`source`, `defaultExport`) | N/A | via plugins | not yet |
| CRDT integration | Lexical collab | Yjs-compatible | Slate+Yjs | **TipTap + y-prosemirror + Yjs** |

### 7.2 What #165 brings to the ecosystem

- **Strongest unknown-component fidelity** — nested CodeMirror source edit for wildcard fallback is unique
- **Explicit severity taxonomy for degraded renders** — no ecosystem precedent for info/warn/error tiers
- **Production pattern for compound-component coordination in a framework without parent-child NodeView nesting** — the Bridge-Registry-via-bridgeId-and-data-attrs approach is novel
- **First public editor pairing with the fumadocs component set specifically**

### 7.3 What #165 could still pull from the ecosystem

- `source` / `defaultExport` fields on descriptors → auto-import-injection when inserting a component (MDX Editor has this)
- `testNode` / matcher fn for structural dispatch beyond tag-name equality (MDX Editor DirectiveDescriptor)
- `@nytimes/react-prosemirror` or `@prosemirror-adapter/react` as a future refactor path if the Bridge Registry's DOM-attr discipline becomes a maintenance burden — parent-child portal nesting would let React context propagate naturally (relates to NG13 user-authored compounds requiring this)

### 7.4 Relevant prior-art reports already in `reports/`

Direct inputs to #165's design:
- `storybook-ecosystem-component-blocks-reuse/` — PropDef discriminated union + CSF3 Meta shape + hide-ReactNode-from-PropPanel
- `fumadocs-ecosystem-component-blocks-reuse/` — pattern-copy rationale for ~350-500 lines; Tabs `groupId` cross-NodeView leak hazard; `fumadocs-core/link` Vite shim need
- `storybook-alternatives-component-playgrounds/` — validates "inline-in-document with live prop editing" is novel territory
- `cms-custom-components-landscape/` — 12-CMS convergence on type-discriminator-driven component map
- `react-types-as-editor-schema/` — validates build-time `react-docgen-typescript` extraction; Webstudio two-layer model
- `tinacms-production-architecture-beyond-mdx/` — `invalid_markdown` sentinel as the anti-pattern; #165's **block-level** error scoping vs TinaCMS's document-level is the differentiator
- `mdx-crdt-roundtrip-fidelity/` — six non-negotiable architectural constraints (flat props, children as nodes, normalization-on-load, expression-indent, flow/text element stability, ESM doc-level preservation)
- `full-stack-pm-crdt-markdown-editor-ideal/` — schema baseline (17 block + 5 inline + 5 mark)
- `codemirror-markdown-source-view-rendering/` — StateField-over-ViewPlugin rule for block decorations
- `source-toggle-architecture/` — adjacent; per-block source toggle analog to `rawMdxFallback` nested CM
- `obsidian-vs-fumadocs-component-inventory/` — the 18-component inventory itself
- `fumadocs-stack-reusability-deep-analysis/` — ~400 LoC pattern-copy rationale
- `block-selection-indicator-patterns/` — committed INTO #165 by this session; drives #168

### 7.5 Gaps in the report library

- No dedicated "TipTap NodeView + ReactNodeViewRenderer patterns" report
- No "Radix Popover / portal-boundary patterns in ProseMirror NodeViews" report — Storybook-ecosystem touches it but doesn't go deep
- No "Context Bridge Registry for compound components" landscape — only Storybook-ecosystem's spec-amendment proposal
- No "severity taxonomy for degraded renders" cross-editor survey — TinaCMS is the closest prior art documented

---

## 8. What's provisional in #165 (will move or be deleted)

1. **Selection indicator CSS rule** — `.jsx-component-wrapper.is-selected { box-shadow: 0 0 0 2px color-mix(...) }` at `globals.css:1064-1066`. PR #168 deletes it.
2. **Implicit "selection is a class toggle" pattern** — ancestry walks duplicated across `JsxComponentView`, `compound-wrappers.tsx`, and `typed-children-guard.ts`. PR #168 replaces with a single `SelectionStatePlugin` as PM PluginState (typed per Precedent #1).
3. **No `source`/`defaultExport` on descriptors** — descriptors are hand-maintained. When NG13 (user-registered components) gets un-deferred, this field is needed.
4. **Hand-written descriptors** — no `react-docgen-typescript` auto-extraction pipeline (Storybook-ecosystem report proposes it; spec FR-28 scopes build-registry diagnostics). Not urgent for built-ins but becomes load-bearing for NG13.
5. **`typedChildrenGuard` depth logic** — was off-by-one once (session line 4064); the fix extended the guard to `$pos.depth === depth`. Still a hand-written PM plugin; could benefit from property-based tests along the ancestry chain.
6. **No `react-prosemirror` migration** — compound-component Context Bridge is correct for the current framework, but session research confirmed NG13 requires `react-prosemirror` to land the user-authored-compound path cleanly.

---

## 9. Unresolved / open at the fork point

1. **PR #165 CI status** — never checked during the fork session. Assistant pushed, created the PR, and moved straight to the new worktree. Any CI feedback (GitHub Actions, checks) is post-cut-off — **verify first thing on continuation**.
2. **`component-showcase.md` final content** — repeatedly corrupted by CRDT auto-save during live testing (rewritten at session lines 1599 and again). What's in PR #165 is whichever state was on disk at `git add` time (session line 4481). Reasonable to refresh deliberately.
3. **Drag-and-drop outline** — Nick's preference at line 4116 was "kill it in general" if a11y-safe. Assistant recommended option 1 (kill ring, show chrome on `.is-selected`). User pivoted to the double-outline question at line 4131 without explicitly accepting option 1. The `.is-selected` box-shadow rule still ships with #165 — will be addressed by #168.
4. **L4423 "make detailed plan. ultrathink"** was interrupted at line 4432. Plan content was rolled into the L4527 `/spec` args — no orphaned plan artifact.
5. **Interaction between #165 and rebase-typed-component-nodes worktree (memory)** — per memory: typed-component-nodes needs re-baselining. Verify whether PR #165's schema changes made that easier or harder; PR #165's widening of `jsxComponent` is a superset of what typed-component-nodes introduced, so the old branch should be fully superseded (consistent with D0).

---

## 10. Entities and terminology dictionary

Key terms and their canonical definitions (ground truth = code + spec):

| Term | Definition | Source |
|---|---|---|
| `jsxComponent` | Block-level PM node widened to `content: 'block*', atom: false, isolating: true, defining: true`. Stores `componentName`, `sourceRaw`, `sourceDirty`, `props`, `attributes`, `kind`, `content`. | `packages/core/src/extensions/jsx-component.ts:32` |
| `jsxInline` | Inline PM node with `content: 'text*'` thin shape — post-D8 flip, inline JSX is source text, no dispatch | SPEC §9.1 |
| `rawMdxFallback` | Block PM node hosting nested CodeMirror for parse-failure / render-error / unregistered cases | `RawMdxFallbackCMView.tsx` |
| `ComponentDescriptor` | Registry entry = `{ name, hasChildren, isSelfClosing?, emptyChildName?, props: PropDef[] }` | `packages/core/src/registry/types.ts` |
| `PropDef` | Discriminated union: `string`/`boolean`/`number`/`enum`/`reactnode` — the last is hidden from PropPanel (content hole) | `packages/core/src/registry/types.ts` |
| `emptyChildName` | Optional descriptor field naming the default child type for empty-container placeholder UX | `registry/built-ins.ts` |
| γ pattern | Hybrid serialization: pristine = sourceRaw pass-through; edited = reconstruction | SPEC §9.1 pillar 2 |
| `sourceDirty` | Boolean attr on `jsxComponent`; `false` = pristine, `true` = edited (reconstruct) | `jsx-component.ts:49` |
| `bridgeId` | Stable node identity for Context Bridge, stored in PM PluginState (WeakMap), NOT a schema attr | `bridge-id-plugin.ts` + Precedent #13 |
| `Context Bridge Registry` | Editor-scoped bridge store keyed by `bridgeId`; ancestor NodeViews publish scope-resolved contexts, descendants walk `$pos.node(depth)` to collect | Precedent #13 + `compound-wrappers.tsx` |
| `TypedChildrenGuard` | PM `filterTransaction` plugin rejecting block insertions at wrong-depth positions inside typed containers | `typed-children-guard.ts` |
| Severity classification | `'info' \| 'warn' \| 'error'` from reason prefix: `"Unregistered component:"`, `"Render error in"`, else | `severity.ts` |
| Fallback 2 | Hybrid retreat: direct-import leaf components; pattern-copy compounds (~300 LoC); eliminates Context Bridge for compounds | FR-27 R1 |
| Chrome bar | Hover/selection overlay UI with `[↑] [↓] [🗑] [⚙️]` (gear always rightmost); z-index 50; appears only on hover/selection; innermost-wins | session lines 3876-4047 |
| `needsConfig` | `data-needs-config` attribute — true when a string prop has explicitly been set to `''` (not undefined); triggers gear-icon hint | session lines 3946-3969 |
| `applyByPrefixSuffix` | Shared minimal-mutation bridge helper (imported from `@inkeep/open-knowledge-core`) | Precedent #11 |
| `createNestedCMExtensions` | Factory returning the CodeMirror extension set for nested CM (wiki-link, md-link, agent-flash gated on `ydoc`, theme compartment) | `nested-cm-extensions.ts` |
| `/agent-browser` | Skill used in this session to verify live PM state via the `agent-browser` MCP (Chrome DevTools Protocol) | session lines 3375+ |

---

## 11. Confidence calibration per finding category

| Finding class | Confidence | Evidence |
|---|---|---|
| Session event timeline (line-numbered) | **HIGH** | Session JSONL read directly; 4527 confirmed as /spec dispatch; cross-referenced commit SHAs with git log |
| Commit list + SHAs for PR #165 | **HIGH** | `git log main..HEAD` on worktree |
| Spec SCR, decisions, invariants, non-goals, fallback strategy | **HIGH** | SPEC.md read directly by agent |
| File scope (82 files, +25,736/-464) | **HIGH** | `git diff --stat main...HEAD` |
| Descriptor registry (18 names + shape) | **HIGH** | Grepped `built-ins.ts` directly |
| `jsxComponent` NodeSpec | **HIGH** | Read `jsx-component.ts` directly |
| Precedents #10-14 full text + precedent-origin commit | **HIGH** | Grepped AGENTS.md + verified commit SHAs |
| 21 bugs fixed during polish | **MEDIUM-HIGH** | Derived from session JSONL line references, commits, and continuation summaries — session forensics agent captured all root causes |
| Ecosystem position vs MDX Editor / BlockNote / Plate | **MEDIUM-HIGH** | Source-read from OSS repos in `~/.claude/oss-repos/` + web probes |
| Fumadocs has no descriptor export surface | **MEDIUM** | Web + OSS check; upstream could add — flagged as could-pull-from-ecosystem |
| `reports/block-selection-indicator-patterns/` is committed into #165 | **MEDIUM** | Session forensics says commit `041603c6` staged it; NOT present in current branch `spec/github-sync` (checked). Committed in the worktree |
| Typed-component-nodes worktree relationship | **MEDIUM** | Memory says needs re-baseline; logical deduction from D0 (supersede PR #23) |
| Future NG13 requires `react-prosemirror` | **MEDIUM** | Session research confirmed this for user-authored compounds; not load-bearing for built-ins |

---

## 12. Channel provenance

| Channel | How used | Source of that channel's findings |
|---|---|---|
| User-provided (session JSONL) | Full read up to line 4527 | `/Users/edwingomezcuellar/.claude/projects/-Users-edwingomezcuellar-projects-open-knowledge--claude-worktrees-component-blocks-v2/92e38657-...jsonl` |
| Code channel (inline) | SPEC.md, built-ins.ts, jsx-component.ts, commit log | `.claude/worktrees/component-blocks-v2/` |
| Reports channel | CATALOGUE.md scan + 12 topically relevant reports | `reports/` on `spec/github-sync` |
| OSS channel | MDX Editor, BlockNote, Plate-mdx, Milkdown, BlockSuite, Craft.js, Fumadocs | `~/.claude/oss-repos/` |
| Web probes | 3 parallel WebSearch calls + WebFetch for ecosystem confirm | MDX Editor docs, TipTap docs, BlockNote docs, Fumadocs docs |
| Catalog skills | None (repo has no `product-surface-areas` / `audience-impact`) | — |

Channels unavailable: catalog skills.

---

## Appendix A — Quick-resume checklist

If you pick this branch back up to continue work on PR #165:

1. `cd /Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/component-blocks-v2`
2. `git status` — should be clean; branch on `worktree-component-blocks-v2`
3. `gh pr view 165 --json state,statusCheckRollup` — verify PR state + CI
4. Run `bun run check` to confirm the 2428-test suite still passes (QA at session line 1022 showed 0 failures)
5. If resuming via session: `claude -r 92e38657-8afa-4557-9724-f4104c01c079` from that worktree path
6. Mental model check — remember the governing directives from session lines 4 & 4414 (greenfield, no deferred tech debt, architectural correctness over "scope")

## Appendix B — If you're taking the PR forward and need to decide on follow-ups

Surfaces that have a documented path (deferred but specced):
- **NG10** per-block source-mode toggle — design in `specs/2026-04-14-component-blocks-v2/evidence/` (per session notes reference)
- **NG13** user-registered custom components — full prior design in `specs/2026-04-14-component-blocks-v2/evidence/custom-components-deferred.md`; requires `react-prosemirror` migration
- **NG14** live-rendered inline-component editing — full prior design in `specs/2026-04-14-component-blocks-v2/evidence/inline-component-editing-deferred.md`

Surfaces unaccounted-for but visible in the topology:
- Auto-import-injection (descriptor `source` / `defaultExport` fields)
- `testNode` / matcher fn for non-name-based dispatch
- `react-prosemirror` / `@prosemirror-adapter/react` migration (unlocks NG13 cleanly)
- Property-based tests for `typedChildrenGuard` (after one off-by-one bug)
- Per-component `contentModel: "rich-text" | "instance"` (Webstudio pattern) for future NG2 multi-hole components

PR #168 is the first stacked follow-up and lands the SelectionStatePlugin + data-attrs + Floating UI architecture — that replaces the provisional `.is-selected` box-shadow in #165's `globals.css:1064-1066`.
