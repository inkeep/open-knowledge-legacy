import { describe, expect, test } from 'bun:test';
import { canonicalizeMarkdown, structuralSignature } from './markdown.test-helpers';

const BASE_SEED = 0x5eedc0de;
const DEFAULT_CASES = 120;

type BlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'blockquote'
  | 'table'
  | 'code-fence'
  | 'jsx-component';

type FeatureType =
  | 'frontmatter'
  | 'empty-body'
  | 'small-doc'
  | 'nested-list'
  | 'deep-blockquote'
  | 'tricky-inline';

type FeatureTracker = Set<FeatureType>;

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

function fuzzCaseCount(): number {
  const fromEnv = Number.parseInt(process.env.OK_FUZZ_CASES ?? '', 10);
  if (!Number.isFinite(fromEnv) || fromEnv <= 0) return DEFAULT_CASES;
  return fromEnv;
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

const TRICKY_INLINE = [
  'pipe \\| character',
  'angle <tag> marker',
  'escaped \\*literal\\* emphasis',
  'escaped \\`backtick\\` text',
  'greater > than sign',
];

function title(rng: Rng, words = rng.int(2, 5)): string {
  const parts: string[] = [];
  for (let i = 0; i < words; i++) {
    const word = rng.pick(WORDS);
    parts.push(i === 0 ? word[0].toUpperCase() + word.slice(1) : word);
  }
  return parts.join(' ');
}

function codeSpan(value: string): string {
  return value.includes('`') ? `\`\`${value}\`\`` : `\`${value}\``;
}

function inlineToken(
  rng: Rng,
  features: FeatureTracker,
  opts: { allowPipe: boolean } = { allowPipe: true },
): string {
  const word = rng.pick(WORDS);
  const style = rng.pick(['plain', 'bold', 'italic', 'code', 'link', 'tricky'] as const);
  if (style === 'bold') return `**${word}**`;
  if (style === 'italic') return `*${word}*`;
  if (style === 'code') return codeSpan(word);
  if (style === 'link') return `[${word}](https://example.com/${word})`;
  if (style === 'tricky') {
    const tricky = rng.pick(TRICKY_INLINE);
    if (!opts.allowPipe && tricky.includes('|')) return `**${word}**`;
    features.add('tricky-inline');
    return tricky;
  }
  return word;
}

function sentence(rng: Rng, features: FeatureTracker): string {
  const parts: string[] = [];
  const count = rng.int(5, 11);
  for (let i = 0; i < count; i++) parts.push(inlineToken(rng, features));
  const joined = parts.join(' ');
  return `${joined[0].toUpperCase() + joined.slice(1)}.`;
}

function blockHeading(rng: Rng): string {
  const level = rng.int(1, 7);
  return `${'#'.repeat(level)} ${title(rng)}`;
}

function blockParagraph(rng: Rng, features: FeatureTracker): string {
  const lines = rng.int(1, 3);
  const out: string[] = [];
  for (let i = 0; i < lines; i++) out.push(sentence(rng, features));
  return out.join(' ');
}

function blockList(rng: Rng, features: FeatureTracker): string {
  const ordered = rng.chance(0.45);
  const count = rng.int(2, 6);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const marker = ordered ? `${i + 1}.` : '-';
    out.push(`${marker} ${sentence(rng, features)}`);
    if (rng.chance(0.35)) {
      const nestedCount = rng.int(1, 3);
      for (let nested = 0; nested < nestedCount; nested++) {
        const nestedMarker = rng.chance(0.5) ? '-' : `${nested + 1}.`;
        out.push(`  ${nestedMarker} ${sentence(rng, features)}`);
      }
      features.add('nested-list');
    }
  }
  return out.join('\n');
}

function blockquote(rng: Rng, features: FeatureTracker): string {
  const count = rng.int(1, 4);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`> ${sentence(rng, features)}`);
    if (rng.chance(0.35)) {
      out.push(`>> ${sentence(rng, features)}`);
      features.add('deep-blockquote');
    }
  }
  return out.join('\n');
}

