/**
 * EX01-EX06: Expression attr round-trip tests (D5, FR-1, FR-5).
 *
 * Validates that the five expression-attr shapes defined in D5 parse to the
 * correct structured values via destructureAttrs and serialize byte-identically
 * when pristine.
 *
 * Note: single-line self-closing JSX is tokenized by micromark as mdxJsxTextElement
 * (inline → jsxInline thin shape). Multi-line paired JSX is tokenized as
 * mdxJsxFlowElement (block → jsxComponent with structured attrs). The EX series
 * tests the BLOCK path (destructureAttrs → attrs.props) using multi-line forms,
 * plus round-trip byte-identity for both inline and block forms.
 */
import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { mdManager, mdRoundTrip, normalize } from './helpers';

function findNode(node: JSONContent, type: string): JSONContent | undefined {
  if (node.type === type) return node;
  if (node.content) {
    for (const child of node.content) {
      const found = findNode(child, type);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Helper: parse MDX → find the first jsxComponent node → return its attrs.
 */
function parseJsxAttrs(md: string): Record<string, unknown> {
  const json = mdManager.parse(md);
  const component = findNode(json, 'jsxComponent');
  if (!component) throw new Error(`No jsxComponent found in parsed output for: ${md}`);
  return component.attrs ?? {};
}

/**
 * Helper: parse MDX → find the first jsxComponent → return its structured props.
 */
function parseJsxProps(md: string): Record<string, unknown> {
  const attrs = parseJsxAttrs(md);
  return (attrs.props ?? {}) as Record<string, unknown>;
}

// Multi-line form to ensure block tokenization (mdxJsxFlowElement → jsxComponent)
const wrap = (tag: string, content = 'x') =>
  `<${tag}>\n\n${content}\n\n</${tag.split(/\s/)[0].split('/')[0]}>\n`;

describe('EX — Expression attr destructuring (D5, FR-1) via block path', () => {
  test('EX01: num={3} → number 3 in structured props', () => {
    const props = parseJsxProps(wrap('Comp num={3}'));
    expect(props.num).toBe(3);
  });

  test('EX02: prop={values} → raw string passthrough', () => {
    const props = parseJsxProps(wrap('Comp prop={values}'));
    expect(props.prop).toBe('values');
  });

  test('EX03: arr={[1,2,3]} → parsed as array', () => {
    const props = parseJsxProps(wrap('Comp arr={[1,2,3]}'));
    expect(props.arr).toEqual([1, 2, 3]);
  });

  test('EX04: complex expression → raw string passthrough', () => {
    // Complex expressions that aren't valid JSON are stored as raw strings
    const props = parseJsxProps(wrap('Comp complex={items.map(x => x + 1)}'));
    expect(typeof props.complex).toBe('string');
    expect(props.complex).toBe('items.map(x => x + 1)');
  });

  test('EX05: {...rest} spread attr → preserved in attributes array, not in props', () => {
    const attrs = parseJsxAttrs(wrap('Comp {...rest}'));
    const props = (attrs.props ?? {}) as Record<string, unknown>;
    // Spread attrs are MdxJsxExpressionAttribute — stored in the attributes array
    // but NOT destructured into named props
    expect(props).toEqual({});
    const attributesArr = attrs.attributes as Array<{ type: string; value?: string }>;
    const spread = attributesArr.find((a) => a.type === 'mdxJsxExpressionAttribute');
    expect(spread).toBeDefined();
    expect(spread?.value).toBe('...rest');
  });

  test('EX06: bool boolean shorthand → true', () => {
    const props = parseJsxProps(wrap('Comp bool'));
    expect(props.bool).toBe(true);
  });

  test('EX07: bool={false} → false (explicit false expression)', () => {
    const props = parseJsxProps(wrap('Comp bool={false}'));
    expect(props.bool).toBe(false); // JSON.parse('false') → boolean false
  });
});

describe('EX — Pristine round-trip byte-identity (inline + block)', () => {
  // Single-line forms round-trip via jsxInline raw text passthrough
  test('EX01: single-line num={3} round-trips byte-identical (jsxInline)', () => {
    const input = '<Comp num={3} />\n';
    // Single-line → jsxInline → raw text → byte-identical
    const output = normalize(mdRoundTrip(input));
    expect(output).toBe(normalize(input));
  });

  test('EX02: single-line prop={values} round-trips byte-identical', () => {
    const input = '<Comp prop={values} />\n';
    const output = normalize(mdRoundTrip(input));
    expect(output).toBe(normalize(input));
  });

  test('EX03: single-line arr={[1,2,3]} round-trips byte-identical', () => {
    const input = '<Comp arr={[1,2,3]} />\n';
    const output = normalize(mdRoundTrip(input));
    expect(output).toBe(normalize(input));
  });

  test('EX05: single-line {...rest} round-trips byte-identical', () => {
    const input = '<Comp {...rest} />\n';
    const output = normalize(mdRoundTrip(input));
    expect(output).toBe(normalize(input));
  });

  test('EX06: single-line bool shorthand round-trips byte-identical', () => {
    const input = '<Comp bool />\n';
    const output = normalize(mdRoundTrip(input));
    expect(output).toBe(normalize(input));
  });

  // Multi-line (block) forms round-trip via sourceRaw pristine path
  test('Block Callout with attrs round-trips byte-identical (pristine sourceRaw)', () => {
    const input = '<Callout type="warning">\n\nHello\n\n</Callout>\n';
    const output = normalize(mdRoundTrip(input));
    expect(output).toBe(normalize(input));
  });

  test('Block with expression attr round-trips byte-identical', () => {
    const input = '<Comp data={values}>\n\nContent\n\n</Comp>\n';
    const output = normalize(mdRoundTrip(input));
    expect(output).toBe(normalize(input));
  });

  test('Block with spread attr round-trips byte-identical', () => {
    const input = '<Comp {...rest}>\n\nContent\n\n</Comp>\n';
    const output = normalize(mdRoundTrip(input));
    expect(output).toBe(normalize(input));
  });
});

describe('EX — Parse handler structured attrs (FR-1)', () => {
  test('mdxJsxFlowElement → jsxComponent with componentName + kind + sourceDirty', () => {
    const attrs = parseJsxAttrs('<Callout type="warning">\n\nHello\n\n</Callout>\n');
    expect(attrs.componentName).toBe('Callout');
    expect(attrs.kind).toBe('element');
    expect(attrs.sourceDirty).toBe(false);
    expect(attrs.sourceRaw).toBeTruthy();
  });

  test('Callout type attr is destructured into props (registered descriptor)', () => {
    const props = parseJsxProps('<Callout type="warning">\n\nHello\n\n</Callout>\n');
    // 'type' is a PropDefEnum in the Callout descriptor
    expect(props.type).toBe('warning');
  });

  test('unregistered component uses wildcard — all attrs in props', () => {
    const props = parseJsxProps('<CustomThing foo="bar">\n\ntext\n\n</CustomThing>\n');
    // Wildcard descriptor has props:[] — destructureAttrs still processes named attrs
    expect(props.foo).toBe('bar');
  });

  test('unregistered component has correct componentName', () => {
    const attrs = parseJsxAttrs('<CustomThing foo="bar">\n\ntext\n\n</CustomThing>\n');
    expect(attrs.componentName).toBe('CustomThing');
    expect(attrs.kind).toBe('element');
  });

  test('children are recursively walked into jsxComponent content', () => {
    const json = mdManager.parse('<Callout type="info">\n\nHello **world**\n\n</Callout>\n');
    const component = findNode(json, 'jsxComponent');
    expect(component).toBeDefined();
    // jsxComponent has content: 'block*', so children should be block nodes
    expect(component?.content).toBeDefined();
    expect(component?.content?.length).toBeGreaterThan(0);
    const firstChild = component?.content?.[0];
    expect(firstChild?.type).toBe('paragraph');
  });

  test('expression flow → kind=expression, content populated', () => {
    const json = mdManager.parse('{/* comment */}\n');
    const component = findNode(json, 'jsxComponent');
    expect(component).toBeDefined();
    expect(component?.attrs?.kind).toBe('expression');
    expect(component?.attrs?.content).toContain('comment');
  });

  test('mdxJsxTextElement → jsxInline with raw source text child', () => {
    const json = mdManager.parse('Hello <Icon name="check" /> world\n');
    const inlineNode = findNode(json, 'jsxInline');
    expect(inlineNode).toBeDefined();
    expect(inlineNode?.content?.[0]?.type).toBe('text');
    expect(inlineNode?.content?.[0]?.text).toBe('<Icon name="check" />');
  });

  test('attributes array preserved for serialize reconstruct (FR-21)', () => {
    const attrs = parseJsxAttrs('<Card color="#F05032" external>\n\ntext\n\n</Card>\n');
    const attributesArr = attrs.attributes as Array<{
      type: string;
      name?: string;
      value?: unknown;
    }>;
    expect(Array.isArray(attributesArr)).toBe(true);
    const colorAttr = attributesArr.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'color');
    expect(colorAttr).toBeDefined();
    expect(colorAttr?.value).toBe('#F05032');
    const externalAttr = attributesArr.find(
      (a) => a.type === 'mdxJsxAttribute' && a.name === 'external',
    );
    expect(externalAttr).toBeDefined();
    expect(externalAttr?.value).toBeNull();
  });

  test('self-closing on its own line → jsxComponent (micromark flow heuristic)', () => {
    // Self-closing JSX on its own line is flow in agnostic mode
    const json = mdManager.parse('<Callout />\n');
    const component = findNode(json, 'jsxComponent');
    expect(component).toBeDefined();
    expect(component?.attrs?.componentName).toBe('Callout');
    expect(component?.attrs?.sourceDirty).toBe(false);
  });

  test('self-closing inline (mid-prose) → jsxInline', () => {
    // Self-closing JSX inside prose is inline → jsxInline thin shape
    const json = mdManager.parse('Hello <Icon name="check" /> world\n');
    const inlineNode = findNode(json, 'jsxInline');
    expect(inlineNode).toBeDefined();
    expect(inlineNode?.content?.[0]?.text).toBe('<Icon name="check" />');
  });
});
