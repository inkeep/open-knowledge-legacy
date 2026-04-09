import { describe, expect, test } from 'bun:test';
import { parseJsx } from './jsx-parser.ts';

describe('parseJsx', () => {
  test('simple string attribute', () => {
    const result = parseJsx('<Callout type="warning">children</Callout>');
    expect(result).not.toBeNull();
    expect(result?.componentName).toBe('Callout');
    expect(result?.props).toEqual({ type: 'warning' });
    expect(result?.childrenString).toBe('children');
  });

  test('boolean shorthand', () => {
    const result = parseJsx('<Callout fullWidth>content</Callout>');
    expect(result?.props).toEqual({ fullWidth: true });
  });

  test('self-closing tag', () => {
    const result = parseJsx('<Video src="demo.mp4" />');
    expect(result?.componentName).toBe('Video');
    expect(result?.props).toEqual({ src: 'demo.mp4' });
    expect(result?.childrenString).toBe('');
  });

  test('expression prop with number', () => {
    const result = parseJsx('<Chart width={800} />');
    expect(result?.props).toEqual({ width: 800 });
  });

  test('expression prop with negative number', () => {
    const result = parseJsx('<Offset x={-10} />');
    expect(result?.props).toEqual({ x: -10 });
  });

  test('expression prop with boolean true', () => {
    const result = parseJsx('<Toggle active={true} />');
    expect(result?.props).toEqual({ active: true });
  });

  test('expression prop with boolean false', () => {
    const result = parseJsx('<Toggle active={false} />');
    expect(result?.props).toEqual({ active: false });
  });

  test('expression prop with string', () => {
    const result = parseJsx('<Tag label={"hello"} />');
    expect(result?.props).toEqual({ label: 'hello' });
  });

  test('multiple props', () => {
    const result = parseJsx('<Card title="Hello" href="/path" external>body</Card>');
    expect(result?.componentName).toBe('Card');
    expect(result?.props).toEqual({ title: 'Hello', href: '/path', external: true });
  });

  test('nested same-name tags preserves children string', () => {
    const source = '<Callout>\n<Callout>inner</Callout>\n</Callout>';
    const result = parseJsx(source);
    expect(result?.componentName).toBe('Callout');
    expect(result?.childrenString).toBe('\n<Callout>inner</Callout>\n');
  });

  test('nested different-name tags preserves children', () => {
    const source = '<Steps>\n<Step>First</Step>\n<Step>Second</Step>\n</Steps>';
    const result = parseJsx(source);
    expect(result?.componentName).toBe('Steps');
    expect(result?.childrenString).toContain('<Step>First</Step>');
    expect(result?.childrenString).toContain('<Step>Second</Step>');
  });

  test('non-primitive expression prop returns null', () => {
    const result = parseJsx('<Chart filter={data => data.value > 5} />');
    expect(result).toBeNull();
  });

  test('variable expression prop returns null', () => {
    const result = parseJsx('<Chart data={metrics} />');
    expect(result).toBeNull();
  });

  test('nested JSX in prop returns null', () => {
    const result = parseJsx('<Card icon={<IconStar />} />');
    expect(result).toBeNull();
  });

  test('empty component', () => {
    const result = parseJsx('<Divider />');
    expect(result?.componentName).toBe('Divider');
    expect(result?.props).toEqual({});
    expect(result?.childrenString).toBe('');
  });

  test('multiline children with markdown', () => {
    const source =
      '<Callout type="info">\n  **bold** text with [link](https://example.com).\n</Callout>';
    const result = parseJsx(source);
    expect(result?.componentName).toBe('Callout');
    expect(result?.childrenString).toContain('**bold**');
    expect(result?.childrenString).toContain('[link]');
  });

  test('single-line paired tag', () => {
    const result = parseJsx('<Callout type="info">Short note.</Callout>');
    expect(result?.componentName).toBe('Callout');
    expect(result?.childrenString).toBe('Short note.');
  });

  test('blank lines in children', () => {
    const source = '<Callout>\n\nFirst paragraph.\n\nSecond paragraph.\n\n</Callout>';
    const result = parseJsx(source);
    expect(result?.childrenString).toContain('First paragraph.');
    expect(result?.childrenString).toContain('Second paragraph.');
  });

  test('invalid input returns null', () => {
    expect(parseJsx('not jsx at all')).toBeNull();
    expect(parseJsx('')).toBeNull();
    // Note: lowercase tags parse fine in acorn-jsx — the tokenizer (jsxTokenizerB)
    // filters uppercase-only before reaching parseJsx, so this is not a parser concern.
  });

  test('whitespace tolerance in attributes', () => {
    const result = parseJsx('<Callout   type = "warning"   >content</Callout>');
    expect(result?.props).toEqual({ type: 'warning' });
  });
});