function table(rng: Rng, features: FeatureTracker): string {
  const cols = rng.int(2, 4);
  const rows = rng.int(1, 4);
  const header: string[] = [];
  for (let i = 0; i < cols; i++) header.push(title(rng, 1));
  const lines = [`| ${header.join(' | ')} |`, `| ${new Array(cols).fill('---').join(' | ')} |`];

  for (let row = 0; row < rows; row++) {
    const cells: string[] = [];
    for (let col = 0; col < cols; col++)
      cells.push(inlineToken(rng, features, { allowPipe: false }));
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function codeFence(rng: Rng): string {
  const language = rng.pick(['ts', 'bash', 'json']);
  if (language === 'bash') {
    return ['```bash', `echo "${rng.pick(WORDS)}-${rng.pick(WORDS)}"`, '```'].join('\n');
  }
  if (language === 'json') {
    return [
      '```json',
      '{',
      `  "service": "${rng.pick(WORDS)}",`,
      `  "stage": "${rng.pick(['dev', 'staging', 'prod'])}"`,
      '}',
      '```',
    ].join('\n');
  }
  return [
    '```ts',
    `const ${rng.pick(WORDS)} = "${rng.pick(WORDS)}";`,
    `console.log(${rng.pick(WORDS)});`,
    '```',
  ].join('\n');
}

function jsxComponentFence(rng: Rng, features: FeatureTracker): string {
  return [
    '```jsx-component',
    `<Callout type="${rng.pick(['info', 'warning', 'success'])}">`,
    `  ${sentence(rng, features)}`,
    `  ${codeSpan(`value\`${rng.pick(WORDS)}`)}   `,
    '   ',
    `  ${sentence(rng, features)}`,
    '</Callout>',
    '```',
  ].join('\n');
}

function frontmatter(rng: Rng): string {
  return [
    '---',
    `title: ${title(rng)}`,
    `tags: [${rng.pick(WORDS)}, ${rng.pick(WORDS)}]`,
    `description: ${sentence(rng, new Set()).replace(/\.$/, '')}`,
    '---',
  ].join('\n');
}

function generateDocument(seed: number): {
  markdown: string;
  used: Set<BlockType>;
  features: FeatureTracker;
} {
  const rng = new Rng(seed);
  const blocks: string[] = [];
  const used = new Set<BlockType>();
  const features: FeatureTracker = new Set();

  if (rng.chance(0.45)) {
    blocks.push(frontmatter(rng));
    features.add('frontmatter');
  }

  const blockCount = rng.int(0, 8);
  if (blockCount <= 2) features.add('small-doc');
  const blockTypes: BlockType[] = [
    'heading',
    'paragraph',
    'list',
    'blockquote',
    'table',
    'code-fence',
    'jsx-component',
  ];

  if (blockCount === 0 && blocks.length === 0) {
    features.add('empty-body');
    return { markdown: '', used, features };
  }

  for (let i = 0; i < blockCount; i++) {
    const type = rng.pick(blockTypes);
    used.add(type);
    if (type === 'heading') blocks.push(blockHeading(rng));
    else if (type === 'paragraph') blocks.push(blockParagraph(rng, features));
    else if (type === 'list') blocks.push(blockList(rng, features));
    else if (type === 'blockquote') blocks.push(blockquote(rng, features));
    else if (type === 'table') blocks.push(table(rng, features));
    else if (type === 'code-fence') blocks.push(codeFence(rng));
    else blocks.push(jsxComponentFence(rng, features));
  }

  const markdown = blocks.join('\n\n');
  if (!markdown) features.add('empty-body');
  return { markdown, used, features };
}

function assertConverges(seed: number, markdown: string): void {
  let once: string;
  try {
    once = canonicalizeMarkdown(markdown);
  } catch (error) {
    throw new Error(
      [
        `Seed ${seed} failed during canonicalize(input).`,
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        '',
        'Input markdown:',
        markdown,
      ].join('\n'),
    );
  }

  let twice: string;
  try {
    twice = canonicalizeMarkdown(once);
  } catch (error) {
    throw new Error(
      [
        `Seed ${seed} failed during canonicalize(canonical).`,
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        '',
        'Input markdown:',
        markdown,
        '',
        'First canonicalized markdown:',
        once,
      ].join('\n'),
    );
  }

  if (twice !== once) {
    throw new Error(
      [
        `Seed ${seed} produced non-idempotent canonical output.`,
        '',
        'Input markdown:',
        markdown,
        '',
        'First canonicalized markdown:',
        once,
        '',
        'Second canonicalized markdown:',
        twice,
      ].join('\n'),
    );
  }

  const before = structuralSignature(markdown);
  const after = structuralSignature(once);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(
      [
        `Seed ${seed} changed structural signature after canonicalization.`,
        '',
        `Before: ${JSON.stringify(before)}`,
        `After:  ${JSON.stringify(after)}`,
        '',
        'Input markdown:',
        markdown,
        '',
        'Canonicalized markdown:',
        once,
      ].join('\n'),
    );
  }
}

