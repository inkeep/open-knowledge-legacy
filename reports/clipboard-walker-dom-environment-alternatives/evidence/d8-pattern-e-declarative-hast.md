# Evidence: D8 — Pattern E (per-descriptor declarative hast emit, no DOM)

**Dimension:** `descriptor.toClipboardHast(props): Hast` — hand-built hast tree from props; no live DOM dependency
**Date:** 2026-05-01
**Sources:** unified.js / hast docs, prior reports
**Coverage policy:** OK's spec preserved this as escape hatch; revisit as architecture-level option.

---

## Pattern definition

Each descriptor implements:

```typescript
interface Descriptor<P> {
  toClipboardHast(props: P): HastRoot | HastElement;
}
```

The clipboard pipeline:
1. PM iterates the selected fragment.
2. For each NodeView/descriptor in the fragment, call `descriptor.toClipboardHast(captured props)`.
3. For non-descriptor content (text, marks, basic blocks), produce hast via standard rehype-style serialization.
4. Compose the hast tree.
5. Serialize via `hast-util-to-html` to a string.
6. Emit as `text/html`.

**No live DOM is consulted. No `getComputedStyle`. No iframe. No SSR.** The descriptor's author is responsible for hand-coding the hast tree with whatever inline styles, attributes, and structure should appear in the clipboard.

This is the Lexical / BlockNote pattern (per D5 evidence §8) — Lexical's `exportDOM()` returns an `HTMLElement` (real DOM-shaped, not hast, but architecturally equivalent — the author writes the structure by hand). BlockNote's `toExternalHTML()` returns a React component that the framework renders to a real document fragment.

---

## Architecture

| Phase | Where | Library | Function |
|---|---|---|---|
| Author writes descriptor | source code | hastscript (`h()` helper) or hand-written object literals | `h('aside', { style: 'border-left: 4px solid #4493f8; ...' }, [h('div', { style: '...' }, props.children)])` |
| Copy event | Browser, copy time | walker for non-descriptor content + descriptor.toClipboardHast for descriptors | Compose hast tree |
| Serialize | Browser | `hast-util-to-html` (~5 KB minified) | hast → HTML string |
| Emit | Browser | DataTransfer | `clipboardData.setData('text/html', html)` |

Bundle cost: `hast-util-to-html` is ~5 KB minified. `hastscript` is ~3 KB. Total dependency cost: ~8 KB.

---

## What it captures

| Capability | Captured? |
|---|---|
| Static descriptor shape | YES (author writes it) |
| Per-variant props (`type="info"` vs `"warning"`) | YES (author writes a switch on props) |
| Children — when children are static (icon SVG paths, fixed labels) | YES |
| Children — when children are user-edited PM content | PARTIAL — author has to integrate the walker output for children, or duplicate the PM-fragment serialization logic |
| `getComputedStyle`-resolved values from the live DOM | NO — this is the load-bearing tradeoff |
| CSS variable resolution | NO unless author hardcodes resolved values |
| Tailwind class → CSS conversion | NO unless author hardcodes resolved values OR ships classes in hast and accepts that destination apps may strip them |
| Live state (Toggle open/closed) | YES (author reads `props.isOpen` and writes the right hast) |
| Activity-hidden state | YES — props are captured at PM-fragment-iteration time, not at React-render time |
| Cross-app paste fidelity | DEPENDS on inline-style discipline |

---

## What it does NOT capture

The fundamental tradeoff: this pattern is *closed under what the author thinks to encode*. If a user adds a custom Tailwind class to a Callout that the author didn't plan for, that class won't appear in the clipboard output. If the theme changes (light → dark mode), the author's hardcoded inline styles drift.

This is "Pattern Y on steroids" in spirit — it's per-descriptor, not per-color-token, but the drift class is the same.

---

## Existing precedents

### Lexical (Meta)

Source: `packages/lexical-html/src/index.ts`. Each `LexicalNode` subclass implements `exportDOM(editor): { element: HTMLElement, after?: ... }`. The framework calls this for each node in the selected fragment, composes the resulting elements, serializes via `innerHTML`. This is structurally identical to Pattern E with the only difference being "real DOM" vs "hast" — the framework takes care of serialization either way.

Per D5 evidence §8: "Inline styles set explicitly per-node by author of the node class. No automatic computed-style capture. No CSS-inliner."

### BlockNote (TypeCellOS)

Source: `packages/core/src/api/exporters/html/util/serializeBlocksExternalHTML.ts`. Each block's `toExternalHTML` returns a React element; the framework renders it to a real document fragment using `react-dom/server` style rendering, then serializes. Same structural pattern.

Per D5 evidence §8: "Author-defined inline `style={{}}` props on the React component returned from `toExternalHTML`. **Filters out BlockNote-specific classes (`bn-` prefix)** before emitting. No CSS-inliner."

