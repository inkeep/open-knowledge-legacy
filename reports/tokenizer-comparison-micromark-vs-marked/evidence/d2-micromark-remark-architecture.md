# Evidence: micromark + remark + remark-prosemirror Architecture

**Dimension:** D2 — micromark + remark-prosemirror end-to-end architecture
**Date:** 2026-04-12
**Sources:** `@handlewithcare/remark-prosemirror@0.1.5` source; mdast-util-to-markdown source; micromark docs; @wooorm public statements.

---

## Key files / pages referenced

- [micromark repo](https://github.com/micromark/micromark)
- [CMSM — CommonMark state machine spec](https://github.com/micromark/common-markup-state-machine)
- [mdast-util-to-markdown](https://github.com/syntax-tree/mdast-util-to-markdown)
- [remark-parse on npm](https://www.npmjs.com/package/remark-parse)
- [@handlewithcare/remark-prosemirror npm](https://www.npmjs.com/package/@handlewithcare/remark-prosemirror) (v0.1.5, ~16.8k weekly downloads)
- [Handle With Care — ProseMirror announcement](https://discuss.prosemirror.net/t/nytimes-react-prosemirror-is-now-handlewithcare-react-prosemirror-and-v2-is-available/8168)
- Installed source: `/tmp/rpm-research/node_modules/@handlewithcare/remark-prosemirror/lib/`

---

## Findings

### Finding: micromark is a lossless state-machine tokenizer with 100% CommonMark compliance
**Confidence:** CONFIRMED
**Evidence:** [@wooorm (Oct 2020)](https://x.com/wooorm/status/1316442528099512321); [micromark README](https://github.com/micromark/micromark)

> "It's done. micromark is in remark. 100% CommonMark (and optionally GFM) compliant."

Three nested state machines (Flow/Content/Text). Every token has `{type, start, end}` where positions include `line, column, offset`. No synthetic tokens — every byte accounted for. Tested with ~650 CommonMark spec tests plus 1.2k+ extras, 100% code coverage, continuous fuzz testing.

### Finding: mdast drops delimiter info by default, but position survives
**Confidence:** CONFIRMED (empirically verified)
**Evidence:** Test parse of `_italic_` and `+ alpha\n+ beta` through remark-parse

mdast nodes:
- `emphasis` — has no delimiter property
- `strong` — has no delimiter property
- `list` — has `ordered: boolean` but no `bullet` marker property
- `code` (fenced) — has no fence char property
- `heading` — has no atx/setext flag

**BUT** every node has `position: {start: {line, column, offset}, end: {...}}` pointing back into the source string. This means we can slice the original markdown at `position.start.offset` to recover the delimiter.

### Finding: mdast-util-to-markdown exposes per-node custom handlers
**Confidence:** CONFIRMED (empirically verified with working test script)
**Evidence:** `/tmp/rpm-research/test-custom-handler.mjs` test output; [mdast-util-to-markdown source](https://github.com/syntax-tree/mdast-util-to-markdown)

Default handlers read global options (`state.options.emphasis || '*'`). But custom handlers override any node type:

```js
toMarkdown(tree, {
  handlers: {
    emphasis(node, _parent, state, info) {
      const marker = node.data?.delimiter || '*';
      const exit = state.enter('emphasis');
      const value = state.containerPhrasing(node, { before: marker, after: marker, ...info });
      exit();
      return marker + value + marker;
    },
  },
});
```

Verified empirically:
- Input: `_italic_ and *bold*`
- Default serialize: `*italic* and *bold*` (delimiter lost)
- Custom handler with per-node data: `_italic_ and *bold*` (delimiter preserved)

Same pattern works for `code` (fence char), `list` (bullet char), `strong`, `thematicBreak`. ~4-8 custom handlers replace the defaults.

### Finding: @handlewithcare/remark-prosemirror provides mdast ↔ ProseMirror mapping with a handler API
**Confidence:** CONFIRMED
**Evidence:** `/tmp/rpm-research/node_modules/@handlewithcare/remark-prosemirror/lib/` source

Three exports:
- `remarkProseMirror(options)` — unified plugin; installs `this.compiler = toProseMirror`
- `fromProseMirror(pmNode, options)` — ProseMirror → mdast (NOT direct to markdown; chain with remarkStringify)
- Helpers: `toPmNode`, `toPmMark`, `fromPmNode`, `fromPmMark`

**Handler API** (`Record<mdastType, handler>`): you register a handler for ANY mdast node type — including custom types added by remark extensions (e.g., `mdxJsxFlowElement` from remark-mdx). Unknown types throw; you control coverage.

The library itself is ~300 LOC. Trivially forkable. Maintained by the `smoores-dev` maintainer (ex-NYT Oak engineer, 5 yrs), the same group that now maintains `@handlewithcare/react-prosemirror` (officially succeeded `@nytimes/react-prosemirror`).

### Finding: mdast-util-to-markdown has a known open emphasis-in-emphasis bug (#12)
**Confidence:** CONFIRMED
**Evidence:** [mdast-util-to-markdown#12](https://github.com/syntax-tree/mdast-util-to-markdown/issues/12) — open since Feb 2021

Input `***emphasis*in emphasis*` serializes to `\***emphasis*in emphasis*` which reparses to a different structure. @wooorm (Oct 2024): *"incredibly complex… Escaping one marker affects parsing elsewhere in unexpected ways."*

Also closed: #66 (not-planned) (needless escapes — `foo***bar***buz` becomes `fo&#x6F;***bar***&#x62;uz`), #8 (underscores escaped in URLs). Maintainer philosophy: cosmetic escapes that preserve HTML output are not considered bugs.

Impact for us: one known nested-emphasis edge case where byte-exact round-trip fails. All 118 constructs in our fidelity catalog would need to be tested through remark to see how many more surface (none of the prior reports probed remark live).

### Finding: remark's maintainer bus factor is effectively one person
**Confidence:** INFERRED (from commit history patterns and sponsorship)
**Evidence:** github.com/wooorm — Titus Wormer maintains remark, micromark, mdast, mdast-util-to-markdown, and most unified ecosystem packages

This is a single-maintainer risk. Mitigating factors: the code is thoroughly tested, the ecosystem is used by Docusaurus, Next.js MDX, Astro, Prettier, Milkdown, BlockNote — substantial downstream pressure to keep it working. But day-to-day velocity depends on one person.

### Finding: remark-prosemirror is 0.x (pre-1.0) and low-adoption
**Confidence:** CONFIRMED
**Evidence:** [@handlewithcare/remark-prosemirror npm page](https://www.npmjs.com/package/@handlewithcare/remark-prosemirror)

- Current version: 0.1.5 (Dec 2024 first publish, Dec 2025 latest)
- Weekly downloads: ~16,800
- 6 versions shipped in ~12 months
- GitHub: 29 stars, 2 forks, 1 open issue

Breaking changes possible during 0.x. Small library (~300 LOC) — forkable if needed.

---

## Gaps / follow-ups

- **Not live-tested:** our 118-case fidelity probe through a full unified + remark pipeline. Would produce a direct comparable number to the 77/118 (@tiptap/markdown) and 74/118 (prosemirror-markdown) data points from the prior report.
- **Not measured:** performance (micromark is slower than marked — one benchmark shows ~13x — but this is off the critical typing path).
