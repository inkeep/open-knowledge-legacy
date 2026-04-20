---
dimension: D7.4 — Curated divergence snippet corpus
date: 2026-04-19
sources: spec.commonmark.org/0.31.2, talk.commonmark.org, github.github.com/gfm, cmark-gfm/remark-gfm/markdown-it/marked issue trackers
priority: P0 Deep
purpose: Test fixture library — lift entries directly into pipeline test suites
---

# Curated Divergence Snippet Corpus

**Purpose:** A consolidated, lift-and-shift-ready library of cross-parser markdown divergence snippets. Each entry has a short label, exact input, documented divergence behavior, spec/forum reference, and a `test_family` tag for grouping fixtures.

**Test family taxonomy** (use these as fixture categories):
- `emphasis` — emphasis/strong precedence and asymmetry
- `links` — link reference resolution, escaping, label matching
- `html-blocks` — HTML block detection and end-conditions
- `setext-vs-hr` — setext headings vs thematic breaks
- `autolinks` — bare URLs, email, GFM extended autolinks
- `lists` — list tightness, paragraph interruption, nesting
- `fenced-code` — fence length matching, closing rules
- `code-spans` — leading/trailing space, escapes
- `hard-breaks` — `\` vs trailing-spaces vs `<br>`
- `gfm-strikethrough` — `~~` vs `~`
- `gfm-tables` — column-count mismatches, code spans, lazy continuation
- `gfm-tasks` — checkbox markers, NBSP, in-table
- `disallowed-html` — tagfilter behavior

---

## Section A: Emphasis (the densest divergence cluster)

```yaml
- name: triple-star-classic
  input: "***foo***"
  expected_commonmark: "<p><em><strong>foo</strong></em></p>"
  divergence: |
    cmark/commonmark.js/markdown-it/marked/remark agree on <em><strong>.
    remark-lint emits unresolvable conflicting marker warnings when
    'strong' and 'em' marker preferences differ.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-132
  forum_ref: https://github.com/remarkjs/remark-lint/issues/236
  test_family: emphasis

- name: nested-strong-inside-em
  input: "*foo**bar**baz*"
  expected_commonmark: "<p><em>foo<strong>bar</strong>baz</em></p>"
  divergence: |
    Older marked versions mis-nested. Modern parsers aligned per spec example 419.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-419
  forum_ref: https://talk.commonmark.org/t/emphasis-strong-emphasis-corner-cases/2123
  test_family: emphasis

- name: em-strong-asymmetry
  input: "*b**a***"
  expected_commonmark: "<p><em>b</em><em>a</em>**</p>"
  intuitive_expected: "<p><em>b<strong>a</strong></em></p>"
  divergence: |
    All major JS parsers produce the counterintuitive form (leftover **).
    Reverse case (***a**b*) parses cleanly. Asymmetry is openers_bottom + rule 9.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-446
  forum_ref: https://talk.commonmark.org/t/emphasis-strong-emphasis-corner-cases/2123
  test_family: emphasis

- name: a-asterisk-b-asterisk-c
  input: "*a**b**c*"
  expected_commonmark: "<p><em>a</em><em>b</em><em>c</em></p>"
  intuitive_expected: "<p><em>a<strong>b</strong>c</em></p>"
  spec_ref: https://spec.commonmark.org/0.31.2/
  forum_ref: https://talk.commonmark.org/t/emphasis-strong-emphasis-corner-cases/2123
  test_family: emphasis

- name: underscore-intraword
  input: "_a_b_c_"
  expected_commonmark: "<p>_a_b_c_</p>"
  divergence: |
    CommonMark/GFM forbid intraword underscore emphasis.
    Classic Daring Fireball Markdown allowed it: <em>a_b_c</em>.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-360
  test_family: emphasis

- name: five-stars-and-emphasis
  input: "*****Hello*world****"
  expected_commonmark: "<p>*****Hello<em>world</em>***</p>"
  divergence: |
    cmark, MD4C, commonmark.js all agree. Older marked versions unstable.
    Documented openers_bottom over-application bug.
  spec_ref: https://spec.commonmark.org/0.31.2/
  forum_ref: https://talk.commonmark.org/t/i-dont-understand-how-emphasis-is-parsed/3866
  test_family: emphasis

- name: escaped-asterisk-strong
  input: "a**\\*** b"
  expected_commonmark: "<p>a<strong>*</strong> b</p>"
  divergence: |
    Removing the leading space changes flankingness; without space, parses
    as literal. Subtle whitespace-sensitivity.
  spec_ref: https://spec.commonmark.org/0.31.2/
  forum_ref: https://talk.commonmark.org/t/behaviour-for-strong-emphasis-with-an-asterisk-inside/4127
  test_family: emphasis
