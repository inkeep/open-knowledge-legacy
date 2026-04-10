---
title: Portable Text JSON Serialization Examples
source: PT specification + sanity monorepo type definitions
confidence: high
dimension: D3
---

# Portable Text JSON Serialization Model

## Basic text paragraph

```json
{
  "_type": "block",
  "_key": "abc123",
  "style": "normal",
  "markDefs": [],
  "children": [
    {
      "_type": "span",
      "_key": "span1",
      "text": "Hello world",
      "marks": []
    }
  ]
}
```

## Text with decorators (bold + italic)

```json
{
  "_type": "block",
  "_key": "block2",
  "style": "normal",
  "markDefs": [],
  "children": [
    { "_type": "span", "_key": "s1", "text": "Normal text ", "marks": [] },
    { "_type": "span", "_key": "s2", "text": "bold and italic", "marks": ["strong", "em"] },
    { "_type": "span", "_key": "s3", "text": " normal again", "marks": [] }
  ]
}
```

## Text with annotation (link)

```json
{
  "_type": "block",
  "_key": "block3",
  "style": "normal",
  "markDefs": [
    {
      "_type": "link",
      "_key": "linkRef1",
      "href": "https://example.com",
      "newTab": true
    }
  ],
  "children": [
    { "_type": "span", "_key": "s1", "text": "Click ", "marks": [] },
    { "_type": "span", "_key": "s2", "text": "here", "marks": ["linkRef1"] },
    { "_type": "span", "_key": "s3", "text": " to visit", "marks": [] }
  ]
}
```

Note: The `marks` array for annotations contains the `_key` from `markDefs`, not the `_type`.

## Custom block object (image)

```json
{
  "_type": "image",
  "_key": "img1",
  "asset": { "_ref": "image-abc123-800x600-png" },
  "caption": "A beautiful sunset",
  "alt": "Sunset over mountains"
}
```

## Custom block object with nested PT (callout/infoBox)

```json
{
  "_type": "infoBox",
  "_key": "info1",
  "title": "Important notice",
  "content": [
    {
      "_type": "block",
      "_key": "nested1",
      "style": "normal",
      "markDefs": [],
      "children": [
        { "_type": "span", "_key": "ns1", "text": "This is nested rich text inside the callout.", "marks": [] }
      ]
    }
  ]
}
```

## Inline object within text

```json
{
  "_type": "block",
  "_key": "block4",
  "style": "normal",
  "markDefs": [],
  "children": [
    { "_type": "span", "_key": "s1", "text": "Written by ", "marks": [] },
    { "_type": "mention", "_key": "m1", "userId": "user-123" },
    { "_type": "span", "_key": "s2", "text": " on Monday", "marks": [] }
  ]
}
```

## List blocks

```json
[
  {
    "_type": "block",
    "_key": "li1",
    "style": "normal",
    "listItem": "bullet",
    "level": 1,
    "markDefs": [],
    "children": [{ "_type": "span", "_key": "s1", "text": "First item", "marks": [] }]
  },
  {
    "_type": "block",
    "_key": "li2",
    "style": "normal",
    "listItem": "bullet",
    "level": 2,
    "markDefs": [],
    "children": [{ "_type": "span", "_key": "s2", "text": "Nested item", "marks": [] }]
  }
]
```

## Full Portable Text array (complete document)

A PT value is always an **array** of blocks at the top level:

```json
[
  { "_type": "block", "_key": "b1", "style": "h1", "children": [...] },
  { "_type": "block", "_key": "b2", "style": "normal", "children": [...] },
  { "_type": "image", "_key": "i1", "asset": {...} },
  { "_type": "block", "_key": "b3", "style": "normal", "children": [...] },
  { "_type": "infoBox", "_key": "ib1", "title": "...", "content": [...] }
]
```

## Key design decisions

1. **Flat array, not tree** — The top-level structure is a flat array of blocks, not a nested tree. This simplifies serialization, diffing, and collaborative editing.
2. **_type discriminates** — Every object uses `_type` for polymorphic dispatch. No separate `nodeType` or `kind` field.
3. **_key enables diffing** — Every object has `_key` for stable identity across edits.
4. **Marks are references** — Annotations use a key-reference system (`markDefs[].\_key` ↔ `span.marks[]`) rather than nesting objects inside spans.
5. **Custom blocks are open** — Only `_type` and `_key` are required. All other fields are schema-defined.

## Source
- PT specification: https://github.com/portabletext/portabletext
- Type definitions: `packages/@sanity/types/src/portableText/types.ts`
