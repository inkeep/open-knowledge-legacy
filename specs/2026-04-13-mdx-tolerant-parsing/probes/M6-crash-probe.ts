/**
 * M6 Crash-Class Coverage Probe
 *
 * Tests the 26 crash-class taxonomy from evidence/crash-taxonomy.md against
 * the current parseSafe implementation. Measures:
 *   1. Which crash classes actually fire
 *   2. Which are caught by R23 guard vs parseSafe tiers
 *   3. Error shape: does err.place carry position info?
 *   4. Position-less rate (grounds A7 spec estimate of 15-25%)
 *
 * Also tests project-root files (PROJECT.md, AGENTS.md, ARCHITECTURE.md)
 * and docs/*.mdx files against the parser.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

// ────────────────────────────── Types ──────────────────────────────

interface ProbeResult {
  id: string;
  category: string;
  input: string;
  parseOutcome: 'ok' | 'throw';
  parseSafeOutcome: 'ok-first-try' | 'ok-brace-retry' | 'raw-text-fallback';
  errorType?: string;
  errorMessage?: string;
  hasPosition?: boolean;
  positionShape?: 'point' | 'position' | 'none';
  offset?: number;
}

// ────────────────────────────── Error inspection ──────────────────────────────

function extractErrorInfo(err: unknown): {
  errorType: string;
  errorMessage: string;
  hasPosition: boolean;
  positionShape: 'point' | 'position' | 'none';
  offset?: number;
} {
  const e = err as Record<string, unknown>;
  const errorType = e?.constructor?.name ?? typeof err;
  const errorMessage = typeof e?.message === 'string' ? e.message.slice(0, 120) : String(err).slice(0, 120);

  // VFileMessage shape: err.place can be Point or Position
  const place = e?.place as Record<string, unknown> | undefined;
  if (!place) {
    return { errorType, errorMessage, hasPosition: false, positionShape: 'none' };
  }

  // Point shape: { line, column, offset }
  if (typeof place.offset === 'number') {
    return { errorType, errorMessage, hasPosition: true, positionShape: 'point', offset: place.offset as number };
  }

  // Position shape: { start: { line, column, offset }, end: ... }
  const start = place.start as Record<string, unknown> | undefined;
  if (start && typeof start.offset === 'number') {
    return { errorType, errorMessage, hasPosition: true, positionShape: 'position', offset: start.offset as number };
  }

  return { errorType, errorMessage, hasPosition: false, positionShape: 'none' };
}

function classifyParseSafe(input: string): Pick<ProbeResult, 'parseSafeOutcome'> {
  // parseSafe has 3 tiers: try parse → brace-retry → raw text
  // We need to distinguish which tier caught it
  try {
    mdManager.parse(input);
    return { parseSafeOutcome: 'ok-first-try' };
  } catch {
    // First parse failed — try brace-retry
    const GUARD_OPEN_BRACE = '\uE004';
    try {
      const safeMd = input.replaceAll('{', GUARD_OPEN_BRACE);
      mdManager.parse(safeMd);
      return { parseSafeOutcome: 'ok-brace-retry' };
    } catch {
      return { parseSafeOutcome: 'raw-text-fallback' };
    }
  }
}

function probeInput(id: string, category: string, input: string): ProbeResult {
  const result: ProbeResult = { id, category, input, parseOutcome: 'ok', parseSafeOutcome: 'ok-first-try' };

  // Test raw parse
  try {
    mdManager.parse(input);
    result.parseOutcome = 'ok';
  } catch (err) {
    result.parseOutcome = 'throw';
    const info = extractErrorInfo(err);
    result.errorType = info.errorType;
    result.errorMessage = info.errorMessage;
    result.hasPosition = info.hasPosition;
    result.positionShape = info.positionShape;
    result.offset = info.offset;
  }

  // Test parseSafe classification
  const safe = classifyParseSafe(input);
  result.parseSafeOutcome = safe.parseSafeOutcome;

  return result;
}

// ────────────────────────────── Crash corpus ──────────────────────────────

// 26 crash classes from evidence/crash-taxonomy.md
const crashCorpus: Array<{ id: string; category: string; input: string }> = [
  // === factory-tag.js (tokenizer level) ===

  // #1: EOF in expression (factoryMdxExpression:113)
  { id: 'C01', category: 'EOF in expression', input: 'Hello {unclosed' },

  // #2: Lazy line in expression in container (factoryMdxExpression:196)
  { id: 'C02', category: 'Lazy expression in blockquote', input: '> {a\nb}' },

  // #3: Lazy line in flow JSX tag (factory-tag.js:789-795)
  { id: 'C03', category: 'Lazy JSX in blockquote', input: '> <Foo\nattr>' },

  // #4: Bad first-name char (:132)
  { id: 'C04', category: 'Bad first-name char', input: '<?xml ?>' },

  // #5: Bad after-< char (:160)
  { id: 'C05', category: 'Bad after-< char', input: '< 1>' },

  // #6: Bad in-name char (:188)
  { id: 'C06', category: 'Bad in-name char', input: '<Foo@bar></Foo@bar>' },

  // #7: Bad in-member-name (:276)
  { id: 'C07', category: 'Bad in-member-name', input: '<Foo.bar@></Foo.bar@>' },

  // #8: Bad before-local-name (:326)
  { id: 'C08', category: 'Bad before-local-name', input: '<svg: />' },

  // #9: Bad after-local-name (:378)
  { id: 'C09', category: 'Bad after-local-name', input: '<svg:path%></svg:path%>' },

  // #10: Bad attribute-name char (:425,472,516)
  { id: 'C10a', category: 'Bad attr-name char (space)', input: '<Foo @bar></Foo>' },
  { id: 'C10b', category: 'Bad attr-name char (percent)', input: '<Foo a%b></Foo>' },

  // #11: Bad before-attr-value (:627)
  { id: 'C11', category: 'Bad before-attr-value', input: '<Foo a=></Foo>' },

  // #12: Mismatched attr-value quote (:658)
  { id: 'C12', category: 'Mismatched attr quote', input: '<Foo a="b\'></Foo>' },

  // #13: Bad after-self-closing / (:711)
  { id: 'C13', category: 'Bad after self-closing /', input: '<Foo /x>' },

  // #14: After-name junk (:227)
  { id: 'C14', category: 'After-name junk', input: '<Foo!></Foo!>' },

  // #15: After-member-name junk (:306)
  { id: 'C15', category: 'After-member-name junk', input: '<Foo.bar!></Foo.bar!>' },

  // #16: After-local-attr-name junk (:597)
  { id: 'C16', category: 'After-local-attr-name junk', input: '<Foo a:b!></Foo>' },

  // #17: Bad first char of member name (:247) — newly catalogued
  { id: 'C17', category: 'Bad first-char member name', input: '<Foo.@bar></Foo.@bar>' },

  // #18: Bad char inside local name (:354) — newly catalogued
  { id: 'C18', category: 'Bad char in local name', input: '<svg:p%th></svg:p%th>' },

  // #19: Bad first char of local attr name (:536) — newly catalogued
  { id: 'C19', category: 'Bad first-char local attr name', input: '<Foo a:@></Foo>' },

  // #20: Bad char inside local attr name (:567) — newly catalogued
  { id: 'C20', category: 'Bad char in local attr name', input: '<Foo a:b%c></Foo>' },

  // === mdast-util-mdx-jsx (tree-build level) ===

  // #21 (taxonomy #17): Closing slash without open
  { id: 'C21', category: 'Closing tag without open', input: '</Foo>' },

  // #22 (taxonomy #18): Attribute on closing tag
  { id: 'C22', category: 'Attr on closing tag', input: '<Foo></Foo bar>' },

  // #23 (taxonomy #19): Self-close on closing tag
  { id: 'C23', category: 'Self-close on closing tag', input: '<Foo></Foo/>' },

  // #24 (taxonomy #20): End-tag mismatch — MOST COMMON
  { id: 'C24', category: 'End-tag mismatch', input: '<Foo>content</Bar>' },

  // #25 (taxonomy #21a): Dangling open tag at EOF — onErrorRightIsTag (position-less!)
  { id: 'C25', category: 'Dangling open tag (EOF)', input: '<Foo>' },

  // #26 (taxonomy #21b): Dangling open tag — onErrorLeftIsTag
  { id: 'C26', category: 'Dangling open tag (left)', input: 'text <Foo> more text' },
];

// Additional inputs from real-world scenarios
const realWorldCorpus: Array<{ id: string; category: string; input: string }> = [
  // Prose patterns that should NOT crash
  { id: 'RW01', category: 'Prose: angle bracket comparison', input: 'Response time was <50ms on average.' },
  { id: 'RW02', category: 'Prose: JS object literal', input: 'Use `{ noServer: true }` in the config.' },
  { id: 'RW03', category: 'Prose: math inequality', input: 'When a < b and c > d, we get interesting results.' },
  { id: 'RW04', category: 'Prose: curly brace in text', input: 'Set config to { count + 1 } for the next value.' },
  { id: 'RW05', category: 'Prose: bare angle bracket', input: 'Use < to compare values.' },
  { id: 'RW06', category: 'Prose: inline code with braces', input: 'The function signature is `fn({ a, b })`' },

  // Valid MDX that should parse correctly
  { id: 'RW07', category: 'Valid MDX: self-closing', input: '<Icon name="check" />' },
  { id: 'RW08', category: 'Valid MDX: paired with children', input: '<Callout type="warning">Important note</Callout>' },
  { id: 'RW09', category: 'Valid MDX: nested', input: '<Card>\n\n<CardHeader>Title</CardHeader>\n\n</Card>' },
  { id: 'RW10', category: 'Valid MDX: Tabs (from docs)', input: '<Tabs items={["Tab A", "Tab B"]}>\n<Tab value="Tab A">\nContent A\n</Tab>\n<Tab value="Tab B">\nContent B\n</Tab>\n</Tabs>' },

  // Mid-type authoring states
  { id: 'RW11', category: 'Mid-type: incomplete tag', input: '# Heading\n\n<Callou\n\nSome text below' },
  { id: 'RW12', category: 'Mid-type: tag with no close', input: '# Heading\n\n<Callout type="warning">\n\nSome text below' },
  { id: 'RW13', category: 'Mid-type: typo in close tag', input: '<Callout>Important</Calout>' },
  { id: 'RW14', category: 'Mid-type: unclosed attr', input: '<Callout type="warning\n\nSome text' },

  // Git-history derived inputs (from PR #95, #98, #101 fixes)
  { id: 'GH01', category: 'PR#95: bare < at EOL', input: 'Some text <\nmore text' },
  { id: 'GH02', category: 'PR#95: bare { unmatched', input: 'Config: { a, b\nno close' },
  { id: 'GH03', category: 'PR#98: bare <letter', input: 'The <response was fast.' },
  { id: 'GH04', category: 'PR#101: consecutive brackets', input: 'Use << and >> operators.' },
  { id: 'GH05', category: 'PR#101: mixed HTML + MDX', input: '<div class="note">text</div>\n\n<Callout>alert</Callout>' },
];

// ────────────────────────────── Project files ──────────────────────────────

// Resolve worktree root: find the nearest directory containing package.json
function findWorktreeRoot(): string {
  let dir = resolve(import.meta.dirname);
  while (dir !== '/') {
    try {
      readFileSync(join(dir, 'package.json'));
      // Check it has a 'packages' dir (monorepo root marker)
      try {
        readdirSync(join(dir, 'packages'));
        return dir;
      } catch { /* not the monorepo root, keep going */ }
    } catch { /* no package.json here */ }
    dir = resolve(dir, '..');
  }
  throw new Error('Could not find worktree root');
}
const WORKTREE_ROOT = findWorktreeRoot();

