# Evidence: D2 — Root cause of entity corruption (`encodeHtmlEntities` in `@tiptap/core`)

**Dimension:** D2 — Library-level serializer behavior
**Date:** 2026-04-11
**Sources:** `node_modules/@tiptap/core/src/utilities/htmlEntities.ts`, `node_modules/@tiptap/markdown/src/MarkdownManager.ts`
**Library versions:** `@tiptap/markdown@3.22.3`, `@tiptap/core@3.22.3`
**Baseline commit:** 2d35736

---

## TLDR

The literal-character corruption (`&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`) originates in `@tiptap/core`'s `encodeHtmlEntities` function. `@tiptap/markdown` calls it on every text node during serialization **except** when the node is inside a code context (code mark or code-block parent). The design is intentional — it exists to round-trip HTML-block content back through markdown — but it corrupts literal body text for every author who writes `&`, `<`, or `>` in paragraphs, headings, lists, tables, or link text.

---

## Source code trace

### The encoder

`node_modules/@tiptap/core/src/utilities/htmlEntities.ts` (26 lines total):

```typescript
/**
 * Decode common HTML entities in text content so they display as literal
 * characters inside the editor.  The decode order matters: `&amp;` must be
 * decoded **last** so that doubly-encoded sequences like `&amp;lt;` first
 * survive the `&lt;` pass and then correctly become `&lt;` (not `<`).
 */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

/**
 * Encode HTML special characters so they roundtrip safely through markdown.
 * `&` is encoded **first** to avoid double-encoding the ampersand in other
 * entities (e.g. `<` → `&lt;`, not `&amp;lt;`).
 *
 * Note: `"` is intentionally NOT encoded here because double quotes are
 * ordinary characters in markdown and do not need escaping.  The decode
 * function still handles `&quot;` because the markdown tokenizer may emit it.
 */
