/**
 * Conversion fidelity tests.
 *
 * Verifies that every supported markdown construct survives the format
 * conversions in the stack:
 *   1. Markdown round-trip: serialize(parse(md))
 *   2. Tree round-trip: pmJSON → nodeFromJSON → updateYFragment → yXmlFragmentToProsemirrorJSON → pmJSON
 *   3. Observer round-trip: XmlFragment → Observer A → Y.Text → Observer B → XmlFragment
 *   4. Full-stack chain: md → parse → XmlFragment → Observer A → Y.Text → Observer B → XmlFragment → serialize → md
 *
 * Documents which constructs are stable vs which normalize.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';

import { __resetCoordinationState, setupObservers } from '../../src/editor/observers';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

// ─── Helpers ───

function wait(ms = 400): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripTrailingWhitespace(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n+$/, '');
}

/** Markdown round-trip: serialize(parse(md)) */
function mdRoundTrip(md: string): string {
  const json = mdManager.parse(md);
  return mdManager.serialize(json);
}

/** Tree round-trip: JSON → node → updateYFragment → yXmlFragmentToProsemirrorJSON → JSON */
function treeRoundTrip(md: string): string {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment('default');
  const json = mdManager.parse(md);
  const pmNode = schema.nodeFromJSON(json);
  const meta = { mapping: new Map(), isOMark: new Map() };
  updateYFragment(doc, fragment, pmNode, meta);
  const resultJson = yXmlFragmentToProsemirrorJSON(fragment);
  const result = mdManager.serialize(resultJson);
  doc.destroy();
  return result;
}

// ─── Test fixtures: every supported markdown construct ───

const CONSTRUCTS: Array<{ name: string; input: string; stable?: boolean; note?: string }> = [
  {
    name: 'heading (h1)',
    input: '# Heading 1\n',
    stable: true,
  },
  {
    name: 'heading (h2)',
    input: '## Heading 2\n',
    stable: true,
  },
  {
    name: 'heading (h3)',
    input: '### Heading 3\n',
    stable: true,
  },
  {
    name: 'paragraph',
    input: 'A simple paragraph.\n',
    stable: true,
  },
  {
    name: 'heading + paragraph',
    input: '## Heading\n\nA paragraph after heading.\n',
    stable: true,
  },
  {
    name: 'bullet list',
    input: '* Item 1\n* Item 2\n* Item 3\n',
  },
  {
    name: 'numbered list',
    input: '1. First\n2. Second\n3. Third\n',
  },
  {
    name: 'fenced code block',
    input: '```javascript\nconst x = 1;\n```\n',
  },
  {
    name: 'inline marks: bold',
    input: 'This is **bold** text.\n',
    stable: true,
  },
  {
    name: 'inline marks: italic',
    input: 'This is *italic* text.\n',
    stable: true,
  },
  {
    name: 'inline marks: code',
    input: 'This has `inline code` here.\n',
    stable: true,
  },
  {
    name: 'inline marks: strikethrough',
    input: 'This is ~~struck~~ text.\n',
  },
  {
    name: 'link',
    input: 'Visit [example](https://example.com) for more.\n',
    stable: true,
  },
  {
    name: 'image',
    input: '![Alt text](https://example.com/img.png)\n',
  },
  {
    name: 'blockquote',
    input: '> This is a blockquote.\n',
  },
  {
    name: 'horizontal rule',
    input: '---\n',
  },
  {
    name: 'hard line break',
    input: 'Line one  \nLine two\n',
    note: 'Two trailing spaces create hard break',
  },
  {
    name: 'nested list',
    input: '* Item 1\n  * Nested 1\n  * Nested 2\n* Item 2\n',
  },
];

// ─── 1. Markdown round-trip ───

describe('markdown round-trip: serialize(parse(md))', () => {
  for (const { name, input, stable } of CONSTRUCTS) {
    test(name, () => {
      const output = stripTrailingWhitespace(mdRoundTrip(input));
      const normalized = stripTrailingWhitespace(input);

      if (stable) {
        // Construct should be perfectly stable
        expect(output).toBe(normalized);
      } else {
        // Construct may normalize but must preserve semantic content
        // Extract meaningful text content (strip markdown syntax)
        const words = normalized.match(/\w{3,}/g) ?? [];
        for (const word of words) {
          expect(output).toContain(word);
        }
      }
    });
  }
});

// ─── 2. Tree round-trip ───

describe('tree round-trip: pmJSON → updateYFragment → yXmlFragmentToProsemirrorJSON → serialize', () => {
  for (const { name, input } of CONSTRUCTS) {
    test(name, () => {
      const output = stripTrailingWhitespace(treeRoundTrip(input));
      const normalized = stripTrailingWhitespace(input);

      // Tree round-trip should preserve content (may normalize whitespace)
      const words = normalized.match(/\w{3,}/g) ?? [];
      for (const word of words) {
        expect(output).toContain(word);
      }
    });
  }
});

// ─── 3. Observer round-trip ───

describe('observer round-trip: XmlFragment → Observer A → Y.Text → Observer B → XmlFragment', () => {
  beforeEach(() => {
    __resetCoordinationState();
  });

  for (const { name, input } of CONSTRUCTS) {
    test(name, async () => {
      const doc = new Y.Doc();
      const fragment = doc.getXmlFragment('default');
      const ytext = doc.getText('source');

      const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

      try {
        // Apply markdown to XmlFragment (simulates WYSIWYG content)
        const json = mdManager.parse(input);
        const pmNode = schema.nodeFromJSON(json);
        const meta = { mapping: new Map(), isOMark: new Map() };
        updateYFragment(doc, fragment, pmNode, meta);

        // Wait for Observer A (tree→text) + Observer B (text→tree) to settle
        await wait(500);

        // Verify bridge invariant holds
        const textContent = stripTrailingWhitespace(ytext.toString());
        const fragSerialized = stripTrailingWhitespace(
          mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment)),
        );
        expect(textContent).toBe(fragSerialized);

        // Verify content is preserved
        const words = stripTrailingWhitespace(input).match(/\w{3,}/g) ?? [];
        for (const word of words) {
          expect(textContent).toContain(word);
        }
      } finally {
        cleanup();
        doc.destroy();
      }
    });
  }
});

// ─── 4. Full-stack chain ───

describe('full-stack chain: md → parse → XmlFragment → Observer A → Y.Text → Observer B → XmlFragment → serialize → md', () => {
  beforeEach(() => {
    __resetCoordinationState();
  });

  for (const { name, input } of CONSTRUCTS) {
    test(name, async () => {
      const doc = new Y.Doc();
      const fragment = doc.getXmlFragment('default');
      const ytext = doc.getText('source');

      const cleanup = setupObservers({ doc, xmlFragment: fragment, ytext, mdManager, schema });

      try {
        // Start with markdown → parse → XmlFragment
        const json = mdManager.parse(input);
        const pmNode = schema.nodeFromJSON(json);
        const meta = { mapping: new Map(), isOMark: new Map() };
        updateYFragment(doc, fragment, pmNode, meta);

        // Wait for full observer cycle to settle
        await wait(500);

        // Final output: serialize back to markdown
        const finalMd = stripTrailingWhitespace(
          mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment)),
        );

        // Content must be preserved (normalization is acceptable)
        const words = stripTrailingWhitespace(input).match(/\w{3,}/g) ?? [];
        for (const word of words) {
          expect(finalMd).toContain(word);
        }

        // Bridge invariant must hold
        const textContent = stripTrailingWhitespace(ytext.toString());
        expect(textContent).toBe(finalMd);
      } finally {
        cleanup();
        doc.destroy();
      }
    });
  }
});
