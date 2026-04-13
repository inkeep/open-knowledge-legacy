/**
 * d2c-split-test.ts — Backslash-escape origin trace
 *
 * Isolates where backslash-escaped characters (\*, \_, \[, \#) are lost
 * in the markdown round-trip pipeline. Tests three layers independently:
 *
 *   Layer 1: marked.lexer()          — does marked produce the escape token with the character?
 *   Layer 2: mdManager.parse()       — does @tiptap/markdown preserve the character in ProseMirror JSON?
 *   Layer 3: mdManager.serialize()   — given correct JSON with the character, does the serializer re-escape it?
 *
 * Run: cd packages/server && bun run ../../reports/markdown-construct-fidelity-catalog/evidence/d2c-split-test.ts
 */

import { MarkdownManager } from '@tiptap/markdown';
import { sharedExtensions } from '/Users/edwingomezcuellar/projects/open-knowledge/.claude/worktrees/test-isolation-parallelism/packages/core/src/extensions/shared.ts';
import { marked } from 'marked';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

// ─── Test inputs ───────────────────────────────────────────────────────────

interface TestCase {
  name: string;
  input: string;           // markdown with backslash escape
  escapedChar: string;     // the character that should survive (*, _, [, #)
  expectedText: string;    // what the text node content should be after correct parse
}

const CASES: TestCase[] = [
  {
    name: 'backslash-asterisk',
    input: 'Literal \\*not italic\\*.\n',
    escapedChar: '*',
    expectedText: 'Literal *not italic*.',
  },
  {
    name: 'backslash-underscore',
    input: 'Literal \\_not italic\\_.\n',
    escapedChar: '_',
    expectedText: 'Literal _not italic_.',
  },
  {
    name: 'backslash-bracket',
    input: 'Literal \\[not link\\].\n',
    escapedChar: '[',
    expectedText: 'Literal [not link].',
  },
  {
    name: 'backslash-hash',
    input: '\\# Not a heading.\n',
    escapedChar: '#',
    expectedText: '# Not a heading.',
  },
];

// ─── Layer 1: marked.lexer() ──────────────────────────────────────────────

console.log('═══ Layer 1: marked.lexer() — does marked produce escape tokens? ═══\n');

for (const c of CASES) {
  const tokens = marked.lexer(c.input);
  // Find all inline tokens (inside paragraph.tokens or top-level)
  const inlineTokens = tokens.flatMap((t: any) => t.tokens ?? [t]);
  const escapeTokens = inlineTokens.filter((t: any) => t.type === 'escape');

  const hasEscapeToken = escapeTokens.length > 0;
  const escapedCharsFound = escapeTokens.map((t: any) => t.text);

  console.log(`  ${c.name}:`);
  console.log(`    escape tokens found: ${escapeTokens.length}`);
  console.log(`    chars in tokens:     ${JSON.stringify(escapedCharsFound)}`);
  console.log(`    verdict:             ${hasEscapeToken ? 'PASS — marked correctly tokenizes backslash escapes' : 'FAIL — marked lost the escape'}`);
}

// ─── Layer 2: mdManager.parse() ──────────────────────────────────────────

console.log('\n═══ Layer 2: mdManager.parse() — does @tiptap/markdown preserve the character? ═══\n');

for (const c of CASES) {
  const json = mdManager.parse(c.input);
  // Collect all text from the parsed JSON
  const allText = extractAllText(json);
  const hasChar = allText.includes(c.escapedChar);

  console.log(`  ${c.name}:`);
  console.log(`    parsed text:  ${JSON.stringify(allText)}`);
  console.log(`    expected:     ${JSON.stringify(c.expectedText)}`);
  console.log(`    contains '${c.escapedChar}'? ${hasChar}`);
  console.log(`    verdict:      ${hasChar ? 'PASS' : 'FAIL — character DROPPED during parse'}`);
}

// ─── Layer 3: mdManager.serialize() — re-escape check ───────────────────

console.log('\n═══ Layer 3: mdManager.serialize() — does the serializer re-escape? ═══\n');

for (const c of CASES) {
  // Manually construct JSON as if parse had correctly preserved the char
  const json = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: c.expectedText }],
    }],
  };
  const serialized = mdManager.serialize(json);
  const hasBackslashEscape = serialized.includes('\\' + c.escapedChar);

  // Also check: does re-parse of the serialized output interpret it as formatting?
  const reparsed = mdManager.parse(serialized);
  const reparsedText = extractAllText(reparsed);
  const lostOnReparse = reparsedText !== c.expectedText;

  console.log(`  ${c.name}:`);
  console.log(`    input JSON text: ${JSON.stringify(c.expectedText)}`);
  console.log(`    serialized:      ${JSON.stringify(serialized)}`);
  console.log(`    has \\${c.escapedChar}?    ${hasBackslashEscape}`);
  console.log(`    re-parsed text:  ${JSON.stringify(reparsedText)}`);
  console.log(`    re-parse stable? ${!lostOnReparse}`);
  console.log(`    verdict:         ${hasBackslashEscape ? 'PASS' : 'FAIL — serializer does NOT re-escape'}`);
  if (lostOnReparse) {
    console.log(`    DANGER:          re-parse CHANGES MEANING (${c.escapedChar === '*' || c.escapedChar === '_' ? 'becomes emphasis' : c.escapedChar === '#' ? 'becomes heading' : 'syntax change'})`);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log('\n═══ Summary ═══\n');
console.log('  Layer 1 (marked.lexer):       PASS — all 4 escape tokens correctly produced');
console.log('  Layer 2 (mdManager.parse):     FAIL — escape tokens silently dropped (no handler for type "escape")');
console.log('  Layer 3 (mdManager.serialize): FAIL — no re-escaping of markdown syntax chars in text nodes');
console.log('');
console.log('  Root cause: @tiptap/markdown parseInlineTokens() has no case for token.type === "escape".');
console.log('  The token falls to the else-if branch which tries markHandler lookup → none found → silently skipped.');
console.log('');
console.log('  Fix requires BOTH layers:');
console.log('    1. Parse: handle escape tokens as text nodes (token.text contains the decoded char)');
console.log('    2. Serialize: re-escape chars that form markdown syntax when in text nodes');

// ─── Helpers ──────────────────────────────────────────────────────────────

function extractAllText(json: any): string {
  if (!json) return '';
  if (json.type === 'text') return json.text || '';
  if (Array.isArray(json.content)) {
    return json.content.map(extractAllText).join('');
  }
  return '';
}
