# I6: Path x Construct Test Matrix

**Date:** 2026-04-11
**Baseline:** 2d35736
**Depends on:** F3 (Layer A ≡ B for all 118 cases)

## Architectural reduction

All 11 IN paths and 9 OUT paths converge on `MarkdownManager` from `@tiptap/markdown` instantiated with `sharedExtensions`. Specifically:

- **Parse gate:** `mdManager.parse()` — every markdown-to-ProseMirror conversion
- **Serialize gate:** `mdManager.serialize()` — every ProseMirror-to-markdown conversion
- **CRDT layer:** transparent (F3 proved Layer A ≡ B on all 118 constructs)

This means any (IN × OUT) pair where both sides go through mdManager is **TRIVIAL** — the mdManager unit tests are the binding constraint. The CRDT layer adds no fidelity risk.

**Three classes of IN path by entry point:**

| Class | IN paths | Entry mechanism |
|-------|----------|-----------------|
| **mdManager-mediated** | IN2, IN5, IN6, IN7, IN8, IN9, IN11 | `mdManager.parse()` — full 118-construct surface |
| **ProseMirror-native** | IN1, IN3, IN4 | Schema-constrained node creation (typing, DOMParser, text insertion) |
| **Relay** | IN10 | CRDT sync — transparent relay of remote client's output |

**Two classes of OUT path by exit point:**

| Class | OUT paths | Exit mechanism |
|-------|-----------|---------------|
| **Serialize** | OUTa, OUTb, OUTc, OUTd | XmlFragment render (a), Y.Text display (b), `mdManager.serialize` (c), Y.Text read (d) |
| **Downstream-of-disk** | OUTe, OUTf, OUTg, OUTh, OUTi | Read bytes written by OUTc — fidelity ≡ OUTc fidelity |

## 99-cell matrix

Key: **T** = TRIVIAL (mdManager tests cover it), **V** = VARIANT (needs explicit test), **-** = N/A

| IN \ OUT | a WYSIWYG | b Source | c Disk | d API | e Docs | f ExtTool | g Diff | h Blame | i NPM |
|----------|-----------|----------|--------|-------|--------|-----------|--------|---------|-------|
| 1 WYSIWYG type | T | T | T | T | T | T | T | T | T |
| 2 Source type | T | T | T | T | T | T | T | T | T |
| 3 Browser paste | **V** | **V** | **V** | **V** | T | T | T | T | T |
| 4 Plain text paste | - | - | - | - | - | - | - | - | - |
| 5 External write | T | **V** | T | **V** | T | T | T | T | T |
| 6 agent-write-md | T | T | T | T | T | T | T | T | T |
| 7 agent-patch | T | T | T | T | T | T | T | T | T |
| 8 agent-undo | T | T | T | T | T | T | T | T | T |
| 9 Git branch switch | T | **V** | T | **V** | T | T | T | T | T |
| 10 CRDT sync | T | T | T | T | T | T | T | T | T |
| 11 Shadow restore | T | T | T | T | T | T | T | T | T |

**Totals: 82 TRIVIAL, 8 VARIANT, 9 N/A (IN4 is row-level N/A — 9 cells)**

### Why IN4 is N/A

Plain text paste inserts literal text nodes — no markdown construct parsing occurs. The construct fidelity matrix tests "does construct X survive path Y?" but IN4 doesn't create constructs. Paste of `# heading` via plain text creates a text node containing the literal string `# heading`, not a heading node.

### Why IN1 is TRIVIAL (not VARIANT)

WYSIWYG typing creates ProseMirror nodes via schema commands (the same `sharedExtensions` schema). These nodes have identical structure to nodes from `mdManager.parse()` — same attrs, same marks. Observer A then serializes via `mdManager.serialize()`. The schema-constrained subset (~30 of 118 constructs) is fully covered by serialize unit tests. Constructs outside the schema (HTML entities, backslash escapes, reference links) can't be created via WYSIWYG — they're N/A for IN1, not missing coverage.

### Why IN10 is TRIVIAL

CRDT sync relays the remote client's Y.Doc state. The local client receives pre-processed XmlFragment + Y.Text. F3 proved the CRDT transport is transparent. The fidelity is determined by whatever IN path the remote client used — no local code path adds fidelity risk.

