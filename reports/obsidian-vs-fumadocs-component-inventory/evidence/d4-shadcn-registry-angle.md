# Evidence: The shadcn/Component Registry Angle

**Dimension:** D4 — shadcn/component registry angle
**Date:** 2026-04-03
**Sources:** shadcn/ui docs, fumadocs.dev, existing shadcn-registry-deep-dive report

---

## Key pages referenced

- https://ui.shadcn.com/docs/registry — Registry specification
- https://ui.shadcn.com/docs/directory — Registry directory (155+ registries)
- https://shadcnregistry.com/plate/fumadocs — @plate/fumadocs registry
- https://www.fuma-nama.dev/blog/fumadocs — How Fumadocs works
- shadcn-registry-deep-dive report (2026-03-20)

---

## Findings

### Finding: Fumadocs uses Radix UI primitives (same as shadcn), not shadcn components directly
**Confidence:** CONFIRMED
**Evidence:** fumadocs.dev blog + component source analysis

- fumadocs-ui is built on **Radix UI** primitives (Accordion, Tabs, Collapsible, Dialog, etc.)
- Styling uses **Tailwind CSS** with **CSS variables** for theming — the same approach shadcn/ui uses
- @fumadocs/base-ui provides unstyled component variants (parallel to shadcn's "copy the source" philosophy)
- Fumadocs is NOT distributed as a shadcn registry — it's a traditional npm package
- The design system is *inspired by* shadcn but is its own independent implementation

### Finding: @plate/fumadocs exists as a third-party shadcn registry entry
**Confidence:** CONFIRMED
**Evidence:** shadcnregistry.com/plate/fumadocs

- Plate (the rich text editor framework) has published a `@plate/fumadocs` registry entry
- This provides Plate editor components styled to match Fumadocs' design system
- Indicates the pattern of building editor components that integrate with Fumadocs styling

### Finding: A custom component library COULD be distributed as a shadcn registry
**Confidence:** CONFIRMED
**Evidence:** shadcn-registry-deep-dive report, shadcn/ui registry specification

The shadcn registry spec supports this use case:
- **registry.json** — manifest listing all components
- **registry-item.json** — per-component metadata (source files, dependencies, CSS vars)
- **12 item types** — including `registry:ui`, `registry:component`, `registry:hook`, `registry:lib`
- **CLI installation** — `npx shadcn@latest add <registry>/<component>`
- **MCP server** — AI agents can discover and install components
- **Cross-registry dependencies** — components can depend on other registries

For our knowledge platform component library:
1. Each component (Callout, WikiLink, Mermaid, etc.) would be a registry item
2. Users install via CLI: `npx shadcn@latest add @ourplatform/callout`
3. Source code is copied into their project (source-owned)
4. AI agents can discover and use components via MCP

### Finding: Third-party registries with docs/knowledge components exist
**Confidence:** CONFIRMED
**Evidence:** shadcn registry directory

Relevant registries from the 155+ in the directory:
- **@plate** — rich text editor components
- **@kibo** — documentation site components (uses Fumadocs)
- **@magicui** — animated UI components
- **@aceternity** — animated components
- **@assistant-ui** — AI chat interface components
- **@prompt-kit** — AI prompt/response display components

No dedicated "knowledge management component" registry exists yet. This is an open opportunity.

### Finding: shadcn/ui v4 has no docs-specific components
**Confidence:** CONFIRMED
**Evidence:** shadcn/ui changelog, registry directory

shadcn/ui core focuses on general UI primitives:
- Accordion, Alert, Badge, Button, Card, Dialog, Dropdown, etc.
- No Callout, CodeBlock, Steps, Tabs (as content tabs), TypeTable, or other docs-specific components
- The `registry:base` type can encode design system presets but not content components

---

## Implications

The distribution strategy has two viable paths:
1. **npm package** (current Fumadocs model) — simpler, version-controlled, but users can't modify source
2. **shadcn registry** — source-owned, AI-discoverable, but more setup for consumers

For a knowledge platform where customization is key, the shadcn registry model is strongly aligned. Components like Callout, WikiLink, Mermaid, CodeBlock, etc. benefit from being source-owned because:
- Users need to customize styling to match their brand
- Components may need to be extended with custom props
- AI agents can read and modify the component source

---

## Gaps / follow-ups

- Exact effort to set up a shadcn registry for our components
- How @plate/fumadocs bridges the editor ↔ Fumadocs styling gap
- Whether Fuma Content will adopt the shadcn registry model
