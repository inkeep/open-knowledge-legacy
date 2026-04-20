# QA-023 Correction: Render Layer is Correct

**Dimension:** Code mark schema-widening render audit (post-R24 / US-017)
**Date:** 2026-04-16
**Source:** Post-ship `/assess-findings` investigation against live dev server at HEAD `2e71e7f8`
**Method:** Playwright DOM inspection + computed-style probe + fresh screenshot at 2× device scale factor

---

## Prior finding (QA-023) — INCORRECT

The Phase 7 `/qa` subprocess reported QA-023 as blocked with the claim:

> Render layer: BREAKS VISUALLY. TipTap/prosemirror-view renders mixed-mark spans as flat DOM siblings, NOT nested. Observed DOM for `*a \`*\`*`: `<em>a </em><code>*</code>` — em is closed before code opens. For `*\`c\`*` (just code wrapped in em): DOM is `<code>c</code>` with NO em wrapper at all — italic is entirely invisible for code-only emphasized spans.

Two separate claims:
1. DOM is flat siblings
2. Italic is visibly missing from inline-code content

---

## Direct verification — BOTH claims are wrong

### (1) DOM is nested, not flat

Playwright DOM probe on live editor at `http://localhost:5174/#/probe` with the same four canonical inputs:

```json
{ "text": "Case C: c", "html": "<p>Case C: <code><em sourcedelimiter=\"*\">c</em></code></p>" }
{ "text": "Case D: d", "html": "<p>Case D: <code><strong sourcedelimiter=\"**\">d</strong></code></p>" }
{ "text": "Case A: a *", "html": "<p>Case A: <em sourcedelimiter=\"*\">a </em><code><em sourcedelimiter=\"*\">*</em></code></p>" }
```

`<em>`/`<strong>` **is** inside `<code>`. Case A correctly has the inner `<em>` wrapping the `*` inside `<code>`, with the outer `<em>` handling the `a ` text.

### (2) Italic + bold ARE applied to inline code

Computed-style probe via `getComputedStyle`:

| Element | Text | font-style | font-weight | font-family |
| --- | --- | --- | --- | --- |
| `<em>` inside `<code>` | `c` | **italic** | 400 | JetBrains Mono Variable |
| `<strong>` inside `<code>` | `d` | normal | **700** (bold) | JetBrains Mono Variable |
| `<em>` inside `<code>` | `*` | **italic** | 400 | JetBrains Mono Variable |

Fresh screenshot at 2× DPR (see `qa-023-rendered.png` / `qa-023-live.png` comparison) shows:
- Case C `c` is visibly italic inside the code box
- Case D `d` is visibly bold inside the code box
- Case A `*` is visibly italic inside the code box

The prior `qa-023-canonical.png` screenshot (used by the original audit) was at a lower resolution; italic on a single lowercase character in a small monospaced font is easy to misread as upright at that zoom.

---

## Why the DOMSerializer path is correct

The schema's mark-rank order (confirmed via `getSchema(sharedExtensions)`):

| Rank | Mark | spec.code | excludes |
| --- | --- | --- | --- |
| 0 | code | true | `""` (widened by `CodeMarkFidelity`, US-017) |
| 1 | strike | false | undefined |
| 2 | underline | false | undefined |
| 3 | highlight | false | undefined |
| 4 | emphasis | false | undefined |
| 5 | strong | false | undefined |
| 6 | link | false | undefined |
| 7 | escapeMark | false | `""` |

`code` is at rank 0 (outermost), so `DOMSerializer.serializeFragment` renders `<code>…</code>` as the outer wrapper with `<em>`/`<strong>` nested inside — the correct CommonMark semantic (`<em>` wrapping `<code>` at the source level, but the DOM nests outer-to-inner by mark rank for the final render). Italic and bold styles apply through CSS inheritance as expected.

---

## Classification (per `/assess-findings`)

**QA-023 finding: Incorrect.** The underlying premise — that the editor renders inline code with other marks as visually broken — is factually wrong. The render works correctly.

No code change required. QA-023 status flipped to `validated` with `resolvedBy: "parent"` citing this evidence.

---

## Implication for Ship Summary

- **Deferred scope item "Render-layer follow-up for Code mark widening"**: withdrawn. No follow-up needed.
- **R24 / US-017 schema widening is complete end-to-end**: schema, parse, serialize, round-trip idempotence, **and** live render all correct.
- The "don't revert the schema widen" directive in the original US-017 AC was sound guidance, but the premise it guarded against (broken render) never actually manifested in the live editor.
