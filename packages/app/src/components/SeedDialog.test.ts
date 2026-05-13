import { describe, expect, test } from 'bun:test';
import SRC from './SeedDialog?raw';

describe('SeedDialog module', () => {
  test('exports SeedDialog component', async () => {
    const mod = await import('./SeedDialog');
    expect(typeof mod.SeedDialog).toBe('function');
  });
});

describe('SeedDialog source-level guards', () => {
  test('accepts an initialPackId prop on the component signature', () => {
    expect(SRC).toContain('initialPackId?: OkPackId');
    expect(SRC).toMatch(/initialPackId\s*[,}]/);
  });

  test('honors initialPackId on dialog open (resets to it, not the default)', () => {
    expect(SRC).toContain('setSelectedPackId(initialPackId ?? DEFAULT_PACK_ID)');
  });

  test('derives a packLocked flag from initialPackId', () => {
    expect(SRC).toMatch(/packLocked\s*=\s*initialPackId/);
  });

  test('hides the in-dialog PackPicker when locked', () => {
    expect(SRC).toMatch(/packLocked[\s\S]{0,300}<PackPicker|<PackPicker[\s\S]{0,300}packLocked/);
  });

  test('threads the selected pack name into the dialog title when locked', () => {
    expect(SRC).toContain('selectedPack.name');
    expect(SRC).toContain('Initialize a starter pack');
  });

  test('routes plan/apply/listPacks through the shared seedClient transport', () => {
    expect(SRC).toContain("from '@/lib/seed-client'");
  });
});
