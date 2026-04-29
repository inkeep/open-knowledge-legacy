# Evidence: Fumadocs Callout

**Date:** 2026-04-22
**Sources:** `@fumadocs/radix-ui`, `@fumadocs/base-ui`, `@fumadocs/obsidian` OSS packages; `fumadocs-core/mdx-plugins`.

---

## Key files referenced

- `packages/radix-ui/src/components/callout.tsx` — prop shape + rendering
- `packages/base-ui/src/components/callout.tsx` — byte-identical to radix-ui variant
- `packages/obsidian/src/ui/index.tsx` — ObsidianCallout / ObsidianCalloutTitle / ObsidianCalloutBody
- `packages/obsidian/src/remark/remark-convert.ts` — `>[!type]` → `<ObsidianCallout>` transformer
- `packages/obsidian/src/utils/mdast-create.ts` — shape of emitted MDX
- `packages/core/src/mdx-plugins/remark-admonition.ts` — Docusaurus `:::` → `<Callout>` (deprecated)
- `packages/core/src/mdx-plugins/remark-directive-admonition.ts` — `:::` via `remark-directive` → `<CalloutContainer>`

---

## Findings

### Finding: Fumadocs `<Callout>` prop surface
**Confidence:** CONFIRMED
**Evidence:** `packages/radix-ui/src/components/callout.tsx:5-32`

```ts
export type CalloutType = 'info' | 'warn' | 'error' | 'success' | 'warning' | 'idea';

export interface CalloutContainerProps extends ComponentProps<'div'> {
  type?: CalloutType;              // @defaultValue info
  icon?: ReactNode;                // "Force an icon"
}

export function Callout({ children, title, ...props }: { title?: ReactNode } & Omit<CalloutContainerProps, 'title'>)
```

- `type` enum of 6 values; `warn` is aliased to `warning`, `tip` (not in the type union but resolved at runtime) is aliased to `info`
- `icon` is `ReactNode` — any React element (not a string)
- `title` is `ReactNode` (not a string) — renders as `<CalloutTitle>` paragraph child
- Compound surface: `<Callout>` = `<CalloutContainer>` + optional `<CalloutTitle>` + `<CalloutDescription>`. Advanced authors can compose these directly.
- Styling: CSS var `--callout-color: var(--color-fd-${type}, var(--color-fd-muted))` — six theme slots

### Finding: Alias resolution logic
**Confidence:** CONFIRMED
**Evidence:** `packages/radix-ui/src/components/callout.tsx:34-38`

```ts
function resolveAlias(type: CalloutType) {
  if (type === 'warn') return 'warning';
  if ((type as unknown) === 'tip') return 'info';
  return type;
}
```

`tip` is accepted at runtime despite not appearing in the TS union — this is a migration accommodation.

### Finding: Icon map for typed variants
**Confidence:** CONFIRMED
**Evidence:** `packages/radix-ui/src/components/callout.tsx:65-74`

```ts
{ info: <Info />, warning: <TriangleAlert />, error: <CircleX />, success: <CircleCheck />, idea: <Lightbulb /> }[type]
```

Icons drawn from `lucide-react`. Five icons covering six types — `warn` folds into `warning`.

### Finding: ObsidianCallout subset
**Confidence:** CONFIRMED
**Evidence:** `packages/obsidian/src/ui/index.tsx:5-10`

```ts
interface CalloutProps extends ComponentProps<'div'> {
  type?: 'info' | 'warn' | 'error' | 'success' | 'warning';  // @defaultValue info
}
```

ObsidianCallout has no `title` prop and no `icon` prop — title/body are composed via `<ObsidianCalloutTitle>` and `<ObsidianCalloutBody>` children. Missing `idea` type compared to main Callout.

### Finding: Obsidian markdown → MDX transformation
**Confidence:** CONFIRMED
**Evidence:** `packages/obsidian/src/remark/remark-convert.ts:10, 36-46`

```ts
const RegexCalloutHead = /^\[!(?<type>\w+)](?<collapsible>\+)?/;
// ...
return createCallout(match[1], [{ type: 'paragraph', children: title as PhrasingContent[] }], body);
```

The regex captures `+` (expanded) as `collapsible` but the capture group is **unused** in `createCallout` — foldable state is dropped on conversion. The raw Obsidian type string (`match[1]`) is passed through verbatim as the `type` attribute — so `<ObsidianCallout type="abstract">` is emitted even though that type is not in the TS union. Runtime alias resolution handles a few, others fall through to the `info` default CSS var.

### Finding: Docusaurus `:::` admonition output shape
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/mdx-plugins/remark-directive-admonition.ts:35-102`

```ts
types = { note: 'info', tip: 'info', info: 'info', warn: 'warning',
  warning: 'warning', danger: 'error', success: 'success' }
// emits:
<CalloutContainer type="info">
  <CalloutTitle>...</CalloutTitle>
  <CalloutDescription>...</CalloutDescription>
</CalloutContainer>
```

- `:::type[Title]` where `[Title]` is a directive label → extracted to `<CalloutTitle>`
- Directive attributes (`{key=value}`) passed through as additional `mdxJsxAttribute`s
- `danger` maps to `error` — same 6-value core palette

### Finding: Legacy `remarkAdmonition` (deprecated) shape
**Confidence:** CONFIRMED
**Evidence:** `packages/core/src/mdx-plugins/remark-admonition.ts:22-33, 78`

```ts
typeMap = { info: 'info', warn: 'warn', note: 'info', tip: 'info', warning: 'warn', danger: 'error' };
// emits <Callout type="...">
```

Different tag: emits `<Callout>` (flat title+content) vs `<CalloutContainer>` (slotted). Now deprecated in favor of the directive-based one.

---

## Gaps / follow-ups

- The `apps/docs/content/docs/ui/components/callout.mdx` file does **not exist** in this version of Fumadocs (the docs were migrated or removed). The component-level TSDoc is the spec.
- Radix-UI and Base-UI variants are byte-identical — confirmed via Read.
