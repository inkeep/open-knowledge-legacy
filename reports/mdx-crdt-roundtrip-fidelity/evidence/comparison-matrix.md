# Evidence: Comparison Matrix

**Dimension:** D5 — Comparison of both architectures across MDX constructs
**Date:** 2026-04-07
**Sources:** Synthesis of D1-D4 evidence

---

## Comparison Matrix

### Rating Scale
- **Excellent:** Works out of the box, no custom code
- **Good:** Works with minor, well-understood custom code (<100 LOC)
- **Fair:** Requires moderate custom code (100-500 LOC) with some edge cases
- **Poor:** Requires significant custom code (500+ LOC) or has fundamental limitations
- **Broken:** Cannot work without architectural changes

---

### JSX Component Blocks (self-closing: `<Chart />`)

| Criterion | Observer Sync (Expl 1+2) | Y.Text Canonical (Expl 6) |
|-----------|--------------------------|---------------------------|
| Fidelity | **Good** — stored as atom node, serialized as fenced code block, round-trips cleanly | **Good** — stored as raw text in Y.Text, needs parser to recognize as component |
| Concurrent safety | **Excellent** — atom node: concurrent edits to the component are LWW on the string attribute | **Fair** — character-level CRDT: concurrent edits near/inside the tag can corrupt syntax |
| Agent ergonomics | **Fair** — agent must construct fenced code block or use DirectConnection API | **Excellent** — agent inserts raw JSX text at any position |
| Complexity | **Good** — existing jsx-component extension handles this | **Fair** — ProseMirror binding needs to detect JSX components in text stream |

### JSX Component Blocks (with children: `<Callout>text</Callout>`)

| Criterion | Observer Sync (Expl 1+2) | Y.Text Canonical (Expl 6) |
|-----------|--------------------------|---------------------------|
| Fidelity | **Good** — children stored as raw string in content attribute | **Good** — children are literal text |
| Concurrent safety | **Excellent** — entire component is one atom | **Poor** — edits inside children and edits to tag structure can interleave |
| Agent ergonomics | **Fair** — fenced code block encoding | **Excellent** — natural JSX insertion |
| Complexity | **Good** — existing extension | **Fair** — parser must handle open/close tag pairing |

### JSX Expression Props (`data={items.filter(i => i > 0)}`)

| Criterion | Observer Sync (Expl 1+2) | Y.Text Canonical (Expl 6) |
|-----------|--------------------------|---------------------------|
| Fidelity | **Good** — inside fenced code block, preserved verbatim | **Good** — raw text preserved |
| Concurrent safety | **Excellent** — atom node protects expression integrity | **Poor** — `{`, `}`, `>` are individual characters, deletions can break syntax |
| Agent ergonomics | **Fair** — must wrap in fenced code block | **Excellent** — write naturally |
| Complexity | **Good** — no special handling needed | **Fair** — parser must understand expression boundaries |

### Import Statements (`import { Chart } from './charts'`)

| Criterion | Observer Sync (Expl 1+2) | Y.Text Canonical (Expl 6) |
|-----------|--------------------------|---------------------------|
| Fidelity | **Fair** — stripped/cached like frontmatter, not in editor tree | **Excellent** — visible as text in Y.Text, fully editable |
| Concurrent safety | **Good** — cached, not in CRDT (no concurrent issues, but no collaboration either) | **Good** — top of file, unlikely to conflict with other edits |
| Agent ergonomics | **Poor** — agent must use separate metadata API, not content write | **Excellent** — agent inserts text at top of file |
| Complexity | **Fair** — needs strip/cache/prepend mechanism (exists for frontmatter) | **Good** — no special handling, just text |

### Export Statements (`export const metadata = {...}`)

| Criterion | Observer Sync (Expl 1+2) | Y.Text Canonical (Expl 6) |
|-----------|--------------------------|---------------------------|
| Fidelity | **Fair** — same strip/cache as imports | **Excellent** — visible text |
| Concurrent safety | **Good** — cached | **Good** — typically at top of file |
| Agent ergonomics | **Poor** — separate API needed | **Excellent** — text insertion |
| Complexity | **Fair** — same mechanism as imports | **Good** — no special handling |

### Inline JSX Expressions (`{variable}` in paragraph text)

| Criterion | Observer Sync (Expl 1+2) | Y.Text Canonical (Expl 6) |
|-----------|--------------------------|---------------------------|
| Fidelity | **Broken** — no representation in ProseMirror tree, passed as literal text | **Good** — preserved as text, but not rendered |
| Concurrent safety | N/A | **Fair** — brace pair can be split by concurrent edits |
| Agent ergonomics | **Poor** — cannot insert inline expressions | **Excellent** — text insertion |
| Complexity | **Poor** — would need inline node type + marked tokenizer extension | **Fair** — parser must detect inline expressions |

### Nested JSX (`<Layout><Card><Button /></Card></Layout>`)

| Criterion | Observer Sync (Expl 1+2) | Y.Text Canonical (Expl 6) |
|-----------|--------------------------|---------------------------|
| Fidelity | **Good** — stored as one atom node (flat string) | **Good** — raw text preserved |
| Concurrent safety | **Excellent** — one atom, LWW | **Poor** — deep nesting + character-level edits = high corruption risk |
| Agent ergonomics | **Fair** — fenced code block | **Excellent** — natural JSX |
| Complexity | **Good** — no special nesting handling | **Fair** — parser must track tag nesting depth |

### MDX Comments (`{/* comment */}`)

| Criterion | Observer Sync (Expl 1+2) | Y.Text Canonical (Expl 6) |
|-----------|--------------------------|---------------------------|
| Fidelity | **Broken** — no handling, parsed as paragraph text by marked | **Good** — preserved as text |
| Concurrent safety | N/A | **Good** — typically standalone line |
| Agent ergonomics | **Poor** — no insertion path | **Excellent** — text insertion |
| Complexity | **Poor** — needs marked tokenizer extension | **Good** — no special handling |

### Components with Markdown Children (MDX interleaving)

| Criterion | Observer Sync (Expl 1+2) | Y.Text Canonical (Expl 6) |
|-----------|--------------------------|---------------------------|
| Fidelity | **Poor** — markdown inside component stored as raw text, not rendered as markdown | **Fair** — raw text preserved, but ProseMirror binding would need to detect and render markdown regions within JSX |
| Concurrent safety | **Excellent** — one atom | **Poor** — interleaved markdown/JSX regions have complex boundaries |
| Agent ergonomics | **Fair** — fenced code block | **Excellent** — write naturally |
| Complexity | **Poor** — supporting this would mean partially parsing void node content | **Poor** — the hardest MDX construct for any editor |

---

## Summary Scores

| Criterion | Observer Sync Avg | Y.Text Canonical Avg |
|-----------|-------------------|---------------------|
| Fidelity | Fair-Good (handles well what it handles, but 3 constructs are broken/poor) | Good-Excellent (handles all constructs, some need custom parsing) |
| Concurrent safety | Excellent (atom node protection) | Fair-Poor (character-level corruption risk for structured syntax) |
| Agent ergonomics | Poor-Fair (fenced code blocks + separate APIs) | Excellent (natural text operations) |
| Complexity | Fair-Good (existing code covers core cases) | Fair (more parser work, less encoding work) |

---

## Gaps / follow-ups

* The concurrent safety gap in Y.Text canonical could be mitigated by "syntax-aware merge" or "region locking" — neither exists in Yjs
* The fidelity gap in observer sync is fundamental: marked cannot parse MDX, so MDX-only constructs have no path
