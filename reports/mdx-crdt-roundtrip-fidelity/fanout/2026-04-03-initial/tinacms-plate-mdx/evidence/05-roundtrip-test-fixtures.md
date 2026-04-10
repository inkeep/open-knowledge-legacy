---
title: "Evidence: Round-Trip Test Fixtures"
source: "@tinacms/mdx/src/next/tests/"
type: test-fixtures
---

# Round-Trip Test Fixtures

## Test Structure

Each test follows the same pattern (from `index.test.ts`):
```typescript
it('matches input', () => {
  const tree = parseMDX(input, field, (v) => v);
  expect(util.print(tree)).toMatchFile(util.nodePath(__dirname));  // node.json
  const string = serializeMDX(tree, field, (v) => v);
  expect(string).toMatchFile(util.mdPath(__dirname));              // out.md
});
```

Parse MDX -> compare Slate tree to snapshot -> serialize back -> compare output to snapshot.

## Fixture: JSX with Rich-Text Children

**Input** (`mdx-blocks-rich-text-children/in.md`):
```mdx
<Cta
>
  ## Click **here**!
</Cta>
```

**Output** (`out.md`):
```mdx
<Cta>
  ## Click **here**!
</Cta>
```

**Slate tree** (`node.json`):
```json
{
  "type": "root",
  "children": [{
    "type": "mdxJsxFlowElement",
    "name": "Cta",
    "children": [{ "type": "text", "text": "" }],
    "props": {
      "children": {
        "type": "root",
        "children": [{
          "type": "h2",
          "children": [
            { "type": "text", "text": "Click " },
            { "type": "text", "text": "here", "bold": true },
            { "type": "text", "text": "!" }
          ]
        }]
      }
    }
  }]
}
```

**Observations**:
- Newline after `<Cta` is normalized away
- Rich-text children are parsed recursively into a nested `RootElement`
- The component itself is a void Slate node -- children live in `props.children`

## Fixture: Nested Object Props

**Input** (`mdx-basic-nested-objects/in.md`):
```mdx
Hello

<Table rows={[
    {
      columns: [
        {
          content: "# Hello"
        }
      ]
    }
  ]} />
```

**Output** (`out.md`):
```mdx
Hello

<Table rows={[{ columns: [{ content: "# Hello\n" }] }]} />
```

**Observation**: The Prettier formatter collapses the multi-line object to a single line. Original formatting is lost.

## Fixture: Unregistered Component

**Input** (`mdx-unregistered-component/in.md`):
```mdx
<SomeUnregisteredComponen hello="world" />

<SomeUnregisteredComponen>
  # Some markdown in the child
</SomeUnregisteredComponen>
```

**Slate tree**: Both elements become `type: "html"` with the raw MDX as `value` string.

**Output**: Identical to input. The raw string is preserved verbatim.

## Fixture: Invalid MDX in Markdown Mode

**Input** (`markdown-basic-invalid-mdx/in.md`):
```
{

import { foo } from 'bar.js'

const a = "ok"

Hello, {world!}
```

**Slate tree**: All lines become plain paragraph text nodes. Import statements and JS expressions are treated as text.

**Observation**: In `parser: { type: 'markdown' }` mode, remark-mdx is NOT used. The content is parsed as plain markdown, so `import` and `{expressions}` are just text.

## FIXME Tests (Known Failures)

Three test directories are prefixed `FIXME-`:

1. `FIXME-markdown-shortcodes-block-with-html-children-1`: Shortcode `{{< center >}}` containing `<h2>Some text</h2>` -- HTML inside shortcode children fails.

2. `FIXME-markdown-shortcodes-block-with-html-children-2`: Same pattern.

3. `FIXME-markdown-shortcodes-with-duplicates`: Duplicate shortcode names.
