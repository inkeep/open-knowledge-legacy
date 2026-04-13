/**
 * Tests for jsxComponent PM node — native MDX form (post-migration).
 *
 * The old code-fence form (```jsx-component) is replaced by native MDX via remark-mdx.
 * These tests verify the jsxComponent PM node works correctly with the new pipeline.
 */
import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '../markdown/index.ts';
import { sharedExtensions } from './shared';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

describe('jsxComponent schema', () => {
  test('jsxComponent node exists in schema', () => {
    expect(schema.nodes.jsxComponent).toBeDefined();
  });

  test('jsxComponent is an atom node', () => {
    expect(schema.nodes.jsxComponent.spec.atom).toBe(true);
  });

  test('jsxComponent has content attribute', () => {
    expect(schema.nodes.jsxComponent.spec.attrs?.content).toBeDefined();
  });
});

describe('jsxComponent via native MDX', () => {
  test('self-closing MDX component stores raw source in content', () => {
    const md = '<Button variant="primary" />\n';
    const json = mdManager.parse(md);
    const jsxNode = json.content?.find((n: any) => n.type === 'jsxComponent');
    expect(jsxNode).toBeDefined();
    expect(jsxNode?.attrs.content).toContain('Button');
  });

  test('self-closing MDX component round-trips', () => {
    const md = '<Button variant="primary" />\n';
    const result = mdManager.serialize(mdManager.parse(md));
    expect(result.trim()).toBe(md.trim());
  });

  test('MDX component with expression attr round-trips', () => {
    const md = '<Chart data={items} />\n';
    const result = mdManager.serialize(mdManager.parse(md));
    expect(result.trim()).toBe(md.trim());
  });

  test('MDX component with member expression round-trips', () => {
    const md = '<Docs.Link href="/api" />\n';
    const result = mdManager.serialize(mdManager.parse(md));
    expect(result.trim()).toBe(md.trim());
  });
});

describe('jsxComponent insertJsxComponent command', () => {
  test('command is available in extension', () => {
    // The insertJsxComponent command is defined in JsxComponent extension
    const ext = sharedExtensions.find(
      (e: any) => e.name === 'jsxComponent' || e.config?.name === 'jsxComponent',
    );
    expect(ext).toBeDefined();
  });
});