export function encodeHtmlEntities(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

**CONFIRMED** — this is the *only* place these three characters are escaped. The pattern is symmetric on the decode side (plus `&quot;`), so `encode(decode(x))` is the identity for well-formed entity strings. **But `encode(x)` is not the identity for literal characters** — that's where the corruption comes from.

### The call site in `MarkdownManager`

`node_modules/@tiptap/markdown/src/MarkdownManager.ts:15` imports the helpers:

```typescript
import {
  decodeHtmlEntities,
  encodeHtmlEntities,
  // ...
} from '@tiptap/core'
```

**The encode path** — `MarkdownManager.ts:901-911`:

```typescript
/**
 * Encode HTML entities in text unless the node is inside a code context
 * (code mark or code-block parent) where literal characters should be preserved.
 */
private encodeTextForMarkdown(text: string, node: JSONContent, parentNode?: JSONContent): string {
  const isInsideCode =
    (parentNode?.type != null && this.codeTypes.has(parentNode.type)) ||
    (node.marks || []).some(m => this.codeTypes.has(typeof m === 'string' ? m : m.type))

  return isInsideCode ? text : encodeHtmlEntities(text)
}
```

Called from `renderNodeToMarkdown` at line 923:

```typescript
if (node.type === 'text') {
  return this.encodeTextForMarkdown(node.text || '', node, parentNode)
}
```

**Execution trace for `# H&M Store`:**

1. `mdManager.parse("# H&M Store\n")` → marked tokenizer splits into: heading token with text "H&M Store"
2. Parser calls `decodeHtmlEntities("H&M Store")` → `"H&M Store"` (no change — no entities present)
3. ProseMirror JSON: `{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "H&M Store" }] }`
4. `mdManager.serialize(json)`:
   - Walk nodes, encounter `{ type: "text", text: "H&M Store" }`
   - Parent is `heading`, which is NOT in `codeTypes`
   - Call `encodeHtmlEntities("H&M Store")` → `"H&amp;M Store"`
   - Wrap in heading marker: `"# H&amp;M Store"`

### The `codeTypes` set

`MarkdownManager.ts:42,106-114`:

```typescript
private codeTypes: Set<string> = new Set()
// ...
// Track extensions that declare `code: true` so we can skip HTML entity
// encoding for their text content (code marks, code blocks).
const isCode = callOrReturn(getExtensionField(extension, 'code'))

if (isCode) {
  this.codeTypes.add(name)
}
```

Populated at registration time from extensions declaring `code: true` (the TipTap `code` mark and `codeBlock` node). The set determines which text is exempt from entity encoding.

### The decode path — asymmetry

`MarkdownManager.ts:656-659, 823`:

```typescript
// Create text node – decode HTML entities so that e.g. `&lt;` displays as `<` in the editor
{
  type: 'text',
  text: decodeHtmlEntities(token.text || ''),
  // ...
}
```

**Critical asymmetry:** `decodeHtmlEntities` handles 4 entities (`&lt;`, `&gt;`, `&quot;`, `&amp;`). It does NOT decode:
- Named entities like `&copy;`, `&mdash;`, `&nbsp;` (beyond `&quot;`)
- Numeric entities like `&#169;`, `&#x2022;`

This means:
- Author writes `&copy;` → parse produces text node "&copy;" (literal 6 chars, not the © character)
- Serialize calls `encodeHtmlEntities("&copy;")` → `&amp;copy;` (the `&` gets escaped first)
- Round-trip result: `&amp;copy;` on disk

Next parse: `&amp;copy;` → marked produces text token "&amp;copy;" → `decodeHtmlEntities("&amp;copy;")` → applies `/&amp;/g` → `"&copy;"` → STABLE (the next serialize returns `&amp;copy;` again). Converges after 1 cycle but not to the original.

---

## Why this exists (design intent)

Comment at `htmlEntities.ts:18-19`:
> `&` is encoded **first** to avoid double-encoding the ampersand in other entities (e.g. `<` → `&lt;`, not `&amp;lt;`).

The comment confirms the intent: the encoder exists to safely serialize nodes that contain ACTUAL special characters (typed `<` or `>` that should become escaped entities in the markdown output). The unstated assumption is that the text will later be parsed through an HTML-aware renderer that decodes entities for display.

This assumption holds when markdown is rendered to HTML for browsers. It breaks down when:
1. The markdown itself is the persistence format and disk state (our case)
2. Grep / git diff / any non-HTML tool touches the file
3. An agent or script reads the file and expects literal characters
4. Another markdown parser that does not decode entities processes the file

In our case, markdown IS the canonical format (not HTML), so any entity encoding is data corruption.

---

## Code map (where fixes would go)

Three architectural options:

### Option A: Post-process `mdManager.serialize` output

Wrap `serialize` calls with a decoder that reverses the 3 entities:

```typescript
// In core or server package:
export function safeMdSerialize(mdManager: MarkdownManager, json: JSONContent): string {
  const raw = mdManager.serialize(json);
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
```

**Pros:**
- Narrow blast radius — one file in core
- Doesn't touch `@tiptap/*` dependencies
- Can be rolled back trivially

**Cons:**
- Blind decode: if the author LITERALLY typed `&amp;` expecting it to stay that way, it becomes `&`. (Both forms render identically in HTML, but disk byte-equality differs.)
- Does not handle numeric or named entities (still fails for `&copy;`, `&#169;`)
- Does not handle HTML blocks (`<div>` is still rendered as `&lt;div&gt;`)

### Option B: Extend `@tiptap/markdown`'s `encodeTextForMarkdown` to be configurable

Fork/patch to allow passing `encodeEntities: false` option:

```typescript
private encodeTextForMarkdown(text: string, node: JSONContent, parentNode?: JSONContent): string {
  if (!this.options.encodeEntities) return text;
  // ... existing isInsideCode check ...
  return isInsideCode ? text : encodeHtmlEntities(text);
}
```

**Pros:**
- Fixes the root cause
- Could be upstreamed to `@tiptap/markdown`

**Cons:**
- Requires forking or monkey-patching `@tiptap/*`
- Breaks the design intent for consumers that DO want HTML-safe output
- Upstream timeline unknown

### Option C: Rewrite `encodeTextForMarkdown` to only escape context-ambiguous characters

Instead of blindly escaping all three, only escape when the character would form a markdown syntax conflict:
- `<` preceded by word char → safe as literal
- `>` at start of line → would form blockquote → escape
- `&` at end of word → safe as literal
- `&` immediately followed by valid entity-name chars → escape to prevent misinterpretation

**Pros:**
- Semantically correct — only escapes what MUST be escaped
- Best fidelity

**Cons:**
- Most complex
- Requires full re-verification against CommonMark spec
- High risk of edge cases

---

## Observed at scale

From `probe-results.tsv` (118 constructs): **10 cases** hit `ENTITY_CORRUPTION` classification. Representative examples (see `d1-construct-catalog.md`):

- `# H&M Store` → `# H&amp;M Store` (heading)
- `Foo & Bar & Baz.` → `Foo &amp; Bar &amp; Baz.` (paragraph)
- `If a < b and b > c then a < c.` → `If a &lt; b and b &gt; c then a &lt; c.` (paragraph with `<`/`>`)
- `&copy; 2026 Example Inc.` → `&amp;copy; 2026 Example Inc.` (double-encoded named entity)
- `<div>HTML block</div>` → `&lt;div&gt;HTML block&lt;/div&gt;` (HTML block → text)

**Critical classes of affected content:**

1. Names and brands containing `&` (H&M, AT&T, Black & Decker, Johnson & Johnson, Ben & Jerry's, Dolce & Gabbana, …)
2. Mathematical and programming notation (`a < b`, `x > 0`, `if a && b`, `<T extends …>`)
3. Files containing URL query strings in body text (not in link URLs): `param=1&other=2`
4. Any author using HTML entities for typographic characters (`&mdash;`, `&ndash;`, `&copy;`, `&trade;`, `&#169;`)
5. Any raw HTML in markdown (allowed by CommonMark, broken by us)

---

## Pointers

- `node_modules/@tiptap/core/src/utilities/htmlEntities.ts` — the encode/decode functions (26 lines total)
- `node_modules/@tiptap/markdown/src/MarkdownManager.ts:901-911` — the `encodeTextForMarkdown` wrapper
- `node_modules/@tiptap/markdown/src/MarkdownManager.ts:656-659, 823` — the decode call sites during parse
- `node_modules/@tiptap/markdown/src/MarkdownManager.ts:42, 106-114` — the `codeTypes` set population
- Related: [@tiptap/markdown GitHub issue #7147](https://github.com/ueberdosis/tiptap/issues/7147) — filed from the earlier round-trip fidelity report

## Gaps / follow-ups

- ~~Not verified: whether `@tiptap/markdown` has any documented option to disable `encodeTextForMarkdown`. Did not exhaustively read all 1298 lines of `MarkdownManager.ts`.~~ → **Resolved in [d2b-extension-api-surface.md](d2b-extension-api-surface.md).** Full 1298-line read completed. No documented option exists. Prototype monkey-patch escape hatch found.
- Not verified: what marked's behavior is for ambiguous cases like `&nosuch;` (non-standard entity name) — likely treated as text.
- Not verified: whether the upcoming `@tiptap/markdown` v4 changes this pattern. The existing research report was based on v3.22.2 — this report is based on v3.22.3, same behavior.
