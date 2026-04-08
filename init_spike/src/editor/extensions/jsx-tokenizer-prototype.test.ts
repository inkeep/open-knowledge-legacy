/**
 * Prototype: Custom markdownTokenizer for raw JSX blocks in TipTap v3.
 *
 * Goal: Store JSX components as raw JSX on disk (valid MDX), NOT wrapped in
 * fenced code blocks. TipTap's @tiptap/markdown `markdownTokenizer` API lets
 * extensions register custom tokenizers with marked.
 *
 * This file defines a standalone JsxBlock extension + exhaustive round-trip tests.
 */
import { describe, expect, test } from 'bun:test';
import { getSchema, type JSONContent, Node } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';

// ---------------------------------------------------------------------------
// Extension: JsxBlock — raw JSX via custom markdownTokenizer
// ---------------------------------------------------------------------------

const JsxBlock = Node.create({
  name: 'jsxBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      content: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-jsx-block]',
        getAttrs: (node) => {
          if (typeof node === 'string') return false;
          return { content: node.getAttribute('data-content') || '' };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-jsx-block': '', 'data-content': HTMLAttributes.content }];
  },

  markdownTokenName: 'jsxBlock',

  markdownTokenizer: {
    name: 'jsxBlock',
    level: 'block' as const,

    start(src: string) {
      return src.match(/<[A-Z]/)?.index ?? -1;
    },

    tokenize(src: string) {
      // --- Self-closing: <Component prop="value" /> ---
      const selfClose = src.match(/^<([A-Z][A-Za-z0-9]*)\b[^>]*\/>\s*\n?/);
      if (selfClose) {
        return {
          type: 'jsxBlock' as const,
          raw: selfClose[0],
          content: selfClose[0].trim(),
        };
      }

      // --- Paired tags: <Component>...children...</Component> ---
      // We need to handle nested same-name tags, so use a counting approach.
      const openMatch = src.match(/^<([A-Z][A-Za-z0-9]*)\b([^>]*)>/);
      if (!openMatch) return undefined;

      const tagName = openMatch[1];
      const openTag = openMatch[0];
      let depth = 1;
      let pos = openTag.length;

      // Walk through the source counting open/close tags
      const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'g');
      const closeRe = new RegExp(`</${tagName}>`, 'g');

      while (depth > 0 && pos < src.length) {
        // Find next open and close tag after current pos
        openRe.lastIndex = pos;
        closeRe.lastIndex = pos;

        const nextOpen = openRe.exec(src);
        const nextClose = closeRe.exec(src);

        if (!nextClose) {
          // No closing tag found — not a valid block
          return undefined;
        }

        if (nextOpen && nextOpen.index < nextClose.index) {
          // Found another open tag before the close
          depth++;
          pos = nextOpen.index + nextOpen[0].length;
        } else {
          // Found a close tag
          depth--;
          if (depth === 0) {
            const endPos = nextClose.index + nextClose[0].length;
            // Consume optional trailing newline
            let rawEnd = endPos;
            if (src[rawEnd] === '\n') rawEnd++;

            const raw = src.slice(0, rawEnd);
            const content = src.slice(0, endPos).trim();

            return {
              type: 'jsxBlock' as const,
              raw,
              content,
            };
          }
          pos = nextClose.index + nextClose[0].length;
        }
      }

      return undefined;
    },
  },

  parseMarkdown(token: any, helpers: any) {
    return helpers.createNode('jsxBlock', { content: token.content || '' });
  },

  renderMarkdown(node: any) {
    return (node.attrs?.content || '') + '\n';
  },
});

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const extensions = [JsxBlock, StarterKit.configure({ undoRedo: false })];
const mdManager = new MarkdownManager({ extensions });
const schema = getSchema(extensions);

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

/** Get all jsxBlock nodes from parsed JSON */
function getJsxBlocks(json: JSONContent): JSONContent[] {
  const blocks: JSONContent[] = [];
  function walk(node: JSONContent) {
    if (node.type === 'jsxBlock') blocks.push(node);
    if (node.content) node.content.forEach(walk);
  }
  walk(json);
  return blocks;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JsxBlock tokenizer — basic parsing', () => {
  test('parses a self-closing JSX tag', () => {
    const md = '<Video src="demo.mp4" />';
    const json = parse(md);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attrs?.content).toBe('<Video src="demo.mp4" />');
  });

  test('parses a paired JSX tag with children', () => {
    const md = `<Callout type="warning">
  Always run integration tests before deploying.
</Callout>`;
    const json = parse(md);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attrs?.content).toBe(md.trim());
  });

  test('parses multiple JSX blocks in a document', () => {
    const md = `# Title

<Callout type="warning">
  Warning text.
</Callout>

Some paragraph.

<Video src="demo.mp4" />`;

    const json = parse(md);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].attrs?.content).toContain('Callout');
    expect(blocks[1].attrs?.content).toContain('Video');
  });
});

