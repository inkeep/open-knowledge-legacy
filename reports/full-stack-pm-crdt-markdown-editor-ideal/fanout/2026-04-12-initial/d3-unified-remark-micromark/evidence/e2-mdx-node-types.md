# E2: MDX Node Types — Full Attribute Shapes

**Sources:**
- `mdast-util-mdx@3.0.0`
- `mdast-util-mdx-jsx@3.2.0`
- `mdast-util-mdx-expression@2.0.1`
- `mdast-util-mdxjs-esm@2.0.1`

## The 5 MDX Node Types

### 1. `mdxJsxFlowElement` — Block-level JSX

```typescript
interface MdxJsxFlowElement extends Parent {
  type: 'mdxJsxFlowElement';
  name: string | null;  // null = fragment (<>...</>)
  attributes: Array<MdxJsxAttribute | MdxJsxExpressionAttribute>;
  children: Array<BlockContent | DefinitionContent>;
}
```

**Content model:** Block content. Appears at the same level as paragraphs.
**Example source:** `<Callout type="warning">\n\nContent here\n\n</Callout>`

### 2. `mdxJsxTextElement` — Inline JSX

```typescript
interface MdxJsxTextElement extends Parent {
  type: 'mdxJsxTextElement';
  name: string | null;  // null = fragment
  attributes: Array<MdxJsxAttribute | MdxJsxExpressionAttribute>;
  children: PhrasingContent[];
}
```

**Content model:** Phrasing content. Appears inline within paragraphs.
**Example source:** `Click <Button>here</Button> to continue`

### 3. `mdxFlowExpression` — Block-level JS Expression

```typescript
interface MdxFlowExpression extends Literal {
  type: 'mdxFlowExpression';
  value: string;
  data?: { estree?: Program | null };
}
```

**Content model:** Block. The `value` is the JS expression (without braces).
**Example source:**
```mdx
{items.map(item => (
  <Item key={item.id} />
))}
```
Parsed as `value: "items.map(item => (\n  <Item key={item.id} />\n))"`.

### 4. `mdxTextExpression` — Inline JS Expression

```typescript
interface MdxTextExpression extends Literal {
  type: 'mdxTextExpression';
  value: string;
  data?: { estree?: Program | null };
}
```

**Content model:** Phrasing. Inline expression evaluation.
**Example source:** `The count is {count + 1}.`
Parsed as `value: "count + 1"`.

### 5. `mdxjsEsm` — ESM Import/Export

```typescript
interface MdxjsEsm extends Literal {
  type: 'mdxjsEsm';
  value: string;
  data?: { estree?: Program | null };
}
```

**Content model:** Root-level only (not block, not phrasing).
**Example source:**
```mdx
import { Callout } from './components'
export const meta = { title: 'Hello' }
```
Parsed as `value: "import { Callout } from './components'"` (one node per statement).

## Attribute Types (shared by both JSX element types)

### MdxJsxAttribute — Named string/expression attribute

```typescript
interface MdxJsxAttribute extends Node {
  type: 'mdxJsxAttribute';
  name: string;
  value?: MdxJsxAttributeValueExpression | string | null;
}
```

- `value: string` → string literal attribute: `type="warning"`
- `value: MdxJsxAttributeValueExpression` → expression attribute: `count={3 + 1}`
- `value: null | undefined` → boolean attribute: `<Component disabled />`

### MdxJsxExpressionAttribute — Spread attribute

```typescript
interface MdxJsxExpressionAttribute extends Node {
  type: 'mdxJsxExpressionAttribute';
  value: string;  // JS expression without braces
  data?: { estree?: Program | null };
}
```

**Example:** `<Component {...props} />` → `value: "...props"`

### MdxJsxAttributeValueExpression — Expression value for named attributes

```typescript
interface MdxJsxAttributeValueExpression extends Node {
  type: 'mdxJsxAttributeValueExpression';
  value: string;
  data?: { estree?: Program | null };
}
```

**Example:** `<Comp count={3 + 1} />` → attribute name `"count"`, value node with `value: "3 + 1"`

## ESTree Attachment

All expression and ESM nodes optionally carry `data.estree: Program | null`, which is the parsed JavaScript AST (ESTree format). This is populated when `remark-mdx` is configured to parse expressions (default behavior), enabling:
- Import/export analysis
- Expression validation
- Variable reference tracking

The `Program` type comes from the `estree-jsx` package.

## Block vs. Inline Determination

MDX JSX elements are classified as block or inline based on **whitespace context**:
- If a JSX tag appears on its own line with blank lines around it → `mdxJsxFlowElement`
- If a JSX tag appears within a paragraph → `mdxJsxTextElement`

This is determined by micromark's tokenizer based on surrounding context, not by tag name.

## Fragment Support

Both `mdxJsxFlowElement` and `mdxJsxTextElement` support fragments via `name: null`:
```mdx
<>
  Content without a wrapper
</>
```
Parsed as `{ type: 'mdxJsxFlowElement', name: null, ... }`.
