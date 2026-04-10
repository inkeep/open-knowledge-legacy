# Evidence: D3 — Built-in Component System

**Dimension:** Component system — built-in components
**Date:** 2026-04-03
**Sources:** fumadocs-ui (packages/radix-ui) source code

---

## Key files referenced

- `packages/radix-ui/src/mdx.tsx` — `defaultMdxComponents` export
- `packages/radix-ui/src/components/callout.tsx` — Callout implementation
- `packages/radix-ui/src/components/tabs.tsx` — Tabs implementation
- `packages/radix-ui/src/components/` — all component files
- `packages/base-ui/src/components/` — unstyled variants

---

## Findings

### Finding: defaultMdxComponents is a plain object mapping tag names to React components
**Confidence:** CONFIRMED
**Evidence:** `packages/radix-ui/src/mdx.tsx:60-85`

```typescript
const defaultMdxComponents = {
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
  pre: (props) => <CodeBlock {...props}><Pre>{props.children}</Pre></CodeBlock>,
  Card,
  Cards,
  a: Link,
  img: Image,
  h1: (props) => <Heading as="h1" {...props} />,
  h2: (props) => <Heading as="h2" {...props} />,
  // ... h3-h6
  table: Table,
  Callout,
  CalloutContainer,
  CalloutTitle,
  CalloutDescription,
};

export { defaultMdxComponents as default };
```

This is the default export of `fumadocs-ui/mdx`. Components are NOT auto-injected — they must be passed to the MDX component via the `components` prop.

### Finding: Full component inventory from radix-ui
**Confidence:** CONFIRMED
**Evidence:** `packages/radix-ui/src/components/` directory listing

- `accordion.tsx` — Accordion
- `banner.tsx` — Banner
- `callout.tsx` — Callout, CalloutContainer, CalloutTitle, CalloutDescription
- `card.tsx` — Card, Cards
- `codeblock.tsx` / `codeblock.rsc.tsx` — CodeBlock, Pre, CodeBlockTabs
- `dynamic-codeblock.tsx` — DynamicCodeblock
- `files.tsx` — Files component
- `github-info.tsx` — GitHubInfo
- `heading.tsx` — Heading
- `image-zoom.tsx` — ImageZoom
- `inline-toc.tsx` — InlineTOC
- `steps.tsx` — Steps
- `tabs.tsx` — Tabs, Tab, TabsList, TabsTrigger, TabsContent
- `type-table.tsx` — TypeTable
- Layout components: sidebar, toc, ui subdirectory

### Finding: Callout is a standard React component with typed props
**Confidence:** CONFIRMED
**Evidence:** `packages/radix-ui/src/components/callout.tsx:9-19`

```typescript
export type CalloutType = 'info' | 'warn' | 'error' | 'success' | 'warning' | 'idea';

export function Callout({
  children,
  title,
  ...props
}: { title?: ReactNode } & Omit<CalloutContainerProps, 'title'>) {
  return (
    <CalloutContainer {...props}>
      {title && <CalloutTitle>{title}</CalloutTitle>}
      <CalloutDescription>{children}</CalloutDescription>
    </CalloutContainer>
  );
}

export interface CalloutContainerProps extends ComponentProps<'div'> {
  type?: CalloutType;
  icon?: ReactNode;
}
```

### Finding: Tabs is a 'use client' component built on Radix primitives
**Confidence:** CONFIRMED
**Evidence:** `packages/radix-ui/src/components/tabs.tsx:1`

```typescript
'use client';
```

Tabs uses React state, context, and `useId()` — it must be a client component. Other components like Callout have no directive and work as server components.

### Finding: Components are NOT made available via a global provider or auto-injection
**Confidence:** CONFIRMED
**Evidence:** `packages/radix-ui/src/mdx.tsx` exports a plain object, and the page component passes it explicitly:

```tsx
// In page.tsx:
<MDX components={getMDXComponents({ a: createRelativeLink(source, page) })} />
```

The `components` prop is the standard MDX mechanism — there is no wrapper provider, no global injection, no magic imports.

**Implications:** For a visual editor, this means the component mapping is a known, inspectable object at the call site. The editor can introspect `defaultMdxComponents` to discover what's available.

---

## Gaps / follow-ups

- base-ui variants and how they differ from radix-ui components
