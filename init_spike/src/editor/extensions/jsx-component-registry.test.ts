import { describe, expect, test } from 'bun:test';
import {
  getBuiltInComponent,
  getSlashComponentItems,
  parseJsxComponent,
  serializeJsxComponent,
} from './jsx-component-registry';
import { getSlashCommandMatch } from './slash-command';

describe('jsx-component registry', () => {
  test('registers the U1.2 built-in components', () => {
    expect(getBuiltInComponent('Callout')).toBeDefined();
    expect(getBuiltInComponent('Tabs')).toBeDefined();
    expect(getBuiltInComponent('CodeGroup')).toBeDefined();
    expect(getBuiltInComponent('Steps')).toBeDefined();
    expect(getBuiltInComponent('Accordion')).toBeDefined();
    expect(getBuiltInComponent('Card')).toBeDefined();
    expect(getBuiltInComponent('Embed')).toBeDefined();
  });

  test('parses and serializes a supported Callout component', () => {
    const parsed = parseJsxComponent(
      '<Callout type="warning">Heads up: review this section before publishing.</Callout>',
    );

    expect(parsed.kind).toBe('known');
    if (parsed.kind !== 'known') {
      throw new Error('Expected a known component');
    }

    expect(parsed.name).toBe('Callout');
    expect(parsed.props.type).toBe('warning');
    expect(serializeJsxComponent(parsed)).toBe(
      '<Callout type="warning">Heads up: review this section before publishing.</Callout>',
    );
  });

  test('preserves self-closing components during serialization', () => {
    const parsed = parseJsxComponent('<Embed src="https://example.com" title="Reference" />');

    expect(parsed.kind).toBe('known');
    if (parsed.kind !== 'known') {
      throw new Error('Expected a known component');
    }

    expect(parsed.meta.selfClosing).toBe(true);
    expect(serializeJsxComponent(parsed)).toBe(
      '<Embed src="https://example.com" title="Reference" />',
    );
  });

  test('falls back safely for unsupported components', () => {
    const parsed = parseJsxComponent('<Button variant="primary">Ship it</Button>');

    expect(parsed.kind).toBe('unknown');
    if (parsed.kind !== 'unknown') {
      throw new Error('Expected an unknown component');
    }

    expect(parsed.reason).toBe('unsupported');
    expect(parsed.raw).toBe('<Button variant="primary">Ship it</Button>');
  });
});

describe('slash command helpers', () => {
  test('returns matching component items for a query', () => {
    const items = getSlashComponentItems('car');
    expect(items.map((item) => item.name)).toContain('Card');
  });

  test('extracts slash query range from text before the cursor', () => {
    expect(getSlashCommandMatch('Prefix /call', 12)).toEqual({
      query: 'call',
      from: 7,
      to: 12,
    });
  });

  test('returns null when there is no active slash query', () => {
    expect(getSlashCommandMatch('Prefix only', 11)).toBeNull();
  });
});
