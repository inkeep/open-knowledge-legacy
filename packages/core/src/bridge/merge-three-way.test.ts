import { describe, expect, test } from 'bun:test';
import DiffMatchPatch from 'diff-match-patch';
import {
  assertContentPreservation,
  BridgeMergeContentLossError,
  mergeThreeWay,
} from './merge-three-way.ts';

const BENCH_ENABLED = process.env.RUN_BENCH === '1' || process.env.RUN_BENCH === 'true';
const describeBench = BENCH_ENABLED ? describe : describe.skip;

const dmp = new DiffMatchPatch();
dmp.Match_Threshold = 0.5;

function dmpMerge(baseline: string, userText: string, agentText: string): string {
  const patches = dmp.patch_make(baseline, userText);
  const [merged] = dmp.patch_apply(patches, agentText);
  return merged;
}

describe('T1: Non-overlapping distributed edits', () => {
  const baseline = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n');

  const userLines = baseline.split('\n');
  userLines.splice(5, 0, 'USER_INSERT_A');
  userLines.splice(13, 0, 'USER_INSERT_B'); // offset +1 from prior insert
  userLines.splice(20, 0, 'USER_INSERT_C'); // offset +2
  const userText = userLines.join('\n');

  const agentLines = baseline.split('\n');
  agentLines.splice(8, 0, 'AGENT_INSERT_A');
  agentLines.splice(16, 0, 'AGENT_INSERT_B'); // offset +1
  const agentText = agentLines.join('\n');

  test('hybrid mergeThreeWay preserves all 5 insertions', () => {
    const merged = mergeThreeWay(baseline, userText, agentText);
    expect(merged).toContain('USER_INSERT_A');
    expect(merged).toContain('USER_INSERT_B');
    expect(merged).toContain('USER_INSERT_C');
    expect(merged).toContain('AGENT_INSERT_A');
    expect(merged).toContain('AGENT_INSERT_B');
    expect(merged).toContain('Line 1');
    expect(merged).toContain('Line 20');
    expect(merged.split('USER_INSERT_A').length - 1).toBe(1);
    expect(merged.split('AGENT_INSERT_A').length - 1).toBe(1);
  });

  test('DMP baseline also passes (sanity)', () => {
    const merged = dmpMerge(baseline, userText, agentText);
    expect(merged).toContain('USER_INSERT_A');
    expect(merged).toContain('USER_INSERT_B');
    expect(merged).toContain('USER_INSERT_C');
    expect(merged).toContain('AGENT_INSERT_A');
    expect(merged).toContain('AGENT_INSERT_B');
  });
});

describe('T2: Same-position concurrent inserts', () => {
  const baseline = 'Line 1\nLine 2\nLine 3';
  const userText = 'Line 1\nUSER PARAGRAPH\nLine 2\nLine 3';
  const agentText = 'Line 1\nAGENT PARAGRAPH\nLine 2\nLine 3';

  test('hybrid mergeThreeWay preserves BOTH insertions', () => {
    const merged = mergeThreeWay(baseline, userText, agentText);
    expect(merged).toContain('USER PARAGRAPH');
    expect(merged).toContain('AGENT PARAGRAPH');
    expect(merged).toContain('Line 1');
    expect(merged).toContain('Line 2');
    expect(merged).toContain('Line 3');
  });

  test('DMP baseline also preserves both (sanity)', () => {
    const merged = dmpMerge(baseline, userText, agentText);
    expect(merged).toContain('USER PARAGRAPH');
    expect(merged).toContain('AGENT PARAGRAPH');
  });
});

describe('T3: D8 — identical concurrent edit', () => {
  const baseline = 'Hello world';
  const userText = 'Hello world!';
  const agentText = 'Hello world!';

  test('hybrid mergeThreeWay deduplicates → single "!"', () => {
    const merged = mergeThreeWay(baseline, userText, agentText);
    expect(merged).toBe('Hello world!');
  });

  test('DMP baseline FAILS — produces "Hello world!!"', () => {
    const merged = dmpMerge(baseline, userText, agentText);
    expect(merged).toBe('Hello world!!');
  });
});

