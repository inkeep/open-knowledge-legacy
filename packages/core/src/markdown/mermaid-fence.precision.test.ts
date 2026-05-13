import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function findInJson(json: JSONContent, predicate: (n: JSONContent) => boolean): JSONContent | null {
  if (predicate(json)) return json;
  for (const child of json.content ?? []) {
    const found = findInJson(child, predicate);
    if (found) return found;
  }
  return null;
}

const isComponent = (name: string) => (n: JSONContent) =>
  n.type === 'jsxComponent' && n.attrs?.componentName === name;

describe('mermaid fence (` ```mermaid `) → MermaidFence canonical', () => {
  test('` ```mermaid ` fence parses to a MermaidFence jsxComponent', () => {
    const json = mdManager.parse('```mermaid\ngraph TD; A-->B;\n```\n');
    const node = findInJson(json, isComponent('MermaidFence'));
    expect(node).toBeDefined();
  });

  test('mermaid fence preserves the chart source on the descriptor props', () => {
    const json = mdManager.parse('```mermaid\ngraph TD\n  A-->B\n  A-->C\n```\n');
    const node = findInJson(json, isComponent('MermaidFence'));
    expect(node).toBeDefined();
    expect((node?.attrs?.props as Record<string, unknown>)?.chart).toBe(
      'graph TD\n  A-->B\n  A-->C',
    );
  });

  test('mermaid fence round-trips back to ` ```mermaid `…``` ` (γ pristine)', () => {
    const source = '```mermaid\ngraph TD; A-->B;\n```\n';
    const json = mdManager.parse(source);
    const out = mdManager.serialize(json);
    expect(out).toBe(source);
  });

  test('non-mermaid fences (` ```js `) are unchanged — still a code block, NOT MermaidFence', () => {
    const json = mdManager.parse('```js\nconst x = 1;\n```\n');
    const mermaid = findInJson(json, isComponent('MermaidFence'));
    expect(mermaid).toBeNull();
  });

  test('plain ` ``` ` fence (no language) is NOT MermaidFence', () => {
    const json = mdManager.parse('```\nplain text\n```\n');
    const mermaid = findInJson(json, isComponent('MermaidFence'));
    expect(mermaid).toBeNull();
  });

  test('legacy `<Mermaid chart="…" />` JSX does NOT match MermaidFence — falls through to wildcard', () => {
    const json = mdManager.parse('<Mermaid chart="graph TD; A-->B;" />\n');
    const fence = findInJson(json, isComponent('MermaidFence'));
    expect(fence).toBeNull();
    const wildcard = findInJson(json, isComponent('Mermaid'));
    expect(wildcard).not.toBeNull();
  });

  test('dirty-path: edited MermaidFence re-emits as ` ```mermaid ` fence, not JSX', () => {
    const json = mdManager.parse('```mermaid\ngraph TD; A-->B;\n```\n');
    const node = findInJson(json, isComponent('MermaidFence'));
    expect(node).not.toBeNull();
    if (node?.attrs) {
      delete (node.attrs as Record<string, unknown>).sourceRaw;
      (node.attrs.props as Record<string, unknown>).chart = 'flowchart LR; X-->Y;';
    }
    const out = mdManager.serialize(json);
    expect(out).toContain('```mermaid');
    expect(out).toContain('flowchart LR; X-->Y;');
    expect(out).not.toContain('<MermaidFence');
    expect(out).not.toContain('<Mermaid ');
  });
});

describe('mermaid + other components coexist', () => {
  test('mermaid fence next to a math block — both promote independently', () => {
    const source = '```mermaid\ngraph TD; A-->B;\n```\n\n$$\nE = mc^2\n$$\n';
    const json = mdManager.parse(source);
    expect(findInJson(json, isComponent('MermaidFence'))).toBeDefined();
    expect(findInJson(json, isComponent('DollarMath'))).toBeDefined();
  });

  test('two mermaid fences in one document each promote independently', () => {
    const source = '```mermaid\ngraph TD; A-->B;\n```\n\n```mermaid\nflowchart LR; X-->Y;\n```\n';
    const json = mdManager.parse(source);
    let count = 0;
    const walk = (n: JSONContent) => {
      if (isComponent('MermaidFence')(n)) count++;
      for (const child of n.content ?? []) walk(child);
    };
    walk(json);
    expect(count).toBe(2);
  });
});