### Why OUTe-i are TRIVIAL for all IN paths

All five read from disk. Disk content is written by OUTc (persistence via `mdManager.serialize`). If OUTc is byte-correct, downstream readers see byte-correct content. OUTe (Fumadocs/MDX) re-parses with remark, which is a rendering fidelity concern, not source-text fidelity — the bytes on disk are correct regardless.

## VARIANT descriptions

### V1: IN3 (browser paste) × OUTa/b/c/d — 4 cells, 1 test shape

**What's different:** TipTap's clipboard handler uses `DOMParser` (configured with `sharedExtensions`), not `mdManager.parse()`. HTML `<b>bold</b>` → ProseMirror Bold mark → `mdManager.serialize()` → `**bold**`. The DOMParser path may produce different node attributes than the markdown parse path for equivalent content (e.g., link `title` attrs, code block `language`, table cell alignment).

**Fidelity risk:** Medium-high. Rich-text paste from external sources (Google Docs, Notion, web pages) produces non-trivial HTML that DOMParser must map to schema nodes. Mismatched attrs → wrong serialize output → corrupted disk file.

**Test shape (integration, Playwright):**
1. Construct clipboard HTML for each schema-supported construct (headings, bold/italic, links, images, lists, tables, code blocks, blockquotes)
2. Paste into WYSIWYG via `page.evaluate(() => document.execCommand('paste'))`
3. Read Y.Text (via `/api/document`) and disk file
4. Assert byte-equality with expected canonical markdown

**Constructs to cover:** ~15 (schema-supported subset that appears in clipboard HTML). Priority: links with title, tables with alignment, nested lists, code blocks with language.

### V2: IN5/IN9 (external write / git branch switch) × OUTb/OUTd — 4 cells, 1 test shape

**What's different:** `createExternalChangeHandler` writes raw file content to Y.Text (`ytext.insert(0, content)`) alongside the mdManager-parsed XmlFragment. Y.Text initially holds the non-canonical form (e.g., `## H\nP` instead of `## H\n\nP`). Observer A on the client eventually converges Y.Text to canonical form, but there's a window where OUTb (source render) and OUTd (API read) return non-canonical markdown.

**Fidelity risk:** Low. The non-canonical window is bounded by Observer A's debounce (50ms) + network latency. The risk is that an API consumer (agent, MCP tool) reads Y.Text during this window and gets non-canonical content. Functional impact: agent patch `find` fails because it matches against canonical form but Y.Text has raw form.

**Test shape (integration):**
1. Write a file with non-canonical markdown to disk
2. Wait for file watcher to propagate
3. Immediately read `/api/document` — assert content equals raw file content OR canonical form
4. Wait 200ms, read again — assert content equals canonical form
5. Key constructs: headings without blank-line separation, lists with inconsistent indentation

## Consolidated test plan

### New tests needed beyond 5-tier strategy

| # | Test | Level | Harness | VARIANT cells covered | Priority |
|---|------|-------|---------|----------------------|----------|
| 1 | Browser paste construct fidelity | e2e | Playwright | V1 (4 cells) | P0 |
| 2 | External write Y.Text convergence | integration | Hocuspocus + test client | V2 (4 cells) | P1 |

**Total new tests: 2 test files** (one Playwright e2e, one integration), covering all 8 VARIANT cells.

### Why so few?

The `mdManager` singleton with `sharedExtensions` is the architectural chokepoint. Every path feeds through it. F3's Layer A ≡ B proof collapses the CRDT dimension. The 118-case construct catalog at the mdManager level covers 77 of 99 cells automatically. The remaining 8 VARIANT cells collapse to 2 independent test shapes because multiple cells share the same underlying code path.

### Highest-risk path

**IN3 × OUTc (browser paste → persistence)** is the highest-risk VARIANT. It's the only path where the parse entry point (`DOMParser`) differs from the standard parse entry point (`mdManager.parse`), AND the result hits disk. Users paste from external sources daily — this is a high-traffic path with a non-standard parser. If a construct survives `mdManager.parse` but not `DOMParser`, the corruption is silent until the user opens source mode or runs `git diff`.