function probeProjectFile(name: string, path: string): ProbeResult | null {
  try {
    const content = readFileSync(path, 'utf-8');
    return probeInput(`PF:${name}`, `Project file: ${name}`, content);
  } catch {
    return null;
  }
}

function probeDocsFiles(): ProbeResult[] {
  const results: ProbeResult[] = [];
  const docsDir = join(WORKTREE_ROOT, 'docs/content');
  try {
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name));
        else if (entry.name.endsWith('.mdx') || entry.name.endsWith('.md')) {
          const fullPath = join(dir, entry.name);
          const content = readFileSync(fullPath, 'utf-8');
          const relPath = fullPath.replace(WORKTREE_ROOT + '/', '');
          results.push(probeInput(`DOC:${relPath}`, `Docs file: ${relPath}`, content));
        }
      }
    };
    walk(docsDir);
  } catch (e) {
    console.error('Failed to walk docs directory:', e);
  }
  return results;
}

// ────────────────────────────── Run probe ──────────────────────────────

console.log('=== M6 Crash-Class Coverage Probe ===\n');

// Phase 1: Crash taxonomy inputs
console.log('--- Phase 1: 26 crash-class taxonomy ---\n');
const taxonomyResults: ProbeResult[] = [];
for (const { id, category, input } of crashCorpus) {
  const result = probeInput(id, category, input);
  taxonomyResults.push(result);
  const status = result.parseOutcome === 'throw' ? '!! THROW' : '   OK   ';
  const safeStatus = result.parseSafeOutcome;
  const posInfo = result.positionShape ? ` pos=${result.positionShape}` : '';
  console.log(`  ${status} | ${safeStatus.padEnd(18)} | ${id.padEnd(4)} | ${category}`);
  if (result.parseOutcome === 'throw') {
    console.log(`           err: ${result.errorType}: ${result.errorMessage}${posInfo}`);
  }
}