```

---

## Section B: Link Reference Resolution

```yaml
- name: case-fold-ref-label
  input: |
    [foo][BAR]

    [bar]: /url
  expected_commonmark: '<p><a href="/url">foo</a></p>'
  divergence: case-insensitive label match (example 205) — all major JS parsers aligned.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-205
  test_family: links

- name: unicode-case-fold-label
  input: |
    [ΑΓΩ]

    [αγω]: /φου
  expected_commonmark: link rendered with Unicode case folding (example 206)
  divergence: |
    Older marked: only ASCII case folding. markdown-it/remark/commonmark.js: aligned.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-206
  test_family: links

- name: shortcut-ref-followed-by-empty-brackets
  input: |
    [foo][ ]

    [foo]: /url
  divergence: |
    JS family (commonmark.js, markdown-it, marked, remark): NOT a link.
    Rust (pulldown-cmark) and Go (goldmark): IS a link.
    Spec is silent. Major cross-language divergence.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-570
  forum_ref: https://talk.commonmark.org/t/reference-links-followed-by-space-only-pair-of-brackets/4581
  test_family: links

- name: link-text-binds-tighter-than-em
  input: "*[foo*](url)"
  expected_commonmark: '<p>*<a href="url">foo*</a></p>'
  divergence: link binds tighter than emphasis — all major aligned.
  spec_ref: https://github.com/commonmark/commonmark-spec/issues/438
  test_family: links

- name: backtick-inside-link-title
  input: '[foo](/ "bar`baz")`'
  expected_commonmark: '<p><a href="/" title="bar`baz">foo</a>`</p>'
  divergence: |
    Spec says code spans > emphasis but is silent vs link titles.
    Behavior is undocumented but consistent: link title wins; trailing backtick literal.
  spec_ref: https://spec.commonmark.org/0.31.2/
  forum_ref: https://talk.commonmark.org/t/precedence-of-link-title-over-code-span/8982
  test_family: links

- name: parens-in-ref-link-destination
  input: |
    [foo]

    [foo]: /url(with)parens
  divergence: |
    commonmark/markdown-it/remark: reject unescaped parens — parses as literal.
    Older marked: more permissive.
  spec_ref: https://spec.commonmark.org/0.31.2/
  forum_ref: https://talk.commonmark.org/t/parentheses-in-link-destination-of-link-reference-definition/2667
  test_family: links
```

---

## Section C: HTML Blocks

```yaml
- name: script-inside-list
  input: |
    - <script>
    - some text
    some other text
    </script>
  divergence: |
    cmark-current/commonmark.js/markdown-it 9.x+/marked/remark: </script> stays inside list item.
    Older cmark and historical markdown-it: closing escaped outside the list.
  spec_ref: https://spec.commonmark.org/0.31.2/#html-blocks
  forum_ref: https://talk.commonmark.org/t/list-block-and-html-block-interaction-help/3777
  test_family: html-blocks

- name: pre-inside-table-html-block
  input: |
    <table><tr><td>
    <pre>
    line one

    line three
    </pre>
    </td></tr></table>
  divergence: |
    All major parsers BUG: blank line inside <pre> incorrectly terminates the
    entire HTML block (type 6 ends at blank line). Spec issue unresolved.
  spec_ref: https://spec.commonmark.org/0.31.2/#html-blocks
  forum_ref: https://talk.commonmark.org/t/end-conditions-within-end-conditions/2388
  test_family: html-blocks

- name: textarea-as-html-block
  input: |
    <textarea>
    line 1

    line 3
    </textarea>
  divergence: |
    Pre-spec-0.31: textarea was NOT in type 1 list — blank line broke the block.
    Post-0.31: textarea IS in type 1 (treated like pre/script/style).
    Older marked / older remark may still treat as type 6 (broken).
  spec_ref: https://spec.commonmark.org/0.31.2/#html-blocks
  forum_ref: https://talk.commonmark.org/t/textarea-as-multi-line-html-block/3550
  test_family: html-blocks

- name: del-inline-html
  input: "<del>*foo*</del>"
  expected_commonmark: "<p><del><em>foo</em></del></p>"
  divergence: inline HTML, em is processed — all major aligned.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-168
  test_family: html-blocks
