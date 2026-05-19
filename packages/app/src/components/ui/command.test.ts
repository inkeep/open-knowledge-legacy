import { describe, expect, test } from 'bun:test';
import SRC from './command?raw';

describe('Command module', () => {
  test('exports the full Command API surface', async () => {
    const mod = await import('./command');
    for (const name of [
      'Command',
      'CommandDialog',
      'CommandEmpty',
      'CommandGroup',
      'CommandInput',
      'CommandItem',
      'CommandList',
      'CommandSeparator',
      'CommandShortcut',
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name]).toBe('function');
    }
  });
});

describe('CommandDialog top-anchored placement', () => {
  test('CommandDialog applies the top-[12vh] inline override to DialogContent', () => {
    expect(SRC).toMatch(
      /<DialogContent[\s\S]*?className=\{cn\(\s*'top-\[12vh\] translate-y-0 overflow-hidden p-0', className\)\}/,
    );
  });

  test('CommandDialog declares no transition or placement prop', () => {
    expect(SRC).not.toMatch(/transition\?:/);
    expect(SRC).not.toMatch(/placement\?:/);
    expect(SRC).not.toMatch(/transition\s*=/);
    expect(SRC).not.toMatch(/placement\s*=/);
  });
});
