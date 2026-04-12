---
title: "How Markdown Editors Handle Paste + Raw HTML: A 15-Editor Landscape Survey"
description: "Comparative survey of how 15 markdown-capable editors handle two interrelated problems: pasting markdown/HTML content from external sources, and rendering raw HTML embedded in markdown. Covers WYSIWYG (TipTap, Notion, Typora, AFFiNE, Bear, Milkdown, Plate), source-based (Obsidian, VS Code, HackMD/HedgeDoc), and newer frameworks (Lexical, Ghost, Logseq, StackEdit, Anytype, iA Writer). Classifies each into behavioral archetypes and extracts decision triggers for a TipTap-based collaborative knowledge base."
createdAt: 2026-04-11
updatedAt: 2026-04-11
subjects:
  - TipTap
  - Notion
  - Obsidian
  - Typora
  - AFFiNE
  - Milkdown
  - Plate
  - Lexical
  - Ghost
  - Logseq
  - HedgeDoc
  - VS Code
  - StackEdit
  - Bear
  - iA Writer
topics:
  - clipboard paste behavior
  - HTML-in-markdown rendering
  - editor UX patterns
  - sanitization approaches
---

# How Markdown Editors Handle Paste + Raw HTML: A 15-Editor Landscape Survey

**Purpose:** Map the behavioral landscape of how markdown editors handle pasted content and raw HTML, to inform a dedicated paste-UX spec for Open Knowledge (a TipTap-based collaborative WYSIWYG editor with markdown-as-canonical-source).

---

## Executive Summary

Across 15 editors spanning WYSIWYG, source-based, block-based, and hybrid architectures, two clear spectrums emerge:

**For paste handling,** the industry splits into 4 archetypes. **No editor uses a confirmation toast** — the pattern is either aggressive silent auto-detection (Notion, Typora, Obsidian, Logseq) or no detection at all (TipTap default, VS Code, iA Writer, Lexical). The "markdown-first" editors (Milkdown, Plate) sidestep the problem entirely by always parsing `text/plain` as markdown. `Cmd+Shift+V` as the plain-text escape hatch is universal where auto-detection exists.

**For HTML rendering in markdown,** the majority of editors **do not render arbitrary raw HTML inline** — they either strip it, show it as literal text, or confine it to a dedicated block type. Only 4 of 15 editors (Typora, VS Code, StackEdit, HedgeDoc) render raw HTML inline with sanitization. The emerging pattern for WYSIWYG editors is **card-based HTML blocks** (Ghost's `HtmlCard`, AFFiNE's HTML code block) — a dedicated, sandboxed container rather than inline rendering.

**Key Findings:**

- **Notion is the UX gold standard for paste** — silent auto-detect, `Cmd+Shift+V` escape, no false-positive complaints in documentation. Their detection appears to key on block-level constructs (headings, lists) rather than inline marks.
- **No editor has solved arbitrary-HTML-in-WYSIWYG well.** Even Typora (the most capable) strips attributes in rendering while preserving them on export. The pattern is either "source-mode renders it, WYSIWYG doesn't" or "dedicated block type."
- **Ghost's `HtmlCard` with DOMPurify is the closest pattern to our Tier 3 `htmlBlock` design** — atomic node, sandboxed render via `dangerouslySetInnerHTML`, sanitized.
- **TipTap's ecosystem HAS a paste-detection pattern** (official docs show example `handlePaste` plugin with regex heuristics) but it's opt-in, not default. The community fork `tiptap-markdown` adds `transformPastedText` but defaults to `false`.
- **Security approaches vary wildly:** DOMPurify (Ghost, HedgeDoc), CSP nonce (VS Code), custom allowlist (StackEdit, Logseq), schema-gate (TipTap, Milkdown, Plate), none (Lexical). No consensus standard.

---

## Research Rubric

| # | Dimension | Depth | Priority |
|---|---|---|---|
| D1 | Paste handling: detection strategy, default behavior, syntax coverage, HTML conversion, sanitization, escape hatches | Deep | P0 |
| D2 | HTML-in-markdown rendering: inline render vs sandbox vs raw text, editability, round-trip fidelity, security | Deep | P0 |
| D3 | Cross-dimension interactions: how paste and HTML rendering interact within each editor | Moderate | P1 |

**Stance:** Factual with conclusions. Decision triggers link recommendations to evidence.

---

## Detailed Findings

### D1: Paste Handling — 4 Behavioral Archetypes

