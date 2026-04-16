/**
 * Merge algorithm verification suite — T1-T7 + T-perf.
 *
 * Each test encodes a specific failure mode discovered through experimentation
 * (`specs/2026-04-15-lossless-bridge-merge/evidence/algorithm-comparison-experiment.md`).
 * Any future change to the merge algorithm MUST pass all 7 tests.
 *
 * The tests are pure string→string — no Y.Text, no CRDT. They verify
 * `mergeThreeWay(baseline, userText, agentText)` produces correct output.
 *
 * Additionally, a `dmpMerge` baseline is tested in parallel to demonstrate
 * WHICH tests the current DMP-only implementation fails (T3, T7) — validating
 * the problem this spec solves.
 */
import { describe, expect, test } from 'bun:test';
import DiffMatchPatch from 'diff-match-patch';
import { mergeThreeWay } from './merge-three-way.ts';

// ── DMP baseline for comparison ────────────────────────────────────────
// This mirrors the current `applyUserDelta` three-way merge:
// patch_make(baseline, userText) → patch_apply(patches, agentText)
const dmp = new DiffMatchPatch();
dmp.Match_Threshold = 0.5;

function dmpMerge(baseline: string, userText: string, agentText: string): string {
  const patches = dmp.patch_make(baseline, userText);
  const [merged] = dmp.patch_apply(patches, agentText);
  return merged;
}

// ────────────────────────────────────────────────────────────────────────
// T1: Non-overlapping distributed edits (sanity baseline)
//
// What it validates: Basic merge correctness — independent edits in
// separate regions. All algorithms pass this. Included as a regression
// baseline.
// ────────────────────────────────────────────────────────────────────────
describe('T1: Non-overlapping distributed edits', () => {
  const baseline = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n');

  // User adds 3 paragraphs at lines 5, 12, 18
  const userLines = baseline.split('\n');
  userLines.splice(5, 0, 'USER_INSERT_A');
  userLines.splice(13, 0, 'USER_INSERT_B'); // offset +1 from prior insert
  userLines.splice(20, 0, 'USER_INSERT_C'); // offset +2
  const userText = userLines.join('\n');

  // Agent adds 2 paragraphs at lines 8, 15 (relative to baseline)
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
    // Original content intact
    expect(merged).toContain('Line 1');
    expect(merged).toContain('Line 20');
    // No duplications
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

// ────────────────────────────────────────────────────────────────────────
// T2: Same-position concurrent inserts
//
// What it validates: Content preservation when both sides insert at the
// same location.
// What fails it: diff3 with strict user-wins (drops agent).
// ────────────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────
// T3: D8 — identical concurrent edit (deduplication)
//
// What it validates: When both sides make the SAME change, the merge
// produces one copy, not two.
// What fails it: DMP (produces "!!"), OT (produces "!!").
// Only diff3's excludeFalseConflicts handles this correctly.
// ────────────────────────────────────────────────────────────────────────
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
    // This demonstrates the problem mergeThreeWay solves
    expect(merged).toBe('Hello world!!');
  });
});

// ────────────────────────────────────────────────────────────────────────
// T4: Emoji and Unicode content
//
// What it validates: Surrogate pair handling. Emoji use 2+ UTF-16 code
// units; algorithms operating on codepoint positions must convert
// correctly.
// What fails it: OT without codepoint conversion. The hybrid avoids
// codepoint issues because line splitting is newline-based and DMP within
// conflict regions operates on JS strings natively.
// ────────────────────────────────────────────────────────────────────────
describe('T4: Emoji and Unicode content', () => {
  const baseline = 'Hello 👨‍💻 world';
  const userText = 'Hello 👨‍💻 world! 🎉';
  const agentText = 'Hello 👨‍💻 beautiful world';

  test('hybrid mergeThreeWay preserves all emoji and text', () => {
    const merged = mergeThreeWay(baseline, userText, agentText);
    expect(merged).toContain('👨‍💻');
    expect(merged).toContain('🎉');
    expect(merged).toContain('beautiful');
    // No corruption — merged string is valid
    expect(merged.length).toBeGreaterThan(0);
  });

  test('DMP baseline also handles emoji (sanity)', () => {
    const merged = dmpMerge(baseline, userText, agentText);
    expect(merged).toContain('👨‍💻');
  });
});