```

---

## Section D: Setext Headings & Thematic Breaks

```yaml
- name: setext-vs-hr
  input: |
    Foo
    ---
    bar
  expected_commonmark: "<h2>Foo</h2><p>bar</p>"
  divergence: |
    All major JS parsers aligned (setext wins per spec example 59).
    Classic perl-markdown: <p>Foo</p><hr/><p>bar</p> (hr precedence).
  spec_ref: https://spec.commonmark.org/0.31.2/#example-59
  test_family: setext-vs-hr

- name: hr-inside-list
  input: |
    * Foo
    * * *
    * Bar
  divergence: |
    commonmark/markdown-it/remark: list with HR nested between items (example 60).
    Some older marked versions: produces three-item list.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-60
  test_family: setext-vs-hr
```

---

## Section E: Autolinks

```yaml
- name: bare-url-no-angle-brackets
  input: "Visit https://example.com today"
  divergence: |
    commonmark (no ext): literal text — no autolink without <>.
    markdown-it: depends on linkify option (default: linkified).
    marked (gfm): linkified by default.
    remark: literal unless remark-gfm plugin loaded.
  spec_ref: https://spec.commonmark.org/0.31.2/#autolinks
  forum_ref: https://talk.commonmark.org/t/autolinking-is-not-automatic/73
  test_family: autolinks

- name: www-bare-link-gfm
  input: "Visit www.example.com today"
  divergence: |
    commonmark (no ext): literal.
    markdown-it+linkify, marked (gfm), remark+gfm, cmark-gfm: linkified to http://www.example.com (note http).
  spec_ref: https://github.github.com/gfm/#autolinks-extension-
  test_family: autolinks

- name: backslash-in-autolink
  input: "<https://example.com?find=\\*>"
  divergence: |
    All major aligned: backslash preserved literally — URL-encoded as %5C* (example 20).
    Spec disallows backslash escapes in autolinks but allows in link destinations.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-20
  forum_ref: https://talk.commonmark.org/t/backslash-escapes-inside-link-destinations/2312
  test_family: autolinks

- name: email-autolink
  input: "<foo@bar.example.com>"
  expected_commonmark: '<p><a href="mailto:foo@bar.example.com">foo@bar.example.com</a></p>'
  divergence: weird-tld <foo@example> — commonmark rejects (no dot in domain), markdown-it linkifies.
  spec_ref: https://spec.commonmark.org/0.31.2/#email-address
  test_family: autolinks

- name: autolink-trailing-period
  input: "Visit https://example.com."
  divergence: |
    cmark-gfm/remark-gfm/markdown-it+linkify-it/github actual: link is https://example.com (period excluded).
  spec_ref: https://github.github.com/gfm/#autolinks-extension-
  test_family: autolinks

- name: autolink-trailing-quote
  input: '"https://example.com"'
  divergence: |
    cmark-gfm/remark-gfm: link includes closing quote (quotes NOT in trim set).
    markdown-it+linkify-it: trims trailing quote.
    marked pre-PR-#2673 also trimmed; post-fix matches spec.
  spec_ref: https://github.com/markedjs/marked/pull/2673
  test_family: autolinks

- name: autolink-balanced-parens
  input: "https://en.wikipedia.org/wiki/Foo_(bar)"
  divergence: cmark-gfm/remark-gfm/markdown-it/github: full URL including (bar) — balanced parens.
  spec_ref: https://github.github.com/gfm/#example-621
  test_family: autolinks

- name: autolink-inside-parens
  input: "(see https://example.com)"
  divergence: All aligned: link is https://example.com (closing ) excluded — parens algorithm).
  spec_ref: https://github.github.com/gfm/#autolinks-extension-
  test_family: autolinks

- name: autolink-www-no-scheme
  input: "www.example.com"
  divergence: |
    cmark-gfm/remark-gfm/github: <a href="http://www.example.com"> (note http, not https).
    markdown-it+linkify-it: defaults to http:// but configurable to https.
  spec_ref: https://github.github.com/gfm/#example-622
  test_family: autolinks

- name: autolink-domain-with-underscore
  input: "https://foo_bar.example.com"
  divergence: |
    cmark-gfm/remark-gfm/github: linked (underscore in third segment, not last 2).
    markdown-it+linkify-it: more permissive — links anyway.
  spec_ref: https://github.github.com/gfm/#extended-www-autolink
  test_family: autolinks

