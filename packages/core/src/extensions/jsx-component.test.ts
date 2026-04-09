import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { sharedExtensions } from './shared';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

/** Parse markdown string to ProseMirror JSON */
function parse(md: string): JSONContent {
  return mdManager.parse(md);
}

/** Serialize ProseMirror JSON to markdown string */
function serialize(json: JSONContent): string {
  return mdManager.serialize(json);
}

/** Round-trip: md -> JSON -> md */
function roundTrip(md: string): string {
  return serialize(parse(md));
}

/** Get all jsxComponent nodes from parsed JSON (editable + void) */
function getJsxNodes(json: JSONContent): JSONContent[] {
  const nodes: JSONContent[] = [];
  function walk(node: JSONContent) {
    if (node.type === 'jsxComponentEditable' || node.type === 'jsxComponentVoid') {
      nodes.push(node);
    }
    if (node.content) node.content.forEach(walk);
  }
  walk(json);
  return nodes;
}

/** Get raw JSX content from a node (works for both editable and void types) */
function getRawContent(node: JSONContent): string {
  if (node.type === 'jsxComponentVoid') return node.attrs?.content || '';
  return node.attrs?._rawContent || '';
}

// ---------------------------------------------------------------------------
// Basic parsing — raw JSX (no fenced code blocks)
// ---------------------------------------------------------------------------

describe('JsxComponent raw JSX parsing', () => {
  test('parses a self-closing JSX tag', () => {
    const md = '<Video src="demo.mp4" />';
    const json = parse(md);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(getRawContent(nodes[0])).toBe('<Video src="demo.mp4" />');
  });

  test('parses a paired JSX tag with children', () => {
    const md = `<Callout type="warning">
  Always run integration tests before deploying.
</Callout>`;
    const json = parse(md);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(getRawContent(nodes[0])).toBe(md.trim());
  });

  test('parses multiple JSX blocks in a document', () => {
    const md = `# Title

<Callout type="warning">
  Warning text.
</Callout>

Some paragraph.

<Video src="demo.mp4" />`;

    const json = parse(md);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(2);
    expect(getRawContent(nodes[0])).toContain('Callout');
    expect(getRawContent(nodes[1])).toContain('Video');
  });

  test('parses nested different-name tags', () => {
    const md = `<Tabs>
<Tab title="npm">
npm install package
</Tab>
<Tab title="yarn">
yarn add package
</Tab>
</Tabs>`;
    const json = parse(md);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(getRawContent(nodes[0])).toBe(md.trim());
  });

  test('parses nested same-name tags', () => {
    const md = `<Callout>
<Callout>inner</Callout>
</Callout>`;
    const json = parse(md);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(getRawContent(nodes[0])).toBe(md.trim());
  });

  test('parses JSX with boolean attributes', () => {
    const md = `<Callout fullWidth>
  Content here.
</Callout>`;
    const json = parse(md);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(getRawContent(nodes[0])).toContain('fullWidth');
  });

  test('parses JSX with expression attributes', () => {
    const md = '<Chart data={metrics} />';
    const json = parse(md);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(getRawContent(nodes[0])).toBe('<Chart data={metrics} />');
  });

  test('code blocks are not confused with JSX', () => {
    const md = `\`\`\`js
const x = <Component />;
\`\`\`

<Callout>Real JSX</Callout>`;
    const json = parse(md);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(getRawContent(nodes[0])).toBe('<Callout>Real JSX</Callout>');
  });

  test('only uppercase-first tags trigger jsxComponent nodes', () => {
    const md = `Some regular paragraph text.

<Callout>This is JSX</Callout>

Another paragraph.`;
    const json = parse(md);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(getRawContent(nodes[0])).toBe('<Callout>This is JSX</Callout>');
  });
});

// ---------------------------------------------------------------------------
// Serialization — raw JSX output (no fence wrapping)
// ---------------------------------------------------------------------------

