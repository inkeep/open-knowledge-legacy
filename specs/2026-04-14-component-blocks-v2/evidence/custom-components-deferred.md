---
name: Custom components deferred — preserved analysis
description: Complete capture of custom-component design work from D9/D10 era before user directive scoped this out. Preserved so future re-spec doesn't lose prior insights.
type: evidence
status: DEFERRED as of 2026-04-14
---

# Custom Components — Deferred Scope: Preserved Analysis

**Status at save time:** This document captures the design work done for user-registered custom components (non-built-in components added via `.open-knowledge/components.ts`) before the user directive on 2026-04-14 scoped this out of Component Blocks v2.

**Directive that flipped scope:**
> "i think whatever components we include will just be part of our default editor/etc. -- supporting a customer's custom components is a later out of scope issue. we'll need to figure out styling isolation/etc. for those later."
> — User, 2026-04-14 conversation (post-Storybook-research)

**Consumer of this document:** the follow-up spec that re-opens custom components after Component Blocks v2 ships. Do not lose these insights.

---

## Context: What was locked (D9 + D10) before the flip

### D9 (LOCKED 2026-04-14, later FLIPPED): Custom component registration via `.open-knowledge/components.ts` explicit config file

**Original rationale:** Explicit registration is minimal ceremony; file-system scanning is convenience layer. Greenfield: set the clean primitive now; add scanning when demand surfaces. File-system scanning (auto-scan `mdx-components.tsx` at project root) deferred to Future Work as convenience layer.

### D10 (LOCKED 2026-04-14, later FLIPPED): Custom components IN P0 scope

**Original rationale:** User-stated hard requirement ("custom components are definitely a requirement to account for"); the one-node architecture (D1 widened `jsxComponent`) makes this zero-migration; de-risks later additions.

---

## §1 The `.open-knowledge/components.ts` config file pattern

### Design

Users would add a TypeScript file at `.open-knowledge/components.ts` declaring custom components they want the editor to render natively:

```typescript
// .open-knowledge/components.ts
import { DataViz } from './my-components/DataViz';
import type { JsxComponentDescriptor } from '@inkeep/open-knowledge-core';

export const customComponents: JsxComponentDescriptor[] = [
  {
    name: 'DataViz',
    isInline: false,
    hasChildren: true,
    props: [
      { name: 'chartType', type: 'enum', enumValues: ['bar', 'line', 'pie'], required: true },
      { name: 'title', type: 'string' },
    ],
    Component: DataViz,
    icon: 'chart',
    category: 'data',
    displayName: 'Data Visualization',
  },
];
```

Loaded by the editor at startup; imported + merged with built-ins registry.

### Prop extraction path

Props could be hand-authored OR auto-generated via `bun run build-registry` extended to scan `.open-knowledge/components.ts` source files via react-docgen-typescript. Build-time extraction matches the built-ins approach and avoids runtime TypeScript compiler cost.

### Hot reload