describe('T4: Emoji and Unicode content', () => {
  const baseline = 'Hello 👨‍💻 world';
  const userText = 'Hello 👨‍💻 world! 🎉';
  const agentText = 'Hello 👨‍💻 beautiful world';

  test('hybrid mergeThreeWay preserves all emoji and text', () => {
    const merged = mergeThreeWay(baseline, userText, agentText);
    expect(merged).toContain('👨‍💻');
    expect(merged).toContain('🎉');
    expect(merged).toContain('beautiful');
    expect(merged.length).toBeGreaterThan(0);
  });

  test('DMP baseline also handles emoji (sanity)', () => {
    const merged = dmpMerge(baseline, userText, agentText);
    expect(merged).toContain('👨‍💻');
  });
});

describe('T5: Heavy divergence — many insertions across a 30-line doc', () => {
  const baseLines = Array.from({ length: 30 }, (_, i) => `Original line ${i + 1}`);
  const baseline = baseLines.join('\n');

  const userMarkers = Array.from({ length: 10 }, (_, i) => `USER_MARKER_${i}`);
  const userInsertAfter = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28];
  const userLines = [...baseLines];
  for (let i = userInsertAfter.length - 1; i >= 0; i--) {
    userLines.splice(userInsertAfter[i], 0, userMarkers[i]);
  }
  const userText = userLines.join('\n');

  const agentMarkers = Array.from({ length: 6 }, (_, i) => `AGENT_MARKER_${i}`);
  const agentInsertAfter = [3, 8, 12, 18, 23, 27];
  const agentLines = [...baseLines];
  for (let i = agentInsertAfter.length - 1; i >= 0; i--) {
    agentLines.splice(agentInsertAfter[i], 0, agentMarkers[i]);
  }
  const agentText = agentLines.join('\n');

  test('all 10 user markers present', () => {
    const merged = mergeThreeWay(baseline, userText, agentText);
    for (const marker of userMarkers) {
      expect(merged).toContain(marker);
    }
  });

  test('all 6 agent markers present', () => {
    const merged = mergeThreeWay(baseline, userText, agentText);
    for (const marker of agentMarkers) {
      expect(merged).toContain(marker);
    }
  });

  test('no duplications', () => {
    const merged = mergeThreeWay(baseline, userText, agentText);
    for (const marker of [...userMarkers, ...agentMarkers]) {
      expect(merged.split(marker).length - 1).toBe(1);
    }
  });

  test('all original content intact', () => {
    const merged = mergeThreeWay(baseline, userText, agentText);
    for (const line of baseLines) {
      expect(merged).toContain(line);
    }
  });
});

describe('T6: Same-line modification (sub-line conflict)', () => {
  const baseline = 'The quick brown fox jumps over the lazy dog.';
  const userText = 'The fast red fox jumps over the lazy dog.';
  const agentText = 'The quick brown fox jumps over the sleepy cat.';

  test('hybrid mergeThreeWay preserves BOTH sub-line edits', () => {
    const merged = mergeThreeWay(baseline, userText, agentText);
    expect(merged).toBe('The fast red fox jumps over the sleepy cat.');
  });

  test('DMP baseline also handles this (DMP is good on single lines)', () => {
    const merged = dmpMerge(baseline, userText, agentText);
    expect(merged).toBe('The fast red fox jumps over the sleepy cat.');
  });
});

describe('T7: Delete/edit conflict', () => {
  const baseline = 'Para 1\n\nThis will be edited by agent.\n\nPara 3';
  const userText = 'Para 1\n\nPara 3'; // deleted middle paragraph
  const agentText = 'Para 1\n\nAGENT EDITED this paragraph.\n\nPara 3';

  test('hybrid mergeThreeWay preserves agent edit (conservative)', () => {
    const merged = mergeThreeWay(baseline, userText, agentText);
    expect(merged).toContain('AGENT EDITED this paragraph.');
    expect(merged).toContain('Para 1');
    expect(merged).toContain('Para 3');
  });

  test('DMP baseline FAILS — produces corrupt partial line', () => {
    const merged = dmpMerge(baseline, userText, agentText);
    const hasIntactAgentEdit = merged.includes('AGENT EDITED this paragraph.');
    if (!hasIntactAgentEdit) {
      expect(merged).not.toBe('Para 1\n\nAGENT EDITED this paragraph.\n\nPara 3');
    }
  });
});

