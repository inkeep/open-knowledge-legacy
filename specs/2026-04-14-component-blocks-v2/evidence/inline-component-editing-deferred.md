---
name: Inline-component editing deferred — preserved analysis
description: Complete capture of inline-component-editing design (descriptor-dispatch, PropPanel popover, InlineBadge chip, IN scenarios) before user directive scoped this out. Preserved so future re-spec doesn't lose prior insights.
type: evidence
status: DEFERRED as of 2026-04-14
---

# Inline-component editing — Deferred Scope: Preserved Analysis

**Status at save time:** This document captures the design work for "native inline-component editing" — descriptor-dispatched live React rendering of inline MDX JSX with click-to-open PropPanel popover anchored to the inline span — before the user directive on 2026-04-14 scoped this out of Component Blocks v2.

**Directives that flipped scope:**

> "can inline jsx elements just be editable as normal inline text? i.e., don't pretty or special render them?"
> — User, 2026-04-14 conversation

> "we can add to future work and put all of our learnings/thoughts in an evidence file, similar to the custom components stuff. ... remember we're greenfield. do not worry about migrations/backfilling/etc."
> — User, 2026-04-14 conversation

**Triggering investigation:** The user asked "does our current component list have any inline items?" and "does fumadocs even support inline JSX?" Investigation confirmed:

- Fumadocs-ui's `defaultMdxComponents` (in `node_modules/fumadocs-ui/dist/mdx.d.ts`) ships ZERO inline components. All exposed MDX tags are block-level: Callout, Card, Cards, CodeBlockTab/Tabs, plus HTML element replacements (a, img, h1-h6, table, pre).
- The 18-component D3 manifest derived 16 fumadocs-ui block components + Mermaid + Audio shadcn wrappers. None are inline.
- Fumadocs's own docs (verified in `~/.claude/oss-repos/fumadocs/apps/docs/content/docs/**/*.mdx`) use JSX only at block level. In-prose JSX references appear only in backticks (documentation, not rendering).
- The §5 P1 inline-editing journey + IN01-IN03 test scenarios + G2 goal all used `<Icon name="check" />` and `<Badge>` as examples, but **neither was in the D3 manifest** — those examples were aspirational.

