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
import { checkpointHeadlineLabel, checkpointVariant } from './TimelinePanel.tsx';

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
            metadata: { incomingDiskSha: 'abc123' },
          },
        }),
      ),
    ).toBe('external-change-rescue');
  });
});

describe('checkpointHeadlineLabel', () => {
  test('ordinary checkpoint → "Save Version"', () => {
    expect(checkpointHeadlineLabel(baseEntry({}))).toBe('Save Version');
  });

  test('bridge-merge-loss → strips "checkpoint: " prefix', () => {
    expect(
      checkpointHeadlineLabel(
        baseEntry({
          message: 'checkpoint: Before concurrent merge @ 2026-04-17T08:00:00Z',
          checkpoint: {
            kind: 'bridge-merge-loss',
            metadata: { lostSubstrings: [] },
          },
        }),
      ),
    ).toBe('Before concurrent merge @ 2026-04-17T08:00:00Z');
  });

  test('external-change-rescue → strips "checkpoint: " prefix', () => {
    expect(
      checkpointHeadlineLabel(
        baseEntry({
          message: 'checkpoint: External change recovered @ 2026-04-17T08:00:00Z',
          checkpoint: {
            kind: 'external-change-rescue',
            metadata: { incomingDiskSha: 'x' },
          },
        }),
      ),
    ).toBe('External change recovered @ 2026-04-17T08:00:00Z');
  });

  test('fallback: bridge-merge-loss without a message prefix returns a safe default', () => {
    expect(
      checkpointHeadlineLabel(
        baseEntry({
          message: '',
          checkpoint: { kind: 'bridge-merge-loss', metadata: { lostSubstrings: [] } },
        }),
      ),
    ).toBe('Before concurrent merge');
  });
});
