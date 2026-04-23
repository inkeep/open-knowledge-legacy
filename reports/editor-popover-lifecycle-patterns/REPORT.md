---
title: "Editor Popover Lifecycle Patterns: Fused vs Split vs Escape Hatches"
description: "How production rich-text editors model the relationship between chip/mark selection state and popover-open state. Surveys 8+ editors (Lexical, BlockNote, BlockSuite, TipTap, Plate.js, Notion, Figma, Medium), 4 design-system primitives (Radix, Ariakit, React Aria, Shadcn), WAI-ARIA constraints, and the HTML `popover` attribute. Finds fused-as-default with narrow local escape hatches; multi-popover UX is ecosystem-absent."
createdAt: 2026-04-21
updatedAt: 2026-04-21
subjects:
  - Lexical
  - BlockNote
  - BlockSuite
  - TipTap
  - Plate.js
  - Radix
  - Ariakit
  - React Aria
  - WAI-ARIA
  - HTML Popover
topics:
  - editor popover lifecycle
  - selection-popover coupling
  - multi-popover UX
  - a11y popover patterns
  - design system popover primitives
---

# Editor Popover Lifecycle Patterns: Fused vs Split vs Escape Hatches

**Purpose:** When a user activates an interactive chip (link, mention, comment) in a rich-text editor, what is the relationship between its "selected" state and the lifecycle of an attached popover? Research surveys production editors, OSS code, design-system primitives, a11y standards, and the HTML platform to determine (a) which patterns are ecosystem-validated, (b) whether multi-popover UX is used anywhere, (c) what migration paths exist if a consumer ships one pattern and later needs another.

---

## Executive Summary

Three patterns coexist in production. All three converge on single-popover-at-a-time UX; none ships multi-popover as a feature.