**Evidence:** [evidence/c1-prosemirror-wysiwyg.md](evidence/c1-prosemirror-wysiwyg.md), [evidence/c2-source-based.md](evidence/c2-source-based.md), [evidence/c3-block-wysiwyg.md](evidence/c3-block-wysiwyg.md), [evidence/c4-pure-wysiwyg-markdown.md](evidence/c4-pure-wysiwyg-markdown.md), [evidence/c5-newer-frameworks.md](evidence/c5-newer-frameworks.md)

| Archetype | Editors | Behavior | MIME priority | Escape hatch |
|---|---|---|---|---|
| **A. No detection** (passthrough) | TipTap (default), VS Code, iA Writer, Lexical | `text/plain` inserted as literal text. No markdown parsing on paste. | text/plain only | N/A |
| **B. Aggressive silent auto-detect** | Notion, Typora, Obsidian, Logseq, Bear | Silently detect and parse markdown from `text/plain`. HTML from `text/html` converted to native format. | text/html > text/plain | `Cmd+Shift+V` |
| **C. MIME-type priority cascade** | AFFiNE, StackEdit, HedgeDoc | Check `text/html` first; if absent, fall back to `text/plain` with markdown parsing. | text/html > text/plain | Varies |
| **D. Markdown-first** (always parse) | Milkdown, Plate | ALL `text/plain` paste is parsed as markdown by default. No detection heuristic needed. | text/plain → markdown parser | `parser: null` opt-out |

**Archetype B is the market default for user-facing editors.** Notion, Typora, and Obsidian represent the three most popular markdown-adjacent editors, and all use aggressive silent detection. Users of these editors expect pasted markdown to "just work."

**Archetype D (Milkdown/Plate) is most aligned with "source text model"** — if the editor treats markdown as its canonical format, parsing ALL text input as markdown is architecturally consistent. False positives are mitigated by the schema gate: pasting "Hello *world*" produces a paragraph with italic "world" which is semantically equivalent to the markdown interpretation.

**Detection heuristics (when documented):**

| Editor | Heuristic | Source |
|---|---|---|
| TipTap (example) | Regex: `^#{1,6}\s`, `\*\*[^*]+\*\*`, `\[.+\]\(.+\)`, `^[-*+]\s` | Official docs example code |
| Logseq | Regex: `[-+*]` or `#+` at line start | Source code |
| Notion | Undocumented; appears to key on block constructs (headings, lists, code fences) | Community observation |
| Obsidian | MIME-type based (`text/html` detected → convert via Turndown) | v0.10.3 changelog |

**Implications for Open Knowledge:**

- Our Archetype A default (TipTap passthrough) is the weakest UX position among our peers. Users coming from Notion, Obsidian, or Typora will expect paste to "just work."
- Archetype D (always-parse) is architecturally consistent with our source-text model but requires high schema fidelity to avoid false-positive corruption.
- TipTap's official docs already provide a `handlePaste` example with regex heuristics — we can adopt rather than invent.
- `Cmd+Shift+V` as escape hatch is universal and should be documented regardless of detection approach.

**Decision triggers:**
- If user persona is "developers who paste markdown from terminals/READMEs" → Archetype B or D
- If user persona includes "non-technical users who paste from web/email" → Archetype A or C
- If false-positive cost is high (corrupts pasted content) → Archetype A with explicit opt-in

---

### D2: HTML-in-Markdown Rendering — 4 Behavioral Archetypes

| Archetype | Editors | Behavior | Security | Round-trip? |
|---|---|---|---|---|
| **W. Full inline render with sanitization** | Typora, VS Code (preview), StackEdit (preview), HedgeDoc | Raw HTML renders as actual HTML with tag/attribute filtering | DOMPurify / CSP / custom allowlist | Yes (source-based) or partial (Typora strips attrs) |
| **X. Sandboxed / card-based render** | AFFiNE (HTML code block), Ghost (HtmlCard) | HTML confined to a dedicated block type, rendered in sandbox/iframe or via `dangerouslySetInnerHTML` + DOMPurify | DOMPurify + containment | Yes (card content round-trips) |
| **Y. Preview-only render** | Obsidian (Reading View), iA Writer (Preview) | HTML renders in read-only preview mode but NOT in the editor/live-preview | Varies | Yes (source file untouched) |
| **Z. No render / strip / literal text** | Notion, Bear, Milkdown, Plate, Lexical, Logseq, Anytype | HTML tags shown as literal text, silently stripped, or dropped | Schema gate (structural) | No (HTML lost on round-trip) |

**Archetype Z is the overwhelming majority (7 of 15).** Most editors do not attempt to render arbitrary HTML in markdown. This is the "safe default" — no XSS surface, no rendering complexity, no round-trip concern.

