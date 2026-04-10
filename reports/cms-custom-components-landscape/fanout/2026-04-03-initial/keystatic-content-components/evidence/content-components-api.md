---
title: Keystatic Content Components Schema Definition API
source_type: primary
source_paths:
  - packages/keystatic/src/content-components.ts
  - packages/keystatic/src/form/api.tsx
  - packages/keystatic/src/form/fields/index.ts
repo: https://github.com/Thinkmill/keystatic
---

# Content Components Schema Definition API

## Five Component Kinds

Keystatic defines **five distinct component kinds** via factory functions exported from `content-components.ts`:

### 1. `block()` — Leaf block (no children)
```typescript
// content-components.ts:87-91
export function block<Schema extends Record<string, ComponentSchema>>(
  config: BlockComponentConfig<Schema>
): BlockComponent<Schema> {
  return { kind: 'block', ...config };
}
```
Self-closing block-level element. Props only, no nested rich text content.

### 2. `wrapper()` — Block with children
```typescript
// content-components.ts:46-50
export function wrapper<Schema extends Record<string, ComponentSchema>>(
  config: WrapperComponentConfig<Schema>
): WrapperComponent<Schema> {
  return { kind: 'wrapper', ...config };
}
```
Block-level element that wraps nested rich text content (`block+` in ProseMirror content expression).

### 3. `inline()` — Inline element
```typescript
// content-components.ts:132-136
export function inline<Schema extends Record<string, ComponentSchema>>(
  config: InlineComponentConfig<Schema>
): InlineComponent<Schema> {
  return { kind: 'inline', ...config };
}
```
Inline-level self-closing element. Renders as `<span>` in ProseMirror DOM.

### 4. `mark()` — Inline formatting mark
```typescript
// content-components.ts:174-178
export function mark<Schema extends Record<string, ComponentSchema>>(
  config: MarkComponentConfig<Schema>
): MarkComponent<Schema> {
  return { kind: 'mark', ...config };
}
```
ProseMirror mark (not a node). Wraps inline text with configurable `tag`, `style`, and `className`.

### 5. `repeating()` — Container with validated children
```typescript
// content-components.ts:193-209
export function repeating<Schema extends Record<string, ComponentSchema>>(
  config: RepeatingComponentConfig<Schema>
): RepeatingComponent<Schema> {
  return {
    kind: 'repeating',
    ...config,
    children: Array.isArray(config.children) ? config.children : [config.children],
    validation: {
      children: {
        min: config.validation?.children?.min ?? 0,
        max: config.validation?.children?.max ?? Infinity,
      },
    },
  };
}
```
Like wrapper, but children are constrained to specific component types with min/max validation.

## ComponentSchema Union Type

From `form/api.tsx:319-327`:
```typescript
export type ComponentSchema =
  | ChildField
  | FormField<any, any, any>
  | ObjectField
  | ConditionalField<BasicFormField<any, any, any>, { [key: string]: ComponentSchema }>
  | ArrayFieldInComponentSchema;
```

## Available Field Types

Exported from `form/fields/index.ts`:
- `text`, `url`, `integer`, `number`, `date`, `datetime`
- `select`, `multiselect`, `checkbox`
- `image`, `file`, `cloudImage`
- `relationship`, `multiRelationship`, `pathReference`
- `array`, `object`, `conditional`, `blocks`
- `slug`, `empty`, `ignored`
- `mdx`, `markdoc` (nested document fields)

## ContentView vs NodeView Pattern

Each component kind supports **two rendering strategies** (union discriminated):

1. **`ContentView`** — Read-only display; editing happens via modal dialog
2. **`NodeView`** — Full custom node view with `onChange`, `onRemove`, `isSelected` props

Wrapper/repeating components pass `children: ReactNode` to both views for nested rich text.

## Configuration Shape

All component kinds share:
```typescript
{
  label: string;
  description?: string;
  icon?: ReactElement;
  schema: Record<string, ComponentSchema>;  // The typed props
  forSpecificLocations?: boolean;  // Exclude from insert menu
}
```