- **Derived-fused** (MDXEditor, TipTap core, Lexical's `isLink`-via-`SELECTION_CHANGE_COMMAND`) — popover visibility is a pure function of selection. No separate "open" state.
- **Controlled fused with local state** (BlockNote, CB-v2's JsxComponent per-instance pattern) — component-local `useState` synced to selection via effects. Close-on-outside-click handled by Radix defaults. Technically CAN coexist but emergently doesn't because of single-selection PM invariant.
- **Externalized single-slot store** (Plate.js, V2 InteractionLayer's `activeNodeId`) — one slot in an externalized store (`openEditorId`, `activeNodeId`). Architecturally one-at-a-time.

**Key findings:**

- **Every surveyed production editor ships single-popover UX.** Zero ship multi-popover as a deliberate feature. Evidence across 8 editors + 4 tutorials — `d1-production-editor-ux.md`, `d2-oss-implementations.md`.
- **Hover-preview is universally treated as a SEPARATE primitive from click/edit popover.** Notion's smart chips, Figma, Google Docs, Confluence Smart Links, Medium — all model hover preview with distinct lifecycle (often hover-delay-bounded, aborted on movement). HTML `popover="hint"` (shipped 2024+) is the platform-native form.
- **WAI-ARIA APG has no Popover pattern.** Only Tooltip (non-interactive) and Dialog (modal). Multi-popover in editors is unspecified territory — not forbidden, not guided.
- **Design system primitives (Radix, Ariakit, React Aria, Shadcn) all default per-instance isolation** — mechanically support multi-open, but zero of them document it as a pattern OR anti-pattern. Ariakit is the outlier with explicit cross-popover sync (`usePopoverStore`) for intentional orchestration.
- **HTML platform offers all three states as first-class:** `popover="auto"` (fused-like: new auto closes siblings), `popover="manual"` (split-like: any coexist), `popover="hint"` (separate stack for hovers). React Aria's official escape hatch for split coexistence is "use `popover='manual'`."
- **No OSS library documents sibling multi-open as a pattern.** Surveyed Radix issues — all nesting-related (Dialog-contains-Popover, Safari portal z-index), none about sibling multi-open. Coordination, if wanted, is consumer responsibility.

**Bottom-line implication for consumers choosing a pattern:** Single-popover is ecosystem default. If multi-popover UX ever materializes as a concrete product requirement, the migration path is well-defined and standardized — swap the primitive to `popover="manual"` or wrap in Floating UI's `FloatingTree`. It's not a bespoke refactor.

---

## Research Rubric

**Primary question:** When a chip in a rich-text editor is selected, is popover-open modeled as fused with selection, split from it, or something else?

**Non-goals (excluded by design):**
- First-party codebase analysis — this report is 3P factual synthesis
- Block-level halo / selection-chrome patterns — this report is specifically about chip/mark popovers
- BubbleMenu / inline formatting toolbars — selection-anchored UI, different concern

**Dimensions:**

| ID | Dimension | Depth | Method |
|---|---|---|---|
| D1 | Production editor UX behavior | Moderate | Web + docs + UX teardowns |
| D2 | OSS editor implementation patterns | Deep | Source code reading in Lexical, BlockNote, BlockSuite, TipTap, Plate.js |
| D3 | A11y / WAI-ARIA constraints | Moderate | WAI-ARIA APG, Radix/React Aria/Ariakit docs, a11y-practitioner blog posts |
| D4 | Design system / component library precedent | Moderate | Radix, Ariakit, React Aria, Shadcn + GitHub issue trackers |

---

## Detailed Findings

### D1 — Production editor UX behavior

**Finding:** Production editors converge on **single-popover, emergent-from-selection** UX. Multi-popover is not a shipped pattern anywhere surveyed.

**Evidence:** [evidence/d1-production-editor-ux.md](evidence/d1-production-editor-ux.md)

**Sub-findings:**

| Editor | Pattern | Multi-popover? | Source |
|---|---|---|---|
| MDXEditor | Derived-fused | No (architectural) | Tutorials + source |
| TipTap core | Derived-fused via `shouldShow(state)` | No (single gate) | Source |
| Slate.js (tutorials) | Derived-fused | No | Tutorials |
| Notion | Controlled fused | No (emergent) | UX observation |
| Figma text-in-design | Controlled fused | No | UX observation |
| Google Docs (smart chips) | Controlled fused + hover-preview separate | No | UX observation |
| Confluence (Smart Links) | **Closest to split** — per-chip view-mode (inline/card/embed) tracked independently, though edit popover itself one-at-a-time | No (mode ≠ popover) | Docs |
| Medium | Controlled fused + hover-preview separate | No | UX observation |

**Implications:**

- The ecosystem has built for 1P-popover UX. Multi-popover is not a validated user need — it's a theoretical ergonomic concern without production precedent.
- Hover-preview is universally distinct. If a consumer wants URL tooltips or similar, it's its own primitive, not a variant of the click popover.

**Decision triggers (when this matters):**

- If building an editor targeting the ecosystem standard — single-popover is the default. No product-UX investigation needed to validate.
- If building an editor with a specific multi-popover requirement — the consumer is in unvalidated territory. The HTML `popover="manual"` primitive is the closest standard path.

**Remaining uncertainty:**

- Craft and Apple Notes were opaque (docs limited, live testing needed for definitive observation). Findings inferred from editor-category convention.

---

### D2 — OSS editor implementation patterns

**Finding:** 4 of 5 surveyed OSS editors ship fused with per-instance or externalized state. 1 ships imperative modal (outlier). None ships sibling multi-popover.

**Evidence:** [evidence/d2-oss-implementations.md](evidence/d2-oss-implementations.md)

**Per-editor breakdown:**

| Editor | Where "open" lives | Coupling mechanism | Multi-popover permitted? |
|---|---|---|---|
| **Lexical** | React `useState` recomputed on every `SELECTION_CHANGE_COMMAND` (`FloatingLinkEditorPlugin/index.tsx:353-437`) | Derivation from selection — explicit | No (architectural) |
| **BlockNote** | Two `useStates` with explicit rationale comment: *"Because the toolbar opens with a delay when a link is hovered... we need separate `toolbarOpen` and `link` states"* (`LinkToolbarController.tsx:22-66`) | Controlled + narrow escape (`toolbarPositionFrozen`) | No (emergent) |
| **Plate.js** | Plugin options store: `{ mode: '' \| 'edit' \| 'insert', openEditorId: string \| null }` (`LinkPlugin.tsx:7-98`) | Externalized single-slot, imperative API (`api.floatingLink.show/hide`) | No (single slot) |
| **BlockSuite** | Imperative Lit custom element via `toggleLinkPopup()` + AbortController (`command.ts:10-42`) | Not bound to selection; triggered by Cmd+K only | N/A (modal) |
| **TipTap core** | Pure `shouldShow(state): boolean` gate on every transaction | Derivation from selection | No (single gate) |
| **TipTap Pro LinkPopover** | Adds `autoOpenOnLinkActive` (default true) + `onOpenChange` callback | Derivation + opt-out | No |

**Implications:**

- **Plate.js's `openEditorId: string | null` pattern is semantically identical to V2's InteractionLayer `activeNodeId`.** Not a novel shape — a mainstream ecosystem pattern.
- **BlockNote's per-instance pattern is identical to CB-v2's JsxComponentView shape.** Also mainstream.
- The only in-code justification found across all 5 editors was BlockNote's — and it exists to handle **hover-delay coordination**, NOT to enable concurrent chip popovers.
- BlockSuite's imperative modal is the outlier. Notable because it's NOT bound to selection at all — an existence proof that decoupling is doable, but at the cost of a modal UX that OK almost certainly doesn't want.

**Decision triggers:**

- Consumer already uses Plate.js-style externalized state → V2 pattern match, no migration needed
- Consumer uses per-instance React state → BlockNote / CB-v2 pattern, needs no migration
- Consumer migrates between the two patterns: approximately 200-300 LoC refactor, ecosystem-precedented, not architecturally risky

---

### D3 — A11y / WAI-ARIA constraints

**Finding:** WAI-ARIA has no formal Popover pattern. Multi-popover in editors is allowed but unspecified. HTML's native `popover` attribute is the one standardized escape hatch.

**Evidence:** [evidence/d3-a11y-constraints.md](evidence/d3-a11y-constraints.md)

**Sub-findings:**

- **WAI-ARIA APG**: Only Tooltip (non-interactive, hover/focus-triggered, no focus-trap) and Dialog (modal, traps focus) patterns exist. Popover is not a documented pattern. Editor-specific popovers fall between: interactive (so not Tooltip) + non-modal (so not Dialog).
- **HTML `popover` attribute** (shipped 2024, widely implemented): Three states are first-class — `popover="auto"` (opening one auto-closes others with `[popover]` ancestry — fused-like), `popover="manual"` (any can coexist — split-like), `popover="hint"` (separate stack for hover peek overlays). React Aria's official recommendation for multi-open editor popovers: "use `popover='manual'`."
- **Radix Popover, React Aria's `usePopover`, Ariakit** — all default to fused-like: focus-scope + restore-to-trigger + auto-close siblings. Ariakit is unique in offering explicit cross-popover sync via the `popover` prop on `usePopoverStore`.
- **Floating UI**: Provides `FloatingTree` + `useDismiss({bubbles: false})` for explicit opt-in multi-open coexistence. Footguns remain (focus-trap coordination when focus stays on the caret).
- **Screen reader behavior with multi-popover is under-documented.** No authoritative guidance from deque, WebAIM, or inclusive-components about VoiceOver / NVDA / JAWS behavior when 2+ popovers coexist in editor contexts. Real gap in ecosystem knowledge.

**Implications:**

- Shipping single-popover aligns with the only patterns WAI-ARIA offers (Dialog-like, Tooltip-like).
- Shipping multi-popover enters unspecified territory. The consumer owns defining a11y semantics. This is not forbidden, but it's unvalidated.
- If migration to multi-popover is ever needed, HTML `popover="manual"` is the platform-sanctioned path — not a bespoke JS coordination layer.

**Decision triggers:**

- Consumer with a11y as P0 priority → ship single-popover. Avoid unvalidated territory.
- Consumer with multi-popover requirement AND a11y investment capacity → HTML `popover="manual"` + own the a11y spec locally.

**Remaining uncertainty:**

- Concrete VO/NVDA/JAWS behavior with coexisting popovers — no practitioner has documented this. Opportunity for primary research if needed.

---

### D4 — Design system / component library precedent

**Finding:** Every surveyed primitive library (Radix, Shadcn, Ariakit, React Aria, Atlassian) defaults to per-instance isolation with a controlled-or-uncontrolled boolean. None documents sibling multi-open as a pattern or anti-pattern. Ariakit is the sole library with an explicit cross-popover sync primitive.

**Evidence:** [evidence/d4-design-system-precedent.md](evidence/d4-design-system-precedent.md)

**Sub-findings:**

- **Radix** (and its direct dependent, Shadcn + TipTap Pro): `open` / `defaultOpen` / `onOpenChange` — controlled or uncontrolled. Component-local by default. No multi-open guidance in docs or issue tracker. Surveyed issues are all about nesting (Safari bugs, Dialog-contains-Popover, portal z-index) — zero about sibling multi-open.
- **Ariakit**: Unique store-based primitive `usePopoverStore()`. Explicit cross-popover sync via the `popover` ref prop. Deliberately supports orchestrated multi-popover. This is the library most aligned with "consumers who need multi-popover."
- **React Aria (Adobe Spectrum)**: `useOverlayTriggerState` hook provides `{ isOpen, open, close, toggle, setOpen }`. Per-trigger isolation is free; cross-trigger coordination is consumer responsibility.
- **Atlassian Popup**: Always-controlled (`isOpen` + `onClose` required). No stance on multi-open.

**Implications:**

- **No library prevents multi-popover.** Isolation is the default; coordination (single-slot, "close others", etc.) is opt-in consumer work.
- **No library actively supports multi-popover as a "here's how to do this safely" pattern.** Ariakit's `usePopoverStore` is the closest but is framed as general popover state management, not specifically for coexistence.
- **Mode enums** (`edit` / `insert` / `create`) are an editor-level pattern on top of the primitive boolean — Plate.js ships this; Radix doesn't.

**Decision triggers:**

- Consumer using Radix (e.g., Shadcn-based projects) — fused-by-default, migration to multi-open = switch to Ariakit / HTML native / Floating UI `FloatingTree`.
- Consumer using React Aria — same; per-instance is free, coordination is yours.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered

- **Craft + Apple Notes UX** (D1) — docs opaque; live-product browser testing needed for definitive observation. Inferred from editor-category convention.
- **Screen-reader behavior with multi-popover in editor contexts** (D3) — no published practitioner research. Primary-source testing opportunity.
- **Lexical / Plate / BlockSuite commit-message rationale** (D2) — no in-code justification found for their specific choice of shape. Only BlockNote documented *why*, and that's about hover-delay, not fused-vs-split.

### Out of Scope (per Rubric)

- First-party codebase analysis (OK's own V2 InteractionLayer, CB-v2's JsxComponentView) — these are documented separately in the consumer's own workstream, not in this 3P report.
- Block-level selection halos — a distinct feature class with different constraints (covered by prior `reports/` material on block-selection indicator patterns).
- BubbleMenu / inline formatting toolbars — selection-anchored UI, different concern from chip-anchored popover.
- Multi-peer awareness presence (collaborator halos / cursors) — deferred layer, different wire format, covered in other research.

---

## Patterns Observed (not prescriptive)

- **Derived-fused is the textbook / tutorial default** — MDXEditor, Slate.js tutorials, TipTap core `shouldShow`. Pure function of selection. Simplest mental model.
- **Controlled-fused with component-local state is the "real-world mature" variant** — Lexical, BlockNote, CB-v2. More flexibility (specific escape hatches like hover-delay, position-freeze during edit) but no fundamentally new UX.
- **Externalized single-slot is the "editor-as-controlled-system" variant** — Plate.js, V2 InteractionLayer. Imperative API, clearest separation of UI-state from UI-rendering. Equivalent UX to controlled-fused.
- **Imperative modal is the outlier** — BlockSuite's `toggleLinkPopup()` + AbortController. Least selection-coupled but also least editor-idiomatic (feels like a command dialog, not a chip popover).
- **Hover-preview is its own consistent primitive across all editors that ship it** — hover-delay bounded, abort-on-movement, distinct from click-edit popover.
- **The ecosystem has three standardized escape hatches** if a consumer ships one pattern and later needs multi-open: HTML `popover="manual"`, Floating UI `FloatingTree` with `useDismiss({bubbles: false})`, or Ariakit's `usePopoverStore`.

---

## References

### Evidence Files

- [evidence/d1-production-editor-ux.md](evidence/d1-production-editor-ux.md) — Notion, Figma, Google Docs, Confluence, Medium, MDXEditor, Slate.js UX behavior
- [evidence/d2-oss-implementations.md](evidence/d2-oss-implementations.md) — Lexical, BlockNote, BlockSuite, Plate.js, TipTap source code
- [evidence/d3-a11y-constraints.md](evidence/d3-a11y-constraints.md) — WAI-ARIA APG, HTML `popover` spec, Radix/React Aria/Ariakit a11y defaults
- [evidence/d4-design-system-precedent.md](evidence/d4-design-system-precedent.md) — Radix, Ariakit, React Aria, Shadcn, Atlassian primitives

### External Sources

- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [HTML Popover attribute spec (WHATWG §6.12)](https://html.spec.whatwg.org/multipage/popover.html)
- [Radix Popover primitive](https://www.radix-ui.com/primitives/docs/components/popover)
- [Ariakit Popover (`usePopoverStore`)](https://ariakit.org/components/popover)
- [React Aria Popover (`useOverlayTriggerState`)](https://react-spectrum.adobe.com/react-aria/Popover.html)
- [Floating UI (`FloatingTree`, `useDismiss`)](https://floating-ui.com/)
- [Lexical `FloatingLinkEditorPlugin`](https://github.com/facebook/lexical/tree/main/packages/lexical-react/src/LexicalLinkPlugin.ts)
- [BlockNote `LinkToolbarController`](https://github.com/TypeCellOS/BlockNote)
- [Plate.js LinkPlugin](https://github.com/udecode/plate/tree/main/packages/link)
- [TipTap BubbleMenu plugin](https://github.com/ueberdosis/tiptap/tree/main/packages/extension-bubble-menu)

### Related Research

- [stories/unify-editor-interaction-primitives/evidence/internal-cb-v2-popover-investigation.md](../../stories/unify-editor-interaction-primitives/evidence/internal-cb-v2-popover-investigation.md) — 1P companion: how CB-v2 implements this today (separate workstream)
- [stories/unify-editor-interaction-primitives/evidence/internal-v2-popover-investigation.md](../../stories/unify-editor-interaction-primitives/evidence/internal-v2-popover-investigation.md) — 1P companion: how V2 InteractionLayer implements this today
