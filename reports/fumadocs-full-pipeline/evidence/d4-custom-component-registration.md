# Evidence: D4 — Custom Component Registration

**Dimension:** Custom component registration
**Date:** 2026-04-03
**Sources:** fumadocs repo source code, official docs, blog posts

---

## Key files referenced

- `examples/next/components/mdx.tsx` — getMDXComponents pattern
- `packages/radix-ui/src/mdx.tsx` — defaultMdxComponents
- `packages/radix-ui/src/mdx.server.tsx` — createRelativeLink
- `examples/next/app/docs/[[...slug]]/page.tsx` — component passing at render site

---

## Findings

### Finding: Custom component registration is done through the getMDXComponents pattern
**Confidence:** CONFIRMED
**Evidence:** `examples/next/components/mdx.tsx`

```typescript
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
```

### Finding: Components are passed at the render call site, not globally registered
**Confidence:** CONFIRMED
**Evidence:** `examples/next/app/docs/[[...slug]]/page.tsx`

```tsx
<MDX
  components={getMDXComponents({
    a: createRelativeLink(source, page),
  })}
/>
```

This is the standard MDX component mapping pattern. Every component in the mapping object is available in MDX content by name. To add a custom component:

1. Create a React component
2. Add it to the getMDXComponents return value
3. Use it in MDX files: `<MyComponent prop="value" />`

### Finding: There is NO separate registration step — it's just React component passing
**Confidence:** CONFIRMED
**Evidence:** The entire mechanism is standard MDX `components` prop. No registration API, no plugin system, no manifest file.

To make a custom component globally available across all MDX pages:

```typescript
// components/mdx.tsx
import MyCustomWidget from './my-custom-widget';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    MyCustomWidget,  // Now available as <MyCustomWidget /> in all MDX
    ...components,
  };
}
```

### Finding: The mdx-components.tsx convention is optional and only for discoverability
**Confidence:** CONFIRMED
**Evidence:** From fumadocs blog "Adding new Conventions":

> "some kind of conventions may help" because beginners were confused about component registration location.

The file is NOT required by the framework. It's a convention that provides a clear entry point for component registration.

### Finding: TypeScript prop types are NOT used anywhere in the pipeline for validation or introspection
**Confidence:** CONFIRMED
**Evidence:** Thorough search of the codebase shows no runtime prop type extraction, no react-docgen usage, no TypeScript compiler API usage for component introspection. The TypeScript types exist for developer experience (autocomplete, type checking) but are not used at build time or runtime for any purpose beyond standard TS compilation.

**Implications for visual editor:** A visual editor would need to add its own prop introspection layer (react-docgen-typescript, TS Compiler API, or similar) to extract prop types from registered components. Fumadocs provides no foundation for this.

### Finding: The global type declaration augments MDX's type system
**Confidence:** CONFIRMED
**Evidence:** `examples/next/components/mdx.tsx`

```typescript
declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
```

This provides TypeScript autocomplete for component names in MDX files when using TypeScript-aware MDX tooling.

---

## Gaps / follow-ups

- How third-party components (non-Fumadocs) work when imported directly in MDX via ESM import statements
