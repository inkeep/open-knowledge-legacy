import { describe, expect, test } from 'bun:test';
import { diffLines } from 'diff';
import { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter';
import { mdManager } from './markdown';

function canonicalizeMarkdown(markdown: string): string {
  const { frontmatter, body } = stripFrontmatter(markdown);
  const json = mdManager.parse(body);
  const serialized = mdManager.serialize(json);
  return prependFrontmatter(frontmatter, serialized);
}

type NormalizationBucket = 'table-alignment' | 'blank-line-change' | 'other';

function isTableAlignmentLine(line: string): boolean {
  // separator row or padded data cell — produced by table serialization
  return /^\s*\|/.test(line);
}

function classifyNormalization(input: string, output: string): NormalizationBucket[] {
  const buckets = new Set<NormalizationBucket>();
  const changes = diffLines(input, output);
  const diffHunks = changes.filter((c) => c.added || c.removed);

  for (const hunk of diffHunks) {
    const lines = hunk.value.split('\n').filter((l) => l !== '');
    if (lines.length === 0) {
      buckets.add('blank-line-change');
      continue;
    }
    if (lines.every(isTableAlignmentLine)) {
      buckets.add('table-alignment');
      continue;
    }
    // hunk has non-blank, non-table lines that changed — genuinely unexpected
    buckets.add('other');
  }

  return [...buckets];
}

function preview(markdown: string, limit = 140): string {
  const oneLine = markdown.replace(/\n/g, '↵');
  return oneLine.length > limit ? `${oneLine.slice(0, limit)}…` : oneLine;
}

class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state;
  }

  float(): number {
    return this.next() / 0x100000000;
  }

  int(minInclusive: number, maxExclusive: number): number {
    return minInclusive + Math.floor(this.float() * (maxExclusive - minInclusive));
  }

  chance(probability: number): boolean {
    return this.float() < probability;
  }

  pick<T>(values: T[]): T {
    return values[this.int(0, values.length)];
  }
}

const WORDS = [
  'deploy',
  'release',
  'cluster',
  'container',
  'service',
  'runtime',
  'gateway',
  'manifest',
  'pipeline',
  'artifact',
  'latency',
  'observability',
  'rollback',
  'monitor',
  'traffic',
  'staging',
  'production',
  'canary',
  'autoscale',
  'credential',
];

function title(rng: Rng, words = rng.int(2, 5)): string {
  const parts: string[] = [];
  for (let i = 0; i < words; i++) {
    const word = rng.pick(WORDS);
    parts.push(i === 0 ? word[0].toUpperCase() + word.slice(1) : word);
  }
  return parts.join(' ');
}

function inlineToken(rng: Rng): string {
  const word = rng.pick(WORDS);
  const style = rng.pick(['plain', 'bold', 'italic', 'code', 'link'] as const);
  if (style === 'bold') return `**${word}**`;
  if (style === 'italic') return `*${word}*`;
  if (style === 'code') return `\`${word}\``;
  if (style === 'link') return `[${word}](https://example.com/${word})`;
  return word;
}

function sentence(rng: Rng): string {
  const parts: string[] = [];
  const count = rng.int(4, 9);
  for (let i = 0; i < count; i++) parts.push(inlineToken(rng));
  const joined = parts.join(' ');
  return `${joined[0].toUpperCase() + joined.slice(1)}.`;
}

function generateSample(seed: number): string {
  const rng = new Rng(seed);
  const blocks: string[] = [];

  if (rng.chance(0.5)) {
    blocks.push(
      [
        '---',
        `title: ${title(rng)}`,
        `tags: [${rng.pick(WORDS)}, ${rng.pick(WORDS)}]`,
        `description: ${sentence(rng).replace(/\.$/, '')}`,
        '---',
      ].join('\n'),
    );
  }

  const blockCount = rng.int(3, 7);
  for (let i = 0; i < blockCount; i++) {
    const kind = rng.int(0, 7);
    if (kind === 0) {
      blocks.push(`${'#'.repeat(rng.int(1, 7))} ${title(rng)}`);
    } else if (kind === 1) {
      blocks.push(sentence(rng));
    } else if (kind === 2) {
      blocks.push([`- ${sentence(rng)}`, `- ${sentence(rng)}`].join('\n'));
    } else if (kind === 3) {
      blocks.push([`> ${sentence(rng)}`, `> ${sentence(rng)}`].join('\n'));
    } else if (kind === 4) {
      blocks.push(
        [
          '| Name | Value |',
          '| --- | --- |',
          `| ${rng.pick(WORDS)} | ${inlineToken(rng)} |`,
          `| ${rng.pick(WORDS)} | ${inlineToken(rng)} |`,
        ].join('\n'),
      );
    } else if (kind === 5) {
      blocks.push(['```ts', `const ${rng.pick(WORDS)} = "${rng.pick(WORDS)}";`, '```'].join('\n'));
    } else {
      blocks.push(
        [
          '```jsx-component',
          `<Callout type="${rng.pick(['info', 'warning', 'success'])}">`,
          `  ${sentence(rng)}`,
          '</Callout>',
          '```',
        ].join('\n'),
      );
    }
  }

  return blocks.join('\n\n');
}