function directedRiskyCases(): Array<{
  name: string;
  markdown: string;
  used: BlockType[];
  features: FeatureType[];
}> {
  return [
    {
      name: 'frontmatter-only',
      markdown: ['---', 'title: Frontmatter Only', 'tags: [ops]', '---'].join('\n'),
      used: [],
      features: ['frontmatter', 'small-doc'],
    },
    {
      name: 'empty-body',
      markdown: '',
      used: [],
      features: ['empty-body', 'small-doc'],
    },
    {
      name: 'nested-list',
      markdown: [
        '- parent item',
        '  - child item one',
        '  - child item two',
        '- parent item two',
      ].join('\n'),
      used: ['list'],
      features: ['nested-list'],
    },
    {
      name: 'deep-blockquote',
      markdown: ['> outer quote', '>> second level quote'].join('\n'),
      used: ['blockquote'],
      features: ['deep-blockquote'],
    },
    {
      name: 'table-inline-formatting',
      markdown: [
        '| Name | Value |',
        '| --- | --- |',
        '| service | **critical** |',
        '| pipeline | `deploy` |',
      ].join('\n'),
      used: ['table'],
      features: [],
    },
    {
      name: 'small-heading',
      markdown: '###### Tiny heading',
      used: ['heading'],
      features: ['small-doc'],
    },
    {
      name: 'tricky-inline',
      markdown: 'Escaped \\`backtick\\` text with pipe \\| character and angle <tag> marker.',
      used: ['paragraph'],
      features: ['tricky-inline', 'small-doc'],
    },
  ];
}

describe('markdown boundary fuzz idempotence + shape', () => {
  const cases = fuzzCaseCount();
  test(
    'seeded supported-markdown docs converge and preserve structural signature',
    () => {
      const coverage = new Map<BlockType, number>([
        ['heading', 0],
        ['paragraph', 0],
        ['list', 0],
        ['blockquote', 0],
        ['table', 0],
        ['code-fence', 0],
        ['jsx-component', 0],
      ]);
      const featureCoverage = new Map<FeatureType, number>([
        ['frontmatter', 0],
        ['empty-body', 0],
        ['small-doc', 0],
        ['nested-list', 0],
        ['deep-blockquote', 0],
        ['tricky-inline', 0],
      ]);

      const uniqueMarkdowns = new Set<string>();

      const directed = directedRiskyCases();
      for (const [index, sample] of directed.entries()) {
        const seed = BASE_SEED - 1000 - index;
        uniqueMarkdowns.add(sample.markdown);
        for (const type of sample.used) coverage.set(type, (coverage.get(type) ?? 0) + 1);
        for (const feature of sample.features) {
          featureCoverage.set(feature, (featureCoverage.get(feature) ?? 0) + 1);
        }
        assertConverges(seed, sample.markdown);
      }

      for (let index = 0; index < cases; index++) {
        const seed = BASE_SEED + index;
        const { markdown, used, features } = generateDocument(seed);
        uniqueMarkdowns.add(markdown);
        for (const type of used) coverage.set(type, (coverage.get(type) ?? 0) + 1);
        for (const feature of features) {
          featureCoverage.set(feature, (featureCoverage.get(feature) ?? 0) + 1);
        }
        assertConverges(seed, markdown);
      }

      console.log(
        `Fuzz: ${uniqueMarkdowns.size} unique documents out of ${cases + directed.length} cases (${cases + directed.length - uniqueMarkdowns.size} duplicates)`,
      );

      for (const count of coverage.values()) {
        expect(count).toBeGreaterThan(0);
      }
      for (const count of featureCoverage.values()) {
        expect(count).toBeGreaterThan(0);
      }
    },
    Number(cases) > 1000 ? 120_000 : 5_000,
  );
});
