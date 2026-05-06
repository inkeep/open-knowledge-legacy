import { describe, expect, test } from 'bun:test';
import { applyChannelSettings } from '../../src/main/auto-updater.ts';

interface Bag {
  channel: string | null;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
}

const blank = (): Bag => ({ channel: null, allowPrerelease: true, allowDowngrade: true });

describe('applyChannelSettings', () => {
  test('latest → channel=latest, allowPrerelease=false, allowDowngrade=true', () => {
    const u = blank();
    applyChannelSettings(u, 'latest');
    expect(u.channel).toBe('latest');
    expect(u.allowPrerelease).toBe(false);
    expect(u.allowDowngrade).toBe(true);
  });

  test('beta → channel=beta, allowPrerelease=true, allowDowngrade=false', () => {
    const u = blank();
    applyChannelSettings(u, 'beta');
    expect(u.channel).toBe('beta');
    expect(u.allowPrerelease).toBe(true);
    expect(u.allowDowngrade).toBe(false);
  });

  test('switch latest→beta→latest restores stable config', () => {
    const u = blank();
    applyChannelSettings(u, 'latest');
    applyChannelSettings(u, 'beta');
    applyChannelSettings(u, 'latest');
    expect(u.channel).toBe('latest');
    expect(u.allowPrerelease).toBe(false);
    expect(u.allowDowngrade).toBe(true);
  });
});
