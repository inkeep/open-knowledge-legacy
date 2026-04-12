# Evidence: D3 — Hit list ranked by test priority

**Dimension:** D3 — Construct-level test priority ranking
**Date:** 2026-04-11
**Sources:** `probe-results.tsv` (D1), `evidence/d2-root-cause-entities.md`, CommonMark 0.31.2, GFM spec
**Baseline commit:** 2d35736

---

## Ranking methodology

Each construct is scored on four dimensions:

1. **Blast radius** — what fraction of real-world content contains this construct?
2. **Silent-failure severity** — does the corruption cause data loss (bad), normalization (tolerable), or user-visible corruption (worst)?
3. **Coverage gap** — is it already tested in our existing `conversion-fidelity.test.ts`? Or silently passing under the `/\w{3,}/g` regex?
4. **Test effort** — how easy is it to add a targeted test case?

**Priority tiers:**

- **P0 — Must test** — high blast radius, silent failure, currently invisible to test suite
- **P1 — Should test** — moderate blast radius OR non-silent OR already partially covered
- **P2 — Nice to test** — low real-world frequency, or well-covered by adjacent tests
- **P3 — Skip** — covered elsewhere, trivial, or constructs we don't support

---

## P0: Must test immediately

These catch bugs that are ACTIVELY silently corrupting real content, and the existing test suite cannot catch them.