**Archetype X (card-based) is the emerging pattern for WYSIWYG editors that want HTML support.** Ghost's `HtmlCard` approach — atomic block node, content stored as string attribute, rendered via `dangerouslySetInnerHTML` after DOMPurify sanitization — directly parallels our Tier 3 `htmlBlock` design from the source-text fidelity spec. AFFiNE's HTML code block with iframe preview is a similar pattern.

**Archetype W (full inline render) only works for source-first editors** where the editor view is read-only (VS Code preview, StackEdit preview) or where the source is canonical (Typora, HedgeDoc). In a WYSIWYG editor where users edit inline, full HTML render creates a two-way problem: the user can visually see HTML-rendered content but can't edit it without switching to source mode, and the editor must decide whether to let users accidentally break the HTML structure via rich-text editing.

**Implications for Open Knowledge:**

- Our Tier 3 `htmlBlock` (atom:true, raw HTML stored as string attribute) aligns with Archetype X — the emerging industry pattern for WYSIWYG editors.
- Full inline render (Archetype W) is NOT viable for our dual-mode architecture — it requires source-mode-only editing for HTML blocks, which is what atom:true achieves.
- Our NG4 decision (no storage-layer sanitization) means we need render-layer sanitization. Ghost's DOMPurify + `dangerouslySetInnerHTML` is the closest reference implementation.
- The "no render" majority (Archetype Z) validates that NOT rendering HTML is a legitimate default — users can always switch to source mode to see their HTML.

**Decision triggers:**
- If HTML-in-markdown is a common user workflow → Archetype X (card-based, sandboxed)
- If HTML-in-markdown is rare and user trust is high → Archetype Z (strip/literal text) is acceptable
- If security is a hard requirement → Archetype X with DOMPurify (Ghost pattern)

---

### D3: Cross-Dimension Interactions

**Pattern 1: Aggressive paste + full HTML render = maximum fidelity, maximum risk.**
Typora is the only editor that does BOTH aggressive paste detection AND full inline HTML rendering. It's also the only one with a documented historical RCE (via `file://` URIs in HTML blocks). Maximum capability = maximum attack surface.

**Pattern 2: No detection + no render = safest, weakest UX.**
TipTap (default), Lexical, and Plate (with defaults) give users no help with either dimension. Content arrives as literal text; HTML tags are dropped or shown as text. Zero risk, zero convenience.

**Pattern 3: Aggressive paste + no HTML render = the Notion pattern.**
Notion auto-detects markdown on paste (strong UX) but does NOT render raw HTML (safe). HTML in markdown becomes literal text. This is a pragmatic middle ground: help with the common case (pasting markdown), don't help with the rare case (embedding raw HTML).

**Pattern 4: Source-first architecture sidesteps both problems.**
Obsidian, VS Code, HackMD, iA Writer — all source-first editors — have inherently clean HTML round-trip (the file IS the source) and only need paste handling for UX convenience. They can afford aggressive paste detection without round-trip risk because there's no serialize step that could corrupt.

**Implication for Open Knowledge:** We're a WYSIWYG editor with a serialize step. Pattern 3 (Notion-like: aggressive paste + no inline HTML render, card-based for HTML blocks) is the safest high-UX option for our architecture.

---

## Comparison Table

| Editor | Arch | Paste detect? | Default | Escape hatch | HTML render? | Sanitization | Round-trip HTML? |
|---|---|---|---|---|---|---|---|
| **TipTap** | WYSIWYG | No (opt-in) | Passthrough | N/A | Schema-gate only | None (schema) | No |
| **Milkdown** | WYSIWYG | Always parse | Markdown-first | `parser: null` | Stripped | None (remark) | No |
| **Plate** | WYSIWYG | Always parse | Markdown-first | `parser: null` | Stripped | None (schema) | No |
| **Notion** | Block | Yes (silent) | Auto-detect | `Cmd+Shift+V` | No | N/A | No |
| **AFFiNE** | Block | MIME cascade | Auto-detect | N/A | Card (iframe) | Sandbox | Card only |
| **Anytype** | Block | Partial | Auto-detect | Late addition | No | N/A | No |
| **Typora** | WYSIWYG | Yes (HTML-first) | Auto-detect | `Cmd+Shift+V` | Full inline | Custom strip | Partial (attrs stripped) |
| **Bear** | WYSIWYG | Yes (RTF) | Auto-detect | `Cmd+Shift+V` | No | N/A | No |
| **iA Writer** | Source | No | Passthrough | N/A | Preview only | MultiMarkdown | Yes (source) |
| **Obsidian** | Hybrid | Yes (MIME) | Auto-detect | Toggle | Preview + partial LP | DOMPurify | Yes (source) |
| **VS Code** | Source | No (URL only) | Passthrough | N/A | Preview (CSP) | CSP nonce | Yes (source) |
| **HedgeDoc** | Source | No (tables only) | Passthrough | N/A | Full (DOMPurify) | DOMPurify | Yes (source) |
| **Lexical** | Framework | No | Passthrough | N/A | No | `IGNORE_TAGS` | No |
| **Ghost** | WYSIWYG | Plugin | Explicit | Shift bypass | Card (DOMPurify) | DOMPurify | Card only |
| **Logseq** | Outliner | Yes (regex) | Auto-detect | N/A | Partial (broken) | Custom allowlist | Partial |
| **StackEdit** | Source | Yes (HTML-first) | Auto-detect | N/A | Preview (markdown-it) | Custom allowlist | Yes (source) |

