---
title: CMS Component Landscape Prior Art Synthesis
description: Key patterns from cms-custom-components-landscape and react-types-as-editor-schema reports relevant to prop panels, inline children, and component registry architecture.
created: 2026-04-08
last-updated: 2026-04-08
---

## Finding 1: Children should NEVER be in prop panels
**Confidence:** CONFIRMED (universal consensus across 12 CMS systems + Webstudio)

Webstudio treats children/ReactNode as a structural content model, not a prop control. Storybook's attempt to render ReactNode in prop panels has 4+ open bug reports since 2020. Every CMS excludes children from prop editing UI.

## Finding 2: Auto-extract + override is the universal model
**Confidence:** CONFIRMED (Webstudio pattern)

```
Layer 1: react-docgen-typescript → __generated__/component.props.ts (auto)
Layer 2: component.ws.ts → imports + spreads + overrides specific controls (manual)
```

10/12 CMS systems use auto-generated controls; all 12 have an escape hatch for manual overrides.

## Finding 3: Control type mapping consensus

| TypeScript Type | Control |
|---|---|
| `boolean` | Toggle/checkbox |
| `number` | Numeric stepper |
| `string` | Text input |
| `string` matching `/color/i` | Color picker |
| String union ≤3 | Radio group |
| String union >3 | Dropdown select |
| `React.ReactNode` | Excluded (structural) |
| Callbacks (`on*`) | Hidden |
| Complex objects | Hidden or manual override |

## Finding 4: No CMS achieves inline WYSIWYG for structured props in document flow
**Confidence:** CONFIRMED

Every system separates prop editing into panels/modals/drawers. Children get inline editing (Keystatic's wrapper kind), but primitive props always go to a panel. This validates our prop panel + inline children architecture.

## Finding 5: Keystatic "wrapper kind" is the reference for Layer 3
**Confidence:** CONFIRMED

Keystatic uses ProseMirror container nodes where:
- Props edited in a modal/panel
- Rich text children render inline and are editable
- This avoids children trapped in void nodes

Pattern: props in panel, children inline. Exactly what our spec proposes.

## Finding 6: Nesting degrades at depth > 2
**Confidence:** INFERRED (from multiple CMS experiences)

Recursive nesting (components inside components) is supported but UX degrades beyond 2-3 levels. No hard limits needed for P0, but design for 2-3 levels.

## Finding 7: Single discriminator field is universal
**Confidence:** CONFIRMED

Every system uses a single string field to route: `blockType`, `_type`, `name`, node type. Our `componentName` attribute follows this pattern.