describe('JsxComponent raw JSX serialization', () => {
  test('serializes to raw JSX (no fence)', () => {
    // Parse from markdown to get correct node structure, then re-serialize
    const input = '<Video src="demo.mp4" />\n';
    const json = parse(input);
    const md = serialize(json);
    expect(md).not.toContain('```');
    expect(md.trim()).toBe('<Video src="demo.mp4" />');
  });

  test('serializes paired JSX with children', () => {
    const content = `<Callout type="warning">
  Some content here.
</Callout>`;
    const json = parse(content);
    const md = serialize(json);
    expect(md).not.toContain('```');
    expect(md.trim()).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// Cycle-1 byte-identity (R10 — load-bearing for Observer B early-exit)
//
// serialize(parse(jsx)) === jsx — NO .trim() normalization.
// Inputs use "production shape" (trailing \n) matching what Observer A / disk
// bridge produce. The serializer always appends \n; so inputs that already
// end with \n are byte-identical from cycle 1.
// ---------------------------------------------------------------------------

describe('JsxComponent cycle-1 byte-identity (R10)', () => {
  test('Callout with type prop', () => {
    const jsx = `<Callout type="warning">
  Always run integration tests before deploying.
</Callout>\n`;
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('self-closing Video', () => {
    const jsx = '<Video src="demo.mp4" />\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('nested Steps > Step', () => {
    const jsx = `<Steps>
<Step>
First step content.
</Step>
<Step>
Second step content.
</Step>
</Steps>\n`;
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('Callout inside Callout (nested same-name)', () => {
    const jsx = `<Callout>
<Callout>inner content</Callout>
</Callout>\n`;
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('multiple attributes', () => {
    const jsx = '<Chart data={metrics} width={800} height={400} />\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('single-line paired tag', () => {
    const jsx = '<Callout type="info">Short note.</Callout>\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('JSX with blank lines in children', () => {
    const jsx = `<Callout>

First paragraph.

Second paragraph.

</Callout>\n`;
    expect(serialize(parse(jsx))).toBe(jsx);
  });
});

// ---------------------------------------------------------------------------
// Cycle-2 convergence — stability after one round-trip
// ---------------------------------------------------------------------------

describe('JsxComponent cycle-2 convergence', () => {
  test('self-closing tag converges', () => {
    const md = '<Video src="demo.mp4" />';
    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('paired tag converges', () => {
    const md = `<Callout type="warning">
  Always run integration tests before deploying.
</Callout>`;
    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('nested different-name tags converge', () => {
    const md = `<Tabs>
<Tab title="npm">
npm install package
</Tab>
<Tab title="yarn">
yarn add package
</Tab>
</Tabs>`;
    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('nested same-name tags converge', () => {
    const md = `<Callout>
<Callout>inner</Callout>
</Callout>`;
    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('mixed document converges', () => {
    const md = `# Test Document

Some intro text.

<Callout type="warning">
  Always run integration tests before deploying.
</Callout>

More content here.

<Video src="demo.mp4" />

<Tabs>
<Tab title="npm">
npm install package
</Tab>
<Tab title="yarn">
yarn add package
</Tab>
</Tabs>

Final paragraph.`;

    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });
});

// ---------------------------------------------------------------------------
// Mixed document structure
// ---------------------------------------------------------------------------

describe('JsxComponent mixed document structure', () => {
  test('correct node types in parsed document', () => {
    const md = `# Heading

Paragraph one.

<Callout type="info">
  Info text.
</Callout>

Paragraph two.`;
    const json = parse(md);
    const types = json.content?.map((n) => n.type) || [];
    expect(types).toEqual(['heading', 'paragraph', 'jsxComponentEditable', 'paragraph']);
  });

  test('JSX at start of document', () => {
    const md = `<Callout type="info">
  First thing in the doc.
</Callout>

Some trailing text.`;
    const json = parse(md);
    expect(json.content?.[0]?.type).toBe('jsxComponentEditable');
    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('JSX at end of document', () => {
    const md = `Some leading text.

<Callout type="info">
  Last thing in the doc.
</Callout>`;
    const json = parse(md);
    const lastNode = json.content?.[json.content.length - 1];
    expect(lastNode?.type).toBe('jsxComponentEditable');
    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('multiple JSX blocks in sequence (no paragraph between)', () => {
    const md = `<Callout type="warning">Warning!</Callout>
<Callout type="info">Info!</Callout>
<Video src="test.mp4" />`;
    const json = parse(md);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(3);
    expect(getRawContent(nodes[0])).toBe('<Callout type="warning">Warning!</Callout>');
    expect(getRawContent(nodes[1])).toBe('<Callout type="info">Info!</Callout>');
    expect(getRawContent(nodes[2])).toBe('<Video src="test.mp4" />');
    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('preserves exact whitespace inside JSX content', () => {
    const content = `<Tabs>
  <Tab title="first">
    Content with  extra  spaces.
  </Tab>
</Tabs>`;
    const json = parse(content);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(getRawContent(nodes[0])).toBe(content);
  });
});
