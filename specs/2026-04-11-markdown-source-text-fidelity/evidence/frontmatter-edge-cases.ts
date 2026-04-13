/**
 * Pathological frontmatter edge-case test script.
 * Tests 10 inputs through stripFrontmatter + prependFrontmatter round-trip.
 *
 * Run: cd <repo-root> && bun run specs/2026-04-11-markdown-source-text-fidelity/evidence/frontmatter-edge-cases.ts
 */
import { stripFrontmatter, prependFrontmatter } from '../../../packages/core/src/extensions/frontmatter.ts';

interface TestCase {
  name: string;
  input: string;
  /** What we expect stripFrontmatter to extract as frontmatter (null = don't check, just round-trip) */
  expectedFrontmatter?: string;
  /** What we expect stripFrontmatter to extract as body */
  expectedBody?: string;
}

const cases: TestCase[] = [
  {
    name: '1. Value containing --- delimiter',
    input: '---\ntitle: "foo --- bar"\n---\n# Body',
    expectedFrontmatter: '---\ntitle: "foo --- bar"\n---\n',
    expectedBody: '# Body',
  },
  {
    name: '2. Multi-line YAML string (literal block)',
    input: '---\ndescription: |\n  Line one\n  Line two\n  ---\n  Line three\n---\n# Body',
    // The regex is non-greedy so it matches the FIRST \n---\n — the one inside the block scalar
    expectedFrontmatter: '---\ndescription: |\n  Line one\n  Line two\n  ---\n',
    expectedBody: '  Line three\n---\n# Body',
  },
  {
    name: '3. Nested YAML object',
    input: '---\nmeta:\n  author: Alice\n  tags:\n    - foo\n    - bar\n---\n# Body',
    expectedFrontmatter: '---\nmeta:\n  author: Alice\n  tags:\n    - foo\n    - bar\n---\n',
    expectedBody: '# Body',
  },
  {
    name: '4. YAML with markdown in value',
    input: '---\nexcerpt: "# Not a heading\\n**bold**"\n---\n# Real heading',
    expectedFrontmatter: '---\nexcerpt: "# Not a heading\\n**bold**"\n---\n',
    expectedBody: '# Real heading',
  },
  {
    name: '5. JSON frontmatter variant',
    input: '---\n{"title": "JSON fm", "tags": ["a","b"]}\n---\n# Body',
    expectedFrontmatter: '---\n{"title": "JSON fm", "tags": ["a","b"]}\n---\n',
    expectedBody: '# Body',
  },
  {
    name: '6. TOML frontmatter (+++)',
    input: '+++\ntitle = "TOML"\ndate = 2026-01-01\n+++\n# Body',
    // Our regex only matches --- so TOML is NOT detected
    expectedFrontmatter: '',
    expectedBody: '+++\ntitle = "TOML"\ndate = 2026-01-01\n+++\n# Body',
  },
  {
    name: '7. Windows line endings (CRLF)',
    input: '---\r\ntitle: CRLF\r\n---\r\n# Body',
    // Regex uses \n — CRLF will NOT match
    expectedFrontmatter: '',
    expectedBody: '---\r\ntitle: CRLF\r\n---\r\n# Body',
  },
  {
    name: '8. Empty frontmatter block',
    input: '---\n---\n# Body',
    expectedFrontmatter: '---\n---\n',
    expectedBody: '# Body',
  },
  {
    name: '9. Frontmatter with trailing whitespace on delimiters',
    input: '---  \ntitle: Trailing spaces\n---  \n# Body',
    // Regex matches ^---\n exactly — trailing spaces break it
    expectedFrontmatter: '',
    expectedBody: '---  \ntitle: Trailing spaces\n---  \n# Body',
  },
  {
    name: '10. Leading whitespace before opening ---',
    input: ' ---\ntitle: Indented\n---\n# Body',
    // Regex anchors at ^ so leading space breaks it
    expectedFrontmatter: '',
    expectedBody: ' ---\ntitle: Indented\n---\n# Body',
  },
];

console.log('=== Frontmatter Edge-Case Test Results ===\n');

let pass = 0;
let fail = 0;

for (const tc of cases) {
  const { frontmatter, body } = stripFrontmatter(tc.input);
  const roundTrip = prependFrontmatter(frontmatter, body);
  const roundTripOk = roundTrip === tc.input;

  let fmOk = true;
  let bodyOk = true;

  if (tc.expectedFrontmatter !== undefined) {
    fmOk = frontmatter === tc.expectedFrontmatter;
  }
  if (tc.expectedBody !== undefined) {
    bodyOk = body === tc.expectedBody;
  }

  const allOk = fmOk && bodyOk && roundTripOk;
  const status = allOk ? 'PASS' : 'FAIL';
  if (allOk) pass++;
  else fail++;

  console.log(`${status}  ${tc.name}`);
  if (!allOk) {
    if (!fmOk) {
      console.log(`  frontmatter expected: ${JSON.stringify(tc.expectedFrontmatter)}`);
      console.log(`  frontmatter actual:   ${JSON.stringify(frontmatter)}`);
    }
    if (!bodyOk) {
      console.log(`  body expected: ${JSON.stringify(tc.expectedBody)}`);
      console.log(`  body actual:   ${JSON.stringify(body)}`);
    }
    if (!roundTripOk) {
      console.log(`  round-trip BROKEN (reassembled !== input)`);
    }
  }
}

console.log(`\n--- Summary: ${pass} PASS, ${fail} FAIL out of ${cases.length} ---`);