- name: email-autolink-plus-after-at
  input: "Contact hello@mail+xyz.example"
  divergence: |
    cmark-gfm/remark-gfm/github: NOT an email autolink (+ disallowed after @).
    markdown-it+linkify-it: may link depending on config.
  spec_ref: https://github.github.com/gfm/#example-625
  test_family: autolinks
```

---

## Section F: List Tightness

```yaml
- name: list-interrupting-paragraph
  input: |
    The Captain died in
    1868.  He was buried in...
  divergence: |
    All major JS parsers aligned: single paragraph (1. only interrupts when starting with "1.").
    Classic markdown: parses as ordered list starting from 1868.
  spec_ref: https://spec.commonmark.org/0.31.2/
  forum_ref: https://talk.commonmark.org/t/blank-lines-before-lists-revisited/1990
  test_family: lists

- name: ordered-list-non-1-start-after-paragraph
  input: |
    Our top priorities are
    2. fix ordered lists
  divergence: All major aligned: paragraph continues — only "1." can interrupt a paragraph.
  spec_ref: https://spec.commonmark.org/0.31.2/
  test_family: lists

- name: nested-sublist-numeric-confusion
  input: |
    1. item 2
       1. item 2.1
    1. item 3
       2. item 3.1
  divergence: |
    Modern parsers: "2." nested becomes paragraph continuation, not new sublist item.
    Older marked: makes a list.
  spec_ref: https://spec.commonmark.org/0.31.2/
  forum_ref: https://talk.commonmark.org/t/blank-lines-before-lists-revisited/1990
  test_family: lists

- name: two-blank-lines-in-list
  input: |
    - foo


    - bar
  divergence: |
    Pre-spec-0.27: "two blank lines end the list" (spec contradiction, removed).
    Spec 0.27+: blank lines do NOT end list, but trigger looseness.
    All modern JS parsers aligned with current spec.
  spec_ref: https://spec.commonmark.org/0.31.2/
  forum_ref: https://talk.commonmark.org/t/multiple-blank-lines-inside-a-list/2289
  test_family: lists

- name: nested-tight-loose-mismatch
  input: |
    - a
      - b

      - c
    - d
  divergence: |
    commonmark/markdown-it/remark: outer list tight, inner list loose.
    Older marked: sometimes propagates looseness to outer.
  spec_ref: https://spec.commonmark.org/0.31.2/
  forum_ref: https://talk.commonmark.org/t/tightness-and-looseness-of-nested-lists/4622
  test_family: lists
```

---

## Section G: Fenced Code Blocks

```yaml
- name: mismatched-fence-lengths
  input: |
    ````
    aaa
    ```
    ``````
  divergence: |
    All major aligned: triple-backtick line is CONTENT, not closing fence.
    Closing must be ≥ opening length (example 124).
  spec_ref: https://spec.commonmark.org/0.31.2/#example-124
  test_family: fenced-code

- name: unclosed-fence
  input: |
    ```
    code without closing
  divergence: |
    All major JS parsers aligned: fence runs to end of document.
    discount (non-spec): closes at next blank line.
  spec_ref: https://spec.commonmark.org/0.31.2/
  forum_ref: https://talk.commonmark.org/t/insist-that-code-fenced-blocks-are-properly-closed/232
  test_family: fenced-code

- name: triple-backtick-as-inline-code
  input: |
    Some text ``` then
    more text on next line ```
  divergence: |
    commonmark/markdown-it/remark: opens an unterminated inline code span (no fence at start of line).
    Some marked versions: have been seen to interpret as fence.
  spec_ref: https://spec.commonmark.org/0.31.2/
  forum_ref: https://talk.commonmark.org/t/a-problem-with-backtick-code-fences/1053
  test_family: fenced-code

- name: indented-closing-fence
  input: |
    ```
    code
       ```
  divergence: All aligned: 3-space indent OK as closing (example 135); 4-space NOT (example 137).
  spec_ref: https://spec.commonmark.org/0.31.2/#example-135
  test_family: fenced-code
```

---

## Section H: Code Spans

```yaml
- name: code-span-leading-space
  input: "` foo `"
  expected_commonmark: "<code>foo</code>"
  divergence: |
    Spec strips one leading + trailing space when both exist (example 327).
    Older marked: preserved spaces. Markdown.pl, showdown: preserve spaces.
    Babelmark2 historic split: 10 preserve, 17 strip.
  spec_ref: https://spec.commonmark.org/0.31.2/#example-327
  forum_ref: https://talk.commonmark.org/t/leading-and-trailing-white-spaces-in-code-blocks/628
  test_family: code-spans
