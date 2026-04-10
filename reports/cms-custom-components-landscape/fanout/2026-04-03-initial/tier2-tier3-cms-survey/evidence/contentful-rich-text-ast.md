---
title: Contentful Rich Text AST and Embedded Entry Pattern
type: primary-source-synthesis
sources:
  - https://www.contentful.com/developers/docs/concepts/rich-text/
  - https://www.npmjs.com/package/@contentful/rich-text-types
  - https://github.com/contentful/rich-text/tree/master/packages/rich-text-react-renderer
  - https://www.contentful.com/help/content-modeling-patterns/
  - https://github.com/contentful/field-editors
date: 2026-04-03
---

# Contentful: Rich Text AST and Embedded Entries

## "Everything is an Entry" Pattern

No special block schema. Any content type can be embedded. Embedding is configured via Rich Text field validations:
- `enabledNodeTypes` — whitelist allowed node types
- `enabledMarks` — whitelist text marks
- `nodes.<nodeType>.linkContentType` — restrict embeddable content types

## Void Node Design

Embedded entries are void nodes in the AST — they carry only a sys link reference, no children:
```json
{
  "nodeType": "embedded-entry-block",
  "data": { "target": { "sys": { "id": "abc123", "type": "Link", "linkType": "Entry" } } },
  "content": []
}
```

Actual entry data resolved separately via REST `includes.Entry` or GraphQL `links` field.

## Node Type Taxonomy (from @contentful/rich-text-types)

BLOCKS: document, paragraph, heading-1 through heading-6, unordered-list, ordered-list, list-item, blockquote, hr, embedded-entry-block, embedded-asset-block, embedded-resource-block, table, table-row, table-cell, table-header-cell

INLINES: embedded-entry-inline, embedded-resource-inline, hyperlink, entry-hyperlink, asset-hyperlink, resource-hyperlink

MARKS: bold, italic, underline, code, superscript, subscript

## Two-Phase Resolution (GraphQL)

GraphQL returns `json` (AST) + `links` (entries/assets) as separate fields. Developers build lookup Maps manually. REST API auto-resolves via SDK.

## Nesting

REST `include` parameter resolves up to 10 levels. GraphQL has no fixed depth limit — constrained by query complexity.