| # | Construct | Why P0 | Expected outcome of tightened test | Fix direction |
|---|---|---|---|---|
| 1 | **`&` in heading text** | Brand names ("H&M", "AT&T", "Johnson & Johnson") are extremely common. Bug is silent. `/\w{3,}/g` is blind to `&`. | Test FAILS on current code; PASSES after entity-decode fix. | Post-process `mdManager.serialize` OR patch `@tiptap/markdown` |
| 2 | **`&` in paragraph body text** | Any paragraph with "& " or "and/&" patterns. Even more common than headings. Silent. | Test FAILS on current code. | Same |
| 3 | **`&` in link text** | Explicit `[A & B](url)` markdown. Silent on round-trip. | Test FAILS. | Same |
| 4 | **`&` in table cell content** | GFM tables with `&`-containing data. Triggers the encoder even inside table cells. | Test FAILS. | Same |
| 5 | **Literal `<` and `>` in paragraph** | Mathematical notation (`x < 10`), generic type signatures (`<T>`), comparison text. | Test FAILS. | Same |
| 6 | **Named entities (`&copy;`, `&mdash;`)** | Authors who learned HTML entity syntax; typographic content. Silently becomes `&amp;copy;`. | Test FAILS. | Handle in decode path |
| 7 | **Numeric entities (`&#169;`, `&#x2022;`)** | Copy-pasted from HTML sources; legacy content. Silently becomes `&amp;#169;`. | Test FAILS. | Handle in decode path |
| 8 | **Backslash-escaped asterisk `\*`** | Author wants literal `*` in text (e.g., footnote marker, multiplication sign). Content dropped entirely. | Test FAILS — currently drops both `\` and `*`. | Patch `@tiptap/markdown` serialize path |
| 9 | **Backslash-escaped underscore `\_`** | Filenames (`my_file`), Python variables in prose, URL slugs mentioned in body. Content dropped. | Test FAILS. | Same |
| 10 | **Backslash-escaped bracket `\[`** | Literal brackets in text (bibliography refs, placeholders). Content dropped. | Test FAILS. | Same |
| 11 | **Backslash-escaped hash `\#`** | Anchor-like notation, issue numbers, social media hashtags. Content dropped. | Test FAILS. | Same |
| 12 | **Link reference definitions** | Documents that use `[docs][ref]` + `[ref]: url` style are broken — every save inlines all references, losing the shared URL pattern. | Test FAILS — produces inline link. | Patch serializer to emit references when input had them |

**Count: 12 P0 tests.** Each is a one-off construct with a specific input and a specific expected output. Test case = roughly 5 lines.

---

## P1: Should test — moderate blast radius or partial coverage

| # | Construct | Why P1 | Outcome |
|---|---|---|---|
| 13 | **HTML blocks (`<div>`, `<span>`, `<br>`)** | CommonMark allows raw HTML. Markdown authors occasionally use `<br>` or `<div>` for layout. Currently escaped to `&lt;div&gt;` text — semantic loss. | Test verifies NOT converted to escaped text; may legitimately preserve as HTML or drop with a warning. |
| 14 | **Autolinks `<https://url>`** | Common GFM pattern. Currently normalized to `[url](url)` — cosmetic but changes shape. | Test accepts either `<url>` or `[url](url)`, asserts URL preserved. |
| 15 | **Bare URL autolink (GFM)** | `Visit https://example.com` — common. Currently becomes `Visit [https://example.com](https://example.com)` which is slightly ugly. | Test asserts URL preserved in link form. |
| 16 | **Trailing `##` on ATX headings** | CommonMark allows `## Heading ##`. Currently stripped. Harmless but worth asserting. | Test accepts either with or without trailing hashes. |
| 17 | **Setext headings (`===`, `---`)** | Legacy documents migrated from older Markdown. Currently converted to ATX. Harmless. | Test accepts either form. |
| 18 | **Indented code blocks** | 4-space indent code. Less common than fenced but valid CommonMark. Currently converted to fenced. | Test accepts either form. |
| 19 | **`~~~` fenced code blocks** | Valid CommonMark alternative to ``` ``` ```. Currently normalized. | Test accepts either form. |
| 20 | **`__bold__` / `_italic_` emphasis** | Common alternative syntax. Normalized to `**` / `*`. | Test accepts either form. |
| 21 | **Bullet marker variants (`*`, `+`)** | Legacy convention varies. Normalized to `-`. | Test accepts any bullet marker. |
| 22 | **Ordered list with `1)` marker** | Valid CommonMark. Normalized to `1.`. | Test accepts either form. |
| 23 | **GFM table alignment** | `|:---|:---:|---:|` syntax. Column-width-normalized but alignment preserved. | Test asserts alignment class preserved, not exact whitespace. |
| 24 | **Double-backtick code span `` `` `backtick` `` ``** | For inline code containing backticks. Currently collapsed — **and non-idempotent**. | Test asserts preserved as-is or at least idempotent. |
| 25 | **Trailing newlines at EOF** | Style convention varies. Currently produces trailing `&nbsp;` — ugly. | Test asserts no `&nbsp;` artifact. |
| 26 | **Very long paragraph (>1k chars)** | Stress the serializer on a realistic-size document. | Test asserts byte-length preservation. |

**Count: 14 P1 tests.**

---

## P2: Nice to test — good coverage already exists or low frequency

| # | Construct | Why P2 |
|---|---|---|
| 27 | Unicode (emoji, CJK, RTL, accented, combining, ZWJ) | Already tested. Currently passes. Keep as regression guard. |
| 28 | Frontmatter (YAML) | Handled by `stripFrontmatter` before `mdManager`. Production path is safe. Test at the production layer, not at mdManager. |
| 29 | Wiki-links (all 4 variants) | Custom extension. Already tested. Currently passes. |
| 30 | JSX component fenced-code | Custom extension. Already tested. Currently passes. |
| 31 | Task lists (checked/unchecked) | GFM. Already covered. Currently passes. |
| 32 | Strikethrough `~~text~~` | GFM. Already covered. Currently passes. |
| 33 | Standard emphasis (`**bold**`, `*italic*`) | Core markdown. Covered in conversion-fidelity. |
| 34 | Standard links `[text](url)` | Core. Covered. |
| 35 | Images `![alt](url)` | Core. Covered. |
| 36 | Nested lists (2-3 levels) | Core. Covered. |
| 37 | Simple block quotes | Core. Covered. |
| 38 | Horizontal rules | Core. Covered (with normalization). |
| 39 | Paragraph with mixed inline marks | Core. Covered. |
| 40 | Heading with inline code / links / bold | Structural combinations. Covered via bridge-matrix. |
| 41 | Tight vs loose lists | Already flagged in existing `markdown-roundtrip-fidelity-tiptap` report as fixable at 50 LOC. |
| 42 | List containing code block | Structural. Covered in conversion-fidelity. |
| 43 | Hard break (trailing spaces) | CommonMark. Covered with whitespace diff. |

---

## P3: Skip — truly out of scope

| # | Construct | Why skip |
|---|---|---|
| 44 | Math blocks (`$$inline$$`, `$$block$$`) | Not a CommonMark or GFM construct. Not in our extensions. Would need separate opt-in. |
| 45 | Definition lists | Not supported by our extension set. |
| 46 | Footnotes | Not supported by our extension set. |
| 47 | Alerts / callouts (`> [!NOTE]`) | GitHub-specific extension. Not supported. |
| 48 | Emoji shortcodes (`:smile:`) | Not a markdown extension, a rendering-time feature. |
| 49 | BOM / CRLF / mixed indentation | File-system-level concerns; handled by `stripFrontmatter` or file watcher. |

---

## Summary: 12 P0 + 14 P1 = 26 targeted tests to close the real gap

Adding 26 new targeted test cases to `conversion-fidelity.test.ts` (or a new `conversion-fidelity-constructs.test.ts`) would:

1. Catch 10 of the 10 `ENTITY_CORRUPTION` cases that currently slip through silently.
2. Catch 4 of the 4 `backslash-escape-consumed` content-loss cases.
3. Catch the `link reference definition destroyed` case.
4. Verify that the 14 P1 normalizations are correctly classified (expected vs unexpected).

**The existing test suite would not catch any of these today.** The `conversion-fidelity.test.ts` `/\w{3,}/g` regex is blind to all characters in the P0 list except the backslash-escaped ones (which drop alphanumeric content).

---

## Pointers

- `d1-construct-catalog.md` — source data for all 118 constructs
- `d2-root-cause-entities.md` — code-level origin of the entity bug
- `probe-script.ts` — reproduction script

## Gaps / follow-ups

- P0 items 8-11 (backslash-escape consumption) have not been verified against marked's tokenizer behavior to confirm the loss is at marked's level vs `@tiptap/markdown`'s renderer. Both would be legitimate fix sites.
- P0 item 12 (reference link preservation) requires schema support for reference-style links in `@tiptap/markdown`. The existing research report flagged this as a fundamental limitation — may not be fixable without schema extension.
- P1 items 13-15 (HTML blocks, autolinks, bare URL autolinks) are ecosystem-wide issues. Upstream `@tiptap/markdown` v4 may change this behavior.