```

---

## Section I: Hard Breaks

```yaml
- name: trailing-spaces-hard-break
  input: |
    foo  
    bar
  expected_commonmark: "<p>foo<br />\nbar</p>"
  divergence: |
    Default options aligned. marked gfm/breaks options can change.
    remark-breaks: behavior differs.
  spec_ref: https://spec.commonmark.org/0.31.2/#hard-line-breaks
  test_family: hard-breaks

- name: backslash-hard-break
  input: |
    foo\
    bar
  expected_commonmark: "<p>foo<br />\nbar</p>"
  divergence: |
    Modern parsers aligned per spec example 16.
    Classic perl-markdown: literal backslash, no hard break.
    kramdown: requires \\ (double).
  spec_ref: https://spec.commonmark.org/0.31.2/#example-16
  forum_ref: https://talk.commonmark.org/t/get-rid-of-two-spaces-to-indicate-explicit-linebreak-in-favor-of-backslash/996
  test_family: hard-breaks

- name: trailing-spaces-end-of-paragraph
  input: "aaa     "
  divergence: All aligned: trailing spaces stripped — no <br/> at paragraph end (example 654).
  spec_ref: https://spec.commonmark.org/0.31.2/#example-654
  test_family: hard-breaks
```

---

## Section J: GFM Strikethrough

```yaml
- name: gfm-strikethrough-double-tilde
  input: "~~struck~~"
  divergence: |
    commonmark (no ext): literal "<p>~~struck~~</p>".
    cmark-gfm/markdown-it (with ext)/marked (gfm)/remark+gfm/github: <del>struck</del>.
  spec_ref: https://github.github.com/gfm/#strikethrough-extension-
  forum_ref: https://talk.commonmark.org/t/strikeout-threw-out-strikethrough-strikes-out-throughout/820
  test_family: gfm-strikethrough

- name: gfm-strikethrough-single-tilde
  input: "~struck~"
  divergence: |
    cmark-gfm/github actual: <del>struck</del> (deliberate non-spec).
    GFM written spec/markdown-it (default)/marked (gfm): rejects single tilde — literal text.
    remark-gfm: defaults to singleTilde:true (matches cmark-gfm/GitHub).
    Older pandoc: accepts for subscript or strike.
  spec_ref: https://github.com/github/cmark-gfm/issues/71
  test_family: gfm-strikethrough

- name: gfm-strikethrough-triple-tilde
  input: "~~~hello~~~"
  divergence: |
    All major: ambiguous — typically parses as opening fenced code block.
  spec_ref: https://github.github.com/gfm/#strikethrough-extension-
  test_family: gfm-strikethrough
```

---

## Section K: GFM Tables

```yaml
- name: list-vs-table-precedence
  input: |
    a | b
    - | -
    1 | 2
  divergence: |
    cmark-gfm/remark-gfm/markdown-it (with gfm-table): parses as a table.
    github actual: parses as a LIST — first line is paragraph "a | b",
    second/third lines form a list. SPEC IS SILENT.
  spec_ref: https://github.com/github/cmark-gfm/issues/333
  test_family: gfm-tables

- name: header-separator-mismatch
  input: |
    | abc | def |
    | --- |
    | bar |
  divergence: All aligned: not a table — rendered as paragraph (example 203).
  spec_ref: https://github.github.com/gfm/#example-203
  test_family: gfm-tables

- name: row-with-extra-cells
  input: |
    | a | b |
    | - | - |
    | 1 | 2 | 3 | 4 |
  divergence: All aligned: 2-cell row, columns 3-4 silently dropped (example 204).
  spec_ref: https://github.github.com/gfm/#example-204
  test_family: gfm-tables

- name: row-with-fewer-cells-and-trailing-space
  input: |
    | a | b |
    | - | - |
    | 1 |
  divergence: |
    cmark-gfm/markdown-it/github: emit <td>1</td><td></td> (2 cells).
    remark-gfm: emits <td>1</td><td></td><td></td> (3 cells — extra empty td from trailing whitespace).
  spec_ref: https://github.com/remarkjs/remark-gfm/issues/11
  test_family: gfm-tables

- name: escaped-backslash-then-pipe
  input: |
    | a \\| b |
    | --- | --- |
    | x | y |
  divergence: |
    cmark-gfm/remark-gfm/github: BUG — treat `\\|` as escaped pipe; 2-cell header.
    markdown-it (gfm-table): treats `\\` as literal backslash, `|` as delimiter — 3 cells.
  spec_ref: https://github.com/github/cmark-gfm/issues/277
  test_family: gfm-tables

