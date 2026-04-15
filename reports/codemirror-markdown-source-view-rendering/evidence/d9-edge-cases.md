# Evidence: D9 — Known failure modes & edge cases

**Dimension:** D9 — Interactions between CM6 primitives; collaboration compatibility; performance at scale
**Date:** 2026-04-14
**Sources:** discuss.codemirror.net, codemirror/dev GitHub issues, yjs/y-codemirror.next repo

---

## D9.1 — Line-wrap × decoration interactions

### Finding: Inline `Decoration.mark` spans can shift browser line-break points (Chrome/Safari)
**Confidence:** CONFIRMED
**Evidence:** https://github.com/codemirror/dev/issues/800

Root cause: inline `<span>` elements inserted by mark decorations change the text flow's line-breaking heuristics. A highlighted match can move to a different visual position after the span is inserted. No mitigation shipped; proposed fix (separate overlay layer like `drawSelection`) not implemented.

Practical implication: heavy `Decoration.mark` use + `lineWrapping` is a known-fragile combination on Chrome/Safari. Keep decoration density low when mixing the two.

### Finding: `Decoration.line` with CSS override does reliably work on specific lines
**Confidence:** CONFIRMED (by pattern adoption across ecosystem)
**Evidence:** CodeMirror zebra-stripes example (https://codemirror.net/examples/zebra/) uses `Decoration.line` for per-line attributes; setting `white-space: pre` via a line class reliably overrides `EditorView.lineWrapping`'s `pre-wrap` on that line.

Pattern:

```ts
Decoration.line({ attributes: { class: 'cm-nowrap-line' } });
// CSS:
// .cm-nowrap-line { white-space: pre !important; }
```

The `.cm-scroller`'s `overflow: auto` provides horizontal scroll for the un-wrapped line.

---

## D9.2 — Atomic ranges & cursor

### Finding: Atomic ranges provide "skip on cursor motion" and "delete as one" but not mixed semantics
**Confidence:** CONFIRMED
**Evidence:** https://discuss.codemirror.net/t/atomic-range-behave-as-atomic-when-caret-moves-behave-as-normal-with-deletion/9701 — Marijn: "This is outside of what `atomicRanges` provides."

Workaround documented in forum: custom `transaction filter` that moves selection out of ranges on arrow nav only, leaving deletion character-by-character. Practical but adds complexity.

### Finding: Cursor-trapped-in-atomic-range bug was fixed in recent CM6
**Confidence:** CONFIRMED
**Evidence:** https://discuss.codemirror.net/t/cursor-trapped-in-atomic-range/9512 — bug fixed by automatic cursor relocation when text input occurs within atomic ranges

### Finding: Backspace adjacent to atomic widgets had quirks
**Confidence:** CONFIRMED
**Evidence:** https://discuss.codemirror.net/t/backspace-on-decoration-with-atomic-ranges-not-working-correctly/6641

Status: historical; worth confirming against the current installed CM version.

### Finding: Atomic ranges require a keymap to take effect
**Confidence:** CONFIRMED
**Evidence:** https://discuss.codemirror.net/t/im-missing-something-about-how-atomicrange-works/8007 — without `standardKeymap` (or equivalent), cursor motion ignores atomic ranges

---

## D9.3 — Block widgets

### Finding: Block widgets must come from a StateField, not a ViewPlugin
**Confidence:** CONFIRMED
**Evidence:** https://discuss.codemirror.net/t/how-to-replace-content-with-widget/4288 — Marijn quote repeated from D1-D2 evidence file

### Finding: Block widget cursor navigation at `side: 1` had a bug; fixed in v6.39.4
**Confidence:** CONFIRMED
**Evidence:** https://discuss.codemirror.net/t/v6-39-3-cant-navigate-through-block-widget-with-side-1-another-language-issue/9607

### Finding: CSS margin on block widgets breaks height calc; use padding/border inside
**Confidence:** CONFIRMED
**Evidence:** https://discuss.codemirror.net/t/positioning-block-level-widgets/3060

---

## D9.4 — y-codemirror.next compatibility with decorations/widgets

### Finding: y-codemirror.next syncs Y.Text only; decorations/widgets are view-layer and not synced — this is correct design
**Confidence:** CONFIRMED
**Evidence:** https://github.com/yjs/y-codemirror.next README + source

Implication for the "Live Preview" pattern: two peers can have different decorations (e.g., one peer with widgets disabled, another with them on). The widgets derive from text state + syntax tree, so both peers will independently compute matching decorations as long as their text is in sync.

### Finding: No documented issues with atomic ranges + collaboration
**Confidence:** CONFIRMED (via absence — negative search)
**Evidence:** Search of https://github.com/yjs/y-codemirror.next/issues for "atomic", "decoration", "widget" — no open issues. `@codemirror/view` atomic ranges operate on cursor motion, not transaction content; y-codemirror.next operates on transaction content. They're orthogonal.

---

## D9.5 — Performance at scale

### Finding: CM6 is viewport-aware; widgets outside viewport are not rendered to DOM
**Confidence:** CONFIRMED
**Evidence:** https://codemirror.net/examples/million/ demonstrates million-line doc; viewport culling is the core design

`estimatedHeight` on `WidgetType` is important for correct scroll position calculation without rendering the widget.

### Finding: MatchDecorator had a historical performance bug (recomputed full-doc on keystroke); fixed
**Confidence:** CONFIRMED
**Evidence:** https://discuss.codemirror.net/t/performance-issues-with-extension/8896 — fix moved to viewport-scoped recomputation

### Finding: No published benchmarks for "N hundred block widgets on one document"
**Confidence:** UNRESOLVED
**Evidence:** Negative search — no forum threads or official benchmarks

Implication: Performance for a PROJECT.md-sized document with 60+ table widgets is extrapolation-only. The viewport culling design suggests it should be fine (only visible widgets render), but empirical verification would be a follow-up probe.

---

## D9.6 — Line-wrap performance

### Finding: No maintainer guidance quantifying line-wrap cost
**Confidence:** UNRESOLVED (negative finding)
**Evidence:** No forum threads or docs section quantifying the cost of `EditorView.lineWrapping`

Practical guidance: enabling line-wrap adds CSS class + browser reflow overhead; combined with issue #800 it can interact poorly with heavy mark-decoration use. Test on large documents. Browser devtools surface excessive reflow.

---

## Gaps / follow-ups

- Empirical benchmark: a document with 60-100 table widgets and lineWrapping ON — does viewport culling keep it smooth? Would resolve D9.5.
- IME / composed-input behavior on atomic-range widgets in recent CM6 — forum threads reference historical fixes; needs current verification.
- y-codemirror.next under load (many remote edits per second) with heavy decoration recomputation on every transaction — no stress test published.