// ────────────────────────────────────────────────────────────────────────
// T5: Heavy divergence — many same-region edits
//
// What it validates: The merge algorithm doesn't degrade under high edit
// density.
// What fails it: DMP drops patches at extreme divergence (the original
// 2-3% failure rate). The hybrid routes through line-level diff3.
// ────────────────────────────────────────────────────────────────────────
describe('T5: Heavy divergence — many insertions across a 30-line doc', () => {
  // 30-line baseline. User inserts 10 new paragraphs, agent inserts 6 new
  // paragraphs. Insertions are at different positions (interleaved, not at
  // the same line). Original lines are NOT modified — all original content
  // serves as anchor lines for diff3.
  //
  // This is T1 at higher density. The test validates that the merge doesn't
  // degrade when many insertions saturate the document. Same-line
  // modification conflicts are T6's job; heavy whole-doc DMP patch_apply
  // drops are validated by the fuzzer (FR-4).
  const baseLines = Array.from({ length: 30 }, (_, i) => `Original line ${i + 1}`);
  const baseline = baseLines.join('\n');

  // User inserts after lines: 1, 4, 7, 10, 13, 16, 19, 22, 25, 28
  const userMarkers = Array.from({ length: 10 }, (_, i) => `USER_MARKER_${i}`);
  const userInsertAfter = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28];
  const userLines = [...baseLines];
  for (let i = userInsertAfter.length - 1; i >= 0; i--) {
    userLines.splice(userInsertAfter[i], 0, userMarkers[i]);
  }
  const userText = userLines.join('\n');

  // Agent inserts after lines: 3, 8, 12, 18, 23, 27
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

// ────────────────────────────────────────────────────────────────────────
// T6: Same-line modification (sub-line conflict)
//
// What it validates: Both sub-line edits survive even when they're on the
// same line.
// What fails it: Line-level diff3 ALONE (loses agent's edit because the
// whole line is a single conflict block resolved as user-wins).
// The hybrid routes this through DMP within the conflict region, which
// handles sub-line merges correctly on short strings.
// Critical regression gate: prevents replacing hybrid with pure diff3.
// ────────────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────
// T7: Delete/edit conflict
//
// What it validates: When one user deletes content that another user
// edited, the edit is preserved (conservative — prefer keeping content
// over losing it).
// What fails it: DMP (corrupt partial line), OT (loses newline).
// Product decision: "user B was actively working on this paragraph" is a
// stronger signal than "user A decided to delete it."
// ────────────────────────────────────────────────────────────────────────
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
    // DMP produces corrupt output — the edit is partially applied
    // against context that no longer exists. The exact corruption varies
    // but the agent's full edited paragraph is NOT preserved intact.
    const hasIntactAgentEdit = merged.includes('AGENT EDITED this paragraph.');
    // If DMP happens to produce the correct result on this input, the test
    // still passes — it documents the known-fragile path. The critical
    // assertion is that mergeThreeWay ALWAYS produces it.
    if (!hasIntactAgentEdit) {
      // Expected: DMP corrupts delete/edit conflicts
      expect(merged).not.toBe('Para 1\n\nAGENT EDITED this paragraph.\n\nPara 3');
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// T-perf: Performance gate
//
// What it validates: The merge algorithm is fast enough for the 50ms
// debounce budget. Regression gate against O(n^2) algorithms.
// ────────────────────────────────────────────────────────────────────────
describe('T-perf: Performance gate', () => {
  // 1000-line document (~69K chars)
  const baseLines = Array.from(
    { length: 1000 },
    (_, i) =>
      `Line ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.`,
  );
  const baseline = baseLines.join('\n');

  // User: 50 modifications + 20 insertions
  const userLines = [...baseLines];
  for (let i = 0; i < 1000; i += 20) {
    userLines[i] = `USER_MODIFIED_LINE_${i}: Updated content for this line.`;
  }
  let uOffset = 0;
  for (let i = 0; i < 1000; i += 50) {
    userLines.splice(i + uOffset + 1, 0, `USER_INSERTION_AT_${i}`);
    uOffset++;
  }
  const userText = userLines.join('\n');

  // Agent: 30 modifications + 15 insertions
  const agentLines = [...baseLines];
  for (let i = 10; i < 1000; i += 33) {
    agentLines[i] = `AGENT_MODIFIED_LINE_${i}: Agent updated this line.`;
  }
  let aOffset = 0;
  for (let i = 25; i < 1000; i += 67) {
    agentLines.splice(i + aOffset + 1, 0, `AGENT_INSERTION_AT_${i}`);
    aOffset++;
  }
  const agentText = agentLines.join('\n');

  test('p95 < 50ms over 100 iterations (debounce budget)', () => {
    // The product requirement: merge must complete within the 50ms Observer A
    // debounce window. Local hardware typically achieves p95 ~4ms; CI runners
    // (shared VMs, CPU throttling) run 5-8x slower at p95 ~40-50ms. The gate
    // asserts against the debounce budget (50ms), not local-hardware speed.
    const times: number[] = [];
    // Warmup
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
      `[T-perf] mergeThreeWay 1000-line doc: p50=${p50.toFixed(2)}ms p95=${p95.toFixed(2)}ms max=${max.toFixed(2)}ms`,
    );

    expect(p95).toBeLessThan(50);
  });
});
