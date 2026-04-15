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
import { mdRoundTrip, normalize } from './helpers';

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