// Phase 1b: Real-world + git history inputs
console.log('\n--- Phase 1b: Real-world + git-history inputs ---\n');
const realWorldResults: ProbeResult[] = [];
for (const { id, category, input } of realWorldCorpus) {
  const result = probeInput(id, category, input);
  realWorldResults.push(result);
  const status = result.parseOutcome === 'throw' ? '!! THROW' : '   OK   ';
  const safeStatus = result.parseSafeOutcome;
  console.log(`  ${status} | ${safeStatus.padEnd(18)} | ${id.padEnd(5)} | ${category}`);
  if (result.parseOutcome === 'throw') {
    console.log(`           err: ${result.errorType}: ${result.errorMessage}`);
  }
}

// Phase 2: Project root files
console.log('\n--- Phase 2: Project root files ---\n');
const projectFileResults: ProbeResult[] = [];
for (const [name, filename] of [
  ['PROJECT.md', 'PROJECT.md'],
  ['AGENTS.md', 'AGENTS.md'],
  ['ARCHITECTURE.md', 'ARCHITECTURE.md'],
] as const) {
  const r = probeProjectFile(name, join(WORKTREE_ROOT, filename));
  if (r) {
    projectFileResults.push(r);
    const status = r.parseOutcome === 'throw' ? '!! THROW' : '   OK   ';
    console.log(`  ${status} | ${r.parseSafeOutcome.padEnd(18)} | ${name}`);
    if (r.parseOutcome === 'throw') {
      console.log(`           err: ${r.errorType}: ${r.errorMessage}`);
    }
  }
}

