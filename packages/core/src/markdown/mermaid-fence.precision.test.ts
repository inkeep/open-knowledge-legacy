/**
 * Mermaid fence parse-path precision tests
 * (SPEC 2026-04-29-mermaid-canonical-and-syntax).
 *
 * ` ```mermaid `…``` ` fenced code parses to a `MermaidFence` compat
 * descriptor (`rendersAs: 'Mermaid'`). Other code-block languages
 * (` ```js `, ` ```ts `, etc.) are unchanged — only `lang === 'mermaid'`
 * is promoted.
 */

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

describe('mermaid fence (` ```mermaid `) → MermaidFence compat', () => {
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
    const mermaidFence = findInJson(json, isComponent('MermaidFence'));
    expect(mermaidFence).toBeNull();
  });

  test('plain ` ``` ` fence (no language) is NOT MermaidFence', () => {
    const json = mdManager.parse('```\nplain text\n```\n');
    const mermaidFence = findInJson(json, isComponent('MermaidFence'));
    expect(mermaidFence).toBeNull();
  });
});

describe('mermaid + other components coexist', () => {
  test('mermaid fence next to a math block — both promote independently', () => {
    const source = '```mermaid\ngraph TD; A-->B;\n```\n\n$$\nE = mc^2\n$$\n';
    const json = mdManager.parse(source);
    expect(findInJson(json, isComponent('MermaidFence'))).toBeDefined();
    expect(findInJson(json, isComponent('DollarMath'))).toBeDefined();
  });
});
