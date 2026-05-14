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

  test('step 1 renders PackCardGrid (same surface as the empty-state canvas)', () => {
    expect(SRC).toContain("from '@/components/PackCardGrid'");
    expect(SRC).toContain('<PackCardGrid');
  });

  test('renders the configure step only when step === "configure"', () => {
    expect(SRC).toMatch(/step\s*===\s*'configure'/);
  });

  test('threads the selected pack name into the dialog title on the configure step', () => {
    expect(SRC).toContain('selectedPack.name');
    expect(SRC).toContain('Initialize a starter pack');
  });

  test('routes plan/apply/listPacks through the shared seedClient transport', () => {
    expect(SRC).toContain("from '@/lib/seed-client'");
  });

  test('Back button shows only on the configure step AND only when not pack-locked', () => {
    expect(SRC).toMatch(/step\s*===\s*'configure'\s*&&\s*!packLocked/);
  });

  test('Back handler resets phase so a previous plan does not flash under the new pack title', () => {
    expect(SRC).toContain('handleBack');
    expect(SRC).toMatch(/handleBack[\s\S]{0,400}setPhase\(\{\s*kind:\s*'loading'/);
  });
});
