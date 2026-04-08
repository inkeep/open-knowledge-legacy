---
title: TipTap Dynamic Attributes & y-prosemirror CRDT Semantics
description: Investigation of how TipTap handles dynamic node attributes and how y-prosemirror syncs them — confirms attribute-level LWW for per-prop concurrent editing.
created: 2026-04-08
last-updated: 2026-04-08
---

## Finding 1: addAttributes() is runtime-callable with access to editor state
**Confidence:** CONFIRMED (source: tiptap/packages/core/src/Node.ts:326-334)

`addAttributes()` is a method that returns an object, with access to `this.editor`, `this.options`, `this.storage`. Can read registry state at init time.

## Finding 2: Schema is immutable after editor creation
**Confidence:** CONFIRMED (source: tiptap/packages/core/src/helpers/getAttributesFromExtensions.ts:79-119)

`addAttributes()` is called once at schema build time. Attributes are compiled into the ProseMirror `NodeSpec.attrs` and cannot change during the session. Registry must be loaded before editor init.

## Finding 3: y-prosemirror treats each attribute as independent CRDT value
**Confidence:** CONFIRMED (source: y-prosemirror/src/sync-utils.js:202-210)

`deltaToPSteps()` calls `tr.setNodeAttribute(pos, key, value)` independently per attribute. Two users can edit different attributes of the same node without LWW conflict. Each attribute in YXmlElement's YMap is an independent LWW entry.

## Finding 4: Single extension with formal attributes is the correct architecture
**Confidence:** CONFIRMED

Option D from the spec (data-* attributes + registry mapping) works, with refinement: attributes should be formally declared in the TipTap schema (not just data-* passthrough) so y-prosemirror tracks them individually. The extension reads the registry at init and generates one attribute per known prop name across all components.

## Finding 5: Custom parseHTML/renderHTML per attribute is supported
**Confidence:** CONFIRMED (source: tiptap/packages/core/src/helpers/injectExtensionAttributesToParseRule.ts:12-47)

Each attribute can have its own `parseHTML(element)` and `renderHTML(attrs)` functions. Can emit as `data-prop-*` in HTML while keeping formal schema attributes.
