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
    // Layer 3: children are parsed into ProseMirror content —
    // getJsxNodes finds Tabs + 2 Tab children = 3 total (recursive walk)
    expect(nodes).toHaveLength(3);
    expect(nodes[0].attrs?.componentName).toBe('Tabs');
    expect(nodes[1].attrs?.componentName).toBe('Tab');
    expect(nodes[2].attrs?.componentName).toBe('Tab');
  });

  test('parses nested same-name tags', () => {
    const md = `<Callout>
<Callout>inner</Callout>
</Callout>`;
    const json = parse(md);
    const nodes = getJsxNodes(json);
    // Layer 3: outer Callout + inner Callout = 2 nodes (recursive walk)
    expect(nodes).toHaveLength(2);
    expect(nodes[0].attrs?.componentName).toBe('Callout');
    expect(nodes[1].attrs?.componentName).toBe('Callout');
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

  test('QA-018: Callout inside Steps>Step (nested different-name, 3-level deep)', () => {
    // This exercises the exact QA-018 scenario: a registered component
    // nested inside another registered component's children.
    const jsx = `<Steps>
<Step>
<Callout type="warning">
Nested callout inside a step. Both should be jsxComponentEditable.
</Callout>
</Step>
</Steps>\n`;
    const json = parse(jsx);
    const nodes = getJsxNodes(json);

    // Should produce 3 nested jsxComponentEditable nodes: Steps, Step, Callout
    const editableNodes = nodes.filter((n) => n.type === 'jsxComponentEditable');
    expect(editableNodes.length).toBeGreaterThanOrEqual(3);

    // Verify the componentName attrs are correct
    const names = editableNodes.map((n) => n.attrs?.componentName);
    expect(names).toContain('Steps');
    expect(names).toContain('Step');
    expect(names).toContain('Callout');

    // Round-trip — cycle 2 must be stable
    const rt1 = serialize(json);
    const rt2 = serialize(parse(rt1));
    expect(rt2).toBe(rt1);
  });

  test('Callout inside Callout (nested same-name)', () => {
    // Layer 3: children parsed through ProseMirror → normalized to flush-left canonical format
    const jsx = `<Callout>
<Callout>inner content</Callout>
</Callout>\n`;
    const result = serialize(parse(jsx));
    // Cycle-1 normalizes: inner Callout becomes a child node with its own content
    // Cycle-2 must be stable
    const cycle2 = serialize(parse(result));
    expect(cycle2).toBe(result);
  });

  test('QA-028: Accordions with nested Accordion children (valid container pattern)', () => {
    const jsx = `<Accordions>
<Accordion title="Section A">
First section content with **bold** text.
</Accordion>
<Accordion title="Section B">
Second section content.
</Accordion>
</Accordions>\n`;
    const json = parse(jsx);
    const nodes = getJsxNodes(json);

    // Should produce 3 jsxComponentEditable nodes: Accordions, Accordion (A), Accordion (B)
    const editableNodes = nodes.filter((n) => n.type === 'jsxComponentEditable');
    expect(editableNodes.length).toBeGreaterThanOrEqual(3);

    const names = editableNodes.map((n) => n.attrs?.componentName);
    expect(names).toContain('Accordions');
    expect(names.filter((n) => n === 'Accordion').length).toBe(2);

    // Verify title prop on Accordion nodes
    const accordions = editableNodes.filter((n) => n.attrs?.componentName === 'Accordion');
    const titles = accordions.map((n) => n.attrs?.title);
    expect(titles).toContain('Section A');
    expect(titles).toContain('Section B');

    // Cycle-2 stability
    const rt1 = serialize(json);
    const rt2 = serialize(parse(rt1));
    expect(rt2).toBe(rt1);
  });

  test('multiple attributes', () => {
    const jsx = '<Chart data={metrics} width={800} height={400} />\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('single-line paired tag', () => {
    // Layer 3: single-line children are normalized to multi-line flush-left on cycle 1
    const jsx = '<Callout type="info">Short note.</Callout>\n';
    const result = serialize(parse(jsx));
    // Canonical form has children on their own line
    const expected = '<Callout type="info">\nShort note.\n</Callout>\n';
    expect(result).toBe(expected);
    // Cycle-2 is byte-stable
    expect(serialize(parse(result))).toBe(result);
  });

  test('JSX with blank lines in children', () => {
    // Layer 3: blank lines in children are normalized through ProseMirror paragraph parsing
    const jsx = `<Callout>

First paragraph.

Second paragraph.

</Callout>\n`;
    const result = serialize(parse(jsx));
    // Canonical form: flush-left paragraphs separated by \n\n
    const expected = `<Callout>
First paragraph.

Second paragraph.
</Callout>\n`;
    expect(result).toBe(expected);
    // Cycle-2 is byte-stable
    expect(serialize(parse(result))).toBe(result);
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

  test('preserves component structure through round-trip', () => {
    // Layer 3: children parsed through ProseMirror → whitespace normalized
    // to flush-left canonical format. Cycle-2 must be stable.
    const content = `<Tabs>
  <Tab title="first">
    Content with  extra  spaces.
  </Tab>
</Tabs>`;
    const json = parse(content);
    const nodes = getJsxNodes(json);
    // Layer 3: Tabs + Tab = 2 nodes (recursive walk of parsed children)
    expect(nodes).toHaveLength(2);
    expect(nodes[0].attrs?.componentName).toBe('Tabs');
    expect(nodes[1].attrs?.componentName).toBe('Tab');
    // Cycle-2 stability
    const cycle1 = roundTrip(content);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });
});

// ---------------------------------------------------------------------------
// Structured-attribute round-trip (US-008)
//
// Verifies renderMarkdown reconstructs raw JSX from structured node attributes
// (componentName + individual prop attrs + _childrenString) rather than using
// the _rawContent passthrough. Props are emitted alphabetically.
// ---------------------------------------------------------------------------

describe('JsxComponent structured-attribute round-trip (US-008)', () => {
  /** Get attrs of the first jsxComponentEditable node */
  function getEditableAttrs(json: JSONContent): Record<string, unknown> | undefined {
    let found: Record<string, unknown> | undefined;
    function walk(node: JSONContent) {
      if (node.type === 'jsxComponentEditable' && !found) {
        found = node.attrs as Record<string, unknown>;
      }
      if (node.content) node.content.forEach(walk);
    }
    walk(json);
    return found;
  }

  test('Callout with type prop → parse → attrs preserved', () => {
    const jsx = `<Callout type="warning">
  Test content.
</Callout>\n`;
    const json = parse(jsx);
    const attrs = getEditableAttrs(json);
    expect(attrs?.componentName).toBe('Callout');
    expect(attrs?.type).toBe('warning');
    expect(attrs?._childrenString).toBe('\n  Test content.\n');
  });

  test('Callout round-trip is byte-identical', () => {
    const jsx = `<Callout type="warning">
  Always run integration tests before deploying.
</Callout>\n`;
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('Video self-closing with src → attrs preserved', () => {
    const jsx = '<Video src="demo.mp4" />\n';
    const json = parse(jsx);
    const attrs = getEditableAttrs(json);
    expect(attrs?.componentName).toBe('Video');
    expect(attrs?.src).toBe('demo.mp4');
    expect(attrs?._childrenString).toBe('');
  });

  test('Video self-closing round-trip is byte-identical', () => {
    const jsx = '<Video src="demo.mp4" />\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('Card with title/href/external → attrs preserved', () => {
    const jsx = '<Card external href="/github" title="GitHub" />\n';
    const json = parse(jsx);
    const attrs = getEditableAttrs(json);
    expect(attrs?.componentName).toBe('Card');
    expect(attrs?.title).toBe('GitHub');
    expect(attrs?.href).toBe('/github');
    expect(attrs?.external).toBe(true);
  });

  test('Card with structured props round-trip is byte-identical', () => {
    const jsx = '<Card external href="/github" title="GitHub" />\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('component with no props round-trips', () => {
    const jsx = '<Steps>\nSome content.\n</Steps>\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('component with many props (alphabetical order)', () => {
    const jsx = '<Video fullView hint="Watch this" src="demo.mp4" title="Demo" />\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('many props non-alphabetical source → reordered on cycle-1, stable on cycle-2', () => {
    const input = '<Video src="demo.mp4" title="Demo" hint="Watch" fullView />\n';
    const cycle1 = serialize(parse(input));
    // Cycle-1 may reorder props to alphabetical
    const cycle2 = serialize(parse(cycle1));
    expect(cycle2).toBe(cycle1); // Cycle-2 is stable
    // Verify the reordered form
    expect(cycle1).toBe('<Video fullView hint="Watch" src="demo.mp4" title="Demo" />\n');
  });

  test('component with unknown attributes from collision → preserved via _unknownAttrs', () => {
    // Card has title, href, external as known props (in propAttrs union).
    // icon (reactnode everywhere → not in propAttrs) and color (not in any component) are unknown.
    const jsx =
      '<Card color="#F05032" external href="/github" icon="brand/GitHub" title="GitHub" />\n';
    const json = parse(jsx);
    const attrs = getEditableAttrs(json);
    expect(attrs?.componentName).toBe('Card');
    expect(attrs?.title).toBe('GitHub');
    expect(attrs?.href).toBe('/github');
    expect(attrs?.external).toBe(true);
    // Unknown attrs stored in _unknownAttrs
    expect(attrs?._unknownAttrs).toBeDefined();
    const unknown = JSON.parse(attrs?._unknownAttrs as string);
    expect(unknown.icon).toBe('brand/GitHub');
    expect(unknown.color).toBe('#F05032');
    // Round-trip preserves ALL attributes (known + unknown)
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('malformed _unknownAttrs JSON is gracefully dropped with warning, no throw', () => {
    // Defensive: if _unknownAttrs contains invalid JSON (e.g., from a migration,
    // external edit, or code bug), renderMarkdown catches the JSON.parse error
    // and logs a warning, dropping the malformed attrs rather than throwing.
    // This test constructs a document where _unknownAttrs is deliberately
    // invalid and verifies the serializer handles it gracefully.
    const json: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'jsxComponentEditable',
          attrs: {
            componentName: 'Callout',
            type: 'warning',
            _unknownAttrs: '{not valid json', // malformed on purpose
            _childrenString: 'hello',
          },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'hello' }],
            },
          ],
        },
      ],
    };

    // Capture console.warn to verify the defensive warning was logged
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };

    let output: string;
    try {
      // Must not throw — defensive catch handles the malformed JSON
      output = serialize(json);
    } finally {
      console.warn = originalWarn;
    }

    // Component still serializes with its known attrs (type="warning")
    expect(output).toContain('type="warning"');
    expect(output).toContain('<Callout');
    expect(output).toContain('</Callout>');

    // Warning was logged
    const hasMalformedWarning = warnings.some((w) =>
      w.includes('Malformed _unknownAttrs on <Callout>'),
    );
    expect(hasMalformedWarning).toBe(true);
  });

  test('collision attrs with non-alphabetical source → cycle-2 stable', () => {
    // Source has non-alphabetical order
    const input =
      '<Card title="GitHub" icon="brand/GitHub" href="/github" color="#F05032" external />\n';
    const cycle1 = serialize(parse(input));
    const cycle2 = serialize(parse(cycle1));
    expect(cycle2).toBe(cycle1);
    // Alphabetical order in output
    expect(cycle1).toBe(
      '<Card color="#F05032" external href="/github" icon="brand/GitHub" title="GitHub" />\n',
    );
  });

  test('boolean shorthand round-trips correctly', () => {
    const jsx = '<Folder defaultOpen name="src" />\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('number prop round-trips correctly', () => {
    const jsx = '<Tabs defaultIndex={2} />\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('void node (unregistered) still uses raw passthrough', () => {
    const jsx = '<CustomWidget foo="bar">body</CustomWidget>\n';
    const json = parse(jsx);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('jsxComponentVoid');
    expect(serialize(json)).toBe(jsx);
  });

  test('expression props → void fallback → raw passthrough', () => {
    const jsx = '<Chart data={metrics} />\n';
    const json = parse(jsx);
    const nodes = getJsxNodes(json);
    expect(nodes[0].type).toBe('jsxComponentVoid');
    expect(serialize(json)).toBe(jsx);
  });

  test('children with nested JSX preserved verbatim (Phase 2 carrier)', () => {
    const jsx = `<Tabs>
<Tab title="npm">
npm install package
</Tab>
<Tab title="yarn">
yarn add package
</Tab>
</Tabs>\n`;
    expect(serialize(parse(jsx))).toBe(jsx);
    // Verify _childrenString preserves nested structure
    const json = parse(jsx);
    const attrs = getEditableAttrs(json);
    expect(attrs?._childrenString).toContain('<Tab title="npm">');
  });
});

