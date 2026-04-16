# Component Blocks v2 — Showcase

Every built-in component rendered in the WYSIWYG editor.

## Callouts

<Callout type="info">

This is an **info** callout with blue accent.

</Callout>

<Callout type="warning">

This is a **warning** callout for cautions.

</Callout>

## Cards

<Cards>

<Card title="Guides" description="Step-by-step tutorials" href="/guides" />

<Card title="Reference" description="API documentation" href="/reference" />

</Cards>

## Steps

<Steps>

<Step>

### Install

Run `bun install` in the repo root.

</Step>

<Step>

### Configure

Edit `.open-knowledge/config.yml` to set up your workspace.

</Step>

</Steps>

## Tabs

<Tabs>

<Tab value="npm">

```bash
npm install @inkeep/open-knowledge
```

</Tab>

<Tab value="bun">

```bash
bun add @inkeep/open-knowledge
```

</Tab>

</Tabs>

## Accordions

<Accordions type="single">

<Accordion title="What is Open Knowledge?">

A CRDT-collaborative MDX editor with a registry-backed component system.

</Accordion>

<Accordion title="How does serialization work?">

Pristine nodes serialize via `sourceRaw` for byte-identical round-trip.

</Accordion>

</Accordions>

## Banner

<Banner>

Component Blocks v2 shipped.

</Banner>

## Wildcard (unregistered)

<DataViz chartType="bar">

This is an unregistered component rendered with the wildcard fallback.

</DataViz>

## Standard markdown

- Bullet one with **bold**
- Bullet two with [a link](https://example.com)

> The editor is a tool for working with content.
