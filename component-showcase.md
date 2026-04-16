# Component Blocks v2 — Showcase

Every built-in component rendered in the WYSIWYG editor.

## Callouts

<Callout type="warning">

This is a **warning** callout for cautions.

</Callout>

<Callout type="info">

This is an **info** callout with blue accent.

</Callout>

## Cards

<Cards title="" description="" href="" external>

<Card title="Guides" description="Step-by-step tutorials" href="/guides" />

<Card title="What is Open Knowledge" description="API documentation" href="/reference" />

<Card title="Hello" description="" href="" external />

<Card title="" description="" href="" external={false} />

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

<Step>

### Hi there how are you doing today

well thanks!

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

## Standard markdown

- Bullet one with **bold**
- Bullet two with [a link](https://example.com)

> The editor is a tool for working with content.

