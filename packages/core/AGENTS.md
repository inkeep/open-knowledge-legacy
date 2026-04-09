# Component Registry — Agent Reference

## Reading the Manifest

The canonical component registry is at `packages/core/src/generated/components.ts`. It exports `componentManifest: Record<string, ComponentMeta>` with PropDef arrays for each component. This file is generated — do not edit by hand.

```typescript
import { componentManifest } from '@inkeep/open-knowledge-core';
const calloutMeta = componentManifest['Callout'];
// → { props: [{ name: 'type', type: 'enum', enumValues: ['info','warn','error',...] }, ...], displayName: 'Callout', category: 'content' }
```

## Regenerating

```bash
bun run build-registry
```

Run this after changing `packages/core/src/registry/built-ins.ts` or upgrading `fumadocs-ui` / `@inkeep/docskit`.

## Reserved Built-in Names (21)

These component names are owned by the editor's built-in registry. User content with matching tag names will render using the built-in component (unknown attributes are preserved but not rendered — see SPEC §3.8).

Callout, Tabs, Tab, Card, Cards, Steps, Step, Accordion, Accordions, ImageZoom, Files, File, Folder, TypeTable, Banner, InlineTOC, Video, Frame, CodeGroup, Mermaid, Audio

Custom component discovery (where user-defined components override built-ins) is Future Work. See `specs/2026-04-08-typed-component-nodes/SPEC.md` §6.

## Sourcing

- **Fumadocs (10 families):** Callout, Tabs/Tab, Card/Cards, Steps/Step, Accordion/Accordions, ImageZoom, Files/File/Folder, TypeTable, Banner, InlineTOC
- **Docskit (3):** Video, Frame, CodeGroup
- **Shadcn-installed (2):** Mermaid, Audio
