import { describe, expect, test } from 'bun:test';
import { loadBuiltInFixtures } from '../../../core/src/markdown/fixtures/index.ts';
import { mdManager, mdRoundTrip, normalize } from './helpers';

function assertByteIdentity(input: string): void {
  const output = normalize(mdRoundTrip(input));
  const expected = normalize(input);
  expect(output).toBe(expected);
}

const fixtures = loadBuiltInFixtures();
const blockFixtures = fixtures.filter((f) => !f.componentName.includes('-inline-'));
const inlineFixtures = fixtures.filter((f) => f.componentName.includes('-inline-'));

describe('I12 — Pristine jsxComponent byte-identity (block form)', () => {
  for (const fixture of blockFixtures) {
    const label = fixture.notes
      ? `${fixture.componentName} — ${fixture.notes}`
      : fixture.componentName;
    test(label, () => {
      assertByteIdentity(fixture.blockForm);
    });
  }
});

describe('γ dirty-path serialization edge cases', () => {
  function dirtyRoundTrip(md: string): string {
    const json = mdManager.parse(md);
    function markDirty(node: import('@tiptap/core').JSONContent): void {
      if (node.type === 'jsxComponent' && node.attrs) {
        node.attrs.sourceDirty = true;
      }
      if (node.content) {
        for (const child of node.content) markDirty(child);
      }
    }
    markDirty(json);
    return mdManager.serialize(json);
  }

  test('String attr with double quotes escapes to expression form', () => {
    const input = '<Comp title="say hello">\n\nContent\n\n</Comp>\n';
    const output = dirtyRoundTrip(input);
    expect(output).not.toContain('title="say "');
  });

  test('String attr with double quotes round-trips through dirty path', () => {
    const json = mdManager.parse('<Comp title="test">\n\nContent\n\n</Comp>\n');
    function setDirtyWithQuotedTitle(node: import('@tiptap/core').JSONContent): void {
      if (node.type === 'jsxComponent' && node.attrs) {
        node.attrs.sourceDirty = true;
        const props = (node.attrs.props ?? {}) as Record<string, unknown>;
        props.title = 'say "hello"';
        node.attrs.props = props;
      }
      if (node.content) {
        for (const child of node.content) setDirtyWithQuotedTitle(child);
      }
    }
    setDirtyWithQuotedTitle(json);
    const output = mdManager.serialize(json);
    expect(output).toContain('title={"say \\"hello\\""}');
    const reParsed = mdManager.parse(output);
    function findNode(
      n: import('@tiptap/core').JSONContent,
      type: string,
    ): import('@tiptap/core').JSONContent | undefined {
      if (n.type === type) return n;
      if (n.content)
        for (const c of n.content) {
          const f = findNode(c, type);
          if (f) return f;
        }
      return undefined;
    }
    expect(findNode(reParsed, 'rawMdxFallback')).toBeUndefined();
  });

  test('Boolean false serializes as expression {false}', () => {
    const json = mdManager.parse('<Comp disabled>\n\nContent\n\n</Comp>\n');
    function setDirtyWithFalse(node: import('@tiptap/core').JSONContent): void {
      if (node.type === 'jsxComponent' && node.attrs) {
        node.attrs.sourceDirty = true;
        const props = (node.attrs.props ?? {}) as Record<string, unknown>;
        props.disabled = false;
        node.attrs.props = props;
      }
      if (node.content) for (const child of node.content) setDirtyWithFalse(child);
    }
    setDirtyWithFalse(json);
    const output = mdManager.serialize(json);
    expect(output).toContain('disabled={false}');
    expect(output).not.toMatch(/disabled(?!\s*=)/);
  });
});

describe('I12 — Pristine jsxInline byte-identity (inline thin shape)', () => {
  for (const fixture of inlineFixtures) {
    const label = fixture.notes
      ? `${fixture.componentName} — ${fixture.notes}`
      : fixture.componentName;
    test(label, () => {
      assertByteIdentity(fixture.blockForm);
    });
  }
});
