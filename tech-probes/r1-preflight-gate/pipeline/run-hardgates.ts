/**
 * Run the remaining hard gates: definition override, fail-fast unknown type,
 * MDX multiline stability, position-data coverage.
 */
import { parse, serialize } from './pipeline';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdx from 'remark-mdx';
import remarkDirective from 'remark-directive';
import { visit } from 'unist-util-visit';
import { remarkProseMirror } from '@handlewithcare/remark-prosemirror';
import { schema } from './schema';
import { mdastToPmHandlers } from './handlers';

const results: any = {};

// ─── Gate 3: definition override round-trip ────────────────────────────
const defInput = '[text][label]\n\n[label]: https://example.com\n';
const defOut = serialize(parse(defInput));
results.definitionOverride = {
  input: defInput,
  output: defOut,
  pass: defOut === defInput,
  verdict: defOut === defInput ? 'PASS' : 'FAIL',
};

// Also test collapsed and full forms
const defInputFull = '[text][label]\n\n[label]: https://example.com "the title"\n';
const defOutFull = serialize(parse(defInputFull));
results.definitionFull = {
  input: defInputFull,
  output: defOutFull,
  pass: defOutFull === defInputFull,
};

// ─── Gate 4: fail-fast on unknown type ────────────────────────────
// Intentionally omit the 'code' handler, feed input with a code node.
const badHandlers: any = { ...mdastToPmHandlers };
delete badHandlers.code;
delete badHandlers.paragraph; // also ensure

let threw = false;
let errMsg = '';
try {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkProseMirror, { schema, handlers: badHandlers } as any);
  const tree = processor.parse('```\ncode\n```\n');
  const transformed = processor.runSync(tree);
  (processor as any).stringify(transformed);
} catch (err: any) {
  threw = true;
  errMsg = err?.message ?? String(err);
}
results.failFastUnknown = {
  threw,
  errMsg,
  expectedPattern: 'unknown markdown node:',
  pass: threw && errMsg.includes('unknown markdown node:'),
};

// ─── Gate 5: MDX multiline expression stability ────────────────────────
const mdxInput = '<Chart data={{\n  key: value\n}}>\nchild\n</Chart>\n';
const r1 = serialize(parse(mdxInput));
let r2 = '';
let r3 = '';
let mdxStable = false;
let mdxError: string | undefined;
try {
  r2 = serialize(parse(r1));
  r3 = serialize(parse(r2));
  mdxStable = r2 === r3; // convergent after first pass (drift ok on first, must stabilize)
} catch (err: any) {
  mdxError = err?.message ?? String(err);
}
results.mdxMultiline = {
  input: mdxInput,
  pass1: r1,
  pass2: r2,
  pass3: r3,
  converged: mdxStable,
  error: mdxError,
};

// ─── Gate 6: position data coverage ────────────────────────────
// Walk all output mdast nodes from the full plugin chain; count nodes with/without position
const sampleInputs = [
  '# heading\n',
  '**bold** *italic*\n',
  '- item\n- item2\n',
  '```js\nx\n```\n',
  '| a | b |\n|--|--|\n| 1 | 2 |\n',
  '<Component prop="v">child</Component>\n',
  ':::note\ncontent\n:::\n',
  '---\ntitle: foo\n---\n\n# body\n',
  '[text][ref]\n\n[ref]: url\n',
];

let totalNodes = 0;
let missingPos = 0;
const missingByType: Record<string, number> = {};

for (const src of sampleInputs) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMdx)
    .use(remarkDirective);
  const tree = processor.runSync(processor.parse(src));
  visit(tree, (node: any) => {
    totalNodes++;
    if (!node.position) {
      missingPos++;
      missingByType[node.type] = (missingByType[node.type] ?? 0) + 1;
    }
  });
}
results.positionCoverage = {
  totalNodes,
  missingPos,
  coverage: (((totalNodes - missingPos) / totalNodes) * 100).toFixed(1) + '%',
  missingByType,
  pass: missingPos === 0,
};

// ─── Soft signal: nested emphasis #12 ────────────────────────────
const nestedInput = '***emphasis*in emphasis*\n';
let nestedOut = '';
let nestedErr: string | undefined;
try {
  nestedOut = serialize(parse(nestedInput));
} catch (err: any) {
  nestedErr = err?.message ?? String(err);
}
results.nestedEmphasis = {
  input: nestedInput,
  output: nestedOut,
  pass: nestedOut === nestedInput,
  error: nestedErr,
};

// ─── Soft signal: Q9 handler API coverage ────────────────────────────
// Verify we can register handlers for all required custom types.
const customHandlerTypes = [
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxFlowExpression',
  'mdxTextExpression',
  'mdxjsEsm',
  'wikiLink',
  'containerDirective',
  'leafDirective',
  'textDirective',
  'definition',
  'yaml',
];
const registered = customHandlerTypes.filter((t) => mdastToPmHandlers[t]);
results.q9Coverage = {
  required: customHandlerTypes,
  registered,
  missing: customHandlerTypes.filter((t) => !mdastToPmHandlers[t]),
  pass: registered.length === customHandlerTypes.length,
};

import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/r1-probe-1776046234/hardgate-results.json', JSON.stringify(results, null, 2));

console.log('=== Hard gate results ===');
console.log('3. Definition override:       ', results.definitionOverride.verdict);
console.log('   Full-form:                 ', results.definitionFull.pass ? 'PASS' : 'FAIL');
console.log('4. Fail-fast unknown type:    ', results.failFastUnknown.pass ? 'PASS' : 'FAIL');
console.log('   Error msg:                 ', results.failFastUnknown.errMsg);
console.log('5. MDX multiline stability:   ', results.mdxMultiline.converged ? 'PASS (converged)' : 'FAIL');
if (results.mdxMultiline.error) console.log('   MDX err:                   ', results.mdxMultiline.error);
console.log('   Pass 1 len:', r1.length, 'Pass 2 len:', r2.length, 'Pass 3 len:', r3.length);
console.log('6. Position data coverage:    ', results.positionCoverage.coverage, results.positionCoverage.pass ? 'PASS' : 'WARN');
console.log('   Missing by type:           ', results.positionCoverage.missingByType);
console.log('8. Nested emphasis #12:       ', results.nestedEmphasis.pass ? 'PASS' : 'FAIL');
console.log('   IN: ', JSON.stringify(results.nestedEmphasis.input));
console.log('   OUT:', JSON.stringify(results.nestedEmphasis.output));
console.log('7. Q9 handler API coverage:   ', results.q9Coverage.pass ? 'PASS' : 'FAIL');
if (results.q9Coverage.missing.length) console.log('   Missing:', results.q9Coverage.missing);
