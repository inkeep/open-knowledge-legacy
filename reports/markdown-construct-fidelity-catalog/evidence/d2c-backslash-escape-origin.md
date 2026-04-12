---
type: raw-proof
title: "D2c: Backslash-escape content loss — origin trace across 3 pipeline layers"
date: 2026-04-11
sources:
  - "@tiptap/markdown v3.22.3 src/MarkdownManager.ts"
  - "marked v17 lexer output"
  - "CommonMark 0.31.2 §2.4"
  - "d2c-split-test.ts (reproduction script)"
---

# D2c: Backslash-escape content loss — origin trace

**TLDR:** The content loss is a **dual-layer bug in `@tiptap/markdown`** — both parse and serialize are broken. marked is innocent. Parse drops characters because `parseInlineTokens()` has no handler for marked's `escape` token type. Serialize fails to re-escape markdown-syntax characters in text nodes, so even a parse fix alone would cause meaning corruption on the next round-trip.

---

## CommonMark spec reference

> **§2.4 Backslash escapes.** Any ASCII punctuation character may be backslash-escaped. [...] A backslash at the beginning of the line, followed by a space, is treated as a hard line break. In all other contexts, a backslash before a punctuation character is treated as a literal backslash, and the escaped character is preserved in the output.

Per the spec, `\*` should produce a literal `*` in the document. The backslash is consumed; the character survives.

---

## Layer-by-layer analysis

### Layer 1: marked.lexer() — PASS

marked v17 correctly tokenizes all 4 backslash-escape constructs per CommonMark §2.4:

| Input | Token type | Token text | Verdict |
|---|---|---|---|
| `\*` | `escape` | `*` | Correct |
| `\_` | `escape` | `_` | Correct |
| `\[` | `escape` | `[` | Correct |
| `\#` | `escape` | `#` | Correct |

The `escape` token's `.text` field contains the decoded character (no backslash). This is the correct intermediate representation — the backslash has been consumed, and the character is preserved for downstream processing.

**marked is NOT the bug.**

### Layer 2: mdManager.parse() — FAIL (primary bug site)

`@tiptap/markdown`'s `parseInlineTokens()` (MarkdownManager.ts:647-753) handles these token types:

- `text` → creates text node with `decodeHtmlEntities(token.text)`
- `html` → merges fragments and parses
- Everything else → looks up a registered mark/node handler

There is **no handler registered for token type `escape`**. When marked emits `{ type: 'escape', text: '*' }`, the code reaches the `else if (token.type)` branch at line 725, attempts `getHandlerForToken('escape')` → returns undefined, checks `token.tokens` → undefined on escape tokens, and **silently returns nothing**. The character is dropped.

**Source location:** `node_modules/@tiptap/markdown/src/MarkdownManager.ts:725-748`

**Fix (3 lines):** Add an `else if (token.type === 'escape')` case that creates a text node from `token.text`:

```typescript
// In parseInlineTokens(), after the 'text' case:
} else if (token.type === 'escape') {
  result.push({ type: 'text', text: token.text || '' });
}
```

### Layer 3: mdManager.serialize() — FAIL (secondary bug site)

Even if parse were fixed to preserve `*`, `_`, `[`, `#` in text nodes, the serializer (`renderNodeToMarkdown` / `renderNodesWithMarkBoundaries`) outputs text node content verbatim (after HTML entity encoding). It does NOT backslash-escape characters that form markdown syntax.

**Consequence:** A text node containing `*not italic*` serializes to `*not italic*`, which re-parses as emphasis (italic). A text node containing `# Not a heading.` at paragraph start serializes to `# Not a heading.`, which re-parses as a heading. This is a **meaning-changing round-trip failure**.

**Source location:** `node_modules/@tiptap/markdown/src/MarkdownManager.ts:905-911` (`encodeTextForMarkdown`)

The current encoder only handles HTML entities (`&`, `<`, `>`). It needs to also escape CommonMark syntax characters that would change the parse tree: `*`, `_`, `[`, `]`, `\`, `` ` ``, `#` (at line start), and possibly others.

**Fix direction:** Extend `encodeTextForMarkdown` to backslash-escape characters that form markdown syntax conflicts:

```typescript
private encodeTextForMarkdown(text: string, node: JSONContent, parentNode?: JSONContent): string {
  if (isInsideCode) return text;
  // Escape markdown syntax chars BEFORE HTML entity encoding
  let escaped = text.replace(/([\\*_\[\]`])/g, '\\$1');
  // Escape # only at line start
  escaped = escaped.replace(/^(#{1,6})\s/gm, '\\$1 ');
  return encodeHtmlEntities(escaped);
}
```

---

## Split test results

Full reproduction: `evidence/d2c-split-test.ts`

| Case | Layer 1 (marked) | Layer 2 (parse) | Layer 3 (serialize) | Re-parse stable? |
|---|---|---|---|---|
| `\*` | PASS — `escape` token with `*` | FAIL — `*` dropped | FAIL — no re-escape | NO — becomes emphasis |
| `\_` | PASS — `escape` token with `_` | FAIL — `_` dropped | FAIL — no re-escape | NO — becomes emphasis |
| `\[` | PASS — `escape` token with `[` | FAIL — `[` dropped | FAIL — no re-escape | yes (brackets alone don't form link) |
| `\#` | PASS — `escape` token with `#` | FAIL — `#` dropped | FAIL — no re-escape | NO — becomes heading |

---

## Fix direction summary

| Fix site | What | Effort | Impact |
|---|---|---|---|
| `@tiptap/markdown` parseInlineTokens | Handle `escape` token type as text node | 3 lines | Restores characters to ProseMirror JSON |
| `@tiptap/markdown` encodeTextForMarkdown | Backslash-escape syntax chars in text nodes | ~10 lines | Prevents meaning-change on re-serialize |
| **Both required** | Parse fix without serialize fix = meaning corruption; serialize fix without parse fix = no effect (chars already gone) | ~13 lines total | Full round-trip fidelity for backslash escapes |

**Recommended approach:** Patch `@tiptap/markdown` at both sites. If upstream merge timeline is too slow, apply the parse fix as a monkey-patch in `@inkeep/open-knowledge-core` and the serialize fix as a post-process wrapper on `mdManager.serialize()`.

---

## Upstream issue status

No existing GitHub issues found in `ueberdosis/tiptap` for "backslash escape" as of 2026-04-11. This is an unreported bug. Filing an upstream issue with this evidence is recommended.

---

## Pointers

- `d2c-split-test.ts` — full reproduction script
- `MarkdownManager.ts:647-753` — parseInlineTokens (bug site 1)
- `MarkdownManager.ts:905-911` — encodeTextForMarkdown (bug site 2)
- `probe-results.tsv` rows 81-84 — raw data for the 4 cases
- `d3-hit-list-ranked.md` P0 cases 8-11 — test priority context
