/**
 * Pure-helper unit tests for JsxComponentView.
 *
 * The useEffect-based InteractionLayer register/deregister flow is
 * exercised in Playwright e2e (none exists for JsxComponent today — no
 * regressions to catch at CI) and indirectly via interaction-layer-host
 * tests. Here we cover the pure parts: id counter, JSX fragment parser,
 * and the PropPanel's component-name extractor.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { extractJsxComponentName } from './JsxComponentPropPanel';
import {
  __resetJsxNodeIdCounterForTests,
  nextJsxNodeId,
  parseJsxContent,
} from './JsxComponentView';

describe('nextJsxNodeId', () => {
  beforeEach(() => {
    __resetJsxNodeIdCounterForTests();
  });

  it('returns "jsx-1" on first call after reset', () => {
    expect(nextJsxNodeId()).toBe('jsx-1');
  });

  it('is strictly monotonic across calls', () => {
    const ids = [nextJsxNodeId(), nextJsxNodeId(), nextJsxNodeId(), nextJsxNodeId()];
    expect(ids).toEqual(['jsx-1', 'jsx-2', 'jsx-3', 'jsx-4']);
  });

  it('produces distinct ids across two consecutive NodeView instances', () => {
    const a = nextJsxNodeId();
    const b = nextJsxNodeId();
    expect(a).not.toBe(b);
  });
});

describe('parseJsxContent', () => {
  it('extracts component name, type, and children from a Callout fragment', () => {
    const parsed = parseJsxContent('<Callout type="info">Body text here</Callout>');
    expect(parsed).toEqual({ component: 'Callout', type: 'info', children: 'Body text here' });
  });

  it('trims whitespace in children', () => {
    const parsed = parseJsxContent('<Callout type="warning">\n  body  \n</Callout>');
    expect(parsed.children).toBe('body');
  });

  it('falls back to Unknown when pattern does not match', () => {
    const parsed = parseJsxContent('<SomethingElse>x</SomethingElse>');
    expect(parsed.component).toBe('Unknown');
    expect(parsed.type).toBe('info');
  });

  it('preserves the raw string as children in the fallback case', () => {
    const raw = '<Tabs><Tab title="a">1</Tab></Tabs>';
    const parsed = parseJsxContent(raw);
    expect(parsed.children).toBe(raw);
  });
});

describe('extractJsxComponentName', () => {
  it('returns the tag name from a Callout open-tag', () => {
    expect(extractJsxComponentName('<Callout type="info">body</Callout>')).toBe('Callout');
  });

  it('returns the tag name from a multi-word Component', () => {
    expect(extractJsxComponentName('<ExternalLinkChip href="x">y</ExternalLinkChip>')).toBe(
      'ExternalLinkChip',
    );
  });

  it('returns the tag name from a self-closing fragment', () => {
    expect(extractJsxComponentName('<Mermaid source="x" />')).toBe('Mermaid');
  });

  it('returns Unknown when there is no opening tag', () => {
    expect(extractJsxComponentName('plain text')).toBe('Unknown');
  });

  it('returns Unknown on empty input', () => {
    expect(extractJsxComponentName('')).toBe('Unknown');
  });
});
