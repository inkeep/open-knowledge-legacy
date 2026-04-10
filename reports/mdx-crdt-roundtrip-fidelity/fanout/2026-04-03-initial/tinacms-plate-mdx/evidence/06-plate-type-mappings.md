---
title: "Evidence: Plate MDAST <-> Slate Type Mapping Tables"
source: "plate/packages/markdown/src/lib/types.ts"
type: source-code
---

# Plate MDAST <-> Slate Type Mapping Tables

## MDAST to Plate Mapping

```typescript
// plate/packages/markdown/src/lib/types.ts
const MDAST_TO_PLATE = {
  // Standard markdown
  paragraph: 'p',
  heading: 'heading',
  blockquote: 'blockquote',
  code: 'code_block',
  list: 'list',
  listItem: 'li',
  thematicBreak: 'hr',
  link: 'a',
  image: 'img',
  table: 'table',
  tableRow: 'tr',
  tableCell: 'td',
  
  // Inline marks
  strong: 'bold',
  emphasis: 'italic',
  delete: 'strikethrough',
  inlineCode: 'code',
  text: 'text',
  
  // MDX-specific (have mapping but NO default rules)
  mdxJsxFlowElement: 'mdxJsxFlowElement',
  mdxJsxTextElement: 'mdxJsxTextElement',
  mdxFlowExpression: 'mdxFlowExpression',
  mdxjsEsm: 'mdxjsEsm',
  mdxTextExpression: 'mdxTextExpression',
  
  // GFM extensions via MDX tags
  del: 'strikethrough',
  mark: 'highlight',
  u: 'underline',
  sub: 'subscript',
  sup: 'superscript',
  
  // Math
  math: 'equation',
  inlineMath: 'inline_equation',
  
  // Misc
  break: 'break',
  html: 'html',
  yaml: 'yaml',
  definition: 'definition',
  footnoteReference: 'footnoteReference',
  footnoteDefinition: 'footnoteDefinition',
  imageReference: 'imageReference',
  linkReference: 'linkReference',
};
```

## Plate to MDAST Mapping

```typescript
const PLATE_TO_MDAST = {
  p: 'paragraph',
  heading: 'heading',
  blockquote: 'blockquote',
  code_block: 'code',
  list: 'list',
  hr: 'thematicBreak',
  a: 'link',
  img: 'image',
  table: 'table',
  td: 'tableCell',
  th: 'tableCell',
  tr: 'tableRow',
  li: 'listItem',
  
  bold: 'strong',
  italic: 'emphasis',
  strikethrough: 'delete',
  code: 'inlineCode',
  text: 'text',
  
  underline: 'u',
  subscript: 'sub',
  superscript: 'sup',
  
  equation: 'math',
  inline_equation: 'inlineMath',
  
  callout: 'callout',
  toc: 'toc',
  mention: 'mention',
  date: 'date',
  comment: 'comment',
  suggestion: 'suggestion',
};
```

## TinaCMS Plate Type Definitions (for comparison)

```typescript
// @tinacms/mdx/src/parse/plate.ts
type BlockElement =
  | BlockquoteElement      // type: 'blockquote'
  | CodeBlockElement       // type: 'code_block'
  | HeadingElement         // type: 'h1'-'h6'
  | HrElement              // type: 'hr'
  | HTMLElement            // type: 'html'
  | ImageElement           // type: 'img'
  | InvalidMarkdownElement // type: 'invalid_markdown'
  | ListItemElement        // type: 'li'
  | MdxBlockElement        // type: 'mdxJsxFlowElement'
  | ParagraphElement       // type: 'p'
  | OrderedListElement     // type: 'ol'
  | UnorderedListElement   // type: 'ul'
  | TableCellElement       // type: 'td'
  | TableRowElement        // type: 'tr'
  | TableElement           // type: 'table'

type InlineElement =
  | TextElement            // type: 'text' + marks
  | MdxInlineElement       // type: 'mdxJsxTextElement'
  | BreakElement           // type: 'break'
  | LinkElement            // type: 'a'
  | ImageElement           // type: 'img'
  | HTMLInlineElement      // type: 'html_inline'
```

**Key difference**: TinaCMS uses direct type strings (`'h1'`, `'h2'`, etc.) while Plate uses plugin keys that are resolved at runtime via `getPluginType()`. TinaCMS's types are more rigid but predictable.
