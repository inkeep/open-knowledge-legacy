import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { fenceFor } from './jsx-component';
import { sharedExtensions } from './shared';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

describe('fenceFor', () => {
  test('returns 3 backticks for content with no backticks', () => {
    expect(fenceFor('<Button>Click me</Button>')).toBe('```');
  });

  test('returns 4 backticks when content contains triple backticks', () => {
    expect(fenceFor('some code\n```\nmore code')).toBe('````');
  });

  test('returns 5 backticks when content contains 4 backticks', () => {
    expect(fenceFor('````example````')).toBe('`````');
  });

  test('returns 3 backticks for content with single/double backticks only', () => {
    expect(fenceFor('`inline` and ``double``')).toBe('```');
  });
});

describe('jsx-component renderMarkdown', () => {
  test('serializes content without backticks using 3-backtick fence', () => {
    const json = {
      type: 'doc',
      content: [{ type: 'jsxComponent', attrs: { content: '<Button>Click</Button>' } }],
    };
    const md = mdManager.serialize(json);
    expect(md).toContain('```jsx-component');
    expect(md).not.toContain('````');
  });

  test('serializes content with triple backticks using 4-backtick fence', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'jsxComponent',
          attrs: { content: 'example:\n```js\nconst x = 1;\n```' },
        },
      ],
    };
    const md = mdManager.serialize(json);
    expect(md).toContain('````jsx-component');
  });
});

describe('jsx-component round-trip', () => {
  test('content with no backticks round-trips through parse→serialize', () => {
    const original = '```jsx-component\n<Button variant="primary">Go</Button>\n```';
    const parsed = mdManager.parse(original);
    const pmNode = schema.nodeFromJSON(parsed);
    expect(pmNode.firstChild?.type.name).toBe('jsxComponent');
    expect(pmNode.firstChild?.attrs.content).toBe('<Button variant="primary">Go</Button>');
    const serialized = mdManager.serialize(parsed);
    expect(serialized.trim()).toBe(original);
  });

  test('content with triple backticks round-trips through parse→serialize', () => {
    const original = '````jsx-component\ncode:\n```js\nconst x = 1;\n```\n````';
    const parsed = mdManager.parse(original);
    const pmNode = schema.nodeFromJSON(parsed);
    expect(pmNode.firstChild?.type.name).toBe('jsxComponent');
    expect(pmNode.firstChild?.attrs.content).toContain('```js');
    const serialized = mdManager.serialize(parsed);
    expect(serialized.trim()).toBe(original);
  });

  test('content with 4 backticks round-trips through parse→serialize', () => {
    const original = '`````jsx-component\n````example\nstuff\n````\n`````';
    const parsed = mdManager.parse(original);
    const pmNode = schema.nodeFromJSON(parsed);
    expect(pmNode.firstChild?.type.name).toBe('jsxComponent');
    expect(pmNode.firstChild?.attrs.content).toContain('````');
    const serialized = mdManager.serialize(parsed);
    expect(serialized.trim()).toBe(original);
  });
});
