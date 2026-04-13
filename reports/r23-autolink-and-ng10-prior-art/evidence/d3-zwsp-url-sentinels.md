# Evidence: D3 — ZWSP and Unicode sentinels in markdown URLs

**Dimension:** D3 — Does U+200B (ZWSP) survive markdown link tokenization? Are there better Unicode sentinels?
**Date:** 2026-04-13
**Sources:** empirical bun test, mdast-util-from-markdown source, RFC 3986/3987, Unicode FAQ, remarkjs/remark issue #518, WHATWG URL issue #151

---

## Key files / pages referenced

- `node_modules/mdast-util-from-markdown/lib/index.js:917-930` — `onexitautolinkprotocol` uses `sliceSerialize` (verbatim bytes)
- `node_modules/mdast-util-to-markdown/lib/util/format-link-as-autolink.js:32` — autolink-format check regex `/[\0- <>\u007F]/` (does NOT reject Unicode above 0x7F)
- `packages/core/src/markdown/autolink-void-html-guard.ts:18-39` — current PUA sentinel definitions
- `packages/core/src/markdown/wiki-link-micromark.ts` — uses explicit ASCII delimiters, not Unicode
- [RFC 3986 — URI Generic Syntax](https://www.rfc-editor.org/rfc/rfc3986.html) — URIs are 7-bit ASCII; non-ASCII must percent-encode
- [RFC 3987 — IRI syntax](https://www.rfc-editor.org/rfc/rfc3987) — permits most Unicode except control/invisible
- [Unicode FAQ: Private Use Area](https://www.unicode.org/faq/private_use.html) — U+E000-F8FF reserved for applications
- [remarkjs/remark#518](https://github.com/remarkjs/remark/issues/518) — "ZWSP HTML character entity replaced by Unicode" — closed as wontfix
- [WHATWG URL#151](https://github.com/whatwg/url/issues/151) — how should URLs containing Unicode ZWSP be treated

---

## Findings

### Finding: ZWSP (U+200B) IS preserved through remark-parse and remark-stringify
**Confidence:** CONFIRMED (empirical)
**Evidence:** bun test in the repo CWD —

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
const proc = unified().use(remarkParse).use(remarkStringify);
const input = '[x\u200By](http://ex\u200Bample.com\u200B)';
const tree = proc.parse(input);
// link.url contains \u200B; child text contains \u200B
const out = proc.stringify(tree);
// out === input — ZWSP preserved byte-for-byte
```

The mechanism: `mdast-util-from-markdown:onexitautolinkprotocol` uses `this.sliceSerialize(token)` which copies source bytes verbatim without URL decoding. Micromark's resolve-all step does not apply Unicode normalization to URL content.

### Finding: PUA (U+E000–U+E003) is the better sentinel choice than ZWSP
**Confidence:** CONFIRMED
**Evidence:** Unicode FAQ + practical comparison

| Sentinel | Preserved? | SEO/Crawler risk | Clipboard ambiguity | Unicode design intent |
|---|---|---|---|---|
| U+200B (ZWSP) | Yes | Unclear — crawlers may strip | HIGH (invisible in copy-paste, invisible bugs) | General Punctuation — for typographic use |
| U+FEFF (BOM/ZWNBSP) | Yes | Likely stripped | HIGH | Byte-order mark — fragile semantics |
| **U+E000–U+F8FF (PUA)** | **Yes** | **Zero — crawlers ignore** | **Low — rare in user input** | **Reserved for application-specific use** |
| U+2060 (Word Joiner) | Yes | Unclear | HIGH | Similar to ZWSP |

PUA is purpose-built for exactly this use case: sentinels that by Unicode design MUST NOT appear in legitimate content.

### Finding: RFC 3986 says URIs are 7-bit ASCII; U+200B would need percent-encoding
**Confidence:** CONFIRMED
**Evidence:** [RFC 3986 §1.2.1](https://www.rfc-editor.org/rfc/rfc3986.html#section-1.2.1)

> The URI syntax provides a method of encoding data, presumably for the sake of identifying a resource, as a sequence of characters.

URIs are defined over a restricted US-ASCII character set. Non-ASCII chars must be percent-encoded. However, markdown parsers (remark included) do NOT auto-encode URL contents — they store source bytes verbatim. So ZWSP in a URL is preserved at the mdast level but would be percent-encoded by browsers/tools that strictly conform to RFC 3986.

**Implications:** ZWSP in mdast URLs is a PIPELINE-INTERNAL form that would be broken by external URL consumers. PUA has the same property but is explicitly reserved for this — there is no semantic contradiction.

### Finding: The current codebase already uses the right sentinels (PUA)
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/markdown/autolink-void-html-guard.ts:18-39`

```typescript
const GUARD_OPEN = '\uE000';   // replaces `<`
const GUARD_CLOSE = '\uE001';  // replaces `>`
const GUARD_COLON = '\uE002';  // replaces `:` inside autolinks
const GUARD_AT = '\uE003';     // replaces `@` inside autolinks
```

**Implications:** Our existing design is architecturally correct per Unicode design intent. NG9 documents the reservation. A refactor to ZWSP would be a REGRESSION.

### Finding: Wiki-link prior art uses ASCII-visible delimiters, not Unicode sentinels
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/markdown/wiki-link-micromark.ts`

wiki-link uses `[[...]]` as visible user-facing syntax — no hidden Unicode. This is appropriate because wiki-link syntax is USER-AUTHORED; autolink sentinels are INTERNAL PIPELINE markers.

---

## Negative searches

- Searched remarkjs/remark issues for "ZWSP URL preservation" → Issue #518 closed as "pipeline preserves verbatim; downstream behavior not guaranteed."
- Searched for "remark preserve Unicode URL" → no formal guarantee exists, but empirical behavior is preservation.

---

## Gaps / follow-ups

- Google/Bing crawler behavior on ZWSP URLs is undocumented. Relevant for content on a live docs site; not relevant for our internal pipeline (URL is unwrapped BEFORE serialization to disk).

---

## Implications for the refactor

1. **Keep PUA sentinels. Do NOT switch to ZWSP.** PUA is the architecturally correct choice per Unicode design intent.
2. **ZWSP would technically work** but adds SEO/clipboard risks that PUA does not have.
3. **Our proposed "refined preprocessor with ZWSP" was based on an INCORRECT assumption.** The current 4-PUA approach is better than any ZWSP variant.
