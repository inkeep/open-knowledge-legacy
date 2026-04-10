# Evidence: MDX Constructs Inventory

**Dimension:** D1 — MDX constructs and void node representation
**Date:** 2026-04-07
**Sources:** mdx-js/mdx repo, mdast-util-mdx source, init_spike/src/editor/extensions/jsx-component.ts, mdxjs.com docs

---

## Key files referenced

- `~/.claude/oss-repos/mdast-util-mdx/lib/index.js` — MDX MDAST types
- `~/.claude/oss-repos/mdast-util-mdx-jsx/lib/index.js` — JSX AST nodes (mdxJsxFlowElement, mdxJsxTextElement)
- `~/.claude/oss-repos/mdast-util-mdxjs-esm/lib/index.js` — ESM import/export nodes
- `~/.claude/oss-repos/mdast-util-mdx-expression/` — Expression nodes
- `init_spike/src/editor/extensions/jsx-component.ts` — Void node extension
- `init_spike/src/editor/extensions/JsxComponentView.tsx` — React node view renderer

---

## Findings

### Finding: MDX adds exactly 3 AST node types to MDAST
**Confidence:** CONFIRMED
**Evidence:** mdast-util-mdx/lib/index.js:25-31, mdast-util-mdx-jsx, mdast-util-mdxjs-esm, mdast-util-mdx-expression

The three MDX extensions to MDAST:
1. **mdxJsxFlowElement / mdxJsxTextElement** — JSX components (block and inline)
2. **mdxjsEsm** — import/export statements
3. **mdxFlowExpression / mdxTextExpression** — expressions like `{variable}`

### Finding: All MDX constructs are currently represented as a single void node type
**Confidence:** CONFIRMED
**Evidence:** jsx-component.ts:13-17, JsxComponentView.tsx:21-45

The init_spike represents ALL JSX as a `jsxComponent` atom node with a `content` string attribute. The serialized form is:

```
```jsx-component
<Callout type="warning">
  Always run integration tests before deploying.
</Callout>
```​
```

The atom node is `group: 'block'`, `atom: true`. Content is the raw JSX string. No distinction between self-closing and container components, no separate handling of expression props.

### Finding: Import/export statements are NOT represented as void nodes
**Confidence:** CONFIRMED
**Evidence:** frontmatter.ts (stripFrontmatter pattern)

Import/export statements are handled identically to frontmatter — stripped before ProseMirror parsing and cached for re-prepend on save. They never enter the Y.XmlFragment. The frontmatter.ts only handles YAML frontmatter today; imports/exports would need a separate strip/prepend mechanism.

### Finding: Inline JSX expressions are NOT handled
**Confidence:** CONFIRMED
**Evidence:** jsx-component.ts:47-48 — `markdownTokenName: 'code'`

The jsxComponent extension only intercepts `code` tokens (fenced code blocks) with `lang === 'jsx-component'`. Inline expressions like `{variable}` within paragraph text are not handled. They would be passed through as literal text by marked.

### Finding: JsxComponentView uses naive regex parsing
**Confidence:** CONFIRMED
**Evidence:** JsxComponentView.tsx:9-19

```tsx
function parseJsxContent(raw: string) {
  const tagMatch = raw.match(/<(\w+)\s+type="([^"]*)">([\s\S]*?)<\/\1>/);
  // ...
}
```

This only handles `<Component type="value">children</Component>`. Expression props like `count={data.length}` would fail (quotes expected, not braces). Multiple attributes would fail. Self-closing tags would fail.

---

## MDX Construct Inventory

| Construct | Example | Current void node handling | Edge cases |
|-----------|---------|---------------------------|------------|
| JSX self-closing | `<Chart />` | Stored as content string | Works — raw string preserved |
| JSX with children (text) | `<Callout>text</Callout>` | Stored as content string | Works — regex parses simple cases |
| JSX expression props | `<Chart data={metrics} />` | Stored as content string | String preserved, but view can't parse it |
| JSX with markdown children | `<Callout>\n\n# Title\n\nText\n\n</Callout>` | Stored as content string | Markdown NOT rendered — shown as raw text |
| Nested JSX | `<Layout><Card><Button /></Card></Layout>` | Stored as content string | String preserved, view shows raw |
| Import statements | `import { Chart } from './charts'` | NOT handled (would need strip/prepend) | Would be parsed as paragraph text by marked |
| Export statements | `export const meta = {...}` | NOT handled | Same as imports |
| Inline expressions | `The count is {data.length}` | NOT handled | Passed as literal text |
| MDX comments | `{/* comment */}` | NOT handled | Treated as paragraph text by marked |
| Components with spread props | `<Chart {...config} />` | Stored as content string | String preserved |

---

## Gaps / follow-ups

* Import/export handling needs design — should they be strip/prepend like frontmatter, or a separate node type?
* Inline JSX expressions have no representation path in either architecture
* The regex parser in JsxComponentView is brittle and needs replacement for production