Adding a descriptor to `.open-knowledge/components.ts` and reloading the editor upgrades all existing `<DataViz>` instances at render-time — runtime descriptor lookup, no document migration, no Y.Doc mutation. Verified by y-prosemirror research (reports/prior art confirmed sync doesn't distinguish atom vs non-atom; descriptor lookup is pure render-time).

### De-registration

Removing `DataViz` from registry downgrades existing instances to the wildcard descriptor — name badge + editable children + no PropPanel. Content preserved via sourceRaw. If never edited since registration change, `sourceDirty: false` → sourceRaw emitted byte-identical.

---

## §2 Persona P3 (Component contributors) — deferred

Persona coverage included:

**P3: Component contributors (monorepo + end-user).** Adding components — whether to the committed built-ins manifest OR their own `.open-knowledge/components.ts`. Care about: low-ceremony registration, auto-generated prop controls, no document migration when adding/removing a component.

Under the deferred scope, P3 applies only to the COMMITTED built-ins manifest (open-knowledge maintainers adding new fumadocs components, etc.). End-user P3 is deferred.

---

## §3 MCP / agent discoverability for custom components — deferred

**Persona P4: Downstream consumers of the component manifest** — agent docs generators, MCP tool schemas, docs site rendering. Care about: typed, stable, programmatically-queryable registry.

MCP tool schemas derive from the built-ins registry currently. If we re-add custom components, the MCP surface needs to expose both built-ins and user-declared. The JSON derivation was going to happen at request-time from the TypeScript source (NG5: no separate .json wire-format — TypeScript IS the wire format). This design decision stays intact for built-ins; if custom components re-enter scope, the same derivation applies.

---

## §4 Styling isolation for custom components — explicitly out of scope

**User's directive:** "we'll need to figure out styling isolation/etc. for those later."

For built-ins we use fumadocs-ui which has its CSS variable namespace (`--color-fd-*`) that we bridge to our shadcn tokens (~80 LoC in globals.css, see new §9.7a).

For custom components, unknowns include:
- Their Tailwind utility classes won't be in our `@source` directive unless scanned
- They may use their own CSS variables that conflict with our design system
- They may ship their own CSS bundle that conflicts with globals
- Dark-mode handling differs between Tailwind/CSS-in-JS/styled-components
- User components may use `@emotion`, `styled-jsx`, or other runtime CSS solutions we haven't validated in editor context

All deferred to the follow-up spec with empirical investigation required.

---

## §5 Prior-art references for the deferred re-spec

The design work done in Storybook research (`reports/storybook-ecosystem-component-blocks-reuse/REPORT.md`) and Fumadocs ecosystem research (`reports/fumadocs-ecosystem-component-blocks-reuse/REPORT.md`) includes patterns the re-spec should leverage:

| Pattern | Source | Applicability |
|---|---|---|
| Framer `addPropertyControls(Comp, {...})` with 22 types | `reports/storybook-.../evidence/visual-editors-component-registration.md` | Richest prop type vocab; our PropDef is a subset |
| Plasmic `registerComponent(Comp, {...})` with 16 types + `custom` | Same | Has `custom` escape for arbitrary React as a control |
| Builder.io `Builder.registerComponent(Comp, {...})` manual input declaration | Same | No TS extraction; explicit is unambiguous |
| MDXEditor `JsxComponentDescriptor` with `Editor` component escape | Same | Custom renderer per descriptor; could inform styling isolation |
| Webstudio auto-generation from TypeScript types | Same | Two-layer model (meta + generated .props file) |
| Storybook `argTypes.control: false` per-prop suppression | `reports/storybook-.../evidence/argtypes-controls.md` | Already adopted as `hidden?: boolean` on PropDef in this spec |
| Storybook `hidden(props)` / `if` conditional visibility | Same | Convergent across Framer/Plasmic/Storybook — defer unless real need |
| Keystatic five-kind taxonomy (wrapper/block/inline/mark/repeating) | `reports/fumadocs-ecosystem-.../REPORT.md` §4 | Richer than `isInline: boolean`; consider for multi-content-hole (NG2) |
| Leva plugin API for custom controls | Same | Hook-based (single React tree); needs adaptation for our per-NodeView architecture |

---

## §6 Open questions for the re-spec

1. **Wire format for custom registration:** TypeScript file (as spec'd here) vs JSON manifest vs CLI tooling (`open-knowledge register-component ...`)? Reopen.

2. **Styling isolation strategy:** Shadow DOM per NodeView? Scoped CSS bundles? Tailwind-in-Tailwind? Reopen.

3. **Live-reload via HMR:** Can Vite HMR re-load user components without full editor remount? Reopen.

4. **Prop extraction for user components:** react-docgen-typescript per-file adds 400-900ms per build (Storybook Issue #28269). Acceptable for small custom sets? What's the ceiling before we push to runtime manual declaration (Builder.io pattern)?

5. **Security / trust model for user components:** What if a user component includes a `<script>` with arbitrary behavior, or reaches out to network? Editor renders the live component — same trust surface as the production site. Reopen.

6. **Collision between custom component name and a future built-in name:** If user registers `<Card>` with a different schema than fumadocs Card, which wins? Reopen.

7. **Agent/MCP exposure of custom components:** When MCP tools query available components, do they get the union (built-ins + custom) or just one set? Reopen.

8. **Visual indicator that a component is user-registered vs built-in:** Badge color? Tooltip? Any? Reopen.

9. **Migration when a user removes a custom component:** Current design is "gracefully downgrade to wildcard; content preserved." Validate this still works under the new architecture once Context Bridge Registry ships for compound components.

10. **Compound custom components:** If a user's custom `<MyTabs>` provides context to `<MyTab>` children, they'd need to declare `contextPublisher` the same way our built-ins do (post-Context-Bridge-Registry). The re-spec needs to expose this mechanism cleanly to user registration.

---

## §7 What the spec looked like before the flip

**Files that had content dedicated to custom components:**
- §4 Personas: P3 end-user contributor role
- §5 User Journeys: "P3 adding a custom component (explicit registration)" + "P3 de-registering"
- §9.2 Descriptor registry: built-ins + user-config merge, both branches
- §9.12 "Custom component registration — `.open-knowledge/components.ts`" (removed by the flip; snapshot preserved below)
- §13 In Scope: `.open-knowledge/components.ts` loader (removed by flip)
- §14 Risks: custom components error boundary concerns (still relevant for built-ins)
- Decision log D9 + D10 (flipped to NG-tier with rationale-preserved status)

### §9.12 content snapshot (removed by the flip)

```markdown
### 9.12 Custom component registration — `.open-knowledge/components.ts`

\`\`\`typescript
// .open-knowledge/components.ts
import { DataViz } from './my-components/DataViz';
import type { JsxComponentDescriptor } from '@inkeep/open-knowledge-core';

export const customComponents: JsxComponentDescriptor[] = [
  {
    name: 'DataViz',
    isInline: false,
    hasChildren: true,
    props: [
      { name: 'chartType', type: 'enum', enumValues: ['bar', 'line', 'pie'], required: true },
      { name: 'title', type: 'string' },
    ],
    Component: DataViz,
    icon: 'chart',
    category: 'data',
    displayName: 'Data Visualization',
  },
];
\`\`\`

Loaded by the editor at startup (imported + merged with built-ins registry). Props can be hand-authored OR auto-generated via `bun run build-registry` extended to scan `.open-knowledge/components.ts` source files.
```

---

## §8 Test scenarios that were drafted (preserved for re-spec)

From §7a test scenarios:

- **CC01:** Add `DataViz` descriptor to `.open-knowledge/components.ts`, reload editor → Existing `<DataViz>` instances in open documents upgrade at render-time — no re-parse, no Y.Doc mutation, identical `encodeStateAsUpdate` before/after.
- **CC02:** Remove `DataViz` from registry → Existing instances downgrade to wildcard (UnregisteredBadge) on next render; content preserved; sourceRaw byte-identical if untouched.
- **CC03:** Custom component with `searchTerms: ['chart']` → `/chart` surfaces it in slash menu.
- **CC04:** Custom component throws on render → ComponentErrorBoundary catches.
- **CC05:** Custom component uses fumadocs-ui internally → Renders correctly if fumadocs context available; falls through to boundary if not.
- **CC06:** Two clients, one registers `DataViz`, other doesn't → MR03 behavior — no CRDT conflict; view differs by registry state.

These remain valid acceptance criteria for the re-spec. Keep them for reference.

---

## §9 Re-spec entry criteria

The re-spec should be triggered when one of the following is true:

1. Open Knowledge's user base articulates a concrete need for custom components (more than ad-hoc requests — actual workflow blocker for paying customers).
2. The built-in component set is insufficient for a meaningful fraction of use cases.
3. A partner/integration request requires custom component support.
4. Component Blocks v2 ships and the team has capacity for the next spec cycle.

When triggered, read this evidence file first. Preserve the prior work.
