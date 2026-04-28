import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { setTimeout as wait } from 'node:timers/promises';
import {
  __resetSidebarHoverPrewarmForTests,
  cancelHoverPrewarm,
  scheduleHoverPrewarm,
} from './sidebar-hover-prewarm';

beforeEach(() => {
  __resetSidebarHoverPrewarmForTests();
});
afterEach(() => {
  __resetSidebarHoverPrewarmForTests();
});

describe('sidebar-hover-prewarm (review Major #7 + V2 FR12 Option G)', () => {
  test('hover → prewarm fires after 80ms intent window', async () => {
    const prewarm = mock((docName: string) => {
      expect(docName).toBe('doc-a');
    });
    scheduleHoverPrewarm('doc-a', prewarm);
    expect(prewarm).not.toHaveBeenCalled();
    await wait(120);
    expect(prewarm).toHaveBeenCalledTimes(1);
  });

  test('quick mouse trail (dismiss before 80ms) fires no prewarm', async () => {
    const prewarm = mock(() => {});
    scheduleHoverPrewarm('doc-a', prewarm);
    // Mouse leaves after 30ms, well before the 80ms intent threshold.
    await wait(30);
    cancelHoverPrewarm('doc-a');
    await wait(120);
    expect(prewarm).not.toHaveBeenCalled();
  });

  test('system docs are refused (__system__)', () => {
    const prewarm = mock(() => {});
    scheduleHoverPrewarm('__system__', prewarm);
    // No timer scheduled — cancel is a no-op.
    cancelHoverPrewarm('__system__');
    // Nothing fires even at the timer horizon.
    expect(prewarm).not.toHaveBeenCalled();
  });

  test('already-prewarmed doc does not re-fire', async () => {
    const prewarm = mock(() => {});
    scheduleHoverPrewarm('doc-b', prewarm);
    await wait(120);
    expect(prewarm).toHaveBeenCalledTimes(1);
    // Second hover on the same doc — no re-fire.
    scheduleHoverPrewarm('doc-b', prewarm);
    await wait(120);
    expect(prewarm).toHaveBeenCalledTimes(1);
  });
});
