---
title: Builder.io Component Registration and Mitosis Architecture
type: primary-source-synthesis
sources:
  - https://www.builder.io/c/docs/custom-components-setup
  - https://www.builder.io/c/docs/custom-components-input-types
  - https://www.builder.io/c/docs/how-builder-works-technical
  - https://github.com/BuilderIO/mitosis
  - https://www.builder.io/c/docs/custom-components-children
date: 2026-04-03
---

# Builder.io: Component Registration and Architecture

## Registration API

Gen 1: `Builder.registerComponent(Component, { name, inputs })` — global singleton registration
Gen 2: `customComponents` prop on `<Content>` component — array-based, per-render

## Input Types (22 types)

string, longText, richText, html, number, boolean, color, file, date, email, url, object (subFields), list (repeatable subFields), reference, code, javascript, json, uiBlocks (nested Builder blocks), enum

Key types for nesting:
- `richText` — WYSIWYG, stores HTML string, requires `dangerouslySetInnerHTML`
- `uiBlocks` — nested editable Builder block regions (named slots)
- `canHaveChildren: true` — enables `props.children` for child blocks

## Iframe Architecture

Visual Editor loads your actual site in an iframe. SDK communicates via postMessage. Builder never stores component code — only names + serialized options.

## Mitosis Compiler

Builder uses Mitosis to generate framework-specific SDKs from a single source. Compiles to React, Vue, Svelte, Qwik, Angular, Solid, React Native. All SDKs follow identical rendering pipeline.

## Serialization

JSON tree of BuilderBlock objects:
- `@type: "@builder.io/sdk:Element"` — type discriminator
- `component.name` — maps to registered component
- `component.options` — serialized input values
- `children` — recursive nesting
- `responsiveStyles` — per-breakpoint CSS
- `bindings`/`actions` — JavaScript expressions