// Phase 3: Docs MDX files
console.log('\n--- Phase 3: Docs MDX files ---\n');
const docsResults = probeDocsFiles();
for (const r of docsResults) {
  const status = r.parseOutcome === 'throw' ? '!! THROW' : '   OK   ';
  const shortId = r.id.replace('DOC:', '');
  console.log(`  ${status} | ${r.parseSafeOutcome.padEnd(18)} | ${shortId}`);
  if (r.parseOutcome === 'throw') {
    console.log(`           err: ${r.errorType}: ${r.errorMessage}`);
  }
}

// ────────────────────────────── Summary ──────────────────────────────

console.log('\n=== SUMMARY ===\n');

const allResults = [...taxonomyResults, ...realWorldResults, ...projectFileResults, ...docsResults];
const throwResults = allResults.filter(r => r.parseOutcome === 'throw');
const taxonomyThrows = taxonomyResults.filter(r => r.parseOutcome === 'throw');

console.log(`Total inputs tested: ${allResults.length}`);
console.log(`  Taxonomy (26 classes): ${taxonomyResults.length} inputs, ${taxonomyThrows.length} throw`);
console.log(`  Real-world: ${realWorldResults.length} inputs, ${realWorldResults.filter(r => r.parseOutcome === 'throw').length} throw`);
console.log(`  Project files: ${projectFileResults.length} inputs, ${projectFileResults.filter(r => r.parseOutcome === 'throw').length} throw`);
console.log(`  Docs MDX: ${docsResults.length} inputs, ${docsResults.filter(r => r.parseOutcome === 'throw').length} throw`);
console.log(`  Total throwing: ${throwResults.length} / ${allResults.length}`);