**What stays in P0 (per the user's "normal inline text" directive):**

- Thin `jsxInline` PM node — ONLY for the technical reason of preserving `<` and `>` characters through the serializer without escape. Schema: `atom: false, content: 'text*', isolating: false`, zero attrs. No NodeView chrome. No descriptor dispatch.
- Parse handler: `mdxJsxTextElement` → `jsxInline` with the raw source slice as text content.
- Serialize handler: `jsxInline` → `html` mdast (bypasses text-escape safe list).
- Inline JSX in WYSIWYG renders as plain text (literal `<Tag attr="x" />` characters visible).
- Round-trip byte-identical via fidelity invariant I12.

**Consumer of this document:** the follow-up spec that re-opens inline-component editing. Do not lose these insights.

---

## §1 The deferred design (what was scoped before the flip)

### Architecture

A **descriptor-dispatched inline NodeView** (`JsxInlineView.tsx`) that renders registered inline components as live React, with click-to-open PropPanel popover anchored to the inline span. Symmetric architecture to the block path: same descriptor registry, same PropDef extraction, same γ dirty-tracking pattern.

```
Source MDX:    Click <Icon name="check" /> to submit.
                     ↑
                     descriptor-dispatch lookup
                     ↓
Registered "Icon"    → live React render of <Icon name="check" />
                       + click → inline PropPanel popover
                       + InlineBadge chrome on hover (subtle outline)
                       + sourceDirty tracking via γ pattern
Wildcard fallback    → InlineBadge chip showing "Icon" tag name
                       + editable children (NodeViewContent inline)
                       + no PropPanel
```

### Original FR set (now removed from P0 spec)

- **FR-10:** NodeView (inline): descriptor-dispatch at render. Registered → inline React + click-to-open inline PropPanel popover + optional `<NodeViewContent>` if hasChildren. Wildcard → inline name badge + `<NodeViewContent>` (children editable if any).
- **FR-12:** PropPanel (inline): Radix popover anchored to the inline span. Same PropDef-driven controls as block; same empty-panel suppression. Click-outside or Esc closes. No drag-handle affordance (inline has no gutter).
- **FR-17a inline half:** `setNodeSelection(getPos())` click induction for inline jsxInline elements (the wrapper span). ProseMirror does NOT auto-NodeSelect on click to `contentEditable={false}` regions of non-atom nodes — without this explicit handler, clicks can't open the inline PropPanel.

### Original §9.8 NodeView (inline) chrome

```
<JsxInlineView>
  ├─ contentEditable={false} wrapper span
  ├─ InlineBadge chip [if wildcard] OR live React component [if registered]
  ├─ <NodeViewContent /> for children (if hasChildren)
  └─ Click handler → setNodeSelection → open PropPanel popover
```

CSS for InlineBadge:
```css
.ProseMirror .jsx-inline-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 0.25rem;
  background: var(--color-muted);
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  font-family: var(--font-mono);
  font-size: 0.875em;
  color: var(--color-muted-foreground);
}
.ProseMirror .jsx-inline-badge[data-selected="true"] {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-foreground);
}
```

### Original `isInline: true` descriptor field (now removed)

```ts
interface JsxComponentMeta {
  // ...
  isInline: boolean;  // routes to jsxInline (true) or jsxComponent (false)
  // ...
}
```

The slash menu (FR-14) filtered to block components via `descriptor.isInline === false`. Inline components were not in the slash menu (Q5 LOCKED — source-mode-only insertion for inline; inline slash deferred to NG-tier).

### Original IN01-IN03 test scenarios

| # | Scenario | Expected |
|---|---|---|
| IN01 | `<Icon name="check" />` inline in prose | Renders inline via descriptor's React component |
| IN02 | Click the Icon | Inline PropPanel popover anchors to the span; `name` text input appears |
| IN03 | Change `name` from "check" to "star" | Icon re-renders live; `sourceDirty: true` |

### Inline `bridgeId` (now removed)

Original §9.15 design had bridgeId attr on jsxInline too, with the bridge plugin's `appendTransaction` assigning IDs to both jsxComponent AND jsxInline. Inline branch is removed; bridgeId is jsxComponent-only.

### Original Q4 (Inline PropPanel trigger UX) — now CLOSED

Q4 was: "Inline PropPanel triggers on click vs hover vs explicit affordance — which UX?" CLOSED upon deferral; reopens with the re-spec.

---

## §2 Why deferred — the cost-benefit analysis

### Costs of inline-component-editing in P0

| Cost | Detail |
|---|---|
| Schema complexity | jsxInline needs full attrs (sourceRaw, sourceDirty, bridgeId, structured props) — same as jsxComponent |
| NodeView complexity | Two NodeViews (block + inline) with subtly different cursor-boundary behavior; inline NodeViews historically the source of cursor-stuck-at-edge bugs in PM |
| Bridge complexity | bridgeId assignment + Context Bridge ancestor walks must handle inline; ContextBridgeProvider wraps inline; jsxInline as compound publisher (rare but possible) |
| PropPanel complexity | Radix Popover anchoring to inline spans (Q7 — popover positioning + scrolling + viewport-edge handling for inline elements is harder than for block) |
| Test surface | IN01-IN08 + inline variants of CB/EB/MR/PD/AG series |
| Visual regression | Inline-component VR snapshots — chrome variations × prose contexts |
| Asymmetric authoring model | Block via slash → click → PropPanel; inline via source-mode-typing → click → popover. Different mental models. |

### Benefits foregone by deferral

| Benefit | Detail |
|---|---|
| Live render of `<Icon />` mid-prose | User sees rendered icon instead of source text. Nicer for known icon sets. |
| PropPanel-driven inline prop editing | Click `<Badge variant="warning">` → choose new variant from dropdown. |
| Symmetric authoring model | "Everything is editable via PropPanel" rather than "block via PropPanel, inline via source." |

### Decision

User directive applied: **inline JSX renders as normal inline text, no chrome, no popover, no descriptor dispatch.** Costs avoided in P0 (~400 LoC of inline scaffold + ~10 test scenarios). Benefits acknowledged as deferred until concrete demand surfaces.

---

## §3 What's preserved in P0 (the thin jsxInline)

The `jsxInline` PM node remains in P0 schema, but in a much thinner form than the original design. Three reasons it stays:

1. **Serialize-without-escape.** mdast-util-to-markdown's text handler escapes `<word` patterns in text contexts (CommonMark safety). A plain PM text node containing `<Icon />` would serialize as `\<Icon /\>` — round-trip broken. A dedicated jsxInline node lets the serializer route through `html` mdast, which preserves `<` and `>` raw.
2. **Precedent #10 compliance for paired-tag children.** `<Badge>content</Badge>` has children. Storing them as content of jsxInline (`content: 'text*'`) preserves Y.Item identity per-keystroke when user edits "content."
3. **Future re-spec doesn't need a schema migration.** When inline-component-editing returns, jsxInline already exists in the schema. The re-spec adds attrs (descriptor-related) and a NodeView with chrome. Schema-add-only (Precedent #9) compatible.

### Thin jsxInline shape

```ts
const jsxInline = Node.create({
  name: 'jsxInline',
  group: 'inline',
  inline: true,
  atom: false,
  content: 'text*',
  isolating: false,
  selectable: true,
  addAttributes: () => ({}),  // intentionally zero attrs in P0
  renderHTML: () => ['span', { 'data-jsx-inline': '' }, 0],  // generic span; no chrome
});
```

### Parser

```ts
handlers.mdxJsxTextElement = (node, state, originalSource) => {
  const raw = originalSource.slice(node.position.start.offset, node.position.end.offset);
  return [{ type: 'jsxInline', content: [{ type: 'text', text: raw }] }];
};
```

### Serializer

```ts
toMarkdownHandlers.jsxInline = (node) => ({
  type: 'html',  // 'html' mdast bypasses the text-escape safe list
  value: node.children?.[0]?.value ?? '',
});
```

### Behavior under the thin shape

- **Editing:** user edits the `<Icon name="check" />` characters in WYSIWYG as if it were any text. Cursor lands inside, types, deletes. No special UX.
- **`<Badge>**bold**</Badge>` case:** the `**bold**` inside is literal asterisks visible in WYSIWYG (no markdown rendering inside inline JSX). When the docs-site renders the MDX, the bold renders correctly. Acknowledged WYSIWYG-vs-production divergence; acceptable for P0.
- **Malformed inline JSX (`<Icon name="`):** micromark-extension-mdx tokenizer falls through to literal text at the mdast level. No `mdxJsxTextElement` produced. Lands as plain text in PM. No special handling needed; no inline rawMdxFallback.
- **Self-closing `<Icon />`:** identical handling to paired form. Source-slice approach works regardless of mdast children.

---

## §4 Re-spec entry criteria

The re-spec should be triggered when one of the following is true:

1. Concrete demand articulated for live-rendered inline components (more than ad-hoc requests — actual workflow blocker for paying customers or partners).
2. A library of inline-suitable components exists (fumadocs ships inline components, an app-local collection emerges, or an integration partner provides them).
3. Authoring telemetry shows users asking for inline component editing (chat, support tickets, feature requests).
4. Component Blocks v2 (the current spec) ships and the team has capacity for the next spec cycle.

When triggered, read this evidence file first. Preserve the prior work.

---

## §5 Open questions for the re-spec

1. **Inline slash menu disambiguation.** Block slash fires at line-start; inline slash would fire mid-prose. How does the trigger logic decide which menu to show? (Q5 was LOCKED to source-mode-only for P0; re-spec must address.)
2. **Cursor boundary semantics.** Inline NodeViews with `contenteditable=false` chrome have historically caused cursor-stuck-at-edge bugs. The re-spec should adopt explicit boundary handling (similar to nested CM's `maybeEscape` in §9.14).
3. **Paired-inline children with marks.** When inline JSX wraps content (e.g., `<Badge>**new**</Badge>`), should children render with marks (bold/em/links) or as plain text? Interpretation A (plain text, current P0) vs Interpretation B (rendered marks) trade-off.
4. **PropPanel popover anchoring (Q7).** Radix Popover positioning relative to an inline span — viewport-edge handling, scroll behavior, multiple inline popovers in a paragraph. Probe required during re-spec.
5. **Inline component descriptor — same registry or separate?** Reuse `JsxComponentDescriptor` with `isInline: true`, or define `JsxInlineDescriptor` as a sibling type? Reuse is simpler; separation may catch type errors at compile time.
6. **Inline error boundary.** When a registered inline component throws, what UX? Per the always-visible invariant (Precedent #24), invalid state should surface the embedded source editor. But CodeMirror is block-oriented — inline CM is awkward. Alternative: inline error chrome with a "fix in source mode" affordance.
7. **Inline component bridgeId.** If inline compounds become possible (e.g., `<TooltipRoot><Tooltip /></TooltipRoot>` inline), bridgeId + Context Bridge would need to extend to inline. Currently scoped to block; re-spec must reconsider.
8. **Visual-regression for inline.** Per-component VR snapshots need inline variants × prose-context fixtures × selection states.
9. **Paste / copy of inline JSX.** Clipboard handling for inline components — does the rich representation preserve through clipboard?
10. **Multi-client editing of inline JSX.** Concurrent edits to the same inline component's attrs — same LWW + char-CRDT model as block, or different?

---

## §6 Prior-art references for the re-spec

| Pattern | Source | Applicability |
|---|---|---|
| MDXEditor inline JSX with descriptor | `reports/storybook-ecosystem-component-blocks-reuse/REPORT.md` (MDXEditor analysis) | Direct prior art — single-node + descriptor dispatch model would extend to inline |
| Framer inline property controls | `reports/storybook-ecosystem-component-blocks-reuse/evidence/visual-editors-component-registration.md` | 22-type prop control vocab; inline-applicable subset is text/enum/number |
| Plasmic inline component registration | Same | `registerComponent(Comp, {...})` works for inline; uses `slot: 'inline'` hint |
| Storybook argsTable for inline | Same | Tabular prop editing pattern; less popover-anchored |
| Reka inline JSX | Inferred from MDXEditor lineage | Same one-node + dispatch pattern |
| Notion inline blocks (mentions, links) | Industry observation | Closest UX analog — click-to-edit inline structured content |

---

## §7 Test scenarios drafted (preserved for re-spec)

From the original §7a IN-series:

- **IN01:** `<Icon name="check" />` inline in prose → Renders inline via descriptor's React component
- **IN02:** Click the Icon → Inline PropPanel popover anchors to the span; `name` text input appears
- **IN03:** Change `name` from "check" to "star" → Icon re-renders live; `sourceDirty: true`
- **(IN04-IN08 retained in P0 spec, simplified to test thin-jsxInline behavior)**

Plus a draft set for the re-spec:

- **IN-RR01:** Two adjacent inline components in same paragraph; click one → only that one's PropPanel opens; clicking the other closes the first.
- **IN-RR02:** Inline component at line-edge — popover anchors don't overflow viewport.
- **IN-RR03:** Inline component with empty-panel descriptor (only ReactNode prop) — no PropPanel; visible chrome only.
- **IN-RR04:** Inline component throws on render — error boundary chrome; click "fix" → switches to source mode + scrolls to that span.
- **IN-RR05:** Multi-client edit of inline component's attrs → LWW merge.
- **IN-RR06:** Paste a paragraph containing 3 inline components → bridgeIds (if applicable) + descriptor dispatch all work.

---

## §8 What this evidence file is NOT

- Not a spec — it's a snapshot of design work for re-use.
- Not a commitment to implement inline-component-editing — that requires the re-spec to validate entry criteria (§4).
- Not a substitute for the full Component Blocks v2 spec — read SPEC.md first.

---

## §9 Companion documents

- `evidence/custom-components-deferred.md` — same pattern, deferred D9/D10 work
- `reports/storybook-ecosystem-component-blocks-reuse/REPORT.md` — convergent prior art on inline patterns
- `reports/fumadocs-ecosystem-component-blocks-reuse/REPORT.md` — fumadocs ecosystem analysis confirming inline gap
- `reports/context-bridge-registry-architecture/REPORT.md` — bridge architecture (would extend to inline if compound inline emerges)
