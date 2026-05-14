import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

function findNodes(json: JSONContent, type: string): JSONContent[] {
  const out: JSONContent[] = [];
  const visit = (n: JSONContent) => {
    if (n.type === type) out.push(n);
    for (const child of n.content ?? []) visit(child);
  };
  visit(json);
  return out;
}

function plainTextOf(json: JSONContent): string {
  let out = '';
  const visit = (n: JSONContent) => {
    if (n.type === 'text') out += n.text ?? '';
    for (const child of n.content ?? []) visit(child);
  };
  visit(json);
  return out;
}

describe('footnotes — basic round-trip', () => {
  test('numeric reference + definition round-trip byte-stable', () => {
    const src = 'Here is text with a footnote[^1].\n\n[^1]: First definition.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('named reference (`[^note]`) round-trips', () => {
    const src = 'Named[^note].\n\n[^note]: A named footnote.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('alphanumeric identifier (`[^a1b2]`) round-trips', () => {
    const src = 'Mixed[^a1b2].\n\n[^a1b2]: Mixed alphanumeric.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });
});

describe('footnotes — parse correctness', () => {
  test('reference parses as PM `footnoteReference` atom with identifier attr', () => {
    const json = mdManager.parse('Hi[^1].\n\n[^1]: Body.\n');
    const refs = findNodes(json, 'footnoteReference');
    expect(refs.length).toBe(1);
    expect(refs[0].attrs?.identifier).toBe('1');
  });

  test('definition parses as PM `footnoteDefinition` block with identifier attr', () => {
    const json = mdManager.parse('Hi[^1].\n\n[^1]: Body.\n');
    const defs = findNodes(json, 'footnoteDefinition');
    expect(defs.length).toBe(1);
    expect(defs[0].attrs?.identifier).toBe('1');
  });

  test('definition body preserves nested paragraph content', () => {
    const json = mdManager.parse('Hi[^1].\n\n[^1]: Body text here.\n');
    const defs = findNodes(json, 'footnoteDefinition');
    expect(plainTextOf(defs[0])).toBe('Body text here.');
  });

  test('definition with mixed-case identifier preserves casing on `label`', () => {
    const json = mdManager.parse('Hi[^MyNote].\n\n[^MyNote]: Body.\n');
    const refs = findNodes(json, 'footnoteReference');
    const defs = findNodes(json, 'footnoteDefinition');
    expect(refs.length).toBe(1);
    expect(defs.length).toBe(1);
    expect(refs[0].attrs?.identifier).toBe('mynote');
    expect(refs[0].attrs?.label).toBe('MyNote');
    expect(defs[0].attrs?.identifier).toBe('mynote');
    expect(defs[0].attrs?.label).toBe('MyNote');
    const src = 'Hi[^MyNote].\n\n[^MyNote]: Body.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('reference text is NOT corrupted to literal `"footnoteReference"` (regression guard)', () => {
    const json = mdManager.parse('Hi[^1].\n\n[^1]: Body.\n');
    expect(plainTextOf(json)).not.toContain('footnoteReference');
  });
});

describe('footnotes — multiple references + definitions', () => {
  test('two references in one paragraph round-trip', () => {
    const src = 'First[^1] and second[^2].\n\n[^1]: One.\n\n[^2]: Two.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('three references with named ids round-trip', () => {
    const src = 'A[^a], B[^b], C[^c].\n\n[^a]: alpha\n\n[^b]: beta\n\n[^c]: gamma\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('parse produces one PM atom per reference', () => {
    const json = mdManager.parse('First[^1] and second[^2].\n\n[^1]: One.\n\n[^2]: Two.\n');
    const refs = findNodes(json, 'footnoteReference');
    expect(refs.length).toBe(2);
    expect(refs.map((r) => r.attrs?.identifier)).toEqual(['1', '2']);
  });

  test('parse produces one PM block per definition', () => {
    const json = mdManager.parse('First[^1] and second[^2].\n\n[^1]: One.\n\n[^2]: Two.\n');
    const defs = findNodes(json, 'footnoteDefinition');
    expect(defs.length).toBe(2);
  });
});

describe('footnotes — orphan handling', () => {
  test('reference without matching definition stays prose (GFM upstream behavior)', () => {
    const src = 'Orphan[^missing] reference.\n';
    const json = mdManager.parse(src);
    const refs = findNodes(json, 'footnoteReference');
    expect(refs.length).toBe(0);
    expect(plainTextOf(json)).toContain('[^missing]');
  });

  test('definition without matching reference stays a definition (orphan def)', () => {
    const src = 'Just a paragraph.\n\n[^orphan]: Lonely definition.\n';
    const json = mdManager.parse(src);
    const defs = findNodes(json, 'footnoteDefinition');
    expect(defs.length).toBe(1);
    expect(defs[0].attrs?.identifier).toBe('orphan');
  });
});

describe('footnotes — definition body content', () => {
  test('definition with bold content round-trips', () => {
    const src = 'Hi[^1].\n\n[^1]: Body with **bold** text.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('definition with link content round-trips', () => {
    const src = 'Hi[^1].\n\n[^1]: See [example](https://example.com).\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('definition body containing a list parses as block content', () => {
    const src = 'Hi[^1].\n\n[^1]:\n    - item 1\n    - item 2\n';
    const json = mdManager.parse(src);
    const defs = findNodes(json, 'footnoteDefinition');
    expect(defs.length).toBe(1);
    expect(findNodes(defs[0], 'list').length).toBeGreaterThan(0);
  });
});

describe('footnotes — surrounding context', () => {
  test('references mid-paragraph with marks compose', () => {
    const src = 'Some **important**[^1] text.\n\n[^1]: Note.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('reference inside a heading round-trips', () => {
    const src = '## Heading with note[^1]\n\n[^1]: Heading note.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });

  test('reference inside a list item round-trips', () => {
    const src = '- Item with footnote[^1]\n\n[^1]: List note.\n';
    expect(mdManager.serialize(mdManager.parse(src))).toBe(src);
  });
});

describe('footnotes — schema-drift defense', () => {
  const driftMgr = new MarkdownManager({
    extensions: sharedExtensions.filter(
      (ext) => ext.name !== 'footnoteReference' && ext.name !== 'footnoteDefinition',
    ),
  });

  function paragraphText(json: JSONContent, index: number): string {
    const paragraphs: JSONContent[] = [];
    for (const child of json.content ?? []) {
      if (child.type === 'paragraph') paragraphs.push(child);
    }
    const target = paragraphs[index];
    return target ? plainTextOf(target) : '';
  }

  test('reference without extension preserves `[^id]` source instead of corrupting to type-name text', () => {
    const src = 'Hello[^1].\n\n[^1]: Body.\n';
    const json = driftMgr.parse(src);
    const flat = JSON.stringify(json);
    expect(flat).not.toContain('"text":"footnoteReference"');
    expect(flat).not.toContain('HellofootnoteReference');
    expect(paragraphText(json, 0)).toBe('Hello[^1].');
  });

  test('reference without extension preserves source casing on label', () => {
    const src = 'Casing[^MyNote] check.\n\n[^MyNote]: Body.\n';
    const json = driftMgr.parse(src);
    expect(paragraphText(json, 0)).toBe('Casing[^MyNote] check.');
    expect(paragraphText(json, 1)).toBe('[^MyNote]: ');
  });

  test('reference without extension round-trips so the [^id] markdown survives serialize', () => {
    const src = 'Sentence with[^7] reference.\n\n[^7]: Body.\n';
    const back = driftMgr.serialize(driftMgr.parse(src));
    expect(back.match(/\[\^7\]/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(back).not.toContain('footnoteReference');
  });

  test('definition without extension surfaces as visible `[^id]:` marker rather than silently dropping', () => {
    const src = 'Hi[^x].\n\n[^x]: Lost body text.\n';
    const json = driftMgr.parse(src);
    expect(paragraphText(json, 1)).toBe('[^x]: ');
    expect(JSON.stringify(json)).not.toContain('"text":"footnoteDefinition"');
    expect(JSON.stringify(json)).not.toContain('Lost body text');
    const paragraphCount = (json.content ?? []).filter((c) => c.type === 'paragraph').length;
    expect(paragraphCount).toBe(2);
  });

  test('inlineUnknownHandler emits node.value when present, never the bare mdast type name', () => {
    const mgr = new MarkdownManager({
      extensions: sharedExtensions.filter((ext) => ext.name !== 'mathInline'),
    });
    const json = mgr.parse('Wave $\\psi$ here.\n');
    const flat = JSON.stringify(json);
    expect(flat).not.toContain('"text":"inlineMath"');
    expect(flat).not.toContain('Wave inlineMath here');
    expect(plainTextOf(json)).toContain('\\psi');
  });
});