---

## Recommendations for Open Knowledge

### Paste handling

**Recommended approach: Archetype D (markdown-first) with configurable opt-out.**

Evidence-backed reasoning:
1. Our architecture treats markdown as canonical source (source-text model). Parsing ALL `text/plain` as markdown is architecturally consistent.
2. Milkdown and Plate (our closest architectural peers) both default to always-parse.
3. Our ProseMirror schema acts as a structural filter — unrecognized syntax produces text nodes, not corruption. False-positive risk is lower than in a free-text editor.
4. TipTap's official docs already provide the `handlePaste` pattern; our implementation hooks into existing infrastructure.
5. `Cmd+Shift+V` is the universal escape hatch and requires zero custom UI.

**Alternative if false-positive risk proves real:** Archetype B (Notion-pattern) with conservative detection keyed on block-level constructs only (headings, lists, code fences) — NOT inline marks. Escalate to confirmation-toast (no editor does this today, but it's the lowest-false-positive option).

### HTML rendering

**Recommended approach: Archetype X (card-based, Ghost pattern) for block HTML; Archetype Z (no render) for inline HTML.**

Evidence-backed reasoning:
1. Our Tier 3 `htmlBlock` design (atom:true, raw source as string attribute) directly maps to Ghost's `HtmlCard` pattern.
2. No WYSIWYG editor has solved inline HTML rendering well. Typora comes closest but strips attributes (partial fidelity). For a source-text-fidelity editor, partial render is worse than no render.
3. DOMPurify is the dominant sanitization choice (Ghost, HedgeDoc, Obsidian). One dependency, well-maintained, OWASP-aligned.
4. Users can always switch to source mode to see raw HTML — our dual-mode architecture provides the escape valve.

---

## Limitations & Open Questions

### Dimensions Not Fully Covered
- **Mobile paste behavior:** All research focused on desktop. Mobile clipboard APIs differ.
- **Drag-and-drop:** Related to paste but uses `drop` event, different clipboard access pattern.
- **Cross-editor paste:** What happens when you paste FROM Notion INTO our editor, or vice versa?

### Out of Scope (per Rubric)
- Implementation cost analysis for any specific approach
- TipTap plugin development specifics (covered in fidelity spec evidence/i4)
- Security threat modeling beyond sanitization approach identification

---

## References

### Evidence Files
- [evidence/c1-prosemirror-wysiwyg.md](evidence/c1-prosemirror-wysiwyg.md) — TipTap, Milkdown, Plate (128 lines)
- [evidence/c2-source-based.md](evidence/c2-source-based.md) — Obsidian, VS Code, HedgeDoc (114 lines)
- [evidence/c3-block-wysiwyg.md](evidence/c3-block-wysiwyg.md) — Notion, AFFiNE, Anytype (95 lines)
- [evidence/c4-pure-wysiwyg-markdown.md](evidence/c4-pure-wysiwyg-markdown.md) — Typora, Bear, iA Writer (93 lines)
- [evidence/c5-newer-frameworks.md](evidence/c5-newer-frameworks.md) — Lexical, Ghost, Logseq, StackEdit (127 lines)

### Related Research
- [reports/markdown-construct-fidelity-catalog/](../markdown-construct-fidelity-catalog/) — 118-case construct-level fidelity analysis (informs what constructs paste must preserve)
- [reports/source-toggle-architecture/](../source-toggle-architecture/) — WYSIWYG ↔ source architecture assessment (informs how paste interacts with dual-mode editing)
- [specs/2026-04-11-markdown-source-text-fidelity/evidence/i3-paste-and-frontmatter.md](../../specs/2026-04-11-markdown-source-text-fidelity/evidence/i3-paste-and-frontmatter.md) — TipTap paste pipeline source-level trace
