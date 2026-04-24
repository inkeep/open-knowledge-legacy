/**
 * Unit tests for the pure-function helpers in TimelinePanel.tsx
 * (bridge-correctness SPEC §6 R7c — kind-aware rendering).
 *
 * The React rendering itself is exercised via the Playwright e2e suite; this
 * test focuses on the string/variant mapping so refactors of label text
 * survive without a browser.
 */
import { describe, expect, test } from 'bun:test';
import type { TimelineEntry } from '@inkeep/open-knowledge-core';
import { allSummariesFor, checkpointHeadlineLabel, checkpointVariant } from './TimelinePanel.tsx';

function baseEntry(overrides: Partial<TimelineEntry>): TimelineEntry {
  return {
    sha: '0'.repeat(40),
    timestamp: '2026-04-17T00:00:00Z',
    author: 'openknowledge',
    authorEmail: 'noreply@openknowledge.local',
    type: 'checkpoint',
    message: 'checkpoint: Save Version',
    contributors: [],
    checkpoint: null,
    ...overrides,
  };
}

describe('checkpointVariant', () => {
  test('returns "save" for ordinary checkpoints without metadata', () => {
    expect(checkpointVariant(baseEntry({ checkpoint: null }))).toBe('save');
  });

  test('returns "bridge-merge-loss" for silent rescue checkpoints', () => {
    expect(
      checkpointVariant(
        baseEntry({
          message: 'checkpoint: Before concurrent merge @ 2026-04-17T00:00:00Z',
          checkpoint: {
            kind: 'bridge-merge-loss',
            docName: null,
            size: null,
            metadata: { lostSubstrings: ['hello'] },
          },
        }),
      ),
    ).toBe('bridge-merge-loss');
  });

  test('returns "external-change-rescue" for rescue-buffer checkpoints', () => {
    expect(
      checkpointVariant(
        baseEntry({
          checkpoint: {
            kind: 'external-change-rescue',
            docName: null,
            size: null,
            metadata: { incomingDiskSha: 'abc123' },
          },
        }),
      ),
    ).toBe('external-change-rescue');
  });
});

describe('checkpointHeadlineLabel (user-outcome language — review iteration 5)', () => {
  test('ordinary checkpoint → "Save Version"', () => {
    expect(checkpointHeadlineLabel(baseEntry({}))).toBe('Save Version');
  });

  test('bridge-merge-loss → user-outcome label, not implementation terms', () => {
    expect(
      checkpointHeadlineLabel(
        baseEntry({
          message: 'checkpoint: Before concurrent merge @ 2026-04-17T08:00:00Z',
          checkpoint: {
            kind: 'bridge-merge-loss',
            docName: 'notes.md',
            size: 1234,
            metadata: { lostSubstrings: [] },
          },
        }),
      ),
    ).toBe('Auto-saved before a concurrent edit (1.2 KB)');
  });

  test('bridge-merge-loss without size omits the size suffix', () => {
    expect(
      checkpointHeadlineLabel(
        baseEntry({
          message: '',
          checkpoint: {
            kind: 'bridge-merge-loss',
            docName: null,
            size: null,
            metadata: { lostSubstrings: [] },
          },
        }),
      ),
    ).toBe('Auto-saved before a concurrent edit');
  });

  test('external-change-rescue → user-outcome label', () => {
    expect(
      checkpointHeadlineLabel(
        baseEntry({
          message: 'checkpoint: External change recovered @ 2026-04-17T08:00:00Z',
          checkpoint: {
            kind: 'external-change-rescue',
            docName: 'root.md',
            size: 42,
            metadata: { incomingDiskSha: 'x' },
          },
        }),
      ),
    ).toBe('Recovered from an external change (42 B)');
  });

  test('does NOT leak implementation terms (no "merge", "mergeThreeWay", "observer", etc.)', () => {
    const labels = [
      checkpointHeadlineLabel(
        baseEntry({
          checkpoint: {
            kind: 'bridge-merge-loss',
            docName: null,
            size: null,
            metadata: { lostSubstrings: [] },
          },
        }),
      ),
      checkpointHeadlineLabel(
        baseEntry({
          checkpoint: {
            kind: 'external-change-rescue',
            docName: null,
            size: null,
            metadata: { incomingDiskSha: 'x' },
          },
        }),
      ),
    ];
    for (const label of labels) {
      expect(label).not.toMatch(/mergeThreeWay|observer|observer A|Path B/i);
    }
  });
});

describe('allSummariesFor (spec D23 flat shape)', () => {
  test('returns [] for legacy entries with no contributors', () => {
    expect(allSummariesFor(baseEntry({ contributors: [] }))).toEqual([]);
  });

  test('returns [] when contributors have no summaries field (legacy commit shape)', () => {
    expect(
      allSummariesFor(
        baseEntry({
          contributors: [{ id: 'agent-a', name: 'Claude', docs: ['foo.md'] }],
        }),
      ),
    ).toEqual([]);
  });

  test('preserves insertion order for a single contributor', () => {
    expect(
      allSummariesFor(
        baseEntry({
          contributors: [
            {
              id: 'agent-a',
              name: 'Claude',
              docs: ['foo.md'],
              summaries: ['Fixed typo', 'Added example', 'Tightened intro'],
            },
          ],
        }),
      ),
    ).toEqual(['Fixed typo', 'Added example', 'Tightened intro']);
  });

  test('flattens across multiple contributors in contributor order (D23)', () => {
    expect(
      allSummariesFor(
        baseEntry({
          contributors: [
            { id: 'agent-a', name: 'Alice', docs: ['a.md'], summaries: ['A1', 'A2'] },
            { id: 'agent-b', name: 'Bob', docs: ['b.md'], summaries: ['B1'] },
          ],
        }),
      ),
    ).toEqual(['A1', 'A2', 'B1']);
  });

  test('mixed contributors: one with summaries, one without — only the summaries land', () => {
    expect(
      allSummariesFor(
        baseEntry({
          contributors: [
            { id: 'agent-a', name: 'Alice', docs: ['a.md'], summaries: ['Cleaned up'] },
            { id: 'agent-b', name: 'Bob', docs: ['b.md'] },
          ],
        }),
      ),
    ).toEqual(['Cleaned up']);
  });
});