describe('JsxBlock tokenizer — serialization', () => {
  test('serializes jsxBlock node back to raw JSX', () => {
    const json: JSONContent = {
      type: 'doc',
      content: [{ type: 'jsxBlock', attrs: { content: '<Video src="demo.mp4" />' } }],
    };
    const md = serialize(json);
    expect(md.trim()).toBe('<Video src="demo.mp4" />');
  });

  test('serializes paired JSX with children', () => {
    const content = `<Callout type="warning">
  Some content here.
</Callout>`;
    const json: JSONContent = {
      type: 'doc',
      content: [{ type: 'jsxBlock', attrs: { content } }],
    };
    const md = serialize(json);
    expect(md.trim()).toBe(content);
  });
});

describe('JsxBlock tokenizer — round-trip', () => {
  test('self-closing tag round-trips', () => {
    const md = '<Video src="demo.mp4" />';
    const cycle1 = roundTrip(md);
    expect(cycle1.trim()).toBe(md);
    // Cycle 2 should be identical to cycle 1
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('paired tag round-trips', () => {
    const md = `<Callout type="warning">
  Always run integration tests before deploying.
</Callout>`;
    const cycle1 = roundTrip(md);
    expect(cycle1.trim()).toBe(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('nested different-name tags round-trip', () => {
    const md = `<Tabs>
<Tab title="npm">
npm install package
</Tab>
<Tab title="yarn">
yarn add package
</Tab>
</Tabs>`;
    const cycle1 = roundTrip(md);
    expect(cycle1.trim()).toBe(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('JSX with markdown children round-trips', () => {
    const md = `<Note>
  Simple note with **bold** and [a link](https://example.com).
</Note>`;
    const cycle1 = roundTrip(md);
    expect(cycle1.trim()).toBe(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });
});

describe('JsxBlock tokenizer — mixed document round-trip', () => {
  test('full document with headings, paragraphs, and JSX blocks', () => {
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

<Note>
  Simple note with **bold** and [a link](https://example.com).
</Note>

Final paragraph.`;

    const json = parse(md);
    const pmNode = schema.nodeFromJSON(json);

    // Check node types
    const nodeTypes = pmNode.content.content.map((n: any) => n.type.name);
    expect(nodeTypes).toContain('heading');
    expect(nodeTypes).toContain('paragraph');
    expect(nodeTypes).toContain('jsxBlock');

    // Count JSX blocks
    const jsxBlocks = getJsxBlocks(json);
    expect(jsxBlocks).toHaveLength(4);
    expect(jsxBlocks[0].attrs?.content).toContain('Callout');
    expect(jsxBlocks[1].attrs?.content).toContain('Video');
    expect(jsxBlocks[2].attrs?.content).toContain('Tabs');
    expect(jsxBlocks[3].attrs?.content).toContain('Note');

    // Round-trip
    const cycle1 = serialize(json);
    const cycle2 = serialize(parse(cycle1));
    expect(cycle2).toBe(cycle1);
  });
});

describe('JsxBlock tokenizer — edge cases', () => {
  test('JSX with boolean attributes', () => {
    const md = '<Callout fullWidth>';
    // Note: this is not self-closing, so it won't match paired tags either
    // unless there's a closing tag. Let's test a proper pair.
    const md2 = `<Callout fullWidth>
  Content here.
</Callout>`;
    const json = parse(md2);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attrs?.content).toContain('fullWidth');
    const cycle1 = roundTrip(md2);
    expect(cycle1.trim()).toBe(md2);
  });

  test('JSX with expression attributes', () => {
    const md = '<Chart data={metrics} />';
    const json = parse(md);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attrs?.content).toBe('<Chart data={metrics} />');
    const cycle1 = roundTrip(md);
    expect(cycle1.trim()).toBe(md);
  });

  test('nested same-name components', () => {
    const md = `<Callout>
<Callout>inner</Callout>
</Callout>`;
    const json = parse(md);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(1);
    // The outer Callout should contain both the inner Callout and its content
    expect(blocks[0].attrs?.content).toBe(md.trim());
    const cycle1 = roundTrip(md);
    expect(cycle1.trim()).toBe(md.trim());
  });

  test('JSX with blank lines in children', () => {
    const md = `<Callout>

First paragraph.

Second paragraph.

</Callout>`;
    const json = parse(md);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attrs?.content).toBe(md.trim());
    const cycle1 = roundTrip(md);
    expect(cycle1.trim()).toBe(md.trim());
  });

  test('JSX at the start of document (no preceding content)', () => {
    const md = `<Callout type="info">
  First thing in the doc.
</Callout>

Some trailing text.`;
    const json = parse(md);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(1);

    // First node should be jsxBlock
    expect(json.content?.[0]?.type).toBe('jsxBlock');

    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('JSX at the end of document (no trailing content)', () => {
    const md = `Some leading text.

<Callout type="info">
  Last thing in the doc.
</Callout>`;
    const json = parse(md);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(1);

    // Last node should be jsxBlock
    const lastNode = json.content?.[json.content.length - 1];
    expect(lastNode?.type).toBe('jsxBlock');

    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('multiple JSX blocks in sequence (no paragraph between)', () => {
    const md = `<Callout type="warning">Warning!</Callout>
<Callout type="info">Info!</Callout>
<Video src="test.mp4" />`;
    const json = parse(md);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].attrs?.content).toBe('<Callout type="warning">Warning!</Callout>');
    expect(blocks[1].attrs?.content).toBe('<Callout type="info">Info!</Callout>');
    expect(blocks[2].attrs?.content).toBe('<Video src="test.mp4" />');

    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1);
  });

  test('self-closing JSX with expression attributes preserves curly braces', () => {
    const md = '<Chart data={metrics} width={800} height={400} />';
    const json = parse(md);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attrs?.content).toBe(md);
    expect(blocks[0].attrs?.content).toContain('{metrics}');
    expect(blocks[0].attrs?.content).toContain('{800}');
  });
});

describe('JsxBlock tokenizer — serialization fidelity', () => {
  test('serialized output uses standard block separation (double newline)', () => {
    // MarkdownManager separates blocks with double newlines.
    // This means JSX blocks get an extra blank line after them compared to input.
    // The key requirement is STABILITY: cycle2 === cycle1.
    const md = `# Title

<Callout>Content</Callout>

Paragraph.`;
    const cycle1 = roundTrip(md);
    const cycle2 = roundTrip(cycle1);
    expect(cycle2).toBe(cycle1); // stability is what matters
  });

  test('exact node order in parsed document', () => {
    const md = `# Heading

Paragraph one.

<Callout type="info">
  Info text.
</Callout>

Paragraph two.`;
    const json = parse(md);
    const types = json.content?.map((n) => n.type) || [];
    expect(types).toEqual(['heading', 'paragraph', 'jsxBlock', 'paragraph']);
  });

  test('JSX content attribute preserves exact whitespace', () => {
    const content = `<Tabs>
  <Tab title="first">
    Content with  extra  spaces.
  </Tab>
</Tabs>`;
    const json = parse(content);
    const blocks = getJsxBlocks(json);
    expect(blocks).toHaveLength(1);
    // The raw JSX content should preserve internal whitespace exactly
    expect(blocks[0].attrs?.content).toBe(content);
  });
});

describe('JsxBlock tokenizer — surrounding content preservation', () => {
  test('headings before and after JSX are preserved', () => {
    const md = `# Before

<Callout>Content</Callout>

## After`;
    const json = parse(md);
    const pmNode = schema.nodeFromJSON(json);
    const types = pmNode.content.content.map((n: any) => n.type.name);
    expect(types[0]).toBe('heading');
    expect(types).toContain('jsxBlock');
    // Should have a heading after (possibly with paragraphs in between)
    const headingCount = types.filter((t: string) => t === 'heading').length;
    expect(headingCount).toBe(2);
  });

  test('code blocks are not confused with JSX', () => {
    const md = `\`\`\`js
const x = <Component />;
\`\`\`

<Callout>Real JSX</Callout>`;
    const json = parse(md);
    const blocks = getJsxBlocks(json);
    // Only the Callout should be a jsxBlock, not the code block content
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attrs?.content).toBe('<Callout>Real JSX</Callout>');
  });

  test('inline HTML-like text in paragraphs does not trigger jsxBlock', () => {
    // Only uppercase-first tags should match (JSX convention)
    const md = `Some text with <div>html</div> in it.

<Callout>This is JSX</Callout>`;
    const json = parse(md);
    const blocks = getJsxBlocks(json);
    // Only the Callout should be captured
    expect(blocks).toHaveLength(1);
    expect(blocks[0].attrs?.content).toBe('<Callout>This is JSX</Callout>');
  });
});