// Position-less rate
const positionLess = throwResults.filter(r => r.positionShape === 'none');
const withPosition = throwResults.filter(r => r.positionShape === 'point' || r.positionShape === 'position');
console.log(`\n--- Position info analysis (Phase 3) ---`);
console.log(`  Throws with position (point): ${throwResults.filter(r => r.positionShape === 'point').length}`);
console.log(`  Throws with position (Position): ${throwResults.filter(r => r.positionShape === 'position').length}`);
console.log(`  Throws position-less: ${positionLess.length}`);
console.log(`  Position-less rate: ${throwResults.length > 0 ? ((positionLess.length / throwResults.length) * 100).toFixed(1) : 'N/A'}%`);

// parseSafe tier distribution
const braceRetry = throwResults.filter(r => r.parseSafeOutcome === 'ok-brace-retry');
const rawText = throwResults.filter(r => r.parseSafeOutcome === 'raw-text-fallback');
const okFirst = throwResults.filter(r => r.parseSafeOutcome === 'ok-first-try');
console.log(`\n--- parseSafe tier distribution (among throws) ---`);
console.log(`  Caught by R23 guard (parse OK): ${taxonomyResults.filter(r => r.parseOutcome === 'ok').length} / ${taxonomyResults.length} taxonomy inputs`);
console.log(`  Throwing but brace-retry saves: ${braceRetry.length}`);
console.log(`  Throwing → raw-text fallback: ${rawText.length}`);

// Taxonomy coverage: which crash classes actually fire?
console.log(`\n--- Taxonomy crash class coverage ---`);
console.log(`  Classes that fire (throw on parse): ${taxonomyThrows.map(r => r.id).join(', ') || 'none'}`);
console.log(`  Classes guarded by R23 (parse OK):  ${taxonomyResults.filter(r => r.parseOutcome === 'ok').map(r => r.id).join(', ') || 'none'}`);

// Detailed position-less listing
if (positionLess.length > 0) {
  console.log(`\n--- Position-less errors (detailed) ---`);
  for (const r of positionLess) {
    console.log(`  ${r.id} | ${r.category} | ${r.errorType}: ${r.errorMessage?.slice(0, 80)}`);
  }
}

// ────────────────────────────── Phase 4: R23-bypass position-less test ──────
// The taxonomy says C25 (dangling open tag EOF) fires onErrorRightIsTag with
// position-less error. But R23 guards it. To measure the position-less rate
// accurately, we need to test inputs that BYPASS R23 by being valid enough
// to pass the guard but still crash the parser.

console.log(`\n--- Phase 4: R23-bypass position-less investigation ---\n`);

// Import parseMd directly to test without R23 guard
import { parseMd } from '../../../packages/core/src/markdown/pipeline.ts';
import { getSchema } from '@tiptap/core';

const schema = getSchema(sharedExtensions);

// These inputs are specifically crafted to bypass R23 (they look like valid
// paired JSX to the guard) but crash the parser at mdast-build level.
const bypassInputs = [
  // Tag mismatch: R23 sees <Foo> and </Bar> but doesn't check name match
  { id: 'BP01', desc: 'Tag mismatch (bypasses R23)', input: '<Foo>content</Bar>' },
  // Attribute errors on valid-looking paired tags
  { id: 'BP02', desc: 'Bad attr on paired tag', input: '<Foo @attr>content</Foo>' },
  { id: 'BP03', desc: 'Bad attr value on paired', input: '<Foo a=>content</Foo>' },
  // Dangling open (R23 guards this, but let's try with raw parseMd call)
  { id: 'BP04', desc: 'Dangling open (raw, no guard)', input: '<Foo>' },
];

