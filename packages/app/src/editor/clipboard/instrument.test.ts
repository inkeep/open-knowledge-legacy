/**
 * Unit tests for instrument.ts behaviors with module-level state.
 *
 * Most `log*` helpers are stateless — they JSON-stringify and
 * `console.warn`. Those are exercised end-to-end through Playwright (the
 * walker fires them as a side-effect of cross-app paste). The exception
 * is `logUnmappedLucideIcon`, which carries a module-level dedup set —
 * a behavioral contract worth pinning here. The dedup is fully testable
 * in bun-test without a real DOM.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { logUnmappedLucideIcon, resetUnmappedLucideSeenForTest } from './instrument.ts';

describe('logUnmappedLucideIcon — once-per-process per-class dedup', () => {
  let origWarn: typeof console.warn;
  let warnings: string[];

  beforeEach(() => {
    resetUnmappedLucideSeenForTest();
    warnings = [];
    origWarn = console.warn;
    console.warn = (msg: unknown) => {
      warnings.push(typeof msg === 'string' ? msg : String(msg));
    };
  });

  afterEach(() => {
    console.warn = origWarn;
    resetUnmappedLucideSeenForTest();
  });

  test('emits on first call for a given class', () => {
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    expect(warnings).toHaveLength(1);
    const event = JSON.parse(warnings[0]);
    expect(event.event).toBe('clipboard-walker-unmapped-lucide-detected');
    expect(event.view).toBe('wysiwyg');
    expect(event.lucideClass).toBe('lucide-foo');
  });

  test('suppresses repeat calls for the same class', () => {
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    expect(warnings).toHaveLength(1);
  });

  test('emits independently for distinct classes', () => {
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    logUnmappedLucideIcon({ lucideClass: 'lucide-bar', view: 'wysiwyg' });
    logUnmappedLucideIcon({ lucideClass: 'lucide-baz', view: 'wysiwyg' });
    expect(warnings).toHaveLength(3);
    const events = warnings.map((w) => JSON.parse(w));
    expect(events.map((e) => e.lucideClass)).toEqual(['lucide-foo', 'lucide-bar', 'lucide-baz']);
  });

  test('dedup persists across distinct view values for the same class', () => {
    // Class identity, not (class, view) tuple, gates the dedup. A future
    // Source-view caller hitting the same class would still suppress.
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'source' });
    expect(warnings).toHaveLength(1);
  });

  test('emitted JSON shape carries event + view + lucideClass and nothing else', () => {
    logUnmappedLucideIcon({ lucideClass: 'lucide-foo', view: 'wysiwyg' });
    const event = JSON.parse(warnings[0]);
    expect(Object.keys(event).sort()).toEqual(['event', 'lucideClass', 'view']);
  });
});
