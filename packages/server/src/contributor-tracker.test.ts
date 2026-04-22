import { beforeEach, describe, expect, test } from 'bun:test';
import { parseContributors } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import {
  clearContributors,
  contributorCount,
  formatContributors,
  formatContributorsFrom,
  recordContributor,
  restoreContributors,
  swapContributors,
} from './contributor-tracker.ts';

beforeEach(() => {
  clearContributors();
});

describe('recordContributor', () => {
  test('records a single contributor', () => {
    recordContributor('notes.md', 'agent-claude-1', 'Claude');
    expect(contributorCount()).toBe(1);
  });

  test('merges docs for the same agent across multiple calls', () => {
    recordContributor('a.md', 'agent-claude-1', 'Claude');
    recordContributor('b.md', 'agent-claude-1', 'Claude');
    expect(contributorCount()).toBe(1);
    const output = formatContributors();
    expect(output).toContain('"a.md"');
    expect(output).toContain('"b.md"');
  });

  test('accumulates multiple distinct agents', () => {
    recordContributor('a.md', 'agent-alice', 'Alice');
    recordContributor('b.md', 'agent-bob', 'Bob');
    expect(contributorCount()).toBe(2);
  });

  test('deduplicates the same doc for the same agent', () => {
    recordContributor('a.md', 'agent-alice', 'Alice');
    recordContributor('a.md', 'agent-alice', 'Alice');
    const output = formatContributors();
    // Only one "a.md" entry
    expect((output.match(/a\.md/g) ?? []).length).toBe(1);
  });

  test('includes colorSeed in formatted output', () => {
    recordContributor('doc.md', 'agent-alice', 'Alice', 'alice-custom-seed');
    const output = formatContributors();
    expect(output).toContain('"colorSeed":"alice-custom-seed"');
  });

  test('colorSeed defaults to displayName when not provided', () => {
    recordContributor('doc.md', 'agent-alice', 'Alice');
    const output = formatContributors();
    expect(output).toContain('"colorSeed":"Alice"');
  });
});

describe('formatContributors / formatContributorsFrom', () => {
  test('returns empty string when no contributors', () => {
    expect(formatContributors()).toBe('');
  });

  test('returns newline-prefixed lines when contributors exist', () => {
    recordContributor('doc.md', 'agent-claude-1', 'Claude');
    const output = formatContributors();
    expect(output.startsWith('\n')).toBe(true);
    expect(output).toContain('ok-contributors:');
  });

  test('includes v:1 version field', () => {
    recordContributor('doc.md', 'agent-claude-1', 'Claude');
    const output = formatContributors();
    expect(output).toContain('"v":1');
  });

  test('round-trips through parseContributors', () => {
    recordContributor('notes.md', 'agent-claude-1', 'Claude');
    recordContributor('docs.md', 'agent-cursor-abc', 'Cursor');
    const body = `WIP auto-save 2026-01-01T00:00:00.000Z${formatContributors()}`;
    const parsed = parseContributors(body);
    expect(parsed).toHaveLength(2);
    const ids = parsed.map((c) => c.id).sort();
    expect(ids).toEqual(['agent-claude-1', 'agent-cursor-abc']);
  });

  test('colorSeed round-trips through parseContributors', () => {
    recordContributor('doc.md', 'agent-alice', 'Alice', 'my-seed');
    const body = formatContributors();
    const parsed = parseContributors(body);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.colorSeed).toBe('my-seed');
  });

  test('formatContributorsFrom uses provided snapshot, not live map', () => {
    recordContributor('live.md', 'agent-live', 'Live');
    const snapshot = swapContributors();
    recordContributor('after-swap.md', 'agent-new', 'New');
    // snapshot has only 'agent-live'; live map has 'agent-new'
    const fromSnapshot = formatContributorsFrom(snapshot);
    expect(fromSnapshot).toContain('agent-live');
    expect(fromSnapshot).not.toContain('agent-new');
  });
});