// ---------------------------------------------------------------------------
// Cycle-2 byte-identity with structured attributes (US-008)
// ---------------------------------------------------------------------------

describe('JsxComponent structured-attr cycle-2 byte-identity', () => {
  const cases: Array<{ name: string; jsx: string }> = [
    {
      name: 'Callout with type',
      jsx: `<Callout type="warning">
  Content here.
</Callout>\n`,
    },
    { name: 'Video self-closing', jsx: '<Video src="demo.mp4" />\n' },
    { name: 'Card with multiple props', jsx: '<Card external href="/gh" title="T" />\n' },
    { name: 'Steps with children', jsx: '<Steps>\nContent.\n</Steps>\n' },
    {
      name: 'Nested Tabs/Tab',
      jsx: `<Tabs>
<Tab title="a">
content a
</Tab>
</Tabs>\n`,
    },
    {
      name: 'Collision attrs on Card',
      jsx: '<Card color="#F05032" external href="/gh" icon="x" title="T" />\n',
    },
    { name: 'Number prop', jsx: '<Tabs defaultIndex={3} />\n' },
    { name: 'Boolean prop', jsx: '<Folder defaultOpen name="src" />\n' },
    { name: 'Unregistered void', jsx: '<CustomWidget foo="bar">body</CustomWidget>\n' },
  ];

  for (const { name, jsx } of cases) {
    test(`cycle-2 stable: ${name}`, () => {
      const cycle1 = roundTrip(jsx);
      const cycle2 = roundTrip(cycle1);
      expect(cycle2).toBe(cycle1);
    });
  }
});

