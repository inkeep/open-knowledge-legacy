import { describe, expect, test } from 'bun:test';
import {
  dedupeHumansByPrincipalId,
  type HumanParticipant,
  type Participant,
  participantsEqual,
} from './use-presence';

function makeHuman(
  clientId: number,
  principalId?: string,
  name = 'Alice',
  color = '#fff',
): HumanParticipant {
  return {
    kind: 'human',
    clientId,
    user: {
      type: 'human',
      name,
      color,
      tabId: `tab-${clientId}`,
      ...(principalId !== undefined ? { principalId } : {}),
    },
    mode: 'wysiwyg',
    tabCount: 1,
  };
}

describe('dedupeHumansByPrincipalId', () => {
  test('two entries with same principalId collapse to one with tabCount === 2', () => {
    const input = [makeHuman(10, 'pid-1'), makeHuman(20, 'pid-1')];
    const result = dedupeHumansByPrincipalId(input);
    expect(result.length).toBe(1);
    expect(result[0].tabCount).toBe(2);
  });

  test('tie-break selects the entry with the lowest clientId', () => {
    const input = [makeHuman(20, 'pid-1', 'Bob'), makeHuman(10, 'pid-1', 'Alice')];
    const result = dedupeHumansByPrincipalId(input);
    expect(result.length).toBe(1);
    // clientId 10 is lower — that entry's name wins
    expect(result[0].clientId).toBe(10);
    expect(result[0].user.name).toBe('Alice');
  });

  test('three entries with same principalId collapse to tabCount === 3', () => {
    const input = [makeHuman(1, 'pid-x'), makeHuman(2, 'pid-x'), makeHuman(3, 'pid-x')];
    const result = dedupeHumansByPrincipalId(input);
    expect(result.length).toBe(1);
    expect(result[0].tabCount).toBe(3);
    expect(result[0].clientId).toBe(1);
  });

  test('ineligible entry (undefined principalId) does not dedupe', () => {
    const input = [makeHuman(1, undefined), makeHuman(2, undefined)];
    const result = dedupeHumansByPrincipalId(input);
    expect(result.length).toBe(2);
    expect(result[0].tabCount).toBe(1);
    expect(result[1].tabCount).toBe(1);
  });

  test('ineligible entry (empty string principalId) does not dedupe', () => {
    const input = [makeHuman(1, ''), makeHuman(2, '')];
    const result = dedupeHumansByPrincipalId(input);
    expect(result.length).toBe(2);
    expect(result.every((h) => h.tabCount === 1)).toBe(true);
  });

  test('mixed: eligible and ineligible entries coexist correctly', () => {
    const input = [makeHuman(1, 'pid-A'), makeHuman(2, undefined), makeHuman(3, 'pid-A')];
    const result = dedupeHumansByPrincipalId(input);
    // pid-A collapses to 1, the ineligible stays → 2 total
    expect(result.length).toBe(2);
    const eligible = result.find((h) => h.user.principalId === 'pid-A');
    const ineligible = result.find((h) => !h.user.principalId);
    expect(eligible?.tabCount).toBe(2);
    expect(eligible?.clientId).toBe(1);
    expect(ineligible?.tabCount).toBe(1);
  });

  test('two entries with different principalIds produce two participants each with tabCount === 1', () => {
    const input = [makeHuman(10, 'pid-A'), makeHuman(20, 'pid-B')];
    const result = dedupeHumansByPrincipalId(input);
    expect(result.length).toBe(2);
    expect(result.every((h) => h.tabCount === 1)).toBe(true);
  });

  test('single entry with eligible principalId has tabCount === 1', () => {
    const input = [makeHuman(5, 'pid-solo')];
    const result = dedupeHumansByPrincipalId(input);
    expect(result.length).toBe(1);
    expect(result[0].tabCount).toBe(1);
  });

  test('empty array returns empty array', () => {
    expect(dedupeHumansByPrincipalId([])).toEqual([]);
  });

  test('output order follows rep position (rep is first entry here)', () => {
    // pid-B: entries at pos 0 (clientId 100) and pos 2 (clientId 200).
    // Rep is clientId 100 (the lower one), which appears first → pid-B emitted at pos 0.
    const input = [makeHuman(100, 'pid-B'), makeHuman(10, 'pid-A'), makeHuman(200, 'pid-B')];
    const result = dedupeHumansByPrincipalId(input);
    expect(result[0].user.principalId).toBe('pid-B');
    expect(result[0].clientId).toBe(100);
    expect(result[1].user.principalId).toBe('pid-A');
  });

  test('output order reflects rep position, not first-occurrence, when rep != first', () => {
    // pid-B appears at positions 0 (clientId 200) and 2 (clientId 100).
    // The rep is clientId 100 (lower), which sits at position 2.
    // Output order therefore puts A (pos 1) before B (pos 2).
    const input = [makeHuman(200, 'pid-B'), makeHuman(10, 'pid-A'), makeHuman(100, 'pid-B')];
    const result = dedupeHumansByPrincipalId(input);
    expect(result.length).toBe(2);
    expect(result[0].user.principalId).toBe('pid-A');
    expect(result[1].user.principalId).toBe('pid-B');
    expect(result[1].clientId).toBe(100);
    expect(result[1].tabCount).toBe(2);
  });
});

function makeParticipantHuman(clientId: number, tabCount: number): Participant {
  return {
    kind: 'human',
    clientId,
    user: { type: 'human', name: 'Alice', color: '#fff', tabId: `tab-${clientId}` },
    mode: 'wysiwyg',
    tabCount,
  };
}

describe('participantsEqual', () => {
  test('returns true for two empty arrays', () => {
    expect(participantsEqual([], [])).toBe(true);
  });

  test('returns false for arrays of different lengths', () => {
    expect(participantsEqual([makeParticipantHuman(1, 1)], [])).toBe(false);
  });

  test('returns true when all fields including tabCount match', () => {
    const a = [makeParticipantHuman(1, 2)];
    const b = [makeParticipantHuman(1, 2)];
    expect(participantsEqual(a, b)).toBe(true);
  });

  test('returns false when only tabCount differs — guards against stale tooltip on TTL tick', () => {
    // This is the exact regression the spec called out: if participantsEqual
    // didn't compare tabCount, the 1 Hz TTL tick would short-circuit setState
    // and the tooltip count would go stale when a tab connects/disconnects.
    const a = [makeParticipantHuman(1, 1)];
    const b = [makeParticipantHuman(1, 2)];
    expect(participantsEqual(a, b)).toBe(false);
  });

  test('returns false when clientId differs', () => {
    const a = [makeParticipantHuman(1, 1)];
    const b = [makeParticipantHuman(2, 1)];
    expect(participantsEqual(a, b)).toBe(false);
  });
});
