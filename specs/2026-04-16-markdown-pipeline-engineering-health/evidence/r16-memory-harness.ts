/**
 * R16 per-MarkdownManager heap-footprint harness.
 *
 * Methodology:
 *   1. Measure baseline heapUsed + RSS after warm-up parses on a sentinel manager
 *      that is then discarded (brings unified/remark internals into cache).
 *   2. Construct N=1 and N=10 MarkdownManagers, retain them in a live array,
 *      Bun.gc(true) between construction and measurement, snapshot delta.
 *   3. Run 1000 parse cycles on one manager (no retention of results), measure
 *      drift — stable heap = no leak; monotonic growth = leak signal.
 *
 * Output: one structured block per measurement to stdout. Copied into
 * evidence/r16-memory.md.
 *
 * Run: bun run specs/2026-04-16-markdown-pipeline-engineering-health/evidence/r16-memory-harness.ts
 */
import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';

const WARMUP_PARSES = 200;
const LEAK_CHECK_PARSES = 1000;
const LEAK_CHECK_SAMPLE_EVERY = 100;

const corpus = `# Heading

Paragraph with **bold** and *em* and \`code\` and [link](http://e.com).

- one
- two
- three with **nested** bold

\`\`\`ts
const x: number = 42;
function f() { return x; }
\`\`\`

| a | b | c |
| - | - | - |
| 1 | 2 | 3 |
| 4 | 5 | 6 |

> A blockquote with [[WikiLink]] and more text.

<Component prop="val">children</Component>
`;

interface MemSnapshot {
  label: string;
  heapUsedMb: number;
  rssMb: number;
  note?: string;
}

function snapshot(label: string, note?: string): MemSnapshot {
  Bun.gc(true);
  const m = process.memoryUsage();
  return {
    label,
    heapUsedMb: round(m.heapUsed / 1024 / 1024),
    rssMb: round(m.rss / 1024 / 1024),
    note,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function diff(a: MemSnapshot, b: MemSnapshot): { heapDelta: number; rssDelta: number } {
  return {
    heapDelta: round(b.heapUsedMb - a.heapUsedMb),
    rssDelta: round(b.rssMb - a.rssMb),
  };
}

function main() {
  const results: MemSnapshot[] = [];
  const diffs: Array<{ from: string; to: string; heapDelta: number; rssDelta: number }> = [];

  // ── Phase 1: warm-up + baseline ─────────────────────────────────────────
  {
    const warmup = new MarkdownManager({ extensions: sharedExtensions });
    for (let i = 0; i < WARMUP_PARSES; i++) warmup.parse(corpus);
  }
  const baseline = snapshot('baseline', 'post-warmup, after discarding warmup manager');
  results.push(baseline);

  // ── Phase 2: one MarkdownManager ────────────────────────────────────────
  const single: MarkdownManager[] = [];
  single.push(new MarkdownManager({ extensions: sharedExtensions }));
  // Do a parse + serialize to force lazy init (if any).
  for (let i = 0; i < 5; i++) {
    const json = single[0].parse(corpus);
    single[0].serialize(json);
  }
  const onePost = snapshot('N=1 manager', 'after construction + 5 warmup cycles');
  results.push(onePost);
  diffs.push({
    from: baseline.label,
    to: onePost.label,
    ...diff(baseline, onePost),
  });

  // ── Phase 3: ten MarkdownManagers ───────────────────────────────────────
  const ten: MarkdownManager[] = [single[0]];
  for (let i = 0; i < 9; i++) {
    const m = new MarkdownManager({ extensions: sharedExtensions });
    for (let j = 0; j < 5; j++) {
      const json = m.parse(corpus);
      m.serialize(json);
    }
    ten.push(m);
  }
  const tenPost = snapshot('N=10 managers', 'each with 5 warmup cycles');
  results.push(tenPost);
  diffs.push({
    from: onePost.label,
    to: tenPost.label,
    ...diff(onePost, tenPost),
  });

  // ── Phase 4: leak check on single manager ───────────────────────────────
  // Release the 10-manager array except the first so heap reflects only one live manager.
  ten.length = 1;
  const leakStart = snapshot('leak-check start', '1 manager retained, 9 released');
  results.push(leakStart);

  const leakSamples: MemSnapshot[] = [];
  for (let i = 0; i < LEAK_CHECK_PARSES; i++) {
    const json = ten[0].parse(corpus);
    ten[0].serialize(json);
    if ((i + 1) % LEAK_CHECK_SAMPLE_EVERY === 0) {
      leakSamples.push(snapshot(`leak @ ${i + 1}`));
    }
  }

  const leakEnd = snapshot('leak-check end', `after ${LEAK_CHECK_PARSES} parse+serialize cycles`);
  results.push(leakEnd);
  diffs.push({
    from: leakStart.label,
    to: leakEnd.label,
    ...diff(leakStart, leakEnd),
  });

  // ── Report ──────────────────────────────────────────────────────────────
  console.log('');
  console.log('# R16 Memory Harness');
  console.log('');
  console.log(`Bun version: ${process.versions.bun}`);
  console.log(`Platform:    ${process.platform} ${process.arch}`);
  console.log(`Warmup parses: ${WARMUP_PARSES}`);
  console.log(`Leak-check parses: ${LEAK_CHECK_PARSES}`);
  console.log('');
  console.log('## Snapshots');
  console.log('');
  console.log('| Label | heapUsed (MB) | RSS (MB) | Note |');
  console.log('|-------|--------------:|---------:|------|');
  for (const r of results) {
    console.log(
      `| ${r.label} | ${r.heapUsedMb} | ${r.rssMb} | ${r.note ?? ''} |`,
    );
  }
  console.log('');
  console.log('## Leak-check trajectory (every 100 parses, 1 manager retained)');
  console.log('');
  console.log('| Sample | heapUsed (MB) | RSS (MB) |');
  console.log('|--------|--------------:|---------:|');
  for (const s of leakSamples) {
    console.log(`| ${s.label} | ${s.heapUsedMb} | ${s.rssMb} |`);
  }
  console.log('');
  console.log('## Deltas');
  console.log('');
  console.log('| From → To | heap Δ (MB) | RSS Δ (MB) | Per-instance heap Δ |');
  console.log('|-----------|------------:|-----------:|--------------------:|');
  for (const d of diffs) {
    let perInstance = '';
    if (d.from === 'N=1 manager' && d.to === 'N=10 managers') {
      perInstance = `${round(d.heapDelta / 9)} (9 new managers)`;
    }
    console.log(
      `| ${d.from} → ${d.to} | ${d.heapDelta} | ${d.rssDelta} | ${perInstance} |`,
    );
  }
  console.log('');
}

main();
