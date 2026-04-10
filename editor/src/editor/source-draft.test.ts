import { describe, expect, test } from 'bun:test';
import { evaluateSourceDraftGate } from './source-draft';

describe('evaluateSourceDraftGate', () => {
  test('allows apply when editable, dirty, conflict-free, and not stale', () => {
    expect(
      evaluateSourceDraftGate({
        isEditable: true,
        diskConflict: '',
        isDirty: true,
        draftBaseRevision: 12,
        canonicalRevision: 12,
      }),
    ).toEqual({ isStale: false, canApply: true });
  });

  test('blocks apply when stale due to canonical revision advancing', () => {
    expect(
      evaluateSourceDraftGate({
        isEditable: true,
        diskConflict: '',
        isDirty: true,
        draftBaseRevision: 12,
        canonicalRevision: 13,
      }),
    ).toEqual({ isStale: true, canApply: false });
  });

  test('blocks apply when disk conflict exists even if revision matches', () => {
    expect(
      evaluateSourceDraftGate({
        isEditable: true,
        diskConflict: 'Disk changed externally.',
        isDirty: true,
        draftBaseRevision: 12,
        canonicalRevision: 12,
      }),
    ).toEqual({ isStale: false, canApply: false });
  });

  test('does not mark stale when draft is clean', () => {
    expect(
      evaluateSourceDraftGate({
        isEditable: true,
        diskConflict: '',
        isDirty: false,
        draftBaseRevision: 12,
        canonicalRevision: 13,
      }),
    ).toEqual({ isStale: false, canApply: false });
  });
});
