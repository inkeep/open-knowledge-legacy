---
title: Storyblok Blok System and Visual Editor Architecture
type: primary-source-synthesis
sources:
  - https://www.storyblok.com/docs/concepts/blocks
  - https://www.storyblok.com/docs/concepts/fields
  - https://www.storyblok.com/docs/concepts/visual-editor
  - https://www.storyblok.com/docs/packages/storyblok-react
  - https://www.storyblok.com/docs/libraries/js/rich-text
date: 2026-04-03
---

# Storyblok: Blok System

## Three Block Types

| Type | is_root | is_nestable | Purpose |
|---|---|---|---|
| Content Type | true | false | Top-level story types |
| Nestable | false | true | Child building blocks |
| Universal | true | true | Both standalone and nestable |

## 15 Field Types

text, textarea, richtext, markdown, number, boolean, datetime, asset, multiasset, bloks, option, options, link, table, plugin

## Content-as-Component-Tree

CMS schema mirrors frontend component tree. A page is a root component containing a `bloks` field, which is an ordered list of nestable components. The `component` string on every blok is the single-field discriminator that enables the `StoryblokComponent` resolver pattern.

## Bidirectional Rich Text/Blok Nesting

- Bloks can contain `richtext` fields
- Rich text can contain `blok` nodes (TipTap/ProseMirror JSON with Storyblok-specific `"type": "blok"` nodes)
- Nesting depth: theoretically unlimited, constrained by field-level whitelists

## Iframe-Bridge Visual Editor

Frontend app loads in iframe. `storyblokEditable(blok)` spreads data attributes (`data-blok-c`, `data-blok-uid`). Bridge fires `input` event on every keystroke for real-time preview.

## Rich Text Segmentation

`segmentStoryblokRichText()` splits richtext into ordered chunks of HTML vs. embedded blok nodes for mixed rendering.
