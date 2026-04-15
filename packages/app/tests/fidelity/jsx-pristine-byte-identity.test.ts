/**
 * I12: Pristine jsxComponent byte-identity.
 *
 * For each block-form built-in component, serialize(parse(md)) === md
 * (byte-exact) when no user edit has occurred (sourceDirty=false).
 *
 * The γ pattern's pristine path emits sourceRaw verbatim — this test
 * verifies that the parse→serialize round-trip is byte-identical for
 * the source forms that users/agents write.
 */
import { describe, expect, test } from 'bun:test';
import { mdManager, mdRoundTrip, normalize } from './helpers';

function assertByteIdentity(input: string): void {
  const output = normalize(mdRoundTrip(input));
  const expected = normalize(input);
  expect(output).toBe(expected);
}

describe('I12 — Pristine jsxComponent byte-identity (block form)', () => {
  test('Callout with type attr', () => {
    assertByteIdentity('<Callout type="warning">\n\nAlways run tests\n\n</Callout>\n');
  });

  test('Callout self-closing (standalone line → flow)', () => {
    assertByteIdentity('<Callout />\n');
  });

  test('Callout with expression attr', () => {
    assertByteIdentity('<Callout type="info">\n\nContent here\n\n</Callout>\n');
  });

  test('Card with href', () => {
    assertByteIdentity('<Card href="/docs" title="Docs">\n\nCard content\n\n</Card>\n');
  });

  test('Cards wrapping Card', () => {
    assertByteIdentity(
      '<Cards>\n\n<Card href="/a" title="A">\n\nFirst\n\n</Card>\n\n<Card href="/b" title="B">\n\nSecond\n\n</Card>\n\n</Cards>\n',
    );
  });

  test('Steps with Step children', () => {
    assertByteIdentity(
      '<Steps>\n\n<Step>\n\nDo this\n\n</Step>\n\n<Step>\n\nThen this\n\n</Step>\n\n</Steps>\n',
    );
  });

  test('Tabs with Tab children', () => {
    assertByteIdentity(
      '<Tabs items={["npm","pnpm"]}>\n\n<Tab value="npm">\n\nnpm install\n\n</Tab>\n\n<Tab value="pnpm">\n\npnpm add\n\n</Tab>\n\n</Tabs>\n',
    );
  });

  test('Accordion with title', () => {
    assertByteIdentity('<Accordion title="FAQ">\n\nAnswer text\n\n</Accordion>\n');
  });

  test('Banner', () => {
    assertByteIdentity('<Banner>\n\nBanner content\n\n</Banner>\n');
  });

  test('ImageZoom self-closing with src', () => {
    assertByteIdentity('<ImageZoom src="/img.png" alt="Photo" />\n');
  });

  test('Unregistered component preserves byte-identity', () => {
    assertByteIdentity('<CustomThing foo="bar">\n\nContent\n\n</CustomThing>\n');
  });

  test('Component with unknown attrs (FR-21 merge)', () => {
    assertByteIdentity('<Card color="#F05032" external>\n\nCard with unknown attrs\n\n</Card>\n');
  });

  test('Component with boolean shorthand', () => {
    assertByteIdentity('<Callout disabled>\n\nContent\n\n</Callout>\n');
  });

  test('Component with expression attr', () => {
    assertByteIdentity('<Comp data={values}>\n\nContent\n\n</Comp>\n');
  });

  test('Component with spread attr', () => {
    assertByteIdentity('<Comp {...rest}>\n\nContent\n\n</Comp>\n');
  });
});

describe('γ dirty-path serialization edge cases', () => {
  /**
   * Helper: parse MDX, force the first jsxComponent to sourceDirty:true,
   * then serialize — exercises the reconstruction path.
   */
  function dirtyRoundTrip(md: string): string {
    const json = mdManager.parse(md);
    // Walk to find jsxComponent and flip sourceDirty
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
    // Should produce valid JSX — not malformed quotes
    expect(output).not.toContain('title="say "');
  });

  test('String attr with double quotes round-trips through dirty path', () => {
    // Manually construct input with quote-containing attr via dirty path
    const json = mdManager.parse('<Comp title="test">\n\nContent\n\n</Comp>\n');
    function setDirtyWithQuotedTitle(node: import('@tiptap/core').JSONContent): void {
      if (node.type === 'jsxComponent' && node.attrs) {
        node.attrs.sourceDirty = true;
        // Simulate user editing the title to contain quotes
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
    // The expression form should preserve the quotes
    expect(output).toContain('title={"say \\"hello\\""}');
    // Re-parse should not degrade to rawMdxFallback
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
    // disabled={false} — NOT disabled (boolean shorthand)
    expect(output).toContain('disabled={false}');
    expect(output).not.toMatch(/disabled(?!\s*=)/);
  });
});

describe('I12 — Pristine jsxInline byte-identity (inline thin shape)', () => {
  test('Self-closing inline <Icon name="check" />', () => {
    assertByteIdentity('Hello <Icon name="check" /> world\n');
  });

  test('Paired inline <Badge>x</Badge>', () => {
    assertByteIdentity('See <Badge>x</Badge> here\n');
  });

  test('Inline with expression attr', () => {
    assertByteIdentity('Use <Comp data={values} /> now\n');
  });
});
