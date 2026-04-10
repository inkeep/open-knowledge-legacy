# Evidence: Observer Sync (Expl 1+2) with MDX

**Dimension:** D2 — Bidirectional Y.XmlFragment ↔ Y.Text observer with MDX constructs
**Date:** 2026-04-07
**Sources:** @tiptap/markdown v3 source, marked source, jsx-component.ts, shimmer analysis report evidence

---

## Key files referenced

- `~/.claude/oss-repos/tiptap/packages/markdown/src/MarkdownManager.ts` — @tiptap/markdown v3 serialize/parse
- `init_spike/src/editor/extensions/jsx-component.ts:44-57` — parseMarkdown and renderMarkdown
- `~/.claude/oss-repos/tiptap-markdown/src/extensions/nodes/code-block.js:15-20` — community version serialize (for reference)

---

## Findings

### Finding: jsxComponent serializes to a fenced code block via renderMarkdown
**Confidence:** CONFIRMED
**Evidence:** jsx-component.ts:54-57

```typescript
renderMarkdown(node) {
  const content = node.attrs?.content || '';
  return `\`\`\`jsx-component\n${content}\n\`\`\``;
}
```

The serialize path produces a fenced code block with `jsx-component` info string. The content (raw JSX) is emitted as-is, no escaping. This is the output that the observer would write to Y.Text.

### Finding: parseMarkdown intercepts code tokens with lang === 'jsx-component'
**Confidence:** CONFIRMED
**Evidence:** jsx-component.ts:44-52

```typescript
markdownTokenName: 'code',
parseMarkdown(token, helpers) {
  if (token.lang !== 'jsx-component') {
    return [];
  }
  return helpers.createNode('jsxComponent', { content: token.text || '' });
}
```

marked tokenizes `\`\`\`jsx-component\n...\n\`\`\`` as `{type: "code", lang: "jsx-component", text: "..."}`. The `text` property contains the raw content between the fences, without the fences themselves.

### Finding: Round-trip is idempotent for jsxComponent atom nodes
**Confidence:** CONFIRMED
**Evidence:** Trace through serialize → marked tokenize → parse

1. **Serialize:** `jsxComponent{content: "<Callout type=\"warning\">text</Callout>"}` → `` ```jsx-component\n<Callout type="warning">text</Callout>\n``` ``
2. **marked tokenize:** produces `{type: "code", lang: "jsx-component", text: "<Callout type=\"warning\">text</Callout>"}`
3. **Parse:** `token.lang === 'jsx-component'` → `createNode('jsxComponent', {content: "<Callout type=\"warning\">text</Callout>"})`

The content attribute is byte-identical after one cycle. No normalization occurs inside fenced code blocks — marked preserves content verbatim.

### Finding: Expression props with special characters survive the round-trip
**Confidence:** CONFIRMED
**Evidence:** Analysis of serialize path + marked tokenizer behavior

Expression props like `data={items.filter(i => i.count > 0)}` contain `{`, `}`, `<`, `>`. These are inside a fenced code block, so:
- marked does not parse them as HTML or markdown (code blocks are opaque)
- The serialize path emits raw content with no escaping
- marked's `text` property for code tokens preserves content verbatim

Special characters `{`, `}`, `<`, `>` are NOT problematic inside fenced code blocks.

### Finding: Triple backticks inside JSX content BREAK the fenced code block
**Confidence:** CONFIRMED
**Evidence:** markdown spec + marked tokenizer behavior

If JSX content contains triple backticks (e.g., a JSX component that renders a code block):

```
```jsx-component
<CodeExample>
```python
print("hello")
```​
</CodeExample>
```​
```

The inner `` ``` `` terminates the outer fenced code block. marked tokenizes this as:
1. A code block with lang `jsx-component` containing `<CodeExample>`
2. A new code block with lang `python` containing `print("hello")`
3. Paragraph text `</CodeExample>`

**Mitigation:** Use a different number of backticks for the outer fence (4+ backticks: `` ```` ``), or use tildes (`~~~`). The renderMarkdown function hardcodes 3 backticks. This is fixable but requires detecting backtick sequences in the content.

### Finding: Multiline JSX preserves whitespace through the round-trip
**Confidence:** CONFIRMED
**Evidence:** marked code token behavior

Multiline JSX like:
```
<Layout
  direction="vertical"
  spacing={16}
>
  <Header />
  <Content />
</Layout>
```

Stored in a fenced code block, marked preserves all whitespace in the `text` property. The round-trip is byte-identical.

### Finding: Import/export statements do NOT flow through the observer
**Confidence:** CONFIRMED
**Evidence:** persistence.ts:146-156, frontmatter.ts

Imports/exports are stripped before Y.XmlFragment population (same as frontmatter). They are cached server-side and re-prepended on save. The observer that serializes Y.XmlFragment → markdown does NOT produce import/export statements. They exist only in the frontmatter/metadata cache.

**Implication for observer sync:** When the observer writes to Y.Text, the markdown will NOT contain import/export lines. If a user views Y.Text (source mode), they see markdown without imports. This is the current behavior — source mode shows serialized WYSIWYG content, not the original .mdx file.

### Finding: The shimmer analysis holds for jsx-component fenced code blocks
**Confidence:** CONFIRMED
**Evidence:** shimmer report findings + code block analysis

The shimmer report proved idempotency for standard markdown content types. Fenced code blocks with custom info strings are a subset of standard markdown — they follow the same code token path. No additional normalization occurs for `jsx-component` vs `typescript` info strings. The shimmer dampening mechanism applies equally.

### Finding: JSX containing markdown-like syntax (# headings) does NOT cause issues
**Confidence:** CONFIRMED
**Evidence:** marked fenced code block tokenizer

Inside a fenced code block, marked treats ALL content as opaque text. `# Heading` inside a jsx-component code block is NOT parsed as a heading. It is preserved as literal text in the `text` property.

---

## Gaps / follow-ups

* The triple backtick edge case needs a production fix (count backticks in content, use N+1 for the fence)
* Import/export re-injection into Y.Text when user wants to see "true source" is an unsolved UX problem
* Inline JSX expressions (`{variable}` in paragraph text) have no observer sync path at all
