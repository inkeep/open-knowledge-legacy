---
title: Component Test Fixture
tags: [test, components]
description: Showcases all 15 built-in component types for manual verification
---

# Component Test Fixture

This document contains one example of every built-in component for visual verification.

## Content Components

<Callout type="warning">
Always run the integration tests before deploying to production.
Skipping tests has caused two incidents this quarter.
</Callout>

<Callout type="info">
This is an informational callout with **bold** and *italic* text.
</Callout>

<Banner variant="normal">
This is a banner notification at the top of the page.
</Banner>

<Steps>
<Step>
Clone the repository and install dependencies.
</Step>
<Step>
Run the build script to generate artifacts.
</Step>
<Step>
Deploy to staging and verify.
</Step>
</Steps>

<Accordion title="Frequently Asked Questions">
Click to expand this section and see the answer.
</Accordion>

<InlineTOC defaultOpen />

<TypeTable type={{}} />

## Layout Components

<Card title="Getting Started" href="/docs/quickstart">
A card linking to the quickstart guide.
</Card>

<Cards>
<Card title="First Card" href="/one">
Description of the first card.
</Card>
<Card title="Second Card" href="/two">
Description of the second card.
</Card>
</Cards>

<Tabs>
<Tab title="npm">
npm install open-knowledge
</Tab>
<Tab title="yarn">
yarn add open-knowledge
</Tab>
<Tab title="pnpm">
pnpm add open-knowledge
</Tab>
</Tabs>

<Files>
<Folder name="src" defaultOpen>
<File name="index.ts" />
<File name="config.ts" />
<Folder name="components">
<File name="Editor.tsx" />
</Folder>
</Folder>
<File name="package.json" />
</Files>

## Media Components

<Video src="https://example.com/demo.mp4" title="Product Demo" />

<ImageZoom src="/images/architecture.png" />

<Mermaid chart="graph TD; A-->B; B-->C;" />

<Audio src="https://example.com/podcast.mp3" title="Episode 1" />

## Data Components

<Frame hint="Interactive embed">
Embedded content goes here.
</Frame>

<CodeGroup>
```typescript
const hello = "world";
```
</CodeGroup>

## Unregistered Components (Fallback)

<CustomWidget foo="bar" count={42}>
This component is not in the built-in registry.
It should render as a gray monospace fallback.
</CustomWidget>

<OptionCard title="Custom" icon="star">
Another unregistered component from a custom library.
</OptionCard>
