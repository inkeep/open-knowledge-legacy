/**
 * R1 pre-flight probe runner.
 *
 * Runs 118 construct catalog + 13 P0 entity/escape cases through the new
 * unified + remark-prosemirror pipeline. Emits TSV + JSON per-case results
 * and summary verdicts.
 */
import { CONSTRUCTS, type Construct, type Category } from './constructs';
import { parse, serialize } from './pipeline';

function normalizeTrailing(s: string): string {
  return s.replace(/\n+$/, '').replace(/[ \t]+$/gm, '');
}

type Classification =
  | 'BYTE_IDENTICAL'
  | 'WHITESPACE_DIFF'
  | 'ENTITY_CORRUPTION'
  | 'SEMANTIC_LOSS'
  | 'STRUCTURE_CHANGE'
  | 'COSMETIC_NORMALIZATION'
  | 'ERROR';

function classify(input: string, output: string): Classification {
  if (input === output) return 'BYTE_IDENTICAL';
  const ni = normalizeTrailing(input);
  const no = normalizeTrailing(output);
  if (ni === no) return 'WHITESPACE_DIFF';

  // Entity corruption check
  const hasLiteralAmp = /(?<!&amp;|&lt;|&gt;|&quot;)&(?!amp;|lt;|gt;|quot;|#)/.test(ni);
  const outputHasAmpEscaped = /&amp;/.test(no);
  if (hasLiteralAmp && outputHasAmpEscaped && !/&amp;/.test(ni)) return 'ENTITY_CORRUPTION';

  const tokens = (s: string) => s.replace(/\s+/g, '');
  if (tokens(ni) === tokens(no)) return 'WHITESPACE_DIFF';

  const lenRatio =
    Math.min(tokens(ni).length, tokens(no).length) /
    Math.max(tokens(ni).length, tokens(no).length);
  if (lenRatio < 0.8) return 'SEMANTIC_LOSS';

  const syntaxChars = (s: string) => s.replace(/[^#*_\-+>`~|\[\]()!]/g, '');
  if (syntaxChars(ni) !== syntaxChars(no)) return 'STRUCTURE_CHANGE';
  return 'COSMETIC_NORMALIZATION';
}

function roundTrip(input: string): { output: string; error?: string } {
  try {
    const doc = parse(input);
    const out = serialize(doc);
    return { output: out };
  } catch (err: any) {
    return { output: '', error: err?.message ?? String(err) };
  }
}

interface Row {
  name: string;
  category: Category;
  input: string;
  notes: string;
  output: string;
  klass: Classification;
  error?: string;
  idempotent: boolean;
}

const rows: Row[] = [];

for (const c of CONSTRUCTS) {
  const r = roundTrip(c.input);
  const klass: Classification = r.error ? 'ERROR' : classify(c.input, r.output);
  const r2 = roundTrip(r.output);
  const idempotent = !r2.error && r2.output === r.output;
  rows.push({
    name: c.name,
    category: c.category,
    input: c.input,
    notes: c.notes ?? '',
    output: r.output,
    klass,
    error: r.error,
    idempotent,
  });
}

// Summary
const counts: Record<string, number> = {};
for (const r of rows) counts[r.klass] = (counts[r.klass] ?? 0) + 1;

const byteIdentical = rows.filter((r) => r.klass === 'BYTE_IDENTICAL').length;
const whitespaceOnly = rows.filter(
  (r) => r.klass === 'BYTE_IDENTICAL' || r.klass === 'WHITESPACE_DIFF',
).length;

console.error('=== 118-case probe summary ===');
console.error(`Total:                ${rows.length}`);
console.error(`BYTE_IDENTICAL:       ${byteIdentical}`);
console.error(`Whitespace-only pass: ${whitespaceOnly} / ${rows.length}`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.error(`  ${k}: ${v}`);
}
console.error('');

// TSV output
const TSV_COLS = ['name', 'category', 'klass', 'idempotent', 'input', 'output', 'error', 'notes'];
const tsv: string[] = [TSV_COLS.join('\t')];
for (const r of rows) {
  tsv.push(
    [
      r.name,
      r.category,
      r.klass,
      r.idempotent ? 'Y' : 'N',
      JSON.stringify(r.input),
      JSON.stringify(r.output),
      r.error ?? '',
      r.notes,
    ].join('\t'),
  );
}

// Write TSV + JSON
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/r1-probe-1776046234/probe-results.tsv', tsv.join('\n'));
writeFileSync('/tmp/r1-probe-1776046234/probe-results.json', JSON.stringify(rows, null, 2));

// Summary JSON
const summary = {
  total: rows.length,
  byteIdentical,
  whitespaceOnlyPass: whitespaceOnly,
  target: 77,
  verdict: whitespaceOnly >= 77 ? 'PASS' : 'FAIL',
  counts,
  failures: rows
    .filter((r) => r.klass !== 'BYTE_IDENTICAL' && r.klass !== 'WHITESPACE_DIFF')
    .map((r) => ({ name: r.name, klass: r.klass, input: r.input, output: r.output, error: r.error })),
};
writeFileSync('/tmp/r1-probe-1776046234/probe-summary.json', JSON.stringify(summary, null, 2));

console.error(`Verdict (M1 ≥ 77/118): ${summary.verdict} (${whitespaceOnly}/${rows.length})`);