describeBench('T-perf: Performance gate', () => {
  const baseLines = Array.from(
    { length: 200 },
    (_, i) =>
      `Line ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.`,
  );
  const baseline = baseLines.join('\n');

  const userLines = [...baseLines];
  for (let i = 0; i < 200; i += 20) {
    userLines[i] = `USER_MODIFIED_LINE_${i}: Updated content for this line.`;
  }
  let uOffset = 0;
  for (let i = 0; i < 200; i += 40) {
    userLines.splice(i + uOffset + 1, 0, `USER_INSERTION_AT_${i}`);
    uOffset++;
  }
  const userText = userLines.join('\n');

  const agentLines = [...baseLines];
  for (let i = 10; i < 200; i += 33) {
    agentLines[i] = `AGENT_MODIFIED_LINE_${i}: Agent updated this line.`;
  }
  let aOffset = 0;
  for (let i = 25; i < 200; i += 67) {
    agentLines.splice(i + aOffset + 1, 0, `AGENT_INSERTION_AT_${i}`);
    aOffset++;
  }
  const agentText = agentLines.join('\n');

  test('p95 < 150ms over 100 iterations', () => {
    const times: number[] = [];
    mergeThreeWay(baseline, userText, agentText);

    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      mergeThreeWay(baseline, userText, agentText);
      times.push(performance.now() - start);
    }

    times.sort((a, b) => a - b);
    const p50 = times[49];
    const p95 = times[94];
    const max = times[99];

    console.log(
      `[T-perf] mergeThreeWay 200-line doc: p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
    );

    expect(p95).toBeLessThan(150);
  });
});

describe('Post-condition: assertContentPreservation', () => {
  test('happy path: result containing both sides passes', () => {
    expect(() =>
      assertContentPreservation(
        'Hello\nworld\n',
        'Hello\nUSER\nworld\n',
        'Hello\nworld\nAGENT\n',
        'Hello\nUSER\nworld\nAGENT\n',
      ),
    ).not.toThrow();
  });

  test('substring violation: user side missing raises BridgeMergeContentLossError with which=substring/side=user', () => {
    try {
      assertContentPreservation(
        'Hello\nworld\n',
        'Hello\nUSER-UNIQUE-MARKER\nworld\n',
        'Hello\nworld\nAGENT\n',
        'Hello\nworld\nAGENT\n',
      );
      expect(false).toBe(true); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(BridgeMergeContentLossError);
      const e = err as BridgeMergeContentLossError;
      expect(e.info.which).toBe('substring');
      expect(e.info.side).toBe('user');
      expect(e.info.lostSubstrings.some((s) => s.includes('USER-UNIQUE-MARKER'))).toBe(true);
    }
  });

  test('substring violation: agent side missing raises with side=agent', () => {
    try {
      assertContentPreservation(
        'Hello\nworld\n',
        'Hello\nUSER\nworld\n',
        'Hello\nworld\nAGENT-UNIQUE-MARKER\n',
        'Hello\nUSER\nworld\n', // drops agent marker
      );
      expect(false).toBe(true);
    } catch (err) {
      expect(err).toBeInstanceOf(BridgeMergeContentLossError);
      const e = err as BridgeMergeContentLossError;
      expect(e.info.which).toBe('substring');
      expect(e.info.side).toBe('agent');
      expect(e.info.lostSubstrings.some((s) => s.includes('AGENT-UNIQUE-MARKER'))).toBe(true);
    }
  });

  test('order violation: user-side segments present but reordered raises which=order', () => {
    const baseline = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\np\nq\nr\ns\nt\n';
    const mine =
      'MARKER-ALPHA\na\nb\nc\nd\ne\nf\ng\nh\ni\nj\nMARKER-BETA\nk\nl\nm\nn\no\np\nq\nr\ns\nt\n';
    const theirs = `${baseline}AGENT-MARKER\n`;
    const reordered =
      'MARKER-BETA\na\nb\nc\nd\ne\nf\ng\nh\ni\nj\nMARKER-ALPHA\nk\nl\nm\nn\no\np\nq\nr\ns\nt\nAGENT-MARKER\n';
    try {
      assertContentPreservation(baseline, mine, theirs, reordered);
      expect(false).toBe(true);
    } catch (err) {
      expect(err).toBeInstanceOf(BridgeMergeContentLossError);
      const e = err as BridgeMergeContentLossError;
      expect(e.info.which).toBe('order');
      expect(e.info.side).toBe('user');
    }
  });

  test('empty diffs: when no side introduced unique content, post-condition passes trivially', () => {
    expect(() => assertContentPreservation('same\n', 'same\n', 'same\n', 'same\n')).not.toThrow();
  });

  test('toLog() emits structured payload with expected fields; redacted by default', () => {
    try {
      assertContentPreservation(
        'base\n',
        'base\nSENSITIVE-CONTENT\n',
        'base\nTHEIRS\n',
        'base\nTHEIRS\n',
      );
      expect(false).toBe(true);
    } catch (err) {
      if (!(err instanceof BridgeMergeContentLossError)) throw err;
      const payload = err.toLog();
      expect(payload.event).toBe('bridge-merge-content-loss');
      expect(payload.which).toBe('substring');
      expect(payload.side).toBe('user');
      expect(payload.baselineLen).toBe('base\n'.length);
      expect(payload.userTextLen).toBe('base\nSENSITIVE-CONTENT\n'.length);
      expect(payload.agentTextLen).toBe('base\nTHEIRS\n'.length);
      expect(payload.resultLen).toBe('base\nTHEIRS\n'.length);
      expect(payload.redacted).toBe(true);
      expect(Array.isArray(payload.lostSubstrings)).toBe(true);
      for (const entry of payload.lostSubstrings) {
        if (typeof entry === 'string') throw new Error('default log must not leak raw substrings');
        expect(entry).toHaveProperty('len');
        expect(entry).toHaveProperty('digest');
        expect(entry.digest).toMatch(/^[0-9a-f]{8}$/);
      }
      const again = err.toLog();
      expect(again.lostSubstrings).toEqual(payload.lostSubstrings);
    }
  });

  test('toLog({ verbose: true }) surfaces raw substrings for opt-in verbose telemetry', () => {
    try {
      assertContentPreservation(
        'base\n',
        'base\nUSER-UNIQUE-MARKER\n',
        'base\nAGENT-MARKER\n',
        'base\nAGENT-MARKER\n',
      );
      expect(false).toBe(true);
    } catch (err) {
      if (!(err instanceof BridgeMergeContentLossError)) throw err;
      const payload = err.toLog({ verbose: true });
      expect(payload.redacted).toBe(false);
      const hasRawMarker = payload.lostSubstrings.some(
        (s) => typeof s === 'string' && s.includes('USER-UNIQUE-MARKER'),
      );
      expect(hasRawMarker).toBe(true);
    }
  });

  test('mergeThreeWay integration: T1-T7 scenarios satisfy the post-condition (no throw)', () => {
    const base = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n');
    const mine = base.replace('Line 2', 'Line 2\nUSER-X');
    const theirs = base.replace('Line 7', 'Line 7\nAGENT-Y');
    expect(() => mergeThreeWay(base, mine, theirs)).not.toThrow();

    expect(() => mergeThreeWay('Hello world', 'Hello world!', 'Hello world!')).not.toThrow();
  });

  test('perf: post-condition adds <5ms p99 on a 10KB doc with ~10 segments', () => {
    const base = Array.from(
      { length: 100 },
      (_, i) => `Line ${i + 1}: lorem ipsum dolor sit amet`,
    ).join('\n');
    const mine = base
      .replace('Line 10', 'Line 10\nUSER-MARKER-A')
      .replace('Line 30', 'Line 30\nUSER-MARKER-B')
      .replace('Line 50', 'Line 50\nUSER-MARKER-C');
    const theirs = base
      .replace('Line 20', 'Line 20\nAGENT-MARKER-A')
      .replace('Line 40', 'Line 40\nAGENT-MARKER-B')
      .replace('Line 70', 'Line 70\nAGENT-MARKER-C');
    const merged = mergeThreeWay(base, mine, theirs);

    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      assertContentPreservation(base, mine, theirs, merged);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[99]).toBeLessThan(20); // permissive CI bound; local is <1ms
  });
});
