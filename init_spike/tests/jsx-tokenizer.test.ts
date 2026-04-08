import { describe, expect, test } from 'bun:test';
import {
  type JsxToken,
  jsxStart,
  jsxTokenizerA,
  jsxTokenizerB,
} from '../src/editor/extensions/jsx-tokenizer';

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

function expectToken(
  token: JsxToken | undefined,
  tagName: string,
  contentSubstring?: string,
): void {
  expect(token).toBeDefined();
  expect(token?.type).toBe('jsxBlock');
  expect(token?.tagName).toBe(tagName);
  if (contentSubstring) {
    expect(token?.content).toContain(contentSubstring);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// start()
// ─────────────────────────────────────────────────────────────────────────────

describe('jsxStart', () => {
  test('finds <Uppercase at start', () => {
    expect(jsxStart('<Callout type="warning">content</Callout>')).toBe(0);
  });

  test('finds <Uppercase with leading whitespace', () => {
    expect(jsxStart('  <Callout>content</Callout>')).toBe(0);
  });

  test('finds <Uppercase after newline', () => {
    expect(jsxStart('some text\n<Callout>content</Callout>')).toBe(10);
  });

  test('returns -1 for lowercase tags', () => {
    expect(jsxStart('<div>content</div>')).toBe(-1);
  });

  test('returns -1 for no tags', () => {
    expect(jsxStart('just plain text')).toBe(-1);
  });

  test('ignores uppercase inside code fences', () => {
    // start() doesn't check code fences — that is handled by marked's tokenizer
    // ordering. Here we just verify it detects the pattern.
    expect(jsxStart('```\n<Callout>\n```')).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Version A tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Version A (simple regex)', () => {
  describe('self-closing tags', () => {
    test('basic self-closing', () => {
      expectToken(jsxTokenizerA('<Image src="photo.jpg" />\n'), 'Image');
    });

    test('self-closing with no attributes', () => {
      expectToken(jsxTokenizerA('<Spacer />\n'), 'Spacer');
    });

    test('self-closing with boolean attribute', () => {
      expectToken(jsxTokenizerA('<Snippet file="test.mdx" />\n'), 'Snippet');
    });

    test('self-closing at end of string (no trailing newline)', () => {
      // Should still match — end of string is also a valid boundary
      expectToken(jsxTokenizerA('<Image src="photo.jpg" />'), 'Image');
    });
  });

  describe('paired tags', () => {
    test('simple paired tag', () => {
      expectToken(jsxTokenizerA('<Callout>Some content</Callout>\n'), 'Callout');
    });

    test('paired tag with attributes', () => {
      expectToken(
        jsxTokenizerA('<Callout type="warning">Always check inputs.</Callout>\n'),
        'Callout',
      );
    });

    test('paired tag with multiline children', () => {
      const src = `<Callout type="warning">
  Line one.
  Line two.
</Callout>
`;
      expectToken(jsxTokenizerA(src), 'Callout', 'Line one');
    });

    test('paired tag with blank lines in children (important for marked)', () => {
      const src = `<Callout>

Paragraph one.

Paragraph two.

</Callout>
`;
      expectToken(jsxTokenizerA(src), 'Callout', 'Paragraph one');
    });

    test('nested different-name tags (Steps > Step)', () => {
      const src = `<Steps>
  <Step>First step</Step>
  <Step>Second step</Step>
</Steps>
`;
      expectToken(jsxTokenizerA(src), 'Steps', '<Step>First step</Step>');
    });

    test('nested different-name tags (Tabs > Tab)', () => {
      const src = `<Tabs>
  <Tab title="TypeScript">TS code</Tab>
  <Tab title="Python">Py code</Tab>
</Tabs>
`;
      expectToken(jsxTokenizerA(src), 'Tabs', '<Tab title="TypeScript">');
    });

    test('boolean attributes', () => {
      expectToken(jsxTokenizerA('<Component fullWidth>Content</Component>\n'), 'Component');
    });
  });

  describe('FAILURE MODE 1: nested same-name tags (the ONLY real failure)', () => {
    test('FAILS: matches inner close tag, outer close is left dangling', () => {
      const src = `<Callout>
  <Callout>inner callout</Callout>
</Callout>
`;
      const token = jsxTokenizerA(src);
      expect(token).toBeDefined();
      // Version A produces: <Callout>\n  <Callout>inner callout</Callout>\n
      // The outer </Callout> is NOT included — left for the next tokenizer pass
      expect(token?.content).toBe('<Callout>\n  <Callout>inner callout</Callout>');
      // This would leave "</Callout>" as a dangling html token
    });

    test('FAILS: triple nesting only captures innermost pair', () => {
      const src = `<Callout>
  <Callout>
    <Callout>deepest</Callout>
  </Callout>
</Callout>
`;
      const token = jsxTokenizerA(src);
      expect(token).toBeDefined();
      // Captures from outer open to first close — wrong boundary
      const closes = token?.content.match(/<\/Callout>/g);
      expect(closes?.length).toBe(1); // Only one close, not three
    });
  });

  describe('FAILURE MODE 2: expression attributes with >', () => {
    test('SURPRISING: regex backtracks and still produces correct full match', () => {
      // The [^>]* stops at the first >, but [\s\S]*? absorbs the rest and
      // backtracks to find </Chart>. The FULL MATCH (raw, content) is correct
      // even though the opening-tag/body boundary is wrong internally.
      // This only matters if we need to separately extract attributes vs body.
      const src = `<Chart filter={items.filter(x => x > 5)} data={metrics}>
  Content
</Chart>
`;
      const token = jsxTokenizerA(src);
      expect(token).toBeDefined();
      expect(token?.tagName).toBe('Chart');
      expect(token?.content).toContain('Content');
      expect(token?.content).toContain('</Chart>');
    });

    test('SURPRISING: even closing tag text in expression attr works via backtracking', () => {
      // You might expect this to fail because </Wrap> appears in the expression.
      // But [\s\S]*? matches minimally to the first </Wrap>, then the trailing
      // \s*(?:\n|$) check fails (next char is ", not newline), so the regex
      // backtracks and finds the REAL </Wrap> at the end.
      const src = `<Wrap cb={s => s.replace("</Wrap>", "")}>
  Content
</Wrap>
`;
      const token = jsxTokenizerA(src);
      expect(token).toBeDefined();
      expect(token?.tagName).toBe('Wrap');
      expect(token?.content).toContain('Content');
    });
  });

  describe('FAILURE MODE 3: JSX in expression attributes', () => {
    test('SURPRISING: regex backtracks past /> in expression and finds paired match', () => {
      const src = `<Component render={() => <Inner />}>
  Content
</Component>
`;
      const token = jsxTokenizerA(src);
      // Self-closing regex cannot match past > in => so it fails.
      // Paired regex: [^>]* stops at > in =>, then [\s\S]*? absorbs the rest
      // and finds </Component>. Full match is correct.
      expect(token).toBeDefined();
      expect(token?.tagName).toBe('Component');
      expect(token?.content).toContain('Content');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Version B tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Version B (tag-counting + brace-depth)', () => {
  describe('self-closing tags', () => {
    test('basic self-closing', () => {
      expectToken(jsxTokenizerB('<Image src="photo.jpg" />\n'), 'Image');
    });

    test('self-closing no space before />', () => {
      expectToken(jsxTokenizerB('<Image src="photo.jpg"/>\n'), 'Image');
    });

    test('self-closing with boolean attribute', () => {
      expectToken(jsxTokenizerB('<Component fullWidth />\n'), 'Component');
    });

    test('self-closing with expression attribute', () => {
      expectToken(jsxTokenizerB('<APIPage document={"index"} />\n'), 'APIPage');
    });
  });

  describe('paired tags with simple attributes', () => {
    test('simple content', () => {
      expectToken(jsxTokenizerB('<Callout>Some content</Callout>\n'), 'Callout');
    });

    test('string attributes', () => {
      expectToken(jsxTokenizerB('<Callout type="warning">Content</Callout>\n'), 'Callout');
    });

    test('multiline children', () => {
      const src = `<Callout type="warning">
  Line one.
  Line two.
</Callout>
`;
      expectToken(jsxTokenizerB(src), 'Callout');
    });

    test('blank lines in children', () => {
      const src = `<Callout>

Paragraph one.

Paragraph two.

</Callout>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Callout');
      expect(token?.content).toContain('Paragraph one');
      expect(token?.content).toContain('Paragraph two');
      expect(token?.content).toContain('</Callout>');
    });
  });

  describe('nested different-name tags', () => {
    test('Steps > Step', () => {
      const src = `<Steps>
  <Step>First step</Step>
  <Step>Second step</Step>
</Steps>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Steps');
      expect(token?.content).toContain('<Step>First step</Step>');
      expect(token?.content).toContain('</Steps>');
    });

    test('Tabs > Tab', () => {
      const src = `<Tabs>
  <Tab title="TypeScript">TS code</Tab>
  <Tab title="Python">Py code</Tab>
</Tabs>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Tabs');
      expect(token?.content).toContain('</Tabs>');
    });

    test('Cards > Card with attributes', () => {
      const src = `<Cards>
  <Card title="React UI" icon="LuMessageSquare" href="/react/chat-button">
    Build a React chat interface.
  </Card>
  <Card title="API" icon="LuNetwork" href="/chat-api">
    Use the REST API directly.
  </Card>
</Cards>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Cards');
      expect(token?.content).toContain('</Cards>');
    });

    test('deeply nested: Steps > Step > CodeGroup', () => {
      const src = `<Steps>
  <Step>
    <CodeGroup>
      Some code here
    </CodeGroup>
  </Step>
</Steps>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Steps');
      expect(token?.content).toContain('</Steps>');
    });
  });

  describe('SOLVES FAILURE MODE 1: nested same-name tags', () => {
    test('Callout inside Callout', () => {
      const src = `<Callout>
  <Callout>inner callout</Callout>
</Callout>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Callout');
      // Should capture the FULL outer Callout, including inner
      expect(token?.content).toContain('<Callout>inner callout</Callout>');
      expect(token?.content.endsWith('</Callout>')).toBe(true);
      // Verify it is the outer close tag, not the inner
      const lastCloseIdx = token?.content.lastIndexOf('</Callout>');
      const innerCloseIdx = token?.content.indexOf('</Callout>');
      expect(lastCloseIdx).toBeGreaterThan(innerCloseIdx);
    });

    test('triple nesting', () => {
      const src = `<Callout>
  <Callout>
    <Callout>deepest</Callout>
  </Callout>
</Callout>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Callout');
      expect(token?.content).toContain('deepest');
      // Count Callout closes — should be 3
      const closes = token?.content.match(/<\/Callout>/g);
      expect(closes?.length).toBe(3);
    });
  });

  describe('SOLVES FAILURE MODE 2: expression attributes with >', () => {
    test('arrow function with > in expression attribute', () => {
      const src = `<Chart filter={items.filter(x => x > 5)} data={metrics}>
  Content
</Chart>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Chart');
      expect(token?.content).toContain('Content');
      expect(token?.content).toContain('</Chart>');
    });

    test('comparison operator in expression attribute', () => {
      const src = `<Table data={items.filter(x => x.count > 10 && x.count < 100)}>
  Content
</Table>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Table');
      expect(token?.content).toContain('</Table>');
    });

    test('ternary with > in expression attribute', () => {
      const src = `<Widget config={count > 0 ? "visible" : "hidden"}>
  Content
</Widget>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Widget');
      expect(token?.content).toContain('</Widget>');
    });

    test('nested braces in expression attribute', () => {
      const src = `<Component data={{ nested: { deep: true } }}>
  Content
</Component>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Component');
      expect(token?.content).toContain('</Component>');
    });

    test('APIPage with JSON array expression (real agents-docs pattern)', () => {
      const src = `<APIPage document={"index"} webhooks={[]} operations={[{"path":"/api/agents","method":"get"},{"path":"/api/agents/{id}","method":"post"}]} showTitle={true} />
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'APIPage');
      expect(token?.content).toContain('operations=');
    });
  });

  describe('SOLVES FAILURE MODE 3: JSX in expression attributes', () => {
    test('self-closing JSX in expression attribute', () => {
      const src = `<Component render={() => <Inner />}>
  Content
</Component>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Component');
      expect(token?.content).toContain('Content');
      expect(token?.content).toContain('</Component>');
    });

    test('paired JSX in expression attribute', () => {
      const src = `<Wrapper header={() => <Title>Hello</Title>}>
  Body content
</Wrapper>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Wrapper');
      expect(token?.content).toContain('Body content');
    });
  });

  describe('string attributes with special characters', () => {
    test('> inside quoted string attribute', () => {
      const src = `<Component label="value > 5">Content</Component>\n`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Component');
      expect(token?.content).toContain('Content');
    });

    test('{ inside quoted string attribute', () => {
      const src = `<Component type="export { Foo as default } from 'pkg'">Content</Component>\n`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Component');
      expect(token?.content).toContain('Content');
    });

    test('single-quoted attribute with >', () => {
      const src = `<Component label='x => x > 5'>Content</Component>\n`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Component');
      expect(token?.content).toContain('Content');
    });
  });

  describe('sequential same-name siblings (not nested)', () => {
    test('parses first Callout from multiple sequential Callouts', () => {
      const src = `<Callout>First</Callout>
<Callout>Second</Callout>
<Callout>Third</Callout>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Callout');
      expect(token?.content).toBe('<Callout>First</Callout>');
    });

    test('multiple Tabs blocks (real agents-docs pattern)', () => {
      const src = `<Tabs>
<Tab title="TS">code</Tab>
</Tabs>
<Tabs>
<Tab title="Py">code</Tab>
</Tabs>
`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Tabs');
      // Should only capture the first Tabs block
      expect(token?.content).toContain('<Tab title="TS">');
      expect(token?.content).not.toContain('<Tab title="Py">');
    });
  });

  describe('edge cases', () => {
    test('returns undefined for lowercase tags', () => {
      expect(jsxTokenizerB('<div>content</div>\n')).toBeUndefined();
    });

    test('returns undefined for plain text', () => {
      expect(jsxTokenizerB('just some text\n')).toBeUndefined();
    });

    test('handles empty children', () => {
      expectToken(jsxTokenizerB('<Note></Note>\n'), 'Note');
    });

    test('handles leading whitespace (indented JSX)', () => {
      expectToken(jsxTokenizerB('  <Callout>Content</Callout>\n'), 'Callout');
    });

    test('handles component with numbers in name', () => {
      expectToken(jsxTokenizerB('<H2>Heading</H2>\n'), 'H2');
    });

    test('unterminated opening tag returns undefined', () => {
      expect(jsxTokenizerB('<Callout attr="value\n')).toBeUndefined();
    });

    test('unterminated body returns undefined', () => {
      expect(jsxTokenizerB('<Callout>content without close\n')).toBeUndefined();
    });

    test('self-closing with expression attribute containing >', () => {
      const src = `<Widget config={x => x > 5} />\n`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Widget');
    });

    test('close tag with whitespace before >', () => {
      const src = `<Callout>Content</Callout  >\n`;
      const token = jsxTokenizerB(src);
      expectToken(token, 'Callout');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-version comparison
// ─────────────────────────────────────────────────────────────────────────────

describe('Version comparison', () => {
  const basicCases = [
    { name: 'self-closing', src: '<Image src="photo.jpg" />\n' },
    { name: 'simple paired', src: '<Callout>Content</Callout>\n' },
    {
      name: 'nested different-name',
      src: '<Steps>\n  <Step>One</Step>\n</Steps>\n',
    },
    {
      name: 'blank lines in children',
      src: '<Callout>\n\nPara 1.\n\nPara 2.\n\n</Callout>\n',
    },
  ];

  for (const { name, src } of basicCases) {
    test(`both versions agree on: ${name}`, () => {
      const a = jsxTokenizerA(src);
      const b = jsxTokenizerB(src);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a?.tagName).toBe(b?.tagName);
      expect(a?.content).toBe(b?.content);
    });
  }

  test('Version B handles nested same-name where A fails', () => {
    const src = `<Callout>\n  <Callout>inner</Callout>\n</Callout>\n`;
    const a = jsxTokenizerA(src);
    const b = jsxTokenizerB(src);

    // A gets the wrong result (stops at first </Callout>)
    if (a) {
      expect(a.content).not.toContain('</Callout>\n</Callout>');
    }

    // B gets the right result
    expect(b).toBeDefined();
    const closes = b?.content.match(/<\/Callout>/g);
    expect(closes?.length).toBe(2);
  });

  test('Version B handles expression attrs with > correctly; A also works via backtracking', () => {
    const src = `<Chart filter={x => x > 5}>\n  Content\n</Chart>\n`;
    const a = jsxTokenizerA(src);
    const b = jsxTokenizerB(src);

    // A actually works via regex backtracking (full match is correct
    // even though internal opening-tag boundary is misplaced)
    expect(a).toBeDefined();
    expect(a?.content).toContain('</Chart>');

    // B also works with correct internal boundaries
    expect(b).toBeDefined();
    expect(b?.content).toContain('</Chart>');

    // Both produce the same overall content
    expect(a?.content).toBe(b?.content);
  });

  test('Both versions handle closing tag text in expression attr via different mechanisms', () => {
    const src = `<Wrap cb={s => s.replace("</Wrap>", "")}>\n  Content\n</Wrap>\n`;
    const a = jsxTokenizerA(src);
    const b = jsxTokenizerB(src);

    // A works via regex backtracking (trailing \n check forces past the fake close)
    expect(a).toBeDefined();
    expect(a?.content).toContain('Content');

    // B works via brace-depth tracking (never confused by the expression)
    expect(b).toBeDefined();
    expect(b?.content).toContain('Content');

    expect(a?.content).toBe(b?.content);
  });
});