- name: pipe-inside-code-span-in-cell
  input: |
    | a | `code | more` |
    | - | -            - |
  divergence: |
    cmark-gfm/remark-gfm/github: GFM rule wins — pipe inside backticks splits cell unless backslash-escaped.
    Violates CommonMark code-span literal-backslash rule.
    markdown-it (gfm-table): historically required \| escape inside code spans.
  spec_ref: https://github.com/github/cmark-gfm/issues/24
  test_family: gfm-tables

- name: lazy-blockquote-table-continuation
  input: |
    > | a | b |
    > | - | - |
    | 1 | 2 |
  divergence: |
    cmark-gfm/github: third line lazy-continues blockquote; full table inside quote.
    remark-gfm/markdown-it (gfm-table): table breaks at third line — new paragraph.
  spec_ref: https://github.com/remarkjs/remark-gfm/issues/3
  test_family: gfm-tables
```

---

## Section L: GFM Task Lists

```yaml
- name: task-list-uppercase-x
  input: |
    - [X] done
    - [x] done
    - [ ] todo
  divergence: All major aligned: all three recognized; checked / checked / unchecked.
  spec_ref: https://github.github.com/gfm/#task-list-items-extension-
  test_family: gfm-tasks

- name: task-list-with-nbsp-in-marker
  input: "- [\\u00A0] item"
  divergence: |
    cmark-gfm/remark-gfm/markdown-it-task-lists/github: NOT recognized as task list item — literal "[ ]" text.
  spec_ref: https://github.com/github/cmark-gfm/issues/192
  test_family: gfm-tasks

- name: task-list-inside-table-cell
  input: |
    | task |
    | --- |
    | - [ ] todo |
  divergence: |
    cmark-gfm/remark-gfm/markdown-it: cell contains literal text "- [ ] todo" (cells inline-only).
    github actual: GitHub.com renders the checkbox interactively — DIVERGES from cmark-gfm.
  spec_ref: https://github.com/remarkjs/remark-gfm/issues/27
  test_family: gfm-tasks
```

---

## Section M: GFM Disallowed Raw HTML (tagfilter)

```yaml
- name: disallowed-html-script
  input: "<script>alert(1)</script>"
  divergence: |
    cmark-gfm (tagfilter on)/remark-gfm/github: &lt;script>alert(1)&lt;/script>.
    cmark-gfm (tagfilter off): passes raw <script>.
    markdown-it: passes raw HTML through unless XSS-sanitizer plugin added.
  spec_ref: https://github.github.com/gfm/#disallowed-raw-html-extension-
  test_family: disallowed-html

- name: disallowed-html-uppercase-tag
  input: "<SCRIPT>alert(1)</SCRIPT>"
  divergence: |
    cmark-gfm/remark-gfm/github: case-insensitive — escaped.
    Older marked: case-sensitive — not escaped (regression).
  spec_ref: https://github.github.com/gfm/#disallowed-raw-html-extension-
  test_family: disallowed-html

- name: disallowed-html-plaintext
  input: "<plaintext>everything below this is unrendered HTML"
  divergence: |
    cmark-gfm/remark-gfm/github: &lt;plaintext>... (escaped, normal markdown continues).
    markdown-it without tagfilter: leaves <plaintext> raw — browser renders rest of doc as plain text.
  spec_ref: https://github.github.com/gfm/#disallowed-raw-html-extension-
  test_family: disallowed-html
```

---

## Notes on Use

1. **Lift directly into a fixture file.** Each entry is structured YAML-style for easy parsing.

2. **Three `expected_commonmark` patterns:**
   - When all major JS parsers agree, treat the value as the regression baseline.
   - When divergence is documented, lift the snippet to a "known-divergence" suite — assert that the in-pipeline parser produces ONE of the documented behaviors and flag drift if it produces something else.
   - When a CVE/forum thread documents a *bug* in a parser the pipeline uses, treat that as a "currently-broken, do-not-regress-toward-fix" case.

3. **Snippets that exercise security-relevant divergence are starred via test_family tags:**
   - `disallowed-html` — every entry is a potential XSS gateway
   - `gfm-tables` — list-vs-table precedence is silently exploitable for content smuggling
   - `html-blocks` — pre-inside-table is a documented containment-failure pattern

4. **Babelmark3 reproducibility:** every snippet can be pasted into https://babelmark.github.io/ to see live cross-parser output (URLs are dynamic / input-encoded; not stable to cite).

5. **Total count:** ~45 snippets across 13 test families.
