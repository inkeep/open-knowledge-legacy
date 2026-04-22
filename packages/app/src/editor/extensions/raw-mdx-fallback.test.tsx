/**
 * Pure-helper unit tests for the US-006 RawMdxFallback NodeView rewrite.
 *
 * The integration tests at
 * `packages/app/tests/integration/rawmdxfallback-multi-client.test.ts`
 * cover the multi-client Y.Item identity invariants (AC#6); this file covers
 * the pure layout + id counter helpers that don't require a full editor.
 *
 * The propPanel flow is exercised in Playwright e2e post-US-008 (the
 * extension registers with InteractionLayer on mount). For V2 scope we rely
 * on the helper + integration coverage.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import {
  __resetRawMdxNodeIdCounterForTests,
  buildRawMdxFallbackChipDom,
  nextRawMdxNodeId,
} from './raw-mdx-fallback';

// Fake DOM shape satisfying the narrow createElement + HTMLElement subset
// the chip builder uses. Repo convention: pure-function tests with fake DOM
// shapes rather than pulling in happy-dom.
interface FakeElement {
  tagName: string;
  attributes: Map<string, string>;
  classList: Set<string>;
  children: FakeElement[];
  textContent: string;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  appendChild(child: FakeElement): FakeElement;
}

function createFakeDoc(): Pick<Document, 'createElement'> {
  function make(tag: string): FakeElement {
    const attrs = new Map<string, string>();
    const classes = new Set<string>();
    const children: FakeElement[] = [];
    const el: FakeElement = {
      tagName: tag.toUpperCase(),
      attributes: attrs,
      classList: {
        add: (...cls: string[]) => {
          for (const c of cls) classes.add(c);
        },
        contains: (c: string) => classes.has(c),
        [Symbol.iterator]: () => classes.values(),
      } as unknown as Set<string>,
      children,
      textContent: '',
      setAttribute(name: string, value: string) {
        attrs.set(name, value);
      },
      getAttribute(name: string) {
        return attrs.get(name) ?? null;
      },
      appendChild(child: FakeElement) {
        children.push(child);
        return child;
      },
    };
    return el;
  }
  return {
    createElement: ((tag: string) => make(tag)) as Document['createElement'],
  };
}

describe('nextRawMdxNodeId', () => {
  beforeEach(() => {
    __resetRawMdxNodeIdCounterForTests();
  });

  it('returns "raw-mdx-1" on first call after reset', () => {
    expect(nextRawMdxNodeId()).toBe('raw-mdx-1');
  });

  it('is strictly monotonic across calls', () => {
    const ids = [nextRawMdxNodeId(), nextRawMdxNodeId(), nextRawMdxNodeId()];
    expect(ids).toEqual(['raw-mdx-1', 'raw-mdx-2', 'raw-mdx-3']);
  });

  it('produces distinct ids across two consecutive NodeView instances', () => {
    const a = nextRawMdxNodeId();
    const b = nextRawMdxNodeId();
    expect(a).not.toBe(b);
  });
});

describe('buildRawMdxFallbackChipDom', () => {
  it('emits a div with load-bearing attributes for e2e selectors', () => {
    const doc = createFakeDoc();
    const result = buildRawMdxFallbackChipDom({
      nodeId: 'raw-mdx-1',
      reason: 'Tag mismatch',
      doc,
    });
    const wrapper = result.dom as unknown as FakeElement;
    // The mid-type-recovery.e2e.ts assertion relies on this exact attr.
    expect(wrapper.getAttribute('data-raw-mdx-fallback')).toBe('');
    expect(wrapper.getAttribute('data-node-id')).toBe('raw-mdx-1');
    expect(wrapper.getAttribute('contenteditable')).toBe('false');
    expect(wrapper.getAttribute('data-reason')).toBe('Tag mismatch');
    expect(wrapper.getAttribute('role')).toBe('button');
    expect(wrapper.getAttribute('tabindex')).toBe('0');
  });

  it('omits data-reason when the reason is undefined but keeps aria-label', () => {
    const doc = createFakeDoc();
    const result = buildRawMdxFallbackChipDom({
      nodeId: 'raw-mdx-2',
      reason: undefined,
      doc,
    });
    const wrapper = result.dom as unknown as FakeElement;
    expect(wrapper.getAttribute('data-reason')).toBeNull();
    // aria-label still rendered from the default fallback so screen readers
    // can announce something meaningful.
    expect(wrapper.getAttribute('aria-label')).toContain('Parse failed');
  });

  it('includes a badge child + a <pre> contentDOM marked contenteditable=false', () => {
    const doc = createFakeDoc();
    const result = buildRawMdxFallbackChipDom({
      nodeId: 'raw-mdx-3',
      reason: 'Tag mismatch',
      doc,
    });
    const wrapper = result.dom as unknown as FakeElement;
    expect(wrapper.children.length).toBe(2);
    const badge = wrapper.children[0];
    const content = wrapper.children[1];
    expect(badge.tagName).toBe('SPAN');
    expect(badge.textContent).toBe('raw');
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(content.tagName).toBe('PRE');
    expect(content.getAttribute('contenteditable')).toBe('false');
    // The content DOM returned must be the same ref PM will mutate.
    expect(result.contentDOM).toBe(content as unknown as HTMLElement);
  });
});
