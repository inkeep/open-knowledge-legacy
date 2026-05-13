import { describe, expect, test } from 'bun:test';
import SRC from './dialog?raw';

describe('Dialog module', () => {
  test('exports the full Dialog API surface', async () => {
    const mod = await import('./dialog');
    for (const name of [
      'Dialog',
      'DialogBody',
      'DialogClose',
      'DialogContent',
      'DialogDescription',
      'DialogFooter',
      'DialogHeader',
      'DialogOverlay',
      'DialogPortal',
      'DialogTitle',
      'DialogTrigger',
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

describe('Dialog Electron drag-region opt-out', () => {
  test('DialogContent carries [-webkit-app-region:no-drag]', () => {
    expect(SRC).toContain('[-webkit-app-region:no-drag]');
    const occurrences = SRC.match(/\[-webkit-app-region:no-drag\]/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });
});
