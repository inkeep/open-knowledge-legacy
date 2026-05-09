import { describe, expect, it } from 'bun:test';
import { isEntryPoint } from './entry-point.ts';

describe('isEntryPoint', () => {
  it('accepts every literal value in the EntryPoint union', () => {
    expect(isEntryPoint('start-fresh')).toBe(true);
    expect(isEntryPoint('pick-existing')).toBe(true);
    expect(isEntryPoint('recents')).toBe(true);
    expect(isEntryPoint('deep-link')).toBe(true);
    expect(isEntryPoint('drag-drop')).toBe(true);
  });

  it('rejects unknown strings', () => {
    expect(isEntryPoint('start')).toBe(false);
    expect(isEntryPoint('')).toBe(false);
    expect(isEntryPoint('Start-Fresh')).toBe(false);
    expect(isEntryPoint('__proto__')).toBe(false);
  });

  it('rejects non-string inputs (defends the IPC boundary against arbitrary payloads)', () => {
    expect(isEntryPoint(undefined)).toBe(false);
    expect(isEntryPoint(null)).toBe(false);
    expect(isEntryPoint(0)).toBe(false);
    expect(isEntryPoint(false)).toBe(false);
    expect(isEntryPoint({})).toBe(false);
    expect(isEntryPoint([])).toBe(false);
    expect(isEntryPoint(['start-fresh'])).toBe(false);
  });
});
