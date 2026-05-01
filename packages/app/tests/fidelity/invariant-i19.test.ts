import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import * as fc from 'fast-check';
import { mdManager, mdRoundTrip, NUM_RUNS } from './helpers';

function stripGammaAttrs(node: JSONContent): JSONContent {
  if (!node) return node;
  let attrs = node.attrs;
  if (node.type === 'jsxComponent' && attrs) {
    attrs = { ...attrs };
    delete (attrs as Record<string, unknown>).sourceRaw;
    delete (attrs as Record<string, unknown>).content;
    delete (attrs as Record<string, unknown>).attributes;
    delete (attrs as Record<string, unknown>).sourceDirty;
    delete (attrs as Record<string, unknown>).componentName;
  }
  const content = node.content?.map(stripGammaAttrs);
  return { ...node, ...(attrs ? { attrs } : {}), ...(content ? { content } : {}) };
}

function findFirstNode(node: JSONContent, type: string): JSONContent | undefined {
  if (node.type === type) return node;
  if (node.content) {
    for (const child of node.content) {
      const found = findFirstNode(child, type);
      if (found) return found;
    }
  }
  return undefined;
}

describe('I19 — single-line <details> ↔ Accordion structural equivalence', () => {
  test('<details> with title + body parses same as <Accordion title body>', () => {
    const html = '<details><summary>Q</summary>Answer</details>';
    const mdx = '<Accordion title="Q">\n\nAnswer\n\n</Accordion>';
    const fromHtml = stripGammaAttrs(mdManager.parse(html));
    const fromMdx = stripGammaAttrs(mdManager.parse(mdx));
    expect(JSON.stringify(fromHtml)).toBe(JSON.stringify(fromMdx));
  });

  test('<details open> → defaultOpen=true', () => {
    const html = '<details open><summary>X</summary>Body</details>';
    const mdx = '<Accordion title="X" defaultOpen>\n\nBody\n\n</Accordion>';
    const fromHtml = stripGammaAttrs(mdManager.parse(html));
    const fromMdx = stripGammaAttrs(mdManager.parse(mdx));
    expect(JSON.stringify(fromHtml)).toBe(JSON.stringify(fromMdx));
  });

  test('<details name="grp"> → name attr preserved', () => {
    const html = '<details name="grp"><summary>One</summary>Body</details>';
    const mdx = '<Accordion title="One" name="grp">\n\nBody\n\n</Accordion>';
    const fromHtml = stripGammaAttrs(mdManager.parse(html));
    const fromMdx = stripGammaAttrs(mdManager.parse(mdx));
    expect(JSON.stringify(fromHtml)).toBe(JSON.stringify(fromMdx));
  });

  test('<details id="a" open> → id + defaultOpen preserved', () => {
    const html = '<details id="a" open><summary>N</summary>B</details>';
    const mdx = '<Accordion title="N" defaultOpen id="a">\n\nB\n\n</Accordion>';
    const fromHtml = stripGammaAttrs(mdManager.parse(html));
    const fromMdx = stripGammaAttrs(mdManager.parse(mdx));
    expect(JSON.stringify(fromHtml)).toBe(JSON.stringify(fromMdx));
  });
});

describe('I19 — multi-paragraph <details> ↔ Accordion structural equivalence', () => {
  test('opener + body + closer paragraphs collapse into single Accordion', () => {
    const html = '<details open><summary>Show details</summary>\n\nBody\n\n</details>';
    const mdx = '<Accordion title="Show details" defaultOpen>\n\nBody\n\n</Accordion>';
    const fromHtml = stripGammaAttrs(mdManager.parse(html));
    const fromMdx = stripGammaAttrs(mdManager.parse(mdx));
    expect(JSON.stringify(fromHtml)).toBe(JSON.stringify(fromMdx));
  });

  test('multi-paragraph body spans are preserved', () => {
    const html = '<details><summary>Title</summary>\n\nPara one\n\nPara two\n\n</details>';
    const mdx = '<Accordion title="Title">\n\nPara one\n\nPara two\n\n</Accordion>';
    const fromHtml = stripGammaAttrs(mdManager.parse(html));
    const fromMdx = stripGammaAttrs(mdManager.parse(mdx));
    expect(JSON.stringify(fromHtml)).toBe(JSON.stringify(fromMdx));
  });
});

