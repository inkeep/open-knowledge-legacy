---
dimension: "D3 — BOM (U+FEFF) handling"
date: 2026-04-19
sources:
  - spec.commonmark.org
  - talk.commonmark.org
  - github.com/micromark/micromark
  - github.com/markdown-it/markdown-it
  - github.com/markedjs/marked
  - github.com/commonmark/commonmark.js
  - github.com/nodeca/js-yaml
  - github.com/remarkjs/remark-frontmatter
  - learn.microsoft.com
---

# Evidence: D3 — BOM (U+FEFF) Handling

## Key files / pages referenced

- [CommonMark 0.31.2 §2.1 Characters and lines](https://spec.commonmark.org/0.31.2/#characters-and-lines)
- [talk.commonmark.org — "Treatment of Unicode BOM (U+FEFF)"](https://talk.commonmark.org/t/treatment-of-unicode-bom-u-feff/1832)
- [micromark preprocess.js](https://github.com/micromark/micromark/blob/main/packages/micromark/dev/lib/preprocess.js)
- [micromark BOM test fixtures](https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js)
- [markdown-it normalize.mjs](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs)
- [marked issue #1133 — UTF-8-BOM not supported](https://github.com/markedjs/marked/issues/1133)
- [marked issue #2139](https://github.com/markedjs/marked/issues/2139)
- [marked docs/INDEX.md — ZERO WIDTH character warning](https://github.com/markedjs/marked/blob/master/docs/INDEX.md)
- [commonmark.js regression.txt](https://github.com/commonmark/commonmark.js/blob/master/test/regression.txt)
- [js-yaml issue #179 — Junk at the beginning of first tag](https://github.com/nodeca/js-yaml/issues/179)
- [YAML 1.2.2 §5.2 Character Encodings](https://yaml.org/spec/1.2.2/#52-character-encodings)
- [Microsoft Learn — PowerShell about_Character_Encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding)
- [microsoft/vscode #22564](https://github.com/microsoft/vscode/issues/22564)

---

## Findings

### Finding: CommonMark 0.31.2 does not address BOM

**Confidence:** CONFIRMED

**Evidence:** No normative text in the spec mentions BOM, U+FEFF, or "byte order mark". Closest language is [§2.1](https://spec.commonmark.org/0.31.2/#characters-and-lines):

> "This spec does not specify an encoding; it thinks of lines as composed of characters rather than bytes."

**Historical debate** is documented in [talk.commonmark.org thread 1832](https://talk.commonmark.org/t/treatment-of-unicode-bom-u-feff/1832) (Aug 2015). Key positions:
- jgm (spec author) observed that "a word indented four spaces after a BOM at the beginning of the file will not be parsed as an indented code block" and suggested BOMs should be "ignored by treating them as absent" — then backed off, calling it an implementation concern.
- Vitaly Puzrin (markdown-it maintainer): BOMs are "legacy shit and can be safely stripped."
- Thread closed without spec change.

**Implication:** BOM handling is implementation-defined. Every parser may legitimately choose differently, and the pipeline cannot rely on "the spec" to settle disputes.

---

### Finding: micromark / remark-parse strips a LEADING BOM but preserves internal BOMs

**Confidence:** CONFIRMED (source + tests)

**Evidence:** [`packages/micromark/dev/lib/preprocess.js`](https://github.com/micromark/micromark/blob/main/packages/micromark/dev/lib/preprocess.js):

```js
if (start) {
  // To do: `markdown-rs` actually parses BOMs (byte order mark).
  if (value.charCodeAt(0) === codes.byteOrderMarker) {
    startPosition++
  }
  start = undefined
}
```

The strip is gated on `start` — a one-shot flag — so only the **first** character is considered, and `startPosition++` advances past it. Double BOMs, BOM-after-whitespace, or mid-text BOMs survive.

Observable behavior from [`test/io/misc/bom.js`](https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js):

| Input | Output |
|---|---|
| `'\uFEFF'` | `''` |
| `'\uFEFF# heading'` | `'<h1>heading</h1>'` |
| `'# hea\uFEFFding'` (string input) | `'<h1>hea\uFEFFding</h1>'` — BOM preserved mid-text |
| `'# hea\uFEFFding'` (stream via `TextDecoder`) | `'<h1>heading</h1>'` — TextDecoder strips the internal BOM |

**STRING vs STREAM DIVERGENCE:** the same input yields different output depending on whether it arrives as a string literal or as bytes decoded by `TextDecoder`. `TextDecoder` strips any internal BOMs as part of its own normalization. For a Node pipeline using `fs.readFileSync(path, 'utf8')` (string path) vs `createReadStream + pipe(createParser())` (stream path), this produces observable divergence.

The `To do` comment explicitly notes that Rust sibling `markdown-rs` "actually parses BOMs" — indicating the micromark authors know the current behavior is conservative.

---

### Finding: markdown-it, marked, and commonmark.js all PRESERVE leading BOM (users treat this as bugs)

**Confidence:** CONFIRMED

**markdown-it evidence:** [`lib/rules_core/normalize.mjs`](https://github.com/markdown-it/markdown-it/blob/master/lib/rules_core/normalize.mjs) shows the full normalization pipeline:

```js
const NEWLINES_RE = /\r\n?|\n/g
const NULL_RE      = /\0/g
export default function normalize (state) {
  let str = state.src.replace(NEWLINES_RE, '\n')
  str = str.replace(NULL_RE, '\uFFFD')
  state.src = str
}
```

No U+FEFF handling exists. A leading BOM survives into token text and is emitted in the output.

**marked evidence:** [Issue #1133 "UTF-8-BOM not supported"](https://github.com/markedjs/marked/issues/1133) (2018-03-06, closed as out of scope). Same symptom reappeared in [#2139](https://github.com/markedjs/marked/issues/2139) (2021-07-22, closed). The project's [`docs/INDEX.md`](https://github.com/markedjs/marked/blob/master/docs/INDEX.md) documents the workaround:

> "special ZERO WIDTH unicode characters (for example \uFEFF) might interfere with parsing"

Suggested caller-side fix: `contents.replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/,"")`.

**commonmark.js evidence:** [`test/regression.txt`](https://github.com/commonmark/commonmark.js/blob/master/test/regression.txt) expects `ZWNBSP (U+FEFF) ZWNBSP` (with literal U+FEFF on both sides) to round-trip with U+FEFF preserved verbatim — documenting passthrough behavior.

---

### Finding: js-yaml does not strip BOM — wontfix since 2015

**Confidence:** CONFIRMED

**Evidence:** [Issue #179 "Junk at the beginning of first tag"](https://github.com/nodeca/js-yaml/issues/179) (2015-04-09, closed wontfix). Reporter's YAML file began with UTF-8 BOM and `yaml.load()` produced a key named `"\uFEFFaccion"` — with the BOM embedded in the key name. Key positions from the thread:

- dervus: "BOM does not make sense for UTF-8 files."
- puzrin: proposed auto-stripping, said "it will not cost us anything"
- ixti: "it's not YAML loader responsibility to sanitize strings"
- Closed without fix.

**YAML 1.2.2 spec §5.2** ([yaml.org/spec/1.2.2/#52-character-encodings](https://yaml.org/spec/1.2.2/#52-character-encodings)) defines `[3] c-byte-order-mark ::= xFEFF` and states a BOM "begins a character stream" — **permitted but not required** at start of stream. So js-yaml's behavior is non-conformant in a soft sense (accepts BOM but doesn't handle it), and this hasn't changed in 9+ years.

---

### Finding: remark-frontmatter is vulnerable to BOMs past the first byte

**Confidence:** INFERRED from source + micromark behavior; no direct bug report found

**Evidence:** remark-frontmatter ([GitHub](https://github.com/remarkjs/remark-frontmatter)) registers a micromark extension that matches `---` (or `+++`/`$$$`) at the start of the document, column 1, line 1. Detection is fence-matching at a specific grid position.

Because micromark's preprocess strips only the leading BOM (one character, one-shot), the common case of an editor prepending a single U+FEFF to `---\nkey: value\n---` succeeds: BOM stripped, `---` lands at column 1 of line 1, frontmatter detected.

**Failure modes:**
1. Double BOM (from file concatenation on Windows): `\uFEFF\uFEFF---` — first BOM stripped, second shifts `---` off column 1 → fence not detected, frontmatter silently treated as inline content.
2. UTF-16LE BOM mis-decoded as UTF-8: decoder emits `\uFFFD` replacement characters before `---`; fence not detected.
3. BOM after whitespace (unusual but possible): the preprocess `if (start)` check runs once at stream start — if any non-BOM character arrives first, BOM is never stripped.

Scanned all 23 issues on [remarkjs/remark-frontmatter](https://github.com/remarkjs/remark-frontmatter/issues) — no BOM-specific reports found. This is an unverified failure mode but mechanically explicable from the source.

---

### Finding: Windows toolchains emit BOM by default in several common paths

**Confidence:** CONFIRMED

**PowerShell 5.1** (default on Windows 10): per [about_Character_Encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding), default encoding is UTF-16LE with BOM. Running `powershell.exe -Command "Get-Content foo.md" > out.md` produces a UTF-16LE+BOM file — which will reach a Node parser as garbled UTF-8 unless decoded correctly.

**PowerShell 7+** (Core): default changed to `Utf8NoBom`. So the failure mode is Windows 10 built-in PowerShell (still shipped), not newer installations.

**Notepad (Windows)**: saved UTF-8 files with a BOM by default until Windows 10 build 1903 (May 2019), when it switched to "UTF-8 (no BOM)". Legacy files created before 1903 still carry BOMs. Reference: [microsoft/vscode #44005](https://github.com/Microsoft/vscode/issues/44005).

**VS Code `files.encoding`**: valid values include `utf8`, `utf8bom`, `utf16le`, `utf16be` — but per-language override is common (e.g., PowerShell projects often default to `utf8bom`). UTF-16LE/BE saves always include BOM; UTF-16LE without BOM is not selectable in stable ([microsoft/vscode #22564](https://github.com/microsoft/vscode/issues/22564)).

**Microsoft Word "Save as .md"**: NOT FOUND — no authoritative source documents BOM emission. Third-party tools (Writage, word-to-markdown) vary, but none are Microsoft-maintained.

---

### Finding: Documented bug reports (BOM)

| Source | Date | Status | Summary |
|---|---|---|---|
| [micromark/micromark test/io/misc/bom.js](https://github.com/micromark/micromark/blob/main/test/io/misc/bom.js) | ongoing | regression test | Documents leading BOM strip + internal BOM preserve |
| [markedjs/marked #1133](https://github.com/markedjs/marked/issues/1133) | 2018-03-06 | closed | "UTF-8-BOM not supported"; first line breaks |
| [markedjs/marked #2139](https://github.com/markedjs/marked/issues/2139) | 2021-07-22 | closed | "First line not parsed as markdown" due to editor BOM |
| [nodeca/js-yaml #179](https://github.com/nodeca/js-yaml/issues/179) | 2015-04-09 | closed wontfix | BOM leaks into first key name |
| [talk.commonmark.org 1832](https://talk.commonmark.org/t/treatment-of-unicode-bom-u-feff/1832) | 2015-08-11 | unresolved | Spec discussion on BOM treatment |

No BOM-specific issues found in `remarkjs/remark`, `remarkjs/remark-parse`, `remarkjs/remark-frontmatter`, `unifiedjs/unified`, or `markdown-it/markdown-it` issue trackers (verified 2026-04-19).

---

## Negative searches

- Searched `site:github.com "BOM" OR "\uFEFF" repo:unifiedjs/unified` → no relevant issues.
- Searched `site:github.com repo:remarkjs/remark-frontmatter BOM` → 0 issues.
- Searched for Microsoft Word markdown export BOM behavior → no authoritative primary source.

---

## Gaps / follow-ups

- **remark-frontmatter + BOM interaction:** No direct bug report or test fixture exists. The double-BOM failure mode is inferred but unverified. Could be validated by a minimal reproducer.
- **Byte-level BOM in network-fetched markdown:** `fetch().text()` on a UTF-8 response strips BOM automatically (WHATWG Fetch spec); `fs.readFileSync(path, 'utf8')` preserves it. Cross-boundary behavior not exhaustively mapped.
- **TextDecoder fatal:true mode:** Would reject BOM-mis-encoded input outright — potentially useful as a defensive loader pattern but not investigated for pipeline applicability.
