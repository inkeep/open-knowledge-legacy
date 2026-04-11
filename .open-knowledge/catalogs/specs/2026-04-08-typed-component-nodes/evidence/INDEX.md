---
title: evidence
description: ""
generated: true
schema_version: 1
---

## Articles

- **[Atom vs Non-Atom Node Type Split for JSX Components](specs/2026-04-08-typed-component-nodes/evidence/node-type-split-architecture.md)** — Investigation confirming two node types (jsxComponentEditable + jsxComponentVoid) is the correct architecture. Single node type with runtime atom toggling is not a viable pattern.
- **[Children Parsing Strategy — marked.lexer() + helpers.parseBlockChildren()](specs/2026-04-08-typed-component-nodes/evidence/children-parsing-strategy.md)** — Resolved OQ13. Code fence children can be parsed into ProseMirror fragments by tokenizing with marked.lexer() then passing tokens to helpers.parseBlockChildren(). No circular dependencies, no MarkdownManager access needed.
- **[CMS Component Landscape Prior Art Synthesis](specs/2026-04-08-typed-component-nodes/evidence/cms-prior-art-synthesis.md)** — Key patterns from cms-custom-components-landscape and react-types-as-editor-schema reports relevant to prop panels, inline children, and component registry architecture.
- **[Component Inventory — Sources, Gaps, and Obsidian Parity Tracking](specs/2026-04-08-typed-component-nodes/evidence/component-inventory-and-gaps.md)** — Complete inventory of built-in components by source (fumadocs, docskit, shadcn), with gap analysis against Obsidian's 13 callout types + block types. Used to track what's covered, what's deferred, and where each component originates.
- **[Fumadocs Serialization Compatibility — jsx-component fences are NOT valid MDX](specs/2026-04-08-typed-component-nodes/evidence/fumadocs-serialization-compatibility.md)** — Critical finding. Fenced code blocks with jsx-component info string render as code snippets in fumadocs, not as components. The on-disk format must be raw JSX for fumadocs compatibility. This reopens D1.
- **[JSX Parser Options Comparison](specs/2026-04-08-typed-component-nodes/evidence/jsx-parser-comparison.md)** — Bundle size, capability, and trade-off analysis for @babel/parser vs acorn+acorn-jsx vs custom regex parser for parsing JSX component strings.
- **[NodeViewContent Feasibility for Inline-Editable Children](specs/2026-04-08-typed-component-nodes/evidence/nodeviewcontent-feasibility.md)** — Investigation confirming TipTap's NodeViewContent supports editable rich-text content holes inside ReactNodeViewRenderer — Layer 3 is architecturally feasible.
- **[Raw JSX markdownTokenizer — Proven via Prototype (24/24 tests pass)](specs/2026-04-08-typed-component-nodes/evidence/raw-jsx-tokenizer-proof.md)** — Complete proof that TipTap's markdownTokenizer API supports raw JSX on disk. Prototype built and tested. All edge cases pass. Round-trips are stable.
- **[react-docgen-typescript Actual Behavior](specs/2026-04-08-typed-component-nodes/evidence/react-docgen-typescript-behavior.md)** — Verified output format, ReactNode detection, union extraction, children filtering, and propFilter mechanics from source + live test.
- **[TipTap Dynamic Attributes & y-prosemirror CRDT Semantics](specs/2026-04-08-typed-component-nodes/evidence/tiptap-dynamic-attributes.md)** — Investigation of how TipTap handles dynamic node attributes and how y-prosemirror syncs them — confirms attribute-level LWW for per-prop concurrent editing.
- **[TipTap MarkdownManager Fragment Serialization for Layer 3](specs/2026-04-08-typed-component-nodes/evidence/markdown-manager-fragment-serialization.md)** — How parseMarkdown creates nodes with child content, and how renderMarkdown serializes content fragments back to markdown. Blockquote + listItem as reference patterns.
