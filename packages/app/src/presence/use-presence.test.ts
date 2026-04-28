import { describe, expect, test } from 'bun:test';
import { dedupeHumansByPrincipalId, type HumanParticipant } from './use-presence';

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

  test('output order preserves first-occurrence of each principalId group', () => {
    const input = [makeHuman(100, 'pid-B'), makeHuman(10, 'pid-A'), makeHuman(200, 'pid-B')];
    const result = dedupeHumansByPrincipalId(input);
    // pid-B first (clientId 100 is rep since 100 < 200), then pid-A
    expect(result[0].user.principalId).toBe('pid-B');
    expect(result[0].clientId).toBe(100);
    expect(result[1].user.principalId).toBe('pid-A');
  });
});