const FIXTURES = [
  [
    '# Deployment Guide',
    '',
    '## Prerequisites',
    '',
    'You need **Docker** and `kubectl` installed.',
    '',
    '- Build the container image',
    '- Push to registry',
    '- Apply the Kubernetes manifests',
    '',
    '> Always deploy to staging first.',
  ].join('\n'),
  [
    '---',
    'title: Deployment Guide',
    'tags: [devops, infrastructure]',
    'description: How to deploy the application to production',
    '---',
    '',
    '# Deployment Guide',
    '',
    'See the [installation guide](https://example.com/install) for details.',
  ].join('\n'),
  [
    '# Deployment Guide',
    '',
    '```jsx-component',
    '<Callout type="warning">',
    '  Always run the integration tests before deploying to production.',
    '  Skipping tests has caused two incidents this quarter.',
    '</Callout>',
    '```',
  ].join('\n'),
];

describe('markdown boundary one-pass fidelity', () => {
  const fuzzCases = process.env.OK_FUZZ_CASES || 24;
  const timeoutMs = Number(fuzzCases) > 1000 ? 120_000 : 5_000;

  test(
    'reports exact-byte preservation across fixtures and a small fuzz sample',
    () => {
      const cases = [
        ...FIXTURES,
        ...Array.from({ length: fuzzCases }, (_, index) => generateSample(0x5eedc0de + index)),
      ];
      const examplesByBucket = new Map<
        NormalizationBucket,
        Array<{ index: number; input: string; output: string }>
      >([
        ['table-alignment', []],
        ['blank-line-change', []],
        ['other', []],
      ]);

      let exactMatches = 0;
      let normalized = 0;
      const bucketCounts = new Map<NormalizationBucket, number>([
        ['table-alignment', 0],
        ['blank-line-change', 0],
        ['other', 0],
      ]);

      cases.forEach((markdown, index) => {
        const output = canonicalizeMarkdown(markdown);
        if (output === markdown) {
          exactMatches++;
        } else {
          normalized++;
          for (const bucket of classifyNormalization(markdown, output)) {
            bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
            const bucketExamples = examplesByBucket.get(bucket);
            if (bucketExamples && bucketExamples.length < 3) {
              bucketExamples.push({ index, input: markdown, output });
            }
          }
        }
      });

      const tableExamples = examplesByBucket.get('table-alignment') ?? [];
      const blankLineExamples = examplesByBucket.get('blank-line-change') ?? [];
      const otherExamples = examplesByBucket.get('other') ?? [];

      console.log(
        [
          `Markdown fidelity: ${exactMatches}/${cases.length} exact`,
          `normalized: ${normalized}`,
          `table-alignment: ${bucketCounts.get('table-alignment')}`,
          `blank-line-change: ${bucketCounts.get('blank-line-change')}`,
          `other: ${bucketCounts.get('other')}`,
          tableExamples.length ? 'table-alignment examples:' : 'table-alignment examples: none',
          ...tableExamples.flatMap((example) => [
            `- case ${example.index}`,
            `  input: ${preview(example.input)}`,
            `  output: ${preview(example.output)}`,
          ]),
          blankLineExamples.length
            ? 'blank-line-change examples:'
            : 'blank-line-change examples: none',
          ...blankLineExamples.flatMap((example) => [
            `- case ${example.index}`,
            `  input: ${preview(example.input)}`,
            `  output: ${preview(example.output)}`,
          ]),
          otherExamples.length ? 'other examples:' : 'other examples: none',
          ...otherExamples.flatMap((example) => [
            `- case ${example.index}`,
            `  input: ${preview(example.input)}`,
            `  output: ${preview(example.output)}`,
          ]),
        ].join('\n'),
      );

      expect(cases.length).toBeGreaterThan(0);
    },
    timeoutMs,
  );
});