// ---------------------------------------------------------------------------
// String prop values with special characters (quote escaping)
// ---------------------------------------------------------------------------

describe('JsxComponent string prop escaping', () => {
  test('string prop with double quotes round-trips via &quot; encoding', () => {
    // User enters: She said "hello" — this must survive the round-trip
    const jsx = '<Callout type="info">\nShe said &quot;hello&quot;\n</Callout>\n';
    const cycle1 = roundTrip(jsx);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('string prop with ampersand round-trips via &amp; encoding', () => {
    const jsx = '<Card title="A &amp; B" />\n';
    const cycle1 = roundTrip(jsx);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('prop value with &quot; parses to actual quote character', () => {
    const jsx = '<Card title="She said &quot;hello&quot;" />\n';
    const json = parse(jsx);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].attrs?.title).toBe('She said "hello"');
  });

  test('prop value with &amp; parses to actual ampersand', () => {
    const jsx = '<Card title="A &amp; B" />\n';
    const json = parse(jsx);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].attrs?.title).toBe('A & B');
  });
});

// ---------------------------------------------------------------------------
// RT06 — Unregistered component fallback (§3.8)
// ---------------------------------------------------------------------------

describe('RT06: Unregistered component fallback', () => {
  test('unregistered component name → jsxComponentVoid node', () => {
    const jsx = '<CustomThingy foo="bar">body</CustomThingy>\n';
    const json = parse(jsx);
    const nodes = getJsxNodes(json);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe('jsxComponentVoid');
    expect(nodes[0].attrs?.content).toBe('<CustomThingy foo="bar">body</CustomThingy>');
  });

  test('unregistered component round-trips byte-identically', () => {
    const jsx = '<CustomThingy foo="bar" count={42}>body text here</CustomThingy>\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('unregistered self-closing round-trips', () => {
    const jsx = '<UnknownWidget data={someVar} />\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });
});

// ---------------------------------------------------------------------------
// RT08 — Collision: registered name with unknown attributes (§3.8)
// ---------------------------------------------------------------------------

describe('RT08: Collision preserve-and-render policy', () => {
  /** Get attrs of the first jsxComponentEditable node */
  function getFirstEditableAttrs(json: JSONContent): Record<string, unknown> | undefined {
    let found: Record<string, unknown> | undefined;
    function walk(node: JSONContent) {
      if (node.type === 'jsxComponentEditable' && !found) found = node.attrs;
      if (node.content) node.content.forEach(walk);
    }
    walk(json);
    return found;
  }

  test('Card with agents-docs shape: unknown color and external preserved', () => {
    // agents-docs Card has color + external props that fumadocs Card doesn't
    const jsx =
      '<Card color="#F05032" external href="/github" icon="brand/GitHub" title="GitHub" />\n';
    const json = parse(jsx);
    const attrs = getFirstEditableAttrs(json);

    // Node created as typed Card built-in
    expect(attrs?.componentName).toBe('Card');
    // Known props stored as regular attributes
    expect(attrs?.title).toBe('GitHub');
    expect(attrs?.href).toBe('/github');
    expect(attrs?.external).toBe(true);
    // Unknown attrs stored in _unknownAttrs (preserved through round-trip)
    expect(attrs?._unknownAttrs).toBeDefined();
    const unknown = JSON.parse(attrs?._unknownAttrs as string);
    expect(unknown.icon).toBe('brand/GitHub');
    expect(unknown.color).toBe('#F05032');
  });

  test('collision round-trip is byte-identical', () => {
    const jsx =
      '<Card color="#F05032" external href="/github" icon="brand/GitHub" title="GitHub" />\n';
    expect(serialize(parse(jsx))).toBe(jsx);
  });

  test('dev warning is logged for unknown attributes', () => {
    // The warning was already logged by earlier tests in this suite for Card.
    // Verify the mechanism works by checking the console output captured above
    // (the "[JsxComponent] Unknown attributes on <Card>: color, icon" line).
    // Since _warnedComponents is module-level, we verify by parsing a FRESH
    // component name not seen in earlier tests.
    const origWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (msg: string) => warnings.push(msg);
    try {
      // Use Banner (registered) with a fabricated unknown attr
      parse('<Banner color="red">Text</Banner>\n');
      const bannerWarnings = warnings.filter((w) => w.includes('Banner') && w.includes('Unknown'));
      expect(bannerWarnings.length).toBeGreaterThanOrEqual(1);
      expect(bannerWarnings[0]).toContain('color');
    } finally {
      console.warn = origWarn;
    }
  });
});