describe('swapContributors + restoreContributors (swap-and-drain pattern)', () => {
  test('swapContributors returns the live map and resets to empty', () => {
    recordContributor('a.md', 'agent-alice', 'Alice');
    const snapshot = swapContributors();
    expect(snapshot.size).toBe(1);
    expect(contributorCount()).toBe(0);
  });

  test('recordContributor after swap goes to new live map, not snapshot', () => {
    recordContributor('a.md', 'agent-alice', 'Alice');
    const snapshot = swapContributors();
    recordContributor('b.md', 'agent-bob', 'Bob');
    expect(snapshot.has('agent-bob')).toBe(false);
    expect(contributorCount()).toBe(1); // agent-bob in live map
  });

  test('restoreContributors merges snapshot back on failure', () => {
    recordContributor('a.md', 'agent-alice', 'Alice');
    const snapshot = swapContributors();
    // Simulate a new contribution arriving during the failed commit
    recordContributor('b.md', 'agent-bob', 'Bob');
    restoreContributors(snapshot);
    // Both alice and bob should now be in the live map
    expect(contributorCount()).toBe(2);
    const output = formatContributors();
    expect(output).toContain('agent-alice');
    expect(output).toContain('agent-bob');
  });

  test('restoreContributors merges docs when same agent in both snapshot and live map', () => {
    recordContributor('a.md', 'agent-alice', 'Alice');
    const snapshot = swapContributors();
    recordContributor('b.md', 'agent-alice', 'Alice'); // same agent, new doc
    restoreContributors(snapshot);
    const output = formatContributors();
    expect(output).toContain('"a.md"');
    expect(output).toContain('"b.md"');
    // Still one entry for agent-alice
    const lines = output.split('\n').filter((l) => l.includes('agent-alice'));
    expect(lines).toHaveLength(1);
  });

  test('restoreContributors on empty live map fully restores snapshot', () => {
    recordContributor('a.md', 'agent-alice', 'Alice');
    const snapshot = swapContributors();
    // no new contributions
    restoreContributors(snapshot);
    expect(contributorCount()).toBe(1);
  });

  test('discarding snapshot on success is correct (no restore)', () => {
    recordContributor('a.md', 'agent-alice', 'Alice');
    const snapshot = swapContributors();
    recordContributor('b.md', 'agent-bob', 'Bob');
    // On success: discard snapshot; live map has agent-bob
    // (no restoreContributors call)
    expect(contributorCount()).toBe(1);
    const output = formatContributors();
    expect(output).toContain('agent-bob');
    expect(output).not.toContain('agent-alice');
    void snapshot; // explicitly unused
  });
});

describe('clearContributors', () => {
  test('clears all accumulated contributors', () => {
    recordContributor('a.md', 'agent-alice', 'Alice');
    recordContributor('b.md', 'agent-bob', 'Bob');
    clearContributors();
    expect(contributorCount()).toBe(0);
    expect(formatContributors()).toBe('');
  });
});

// Agent change-notes follow-up spec — FR-3 summaries accumulation
describe('recordContributor summaries', () => {
  test('omitted summary leaves entry with empty summaries array', () => {
    recordContributor('a.md', 'agent-alice', 'Alice');
    const snapshot = swapContributors();
    const entry = snapshot.get('agent-alice');
    expect(entry?.summaries).toEqual([]);
  });

  test('single summary is captured in call order', () => {
    recordContributor(
      'a.md',
      'agent-alice',
      'Alice',
      undefined,
      undefined,
      undefined,
      'added auth design',
    );
    const snapshot = swapContributors();
    expect(snapshot.get('agent-alice')?.summaries).toEqual(['added auth design']);
  });

  test('multiple summaries accumulate in call order', () => {
    recordContributor(
      'a.md',
      'agent-alice',
      'Alice',
      undefined,
      undefined,
      undefined,
      'first note',
    );
    recordContributor(
      'a.md',
      'agent-alice',
      'Alice',
      undefined,
      undefined,
      undefined,
      'second note',
    );
    recordContributor(
      'a.md',
      'agent-alice',
      'Alice',
      undefined,
      undefined,
      undefined,
      'third note',
    );
    const snapshot = swapContributors();
    expect(snapshot.get('agent-alice')?.summaries).toEqual([
      'first note',
      'second note',
      'third note',
    ]);
  });

  test('whitespace-only summaries are dropped', () => {
    recordContributor('a.md', 'agent-alice', 'Alice', undefined, undefined, undefined, '   ');
    recordContributor(
      'a.md',
      'agent-alice',
      'Alice',
      undefined,
      undefined,
      undefined,
      'valid note',
    );
    recordContributor('a.md', 'agent-alice', 'Alice', undefined, undefined, undefined, '');
    const snapshot = swapContributors();
    expect(snapshot.get('agent-alice')?.summaries).toEqual(['valid note']);
  });

  test('summaries are trimmed before storage', () => {
    recordContributor(
      'a.md',
      'agent-alice',
      'Alice',
      undefined,
      undefined,
      undefined,
      '  padded note  ',
    );
    const snapshot = swapContributors();
    expect(snapshot.get('agent-alice')?.summaries).toEqual(['padded note']);
  });

  test('summaries are per-writer, not global', () => {
    recordContributor(
      'a.md',
      'agent-alice',
      'Alice',
      undefined,
      undefined,
      undefined,
      'alice note',
    );
    recordContributor('b.md', 'agent-bob', 'Bob', undefined, undefined, undefined, 'bob note');
    const snapshot = swapContributors();
    expect(snapshot.get('agent-alice')?.summaries).toEqual(['alice note']);
    expect(snapshot.get('agent-bob')?.summaries).toEqual(['bob note']);
  });

  test('restoreContributors preserves prior summaries when merging', () => {
    recordContributor(
      'a.md',
      'agent-alice',
      'Alice',
      undefined,
      undefined,
      undefined,
      'pre-drain note',
    );
    const snapshot = swapContributors();
    recordContributor(
      'b.md',
      'agent-alice',
      'Alice',
      undefined,
      undefined,
      undefined,
      'post-swap note',
    );
    restoreContributors(snapshot);
    const restored = swapContributors();
    // Order: snapshot entries first, then post-swap accumulators (call-order preservation within failed drain)
    expect(restored.get('agent-alice')?.summaries).toEqual(['pre-drain note', 'post-swap note']);
  });
});
