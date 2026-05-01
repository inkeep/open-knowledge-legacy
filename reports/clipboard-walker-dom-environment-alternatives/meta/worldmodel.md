---
name: worldmodel-clipboard-walker-dom-alternatives
description: Topology snapshot for the clipboard-walker-dom-environment-alternatives report
type: meta
date: 2026-05-01
---

# Worldmodel: Clipboard Walker DOM Environment Alternatives

## Topic framing

OK shipped a clipboard walker (PR #386) that runs at copy time in the browser, reads `view.nodeDOM(pos)` from live ProseMirror+React DOM, calls `getComputedStyle(el)` to inline computed styles (post-`convertCssColors` for oklch→rgb), sanitizes attrs, and emits text/html for cross-app paste.

**Question:** Are happy-dom / jsdom / linkedom / parse5 / cheerio / juice / react-email / Premailer viable ALTERNATIVES, or orthogonal tools?

**Stance:** Conclusions — produce architectural decision framework + ranked recommendation.

**Framing:** 3P / external library + pattern research; no first-party codebase analysis.

## Surfaces investigated

| Surface | Channel | Purpose |
|---|---|---|
| DOM environments (Node/headless) | npm, GitHub | jsdom, happy-dom, linkedom, parse5, cheerio, htmlparser2 |
| CSS-inlining tools | npm, GitHub | juice, juice/client, Premailer, react-email/tailwind, mailing |
| Browser-time JIT Tailwind | GitHub | Twind, jit-browser-tailwindcss, Tailwind v4 `compile()` |
| Live-DOM walker prior art | GitHub | html-to-image, dom-to-image, html2canvas, computed-style-to-inline-style |
| Hidden-iframe rendering | GitHub, MDN | Patterns from screenshot/email-preview tooling |
| Declarative hast emit | GitHub, unified.js | hastscript, hast-util-to-html |
| ProseMirror clipboard pipeline | GitHub | prosemirror-view/src/clipboard.ts |

## Entities + terminology

| Entity | Role | Notes |
|---|---|---|
| `getComputedStyle(el)` | DOM API | Returns resolved computed style for live element. CSSOM-bound. |
| CSSOM | Web standard | CSS Object Model; required for `getComputedStyle` semantics |
| `style.cssText` | DOM API | Serializes inline style declaration |
| `view.nodeDOM(pos)` | ProseMirror API | Returns the DOM node rendered for a PM position |
| `clipboardSerializer` / `transformCopied` | ProseMirror | Hooks for clipboard emission |
| `oklch()` color | CSS Color Module 4 | Tailwind v4 default; not supported by Gmail/Outlook 2024-2025 |
| Activity-hidden | React 19.2 | `<Activity mode="hidden">` unmounts subtree DOM |
| MDX descriptor | OK pipeline | JSX components with optional hidden state, declarative props |
| hast | unified.js | HTML AST format (rehype/remark interchange) |

## Prior research (existing reports — reference, do not re-derive)

| Report | Coverage relevant to current question | Reference policy |
|---|---|---|
| [`reports/cross-app-clipboard-icon-rendering/REPORT.md`](../../cross-app-clipboard-icon-rendering/REPORT.md) | Cross-app destination matrix (Gmail/Outlook/Notion/Slack/GDocs strip inline `<svg>`); Unicode glyph replacement recommendation. | **Reference for destination behavior** — do not re-derive paste matrix. |
| [`reports/tiptap-clipboard-round-trip-markdown/REPORT.md`](../../tiptap-clipboard-round-trip-markdown/REPORT.md) (2026-04-30 amendment) | Patterns X (live-DOM walker), Y (shared style-token TS module), Z (react-email-style SSR), W (runtime Tailwind in-browser via Twind / jit-browser / v4 compile). Also: html-to-image / dom-to-image library family, perf data on `getComputedStyle`, Activity-hidden gotcha, pseudo-element gotcha, Tailwind v4 oklch/`@theme` notes. | **Reference for Patterns A/B/C and library prior art** — build on, don't re-derive. New report extends with library-level depth (D1, D2) and the hidden-iframe pattern (D7, novel). |

## 3P landscape (key OSS sources for evidence)

| Library | Repo | Role |
|---|---|---|
| jsdom | github.com/jsdom/jsdom | Most-complete Node DOM impl, has CSSOM |
| happy-dom | github.com/capricorn86/happy-dom | Faster, lighter Node DOM (Vitest default) |
| linkedom | github.com/WebReflection/linkedom | Spec-light, fastest pure-JS DOM |
| parse5 | github.com/inikulin/parse5 | HTML5 parser (used by jsdom internally) |
| cheerio | github.com/cheeriojs/cheerio | jQuery-like server HTML manipulation |
| htmlparser2 | github.com/fb55/htmlparser2 | Streaming HTML parser (used by cheerio) |
| juice | github.com/Automattic/juice | Node CSS-inliner; `juice/client` browser bundle |
| Premailer | github.com/premailer/premailer | Ruby CSS-inliner |
| react-email | github.com/resend/react-email | Email-template framework with Tailwind |
| Twind | github.com/tw-in-js/twind | Runtime Tailwind-in-JS (stalled) |
| jit-browser-tailwindcss | github.com/mhsdesign/jit-browser-tailwindcss | Browser Tailwind v3 compiler |
| html-to-image | github.com/bubkoo/html-to-image | Live-DOM walker library |
| computed-style-to-inline-style | github.com/lukehorvat/computed-style-to-inline-style | Pure walker primitive |
| hastscript / hast-util-to-html | github.com/syntax-tree | hast tree construction + serialization |

## Patterns observed (a priori, before evidence capture)

| Pattern | Where it runs | DOM environment | What it requires |
|---|---|---|---|
| **A. Live-browser walker** (current OK) | Browser, copy time | Live browser DOM + CSSOM | `view.nodeDOM(pos)`, `getComputedStyle` |
| **B. SSR + jsdom + juice** (react-email model) | Node build/SSR | jsdom or happy-dom | React-render → HTML → load `<style>` → juice inlines |
| **C. JIT Tailwind + walker hybrid** | Browser, copy time | Live DOM + JIT compiler | walker + jit-browser-tailwindcss / Twind |
| **D. Hidden-iframe render-and-walk** | Browser, copy time | iframe with own document + CSSOM | `<iframe>`, React mount, walker reads iframe DOM |
| **E. Declarative hast emit** (escape hatch) | Anywhere (no DOM) | None | `descriptor.toClipboardHast(props): Hast` |

## Connections + dependencies

- React 19 + ProseMirror are non-negotiable (per non-goals)
- Tailwind v4 → uses `oklch()` colors not supported by Gmail (per cross-app-clipboard-icon-rendering report) → `convertCssColors` post-walk is mandatory
- MDX descriptors with optional hidden state → must work without live DOM in some cases
- Cross-app destinations: Gmail (strict CSS allowlist), Notion, Slack (rich_text_block schema), Outlook (web + desktop), Google Docs

## Patterns to investigate (rubric-matching)

The rubric maps directly:
- D1 → DOM library survey (Node-side comparators for B and Premailer-style flows)
- D2 → CSS-inliner survey (juice/Premailer/react-email/mailing)
- D3 → Browser JIT Tailwind (refresh from prior)
- D4 → Pattern A (current OK approach)
- D5 → Pattern B (SSR + jsdom + juice)
- D6 → Pattern C (JIT + walker hybrid)
- D7 → Pattern D (hidden-iframe — novel)
- D8 → Pattern E (declarative hast)
- D9 → Failure-mode matrix
- D10 → Recommendation

## Unresolved/adjacent

- **NEW (D7):** Hidden-iframe render-and-walk pattern — not surveyed in any prior report. Used by html-to-image's `iframe` mode for accurate computed-style capture; used by email-preview tools like react-email's `Preview` component; used by some screenshot-extension code. What does it cost? What does it enable that the current walker can't?
- **NEW (D1 depth):** What does each Node-side DOM library actually support for `getComputedStyle` + `style.cssText`? jsdom is famously partial; happy-dom claims `getComputedStyle` support; linkedom does not have a CSSOM. Prior report did not break this down at library level.
- **NEW (D9):** Cross-cutting failure-mode matrix — concrete cells for each (Pattern × failure-mode).

## Headless mode notes

- Worldmodel scan: prior reports give partial coverage of D3, D4 (refresh-only). D1, D2, D5, D7 require fresh research. D6 partial. D8 partial.
- Routing: Path A (formal report), full rigor. Subagents for D1, D2, D5, D7. Self-handle D3, D4, D6, D8 from prior reports. Synthesize D9, D10.
- Skip /audit per user request.
