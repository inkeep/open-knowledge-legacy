# Evidence: Fumadocs Accordion (standalone case)

**Date:** 2026-04-22
**Sources:** fumadocs OSS repo (radix-ui + base-ui variants)

## Key files
- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/packages/radix-ui/src/components/accordion.tsx`
- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/packages/base-ui/src/components/accordion.tsx`
- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/apps/docs/content/docs/ui/components/accordion.mdx`
- `/Users/edwingomezcuellar/.claude/oss-repos/fumadocs/apps/docs/content/docs/ui/props.ts`

## Findings

### Finding: Fumadocs has NO standalone single-Accordion component
**Confidence:** CONFIRMED
**Evidence:** `packages/radix-ui/src/components/accordion.tsx:59-80`

```tsx
export function Accordion({
  title,
  id,
  value = String(title),
  children,
  ...props
}: Omit<ComponentProps<typeof AccordionItem>, 'value' | 'title'> & {
  title: string | ReactNode;
  value?: string;
}) {
  return (
    <AccordionItem value={value} {...props}>
      <AccordionHeader id={id} data-accordion-value={value}>
        <AccordionTrigger>{title}</AccordionTrigger>
```

The `<Accordion>` export is always an `AccordionItem` — it must be nested inside `<Accordions>` (the Radix `Root`) to receive the controlling context. Using it alone renders an unstyled item with no toggle behavior.

### Finding: Single-item Accordion effectively = `<Accordions type="single"><Accordion title="...">...</Accordion></Accordions>`
**Confidence:** CONFIRMED
**Evidence:** `apps/docs/content/docs/ui/components/accordion.mdx:25-28`

```mdx
<Accordions type="single">
  <Accordion title="My Title">My Content</Accordion>
</Accordions>
```

This is the canonical "standalone toggle" form in Fumadocs. Props on the inner `<Accordion>` relevant to a standalone case:
- `title: string | ReactNode` (required) — the trigger label
- `id?: string` — enables hash-linking (auto-opens when URL hash matches)
- `value?: string` — defaults to `String(title)`

### Finding: `defaultValue` on `<Accordions>` controls initial open state
**Confidence:** CONFIRMED
**Evidence:** `packages/radix-ui/src/components/accordion.tsx:21-28`

```tsx
const [value, setValue] = useState<string | string[]>(() =>
  type === 'single' ? (defaultValue ?? '') : (defaultValue ?? []),
);
```

For a single-item group, `defaultValue="My Title"` (matching the inner `value`) opens it on mount. No `defaultOpen` prop on the individual `<Accordion>`.

### Finding: base-ui variant adds `hiddenUntilFound` for in-page search
**Confidence:** CONFIRMED
**Evidence:** `packages/base-ui/src/components/accordion.tsx:71`

```tsx
<AccordionContent hiddenUntilFound>
```

Browser "find in page" can reveal collapsed content. This is a progressive enhancement missing in the radix-ui variant.

## Implications for OK Toggle superset
- Fumadocs provides no native `defaultOpen` on the item itself; consumers encode it via the group's `defaultValue`. OK can simplify by putting `defaultOpen` directly on the Toggle descriptor (matches Mintlify/Notion/HTML5 convention).
- The `id` / hash-linking + copy-button behavior is a value-add worth replicating as optional props.
- Migration from Fumadocs standalone Accordion: map `title` → `title`, `id` → `id`, `Accordions.defaultValue === Accordion.value` → `defaultOpen: true`.
