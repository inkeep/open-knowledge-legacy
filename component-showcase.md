# Component Blocks v2 — Showcase

Every built-in component + edge cases, rendered in the WYSIWYG editor.

## 1. Callouts (5 variants)

<Callout type="info">

This is an **info** callout. It uses the blue accent.

</Callout>

<Callout type="warning">

This is a **warning** callout — for cautions and soft errors.

</Callout>

<Callout type="error">

This is an **error** callout — for destructive or critical messaging.

</Callout>



<Callout type="success">

This is a **success** callout — for confirmations and positive outcomes.

</Callout>

<Callout type="idea">

This is an **idea** callout — for tips, tricks, and inspirations.

</Callout>

## 2. Card (single) — with title, description, icon, href

<Card title="Getting Started" description="Read the quickstart guide" href="/docs/quickstart" external />

## 3. Cards (grid) — container with emptyChildName='Card'

<Cards>

<Card title="Guides" description="Step-by-step tutorials" href="/guides">



</Card>

<Card title="Reference" description="API reference" href="/reference" />

<Card title="Examples" description="Real-world examples" href="/examples" />

<Card title="Showcase" description="Community projects" href="/showcase" />

</Cards>



## 4. Steps + Step — numbered vertical sequence

<Steps>

<Step>

### Install dependencies

Run `bun install` in the repo root.

</Step>

<Step>

### Configure the workspace

Edit `.open-knowledge/config.yml` to match your content layout.

</Step>

<Step>

### Start the dev server

```bash
bun run dev
```

Open `http://localhost:5173` in your browser.





</Step>

</Steps>

## 5. Tabs + Tab — Fallback 2 pattern-copy wrappers

<Tabs>

<Tab value="npm">

```bash
npm install @inkeep/open-knowledge
```

</Tab>

<Tab value="pnpm">

```bash
pnpm add @inkeep/open-knowledge
```

</Tab>

<Tab value="yarn">

```bash
yarn add @inkeep/open-knowledge
```

</Tab>

<Tab value="bun">

```bash
bun add @inkeep/open-knowledge
```

</Tab>

</Tabs>

## 6. Accordions + Accordion — Fallback 2 pattern-copy wrappers

<Accordions type="single">

<Accordion title="What is Open Knowledge?">

A CRDT-collaborative MDX editor with a registry-backed component system. Human authoring + agent authoring share the same document model via Y.js.

</Accordion>

<Accordion title="How does the γ serialization work?">

Pristine jsxComponent nodes serialize via `sourceRaw` for byte-identical round-trip. Edited nodes (`sourceDirty: true`) reconstruct via `mdxJsxFlowElement` mdast. Parent nodes with dirty descendants are forced to reconstruct (FR-5 effectiveDirty rule).

</Accordion>

<Accordion title="What's the Context Bridge Registry?">

Compound components (Tabs, Accordion) that rely on React Context don't cross TipTap NodeView portals. The Context Bridge Registry publishes/subscribes context values through an external store. For Radix-based compounds, we apply Fallback 2 pattern-copy wrappers because Radix's `createContextScope` closures are unreachable from outside.

</Accordion>

</Accordions>



## 7. Files + Folder + File — file tree visualization

<Files>

<Folder name="packages" defaultOpen>

<Folder name="core" defaultOpen>

<File name="jsx-component.ts" />

<File name="jsx-inline.ts" />

<File name="raw-mdx-fallback.ts" />

<File name="built-ins.ts" />

</Folder>

<Folder name="app" defaultOpen>

<File name="JsxComponentView.tsx" />

<File name="RawMdxFallbackCMView.tsx" />

<File name="bridge-id-plugin.ts" />

<File name="store.ts" />

</Folder>

</Folder>

</Files>

## 8. Banner

<Banner>

🚀 Component Blocks v2 shipped — all 18 built-ins rendering in WYSIWYG.

</Banner>

## 9. ImageZoom — click to enlarge

<ImageZoom src="https://fumadocs.dev/og.png" alt="Fumadocs Open Graph image" />

## 10. Audio — shadcn wrapper

<Audio src="/examples/sample.mp3" />

## 11. Wildcard / unregistered component (demonstrates '*' descriptor fallback)

<DataViz chartType="bar">

This is an unregistered component. It renders with the `UnregisteredBadge` chrome + editable children. Schema permits any `block*` content inside.

</DataViz>

## 12. Inline JSX (NG14 thin shape — visible source text, no live render)

Here is some prose with an inline icon <Icon name="sparkles" /> and a badge <Badge variant="default">v1.0</Badge>. Both render as **literal source text** in WYSIWYG per NG14 — byte-identical round-trip via Precedent #10 (Y.Item identity preserved via `content: 'text*'`).

Regular emphasis like *italic* and **bold** and ~~strikethrough~~ and `inline code` all still work.

## 13. Paragraph + standard markdown (baseline for comparison)

### Lists

- Bullet one
- Bullet two with **bold**
- Bullet three with [a link](https://example.com)

1. Ordered one
2. Ordered two
3. Ordered three

### Blockquote

> The editor is a tool for working with content. Hiding content prevents the user from fixing it. — Precedent #14

### Code block

```typescript
// γ serialization: pristine → sourceRaw, edited → reconstruction
export const nodeHandlers = {
  jsxComponent: (pmNode) => {
    if (!effectiveDirty(pmNode) && pmNode.attrs.sourceRaw) {
      return { type: 'html', value: pmNode.attrs.sourceRaw };
    }
    return reconstructMdxJsxFlowElement(pmNode);
  },
};
```

### Table

| Component | Category | hasChildren | Provider                  |
| --------- | -------- | ----------- | ------------------------- |
| Callout   | content  | yes         | fumadocs-ui               |
| Card      | layout   | yes         | fumadocs-ui               |
| Tabs      | layout   | yes         | editor-local (Fallback 2) |
| Accordion | layout   | yes         | editor-local (Fallback 2) |
| Mermaid   | data     | no          | shadcn wrapper            |
| Audio     | media    | no          | shadcn wrapper            |

### Wiki links + internal links

Here's a [[wiki-link]] and an [internal link](./ARCHITECTURE.md) and an [external link](https://fumadocs.dev).

<Accordions type="single">

<Accordion title="Nested Callout inside Accordion">

<Callout type="info">

An **info Callout** nested inside an Accordion. Both should render correctly thanks to fumadocs-ui Callout + editor-local Accordion wrapper.

</Callout>

<Steps>

<Step>

### Nested Steps inside Accordion

Container components compose cleanly.

</Step>

<Step>

### With an inline Icon <Icon name="check-circle" />

The Icon renders as source text per NG14.

</Step>

</Steps>

</Accordion>

</Accordions>

## 14. Nested composition (compound components + block children)

---

*End of showcase — try clicking any block to see the PropPanel, hover to see the SideMenu drag handle, type *`/`* to open the slash menu, and press Esc inside a component's children to select the parent (L1 keyboard nav).*

*Note: TypeTable, InlineTOC, and Mermaid components are omitted from this showcase because they require complex expression attrs (object literals and template strings) that our parser doesn't currently round-trip cleanly — tracked as a known fidelity gap for a follow-up spec.*
