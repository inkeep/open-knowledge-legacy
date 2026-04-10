# Evidence: Lessons Learned and Edge Cases

**Dimension:** D5 — What goes wrong when auto-generating editing UIs from TypeScript
**Date:** 2026-04-03
**Sources:** Storybook GitHub issues, Webstudio source code, react-docgen-typescript issues, community discussions

---

## Key files / pages referenced

- [Storybook #26606](https://github.com/storybookjs/storybook/issues/26606) — react-docgen tracking umbrella
- [Storybook #25686](https://github.com/storybookjs/storybook/discussions/25686) — react-docgen as TS default QA
- [Storybook #28269](https://github.com/storybookjs/storybook/issues/28269) — fast refresh slow since v8.1.0
- [react-docgen-typescript #112](https://github.com/styleguidist/react-docgen-typescript/issues/112) — performance
- [react-docgen-typescript #203](https://github.com/styleguidist/react-docgen-typescript/issues/203) — generics
- [react-docgen-typescript #320](https://github.com/styleguidist/react-docgen-typescript/issues/320) — custom component types
- [Plasmic forum: auto-register with TS types](https://forum.plasmic.app/t/how-to-automatically-register-components-with-typescript-types/636)
- [Plasmic forum: improving registration](https://forum.plasmic.app/t/improving-component-registration-process/4563)
- [Builder.io ideas: auto-create inputs from props](https://ideas.builder.io/ideas/PROD-I-55)
- `webstudio/packages/generate-arg-types/src/arg-types.ts` — silent drops

---

## Findings

### Finding: Silent type dropping is the #1 failure mode — users don't know a prop was lost
**Confidence:** CONFIRMED
**Evidence:** Webstudio `getArgType()` default case, Storybook react-docgen behavior

Webstudio's `getArgType()` returns `undefined` for any type it doesn't recognize:

```typescript
default:
  if (name === "role" || name.startsWith("aria-")) {
    return makePropMeta("string", "text");
  }
  return; // silently dropped
```

This means: `Record<string, unknown>`, `CustomType`, `SomeInterface`, `T[]`, and any complex type produces NO control in the panel. The user never sees an error — the prop simply doesn't appear. This is a deliberate design choice (avoid broken controls) but creates a trust gap: "Why can't I edit this prop?"

Storybook's react-docgen has the same pattern — unknown types result in no control or a generic "object" control.

### Finding: React.ReactNode/children is the most common "surprising" failure
**Confidence:** CONFIRMED
**Evidence:** [Storybook #13551](https://github.com/storybookjs/storybook/issues/13551), [#24005](https://github.com/storybookjs/storybook/issues/24005), [#12570](https://github.com/storybookjs/storybook/issues/12570), [#11429](https://github.com/storybookjs/storybook/issues/11429)

Multiple open issues across years. ReactNode shows as:
- JSON object editor (confusing for non-developers)
- Crashes when entering arbitrary values
- Cannot display JSX content in the Controls panel
- "children in the args object?" — fundamental design question

The Storybook team acknowledges this is an unsolved problem. Their short-term fix is rendering ReactNode as a text editor, but this loses the ability to configure rich content.

### Finding: Imported/cross-file types are the #1 technical limitation
**Confidence:** CONFIRMED
**Evidence:** [Shilman gist](https://gist.github.com/shilman/036313ffa3af52ca986b375d90ea46b0), react-docgen behavior

This was called a "dealbreaker for most projects." Real-world components almost always import types:

```typescript
// types.ts
export type Variant = "primary" | "secondary" | "ghost";
// button.tsx
import { Variant } from "./types";
interface ButtonProps { variant: Variant; }
```

react-docgen (Babel) loses the Variant resolution entirely. react-docgen-typescript handles this correctly because it runs the full TypeScript type checker.

**Lesson:** Any auto-extraction system for real-world TypeScript MUST use the TypeScript Compiler API, not Babel.

### Finding: forwardRef is a persistent pain point across all systems
**Confidence:** CONFIRMED
**Evidence:** [Storybook #8881](https://github.com/storybookjs/storybook/issues/8881), [react-docgen #883](https://github.com/reactjs/react-docgen/issues/883), react-docgen-typescript parser.ts line 338

`React.forwardRef()` wraps the component in a `ForwardRefExoticComponent`. react-docgen-typescript detects this and unwraps:

```typescript
if (symbolName === 'ForwardRefExoticComponent' && ts.isCallExpression(...)) {
  const component = this.checker.getSymbolAtLocation(expression.arguments[0]);
}
```

But edge cases remain: forwardRef + memo, forwardRef with union props (union members lost), forwardRef + generics. Every system has at least one open bug related to forwardRef.

### Finding: Discriminated unions produce confusing UIs — no system handles them well
**Confidence:** INFERRED
**Evidence:** [Storybook #25492](https://github.com/storybookjs/storybook/issues/25492), analysis of all four systems

```typescript
type ButtonProps = 
  | { variant: "link"; href: string }
  | { variant: "button"; onClick: () => void };
```

This should ideally produce: when variant="link", show href field. When variant="button", show onClick. No system does this:
- Storybook: shows all props with type errors
- Webstudio: would show variant as dropdown, both href and onClick always visible
- Plasmic: `hidden` callback can approximate this but requires manual registration

This is the strongest argument FOR manual overrides — auto-extraction cannot express conditional prop visibility.

### Finding: Performance at scale is manageable with shared program but has ceiling
**Confidence:** CONFIRMED
**Evidence:** [react-docgen-typescript #112](https://github.com/styleguidist/react-docgen-typescript/issues/112), [Storybook #28269](https://github.com/storybookjs/storybook/issues/28269)

| Scenario | Time |
|---|---|
| 1 component, fresh program | ~600ms |
| 75 components, fresh program per file | ~40s |
| 75 components, shared program | ~10-15s |
| 200+ components, shared program | ~30-60s |
| Storybook full build, react-docgen-typescript | ~59s |
| Storybook full build, react-docgen (Babel) | ~29s |

Storybook v8.1.0 introduced a regression where fast refresh became very slow with react-docgen-typescript — each save triggers a full docgen pass. For editor use, the recommended pattern is: extract once at project load, re-extract incrementally on file save.

### Finding: Generic components (Table<T>, Select<T>) produce unhelpful types
**Confidence:** CONFIRMED
**Evidence:** [react-docgen-typescript #203](https://github.com/styleguidist/react-docgen-typescript/issues/203), parser.ts line 691

```typescript
<Select<UserType> options={users} />
```

react-docgen-typescript resolves generic constraints (`T extends X` → uses `X`) but unbound generics produce:
- `T` as the type name (unhelpful)
- `React.ComponentProps<T>` unresolved (produces nothing)
- Generic intersection types may lose some members

**Lesson:** Components with generics need manual override to produce useful controls.

### Finding: enum types from TypeScript enums work but have gotchas
**Confidence:** CONFIRMED
**Evidence:** parser.ts union extraction logic, Storybook docs

```typescript
enum Variant { Primary = "primary", Secondary = "secondary" }
```

With `shouldExtractLiteralValuesFromEnum: true`, this extracts correctly. But:
- `const enum` may be inlined by tsc and not visible
- Numeric enums produce number values, not labels
- String enums with computed values don't extract

### Finding: The override mechanism is essential — every mature system has one
**Confidence:** CONFIRMED
**Evidence:** All four systems

| System | Override Mechanism | Override Granularity |
|---|---|---|
| Storybook | `argTypes` in CSF meta | Per-prop, per-story, per-project |
| Webstudio | `.ws.ts` files importing `__generated__` | Per-prop, merges with auto-generated |
| Plasmic | `registerComponent()` meta | Entire component schema (manual) |
| Builder.io | `registerComponent()` inputs | Entire component schema (manual) |

No team ships auto-extraction alone. Every system that started with "just extract from types" added manual overrides. The override layer is WHERE the editorial intent lives — "this string is a URL", "this string is a file path", "this dropdown should have these labels."

### Finding: Types that look simple but cause problems
**Confidence:** CONFIRMED
**Evidence:** Cross-system analysis

1. **`string | undefined`** — react-docgen-typescript produces `"string | undefined"` without `shouldRemoveUndefinedFromOptional`
2. **`VariantProps<typeof X> | null`** — the `| null` from cva VariantProps needs filtering
3. **Index signatures** (`[key: string]: unknown`) — produces unhelpful `string` type
4. **Conditional types** (`T extends X ? A : B`) — resolved at extraction time, may not match runtime
5. **Template literal types** (`\`text-${Size}\``) — resolves to string, loses the structure
6. **Branded types** (`string & { __brand: "URL" }`) — resolves to `string`, loses the brand

---

## Gaps / follow-ups

- How many props is "too many" for a prop panel? (shadcn Button: ~10 props, MUI Button: ~50 props)
- Prop panel UX: grouping, collapsing, search — matters more at scale than auto-extraction quality