describe('I19 — γ pristine preservation of <details> source', () => {
  const cases: Array<{ name: string; md: string }> = [
    { name: 'single-line, no attrs', md: '<details><summary>Q</summary>Answer</details>\n' },
    { name: 'single-line, open', md: '<details open><summary>X</summary>Body</details>\n' },
    {
      name: 'single-line, name',
      md: '<details name="grp"><summary>One</summary>Body</details>\n',
    },
    {
      name: 'single-line, id + open',
      md: '<details id="anchor" open><summary>Named</summary>Body</details>\n',
    },
    {
      name: 'multi-paragraph, open',
      md: '<details open><summary>Show details</summary>\n\nBody\n\n</details>\n',
    },
    {
      name: 'multi-paragraph, multi-body',
      md: '<details><summary>Title</summary>\n\nMulti-line\n\nbody\n\n</details>\n',
    },
    {
      name: 'inside a document with surrounding prose',
      md: 'Intro.\n\n<details><summary>Q</summary>A</details>\n\nOutro.\n',
    },
  ];

  for (const c of cases) {
    test(`<details> round-trips byte-identical (${c.name})`, () => {
      expect(mdRoundTrip(c.md)).toBe(c.md);
    });
  }
});

describe('I19 — props shape after parse', () => {
  test('open attr sets defaultOpen=true', () => {
    const json = mdManager.parse('<details open><summary>X</summary>Body</details>');
    const node = findFirstNode(json, 'jsxComponent');
    expect(node).toBeDefined();
    expect(node?.attrs?.componentName).toBe('HtmlDetailsAccordion');
    const props = (node?.attrs?.props ?? {}) as Record<string, unknown>;
    expect(props.title).toBe('X');
    expect(props.defaultOpen).toBe(true);
  });

  test('no open attr → defaultOpen prop absent from props', () => {
    const json = mdManager.parse('<details><summary>X</summary>Body</details>');
    const node = findFirstNode(json, 'jsxComponent');
    const props = (node?.attrs?.props ?? {}) as Record<string, unknown>;
    expect(props.defaultOpen).toBeUndefined();
  });

  test('name + id attrs are carried through to props', () => {
    const json = mdManager.parse(
      '<details id="anchor" name="grp"><summary>X</summary>Body</details>',
    );
    const node = findFirstNode(json, 'jsxComponent');
    const props = (node?.attrs?.props ?? {}) as Record<string, unknown>;
    expect(props.name).toBe('grp');
    expect(props.id).toBe('anchor');
  });

  test('summary text becomes title prop', () => {
    const json = mdManager.parse(
      '<details><summary>Human-readable summary</summary>Body</details>',
    );
    const node = findFirstNode(json, 'jsxComponent');
    const props = (node?.attrs?.props ?? {}) as Record<string, unknown>;
    expect(props.title).toBe('Human-readable summary');
  });
});

describe('I19 — PBT: arbitrary summary + body text → pristine round-trip', () => {
  const titleChars = fc.stringMatching(/^[A-Za-z][\w .,!?;:'-]{0,30}$/);
  const bodyChars = fc.stringMatching(/^[A-Za-z][\w .,!?;:()']{0,40}$/);

  test('single-line <details> with arbitrary title + body is pristine', () => {
    fc.assert(
      fc.property(titleChars, bodyChars, (title, body) => {
        const html = `<details><summary>${title}</summary>${body}</details>\n`;
        expect(mdRoundTrip(html)).toBe(html);
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });

  test('single-line <details open> with arbitrary title + body is pristine', () => {
    fc.assert(
      fc.property(titleChars, bodyChars, (title, body) => {
        const html = `<details open><summary>${title}</summary>${body}</details>\n`;
        expect(mdRoundTrip(html)).toBe(html);
      }),
      { numRuns: NUM_RUNS, seed: 42 },
    );
  });
});
