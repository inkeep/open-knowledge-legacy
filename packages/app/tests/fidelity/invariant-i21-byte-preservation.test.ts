
import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import { mdManager, mdRoundTrip, NUM_RUNS } from './helpers';

describe('I21 — descriptor source forms round-trip byte-identical via OK→OK paste path', () => {
  test('lowercase `<img src="…"/>` — fix for silent flip to `![](src)` (BUG class 1)', () => {
    const src = '<img src="https://example.com/x.png" alt="x" />\n';
    expect(mdRoundTrip(src)).toBe(src);
  });

  test('multi-line `<Callout type="note">…</Callout>` — fix for conspicuous codeBlock degradation (BUG class 2)', () => {
    const src = '<Callout type="note">\n\nbody text\n\n</Callout>\n';
    expect(mdRoundTrip(src)).toBe(src);
  });

  test('multi-line `<Callout type="warning">…</Callout>` with a body paragraph', () => {
    const src = '<Callout type="warning">\n\nheads up\n\n</Callout>\n';
    expect(mdRoundTrip(src)).toBe(src);
  });

  test('`<details><summary>…</summary>…</details>` — HtmlDetailsAccordion compat (BUG class 3, post-rebuild)', () => {
    const src = '<details><summary>Q</summary>A</details>\n';
    expect(mdRoundTrip(src)).toBe(src);
  });

  test('`<details open><summary>…</summary>…</details>` — defaultOpen=true preserved', () => {
    const src = '<details open><summary>Show details</summary>\n\nBody\n\n</details>\n';
    expect(mdRoundTrip(src)).toBe(src);
  });

  test('`<u>foo</u>` raw HTML inline survives the clipboard round-trip (BUG class 4)', () => {
    const src = 'plain prose with a <u>foo</u> word inline\n';
    expect(mdRoundTrip(src)).toBe(src);
  });

  test('mixed canonical content — Callout + image + body prose', () => {
    const src =
      '## Section heading\n\n<Callout type="note">\n\nan informative aside\n\n</Callout>\n\n<img src="https://example.com/x.png" alt="x" />\n\nFollowing prose paragraph.\n';
    expect(mdRoundTrip(src)).toBe(src);
  });
});

describe('I21 — fast-check fuzz over the canonical-descriptor input grammar', () => {
  const calloutTypes = ['note', 'tip', 'important', 'warning', 'caution'] as const;

  test('every (type, body-line-count) pair round-trips byte-identical', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...calloutTypes),
        fc.integer({ min: 1, max: 4 }),
        (type, bodyLineCount) => {
          const body = Array.from({ length: bodyLineCount }, (_, i) => `line ${i + 1}`).join('\n');
          const src = `<Callout type="${type}">\n\n${body}\n\n</Callout>\n`;
          expect(mdRoundTrip(src)).toBe(src);
        },
      ),
      { numRuns: Math.min(NUM_RUNS, 200) },
    );
  });

  test('image src + alt round-trips byte-identical', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-zA-Z0-9_/.-]+$/.test(s)),
        fc.string({ maxLength: 20 }).filter((s) => !/[\\<>"'&]/.test(s)),
        (src, alt) => {
          const md = `<img src="https://example.com/${src}" alt="${alt}" />\n`;
          expect(mdRoundTrip(md)).toBe(md);
        },
      ),
      { numRuns: Math.min(NUM_RUNS, 200) },
    );
  });
});

describe('I21 — descriptor identity is preserved on parse', () => {
  test('multi-line `<Callout>` parses to jsxComponent(Callout) with type prop', () => {
    const json = mdManager.parse('<Callout type="note">\n\nbody\n\n</Callout>');
    const docContent = json.content?.[0];
    expect(docContent?.type).toBe('jsxComponent');
    expect(docContent?.attrs?.componentName).toBe('Callout');
    expect(docContent?.attrs?.props?.type).toBe('note');
  });

  test('`<img>` parses to jsxComponent(img) with src + alt props', () => {
    const json = mdManager.parse('<img src="x.png" alt="x" />');
    function findJsxComponent(node: typeof json): typeof json | undefined {
      if (node.type === 'jsxComponent') return node;
      if (!node.content) return undefined;
      for (const child of node.content) {
        const found = findJsxComponent(child);
        if (found) return found;
      }
      return undefined;
    }
    const jsxNode = findJsxComponent(json);
    expect(jsxNode).toBeDefined();
    expect(jsxNode?.attrs?.componentName).toBe('img');
    expect(jsxNode?.attrs?.props?.src).toBe('x.png');
    expect(jsxNode?.attrs?.props?.alt).toBe('x');
  });

  test('`<details>` parses to jsxComponent(HtmlDetailsAccordion) with title prop', () => {
    const json = mdManager.parse('<details><summary>Q</summary>A</details>');
    expect(json.content?.[0]?.type).toBe('jsxComponent');
    expect(json.content?.[0]?.attrs?.componentName).toBe('HtmlDetailsAccordion');
    expect(json.content?.[0]?.attrs?.props?.title).toBe('Q');
  });
});
