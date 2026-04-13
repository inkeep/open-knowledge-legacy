# E1: Complete mdast Node Type Catalogue

**Source:** `@types/mdast@4.0.4` (`node_modules/.bun/@types+mdast@4.0.4/node_modules/@types/mdast/index.d.ts`)

## Base Interfaces

```typescript
// From unist
interface Node {
  type: string;
  data?: Data | undefined;
  position?: Position | undefined;
}

interface Parent extends Node {
  children: RootContent[];
}

interface Literal extends Node {
  value: string;
}

// Position tracking
interface Point {
  line: number;     // 1-indexed
  column: number;   // 1-indexed
  offset?: number;  // 0-indexed
}

interface Position {
  start: Point;
  end: Point;
}
```

## Mixins

```typescript
interface Association {
  identifier: string;
  label?: string | null | undefined;
}

interface Reference extends Association {
  referenceType: ReferenceType; // "shortcut" | "collapsed" | "full"
}

interface Resource {
  url: string;
  title?: string | null | undefined;
}

interface Alternative {
  alt?: string | null | undefined;
}
```

## CommonMark Block Nodes (10 types)

| # | Type | Base | Key Properties | Children |
|---|------|------|----------------|----------|
| 1 | `root` | Parent | — | `RootContent[]` |
| 2 | `paragraph` | Parent | — | `PhrasingContent[]` |
| 3 | `heading` | Parent | `depth: 1\|2\|3\|4\|5\|6` | `PhrasingContent[]` |
| 4 | `blockquote` | Parent | — | `(BlockContent\|DefinitionContent)[]` |
| 5 | `list` | Parent | `ordered?: boolean`, `start?: number`, `spread?: boolean` | `ListContent[]` |
| 6 | `listItem` | Parent | `checked?: boolean`, `spread?: boolean` | `(BlockContent\|DefinitionContent)[]` |
| 7 | `code` | Literal | `lang?: string`, `meta?: string` | — (value) |
| 8 | `html` | Literal | — | — (value) |
| 9 | `thematicBreak` | Node | — | — (void) |
| 10 | `definition` | Node + Association + Resource | `identifier`, `label`, `url`, `title` | — (void) |

## CommonMark Inline Nodes (9 types)

| # | Type | Base | Key Properties | Children |
|---|------|------|----------------|----------|
| 11 | `text` | Literal | — | — (value) |
| 12 | `emphasis` | Parent | — | `PhrasingContent[]` |
| 13 | `strong` | Parent | — | `PhrasingContent[]` |
| 14 | `inlineCode` | Literal | — | — (value) |
| 15 | `break` | Node | — | — (void) |
| 16 | `link` | Parent + Resource | `url`, `title` | `PhrasingContent[]` |
| 17 | `image` | Node + Resource + Alternative | `url`, `title`, `alt` | — (void) |
| 18 | `linkReference` | Parent + Reference | `identifier`, `label`, `referenceType` | `PhrasingContent[]` |
| 19 | `imageReference` | Node + Reference + Alternative | `identifier`, `label`, `referenceType`, `alt` | — (void) |

## GFM Extension Nodes (6 types)

| # | Type | Base | Key Properties | Children |
|---|------|------|----------------|----------|
| 20 | `table` | Parent | `align?: AlignType[]` | `TableContent[]` (TableRow) |
| 21 | `tableRow` | Parent | — | `RowContent[]` (TableCell) |
| 22 | `tableCell` | Parent | — | `PhrasingContent[]` |
| 23 | `delete` | Parent | — | `PhrasingContent[]` |
| 24 | `footnoteDefinition` | Parent + Association | `identifier`, `label` | `(BlockContent\|DefinitionContent)[]` |
| 25 | `footnoteReference` | Node + Association | `identifier`, `label` | — (void) |

**AlignType:** `"center" | "left" | "right" | null`

## Frontmatter Nodes (2 types)

| # | Type | Base | Key Properties |
|---|------|------|----------------|
| 26 | `yaml` | Literal | — (value = raw YAML) |
| 27 | `toml` | Literal | — (value = raw TOML, via module augmentation) |

## MDX Nodes (5 types)

**Source:** `mdast-util-mdx-jsx@3.2.0`, `mdast-util-mdx-expression@2.0.1`, `mdast-util-mdxjs-esm@2.0.1`

| # | Type | Base | Key Properties | Children |
|---|------|------|----------------|----------|
| 28 | `mdxJsxFlowElement` | Parent | `name: string\|null`, `attributes: (MdxJsxAttribute\|MdxJsxExpressionAttribute)[]` | `(BlockContent\|DefinitionContent)[]` |
| 29 | `mdxJsxTextElement` | Parent | `name: string\|null`, `attributes: (MdxJsxAttribute\|MdxJsxExpressionAttribute)[]` | `PhrasingContent[]` |
| 30 | `mdxFlowExpression` | Literal | `data.estree?: Program` | — (value) |
| 31 | `mdxTextExpression` | Literal | `data.estree?: Program` | — (value) |
| 32 | `mdxjsEsm` | Literal | `data.estree?: Program` | — (value) |

### MDX Attribute Types

```typescript
interface MdxJsxAttribute extends Node {
  type: 'mdxJsxAttribute';
  name: string;
  value?: MdxJsxAttributeValueExpression | string | null;
}

interface MdxJsxExpressionAttribute extends Node {
  type: 'mdxJsxExpressionAttribute';
  value: string;
  data?: { estree?: Program | null };
}

interface MdxJsxAttributeValueExpression extends Node {
  type: 'mdxJsxAttributeValueExpression';
  value: string;
  data?: { estree?: Program | null };
}
```

## Content Model Categories

| Category | Member Types |
|----------|-------------|
| `RootContent` | All of the below |
| `BlockContent` | blockquote, code, heading, html, list, paragraph, table, thematicBreak, mdxJsxFlowElement, mdxFlowExpression |
| `PhrasingContent` | break, delete, emphasis, footnoteReference, html, image, imageReference, inlineCode, link, linkReference, strong, text, mdxJsxTextElement, mdxTextExpression |
| `ListContent` | listItem |
| `TableContent` | tableRow |
| `RowContent` | tableCell |
| `DefinitionContent` | definition, footnoteDefinition |
| `FrontmatterContent` | yaml, toml |

**Total: 32 distinct mdast node types** (19 CommonMark + 6 GFM + 2 frontmatter + 5 MDX)