### Generic hast use

The unified.js ecosystem is the canonical hast surface:
- `hastscript` — `h()` helper for hand-building trees.
- `hast-util-from-html` / `hast-util-to-html` — parse/serialize.
- `rehype-stringify` — standard hast → HTML serializer.
- Used in Astro, MDX, remark-rehype pipelines for build-time HTML emission.

For runtime browser use, all of these are bundleable; total cost for the minimal `hast-util-to-html` + `hastscript` stack is <10 KB.

---

## Architectural facts for OK clipboard

### What it solves that Pattern A doesn't

1. **Activity-hidden subtree:** Pattern E gets descriptor props from the PM-fragment iteration, not from a React mount. Activity-hidden has no impact.
2. **State purity:** the author writes the canonical render shape, not "whatever the hover/focus/selection state is right now".
3. **Predictability:** the output is deterministic per props; no dependence on running CSSOM state.
4. **Bundle cost:** trivially small (~8 KB hast deps).
5. **No DOM mocking, no iframe, no SSR runtime, no Tailwind compiler.**

### What it requires from descriptor authors

1. **Hand-coded inline styles** for each variant. Same drift class as Pattern Y (shared style-token TS module): every theme change is a 2-file edit (live React component + descriptor's `toClipboardHast`).
2. **Children integration:** for descriptors that wrap user content, the author has to call back into the walker (or PM-fragment serializer) for `props.children`. Pattern E for the descriptor *chrome* + Pattern A for the *content* is a natural composition.
3. **Cross-app testing:** because the output is hand-coded, the author has to think about Gmail/Notion/Slack/Outlook destination quirks (the cross-app icon report's matrix). For descriptors that just need basic formatting, this is small. For descriptors with rich chrome, it's nontrivial.

### What it does NOT solve that Pattern A does

1. **Automatic theme drift handling:** if Tailwind v4 `@theme` tokens change, Pattern A re-resolves through the live CSSOM. Pattern E needs the author to update hardcoded values.
2. **Composable cascade:** if a parent applies a Tailwind class that affects the descriptor's color (`text-red-500`), Pattern A inherits via cascade. Pattern E does not — descriptor is contextless.

---

## Findings

### Finding 1: Pattern E is the canonical "live editor" approach in peer editors (Lexical, BlockNote)

**Confidence:** HIGH.
**Evidence:** D5 evidence §8 surveys Lexical's `exportDOM` and BlockNote's `toExternalHTML`. Both are author-written per-node-class, no automated computed-style capture. Pattern A (live walker) is rarer in peer editors precisely because most editors don't have a stable live DOM at copy time the same way OK does.

### Finding 2: Pattern E composes naturally with Pattern A — Pattern A handles children, Pattern E handles descriptor chrome

**Confidence:** HIGH.
**Evidence:** Both Lexical and BlockNote have this composition: `exportDOM` for the wrapper, the framework's normal serialization for inner nodes. For OK, the equivalent is: `descriptor.toClipboardHast(props)` returns hast with a hole for `{children}`; the walker (or PM serializer) fills the hole with the inner content's serialized hast.

### Finding 3: Pattern E's cost is per-descriptor maintenance; bundle cost is trivial

**Confidence:** HIGH.
**Evidence:** `hast-util-to-html` + `hastscript` total ~8 KB minified per the unified.js npm pages. Per-descriptor cost is one `toClipboardHast(props)` function — for OK's ~10-15 descriptors, this is bounded engineering.

### Finding 4: Pattern E is the only pattern that handles Activity-hidden + state-purified output WITHOUT a live DOM dependency

**Confidence:** HIGH.
**Evidence:** D7 evidence §"What it enables vs the live walker" matrix — only D7 (iframe) and Pattern E share the "Resolve component without React mount in main editor tree" capability. D7 needs an iframe + React render; Pattern E needs a function call. Pattern E is the cheaper of the two for that specific capability.

---

## Verdict

Pattern E is the cheapest, most predictable alternative for descriptor *chrome* — explicitly a fallback or a dual-path companion to Pattern A. Its limit is theme drift: the author has to maintain hardcoded values that may diverge from live CSS. That maintenance cost is real but bounded (per-descriptor, per-theme-change, finite descriptor count).

---

## Gaps / follow-ups

- The composition of Pattern A (live walker for content) + Pattern E (declarative for chrome) is the natural hybrid. Defining the seam — what counts as "chrome" vs "content" — would benefit from a probe. The shipped OK code already has `toClipboardHast` as an escape hatch in the spec; how often it's actually used in practice (vs the walker fallback) is a measurable signal.
- For a maximally lightweight OK approach, Pattern E composed with Pattern A could replace Pattern Y's static palette entirely — `descriptor.toClipboardHast(props)` IS the per-descriptor static palette, just with a function shape that admits dynamic props.