// Build handler tables using the same path as MarkdownManager
// We can't easily call parseMd without R23 since protectFromMdx is baked in.
// Instead, let's manually try mdManager.parse on inputs that the guard DOESN'T protect.
for (const { id, desc, input } of bypassInputs) {
  try {
    mdManager.parse(input);
    console.log(`  OK     | ${id} | ${desc}`);
  } catch (err) {
    const info = extractErrorInfo(err);
    console.log(`  THROW  | ${id} | ${desc} | pos=${info.positionShape} | ${info.errorType}: ${info.errorMessage?.slice(0, 80)}`);
  }
}

// ── Also: test the SPECIFIC position-less scenario from taxonomy ──
// The taxonomy says line 458 (onErrorRightIsTag) fires with place=undefined.
// This only fires when we have a JSX flow element that's OPEN at EOF.
// R23 guards <Foo> by protecting the < unless it sees </Foo>.
// To trigger the raw crash we'd need to bypass protectFromMdx.
// Let's test by importing micromark-extension-mdx-jsx directly.
console.log(`\n  --- Direct micromark test for position-less path ---`);
try {
  const micromarkMdxJsx = await import('micromark-extension-mdx-jsx');
  const mdastUtilMdxJsx = await import('mdast-util-mdx-jsx');
  const remarkParseModule = await import('remark-parse');
  const unifiedModule = await import('unified');

  const mdxJsx = micromarkMdxJsx.mdxJsx;
  const mdxJsxFromMarkdownFn = mdastUtilMdxJsx.mdxJsxFromMarkdown;
  const remarkParse_ = remarkParseModule.default;
  const unified_ = unifiedModule.unified;

  // Build a minimal processor with just remark-parse + mdx-jsx (no R23 guard)
  const rawProcessor = unified_()
    .use(remarkParse_)
    .use(function () {
      const data = this.data() as Record<string, unknown[]>;
      data.micromarkExtensions ??= [];
      data.fromMarkdownExtensions ??= [];
      data.micromarkExtensions.push(mdxJsx({ acorn: undefined }));
      data.fromMarkdownExtensions.push(mdxJsxFromMarkdownFn());
    });

  const posLessTests = [
    { id: 'PL01', desc: 'Dangling <Foo> at EOF (no R23)', input: '<Foo>' },
    { id: 'PL02', desc: 'Dangling <Foo> with content (no R23)', input: '<Foo>\nsome content\nmore content' },
    { id: 'PL03', desc: 'Dangling <Foo.Bar> at EOF', input: '<Foo.Bar>' },
    { id: 'PL04', desc: 'Tag mismatch (no R23)', input: '<Foo>stuff</Bar>' },
    { id: 'PL05', desc: 'Nested dangling', input: '<Outer><Inner></Inner>' },
  ];

  let posLessCount = 0;
  let posHasCount = 0;

  for (const { id, desc, input } of posLessTests) {
    try {
      const tree = rawProcessor.parse(input);
      rawProcessor.runSync(tree);
      console.log(`  OK     | ${id} | ${desc}`);
    } catch (err) {
      const info = extractErrorInfo(err);
      if (info.positionShape === 'none') posLessCount++;
      else posHasCount++;
      console.log(`  THROW  | ${id} | ${desc} | pos=${info.positionShape} | ${info.errorType}: ${info.errorMessage?.slice(0, 80)}`);
    }
  }
  console.log(`\n  Position-less in direct tests: ${posLessCount} / ${posLessCount + posHasCount}`);
} catch (e) {
  console.log(`  (Direct micromark test skipped: ${e})`);
}

// Export results as JSON for downstream consumption
const outputPath = join(import.meta.dirname, '../evidence/crash-class-probe-raw.json');
const { writeFileSync } = await import('node:fs');
writeFileSync(outputPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  taxonomy: taxonomyResults,
  realWorld: realWorldResults,
  projectFiles: projectFileResults,
  docs: docsResults,
  summary: {
    totalInputs: allResults.length,
    totalThrows: throwResults.length,
    positionLessCount: positionLess.length,
    positionLessRate: throwResults.length > 0 ? positionLess.length / throwResults.length : 0,
    taxonomyThrowCount: taxonomyThrows.length,
    taxonomyGuardedCount: taxonomyResults.filter(r => r.parseOutcome === 'ok').length,
  }
}, null, 2));
console.log(`\nRaw results written to: ${outputPath}`);
