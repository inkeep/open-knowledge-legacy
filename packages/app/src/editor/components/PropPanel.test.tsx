/**
 * PropPanel — unit tests for the Advanced collapsible section, the
 * non-default-set count helper, the per-descriptor localStorage round-trip,
 * the autoFocus marker, and the upload affordance.
 *
 * Repo convention (see ActivityPanelBurstRow.test.tsx, use-editor-mode.test.ts):
 * no @testing-library/react, no happy-dom. Structural cases use
 * `renderToString`; storage helpers are unit-tested with localStorage fakes.
 *
 * Interactive cases (trigger click toggling open/closed; re-mount reading
 * persisted state through DOM lifecycle) are covered indirectly:
 *   - The Collapsible's `open`/`onOpenChange` wiring is structural; if the
 *     `onOpenChange` calls both setState and `persistAdvancedOpenState`, a
 *     remount reading via `readAdvancedOpenState` will reflect the change.
 *     Both halves are unit-tested below.
 *   - The Playwright suite at packages/app/tests/a11y/component-blocks.e2e.ts
 *     (A11Y01 Tab cycle, A11Y03 Esc close) exercises the panel end-to-end.
 */

import { describe, expect, test } from 'bun:test';
import type { PropDef } from '@inkeep/open-knowledge-core';
import { renderToString } from 'react-dom/server';
import type { JsxComponentDescriptor } from '../registry/types.ts';

const {
  countAdvancedSet,
  getAutoFocusedPropName,
  PropPanel,
  persistAdvancedOpenState,
  readAdvancedOpenState,
} = await import('./PropPanel.tsx');

// ---------------------------------------------------------------------------
// localStorage fake — the read/write helpers swallow throws and treat
// undefined `localStorage` as "no storage". Replace the global per test.
// ---------------------------------------------------------------------------

interface FakeStorage {
  store: Record<string, string>;
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
  clear: () => void;
}

function makeFakeStorage(): FakeStorage {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
    removeItem: (k) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

function withFakeStorage<T>(fn: (s: FakeStorage) => T): T {
  const fake = makeFakeStorage();
  const original = (globalThis as { localStorage?: Storage }).localStorage;
  // Cast the shape — the helpers only call getItem / setItem.
  (globalThis as { localStorage?: unknown }).localStorage = fake as unknown as Storage;
  try {
    return fn(fake);
  } finally {
    if (original === undefined) {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    } else {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  }
}

// ---------------------------------------------------------------------------
// Descriptor fixtures — minimum surface PropPanel reads.
// ---------------------------------------------------------------------------

function NoopComponent() {
  return null;
}

function makeCanonicalDescriptor(name: string, props: PropDef[]): JsxComponentDescriptor {
  return {
    name,
    surface: 'canonical',
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    hasChildren: false,
    props,
    serialize: () => ({ type: 'paragraph', children: [] }),
    Component: NoopComponent,
    reactNodePropNames: new Set(),
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('countAdvancedSet', () => {
  test('returns 0 when no advanced props are set away from default', () => {
    const advanced: PropDef[] = [
      {
        name: 'loading',
        type: 'enum',
        enumValues: ['eager', 'lazy'],
        defaultValue: 'lazy',
        advanced: true,
        required: false,
      },
      { name: 'srcset', type: 'string', advanced: true, required: false },
    ];
    expect(countAdvancedSet(advanced, {})).toBe(0);
    expect(countAdvancedSet(advanced, { loading: 'lazy' })).toBe(0);
    expect(countAdvancedSet(advanced, { srcset: undefined })).toBe(0);
  });

  test('counts a prop as set when its value differs from the declared default', () => {
    const advanced: PropDef[] = [
      {
        name: 'loading',
        type: 'enum',
        enumValues: ['eager', 'lazy'],
        defaultValue: 'lazy',
        advanced: true,
        required: false,
      },
      { name: 'srcset', type: 'string', advanced: true, required: false },
      { name: 'title', type: 'string', advanced: true, required: false },
    ];
    expect(countAdvancedSet(advanced, { loading: 'eager', srcset: 'x.png 1x', title: 'tip' })).toBe(
      3,
    );
  });

  test('a prop with no defaultValue counts as set when value is anything but undefined', () => {
    const advanced: PropDef[] = [
      { name: 'srcset', type: 'string', advanced: true, required: false },
    ];
    expect(countAdvancedSet(advanced, { srcset: '' })).toBe(1);
    expect(countAdvancedSet(advanced, { srcset: undefined })).toBe(0);
  });
});

describe('localStorage round-trip', () => {
  test('returns false when no entry is present', () => {
    withFakeStorage(() => {
      expect(readAdvancedOpenState('img')).toBe(false);
    });
  });

  test('persist + read round-trip preserves true', () => {
    withFakeStorage((fake) => {
      persistAdvancedOpenState('img', true);
      expect(fake.store['ok.propPanel.advanced.img']).toBe('true');
      expect(readAdvancedOpenState('img')).toBe(true);
    });
  });

  test('persist false stores false', () => {
    withFakeStorage((fake) => {
      persistAdvancedOpenState('img', true);
      persistAdvancedOpenState('img', false);
      expect(fake.store['ok.propPanel.advanced.img']).toBe('false');
      expect(readAdvancedOpenState('img')).toBe(false);
    });
  });

  test('per-descriptor scoping — opening img does not open Callout', () => {
    withFakeStorage(() => {
      persistAdvancedOpenState('img', true);
      expect(readAdvancedOpenState('Callout')).toBe(false);
      expect(readAdvancedOpenState('img')).toBe(true);
    });
  });

  test('returns false when localStorage is unavailable', () => {
    const original = (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { localStorage?: unknown }).localStorage;
    try {
      expect(readAdvancedOpenState('img')).toBe(false);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = original;
    }
  });
});

// ---------------------------------------------------------------------------
// Static markup — Advanced section presence + count badge
// ---------------------------------------------------------------------------

describe('PropPanel — Advanced collapsible section', () => {
  test('(a) descriptor with no advanced props renders no Collapsible', () => {
    const d = makeCanonicalDescriptor('NoAdvanced', [
      { name: 'src', type: 'string', required: true },
      { name: 'alt', type: 'string', required: false },
    ]);
    const html = withFakeStorage(() =>
      renderToString(<PropPanel descriptor={d} values={{}} onChange={() => {}} />),
    );
    expect(html).not.toContain('data-prop-panel-advanced-trigger');
    expect(html).not.toContain('data-slot="collapsible"');
  });

  test('(b) descriptor with advanced props renders Collapsible closed by default', () => {
    const d = makeCanonicalDescriptor('WithAdvanced', [
      { name: 'src', type: 'string', required: true },
      { name: 'srcset', type: 'string', advanced: true, required: false },
    ]);
    const html = withFakeStorage(() =>
      renderToString(<PropPanel descriptor={d} values={{}} onChange={() => {}} />),
    );
    expect(html).toContain('data-prop-panel-advanced-trigger');
    expect(html).toContain('data-state="closed"');
    // The trigger label is "Advanced".
    expect(html).toContain('Advanced');
  });

  test('(d) count badge: hidden when 0; shows N when N props non-default', () => {
    const d = makeCanonicalDescriptor('Img', [
      { name: 'src', type: 'string', required: true },
      {
        name: 'loading',
        type: 'enum',
        enumValues: ['eager', 'lazy'],
        defaultValue: 'lazy',
        advanced: true,
        required: false,
      },
      { name: 'srcset', type: 'string', advanced: true, required: false },
      { name: 'title', type: 'string', advanced: true, required: false },
    ]);

    // 0 set → no badge
    const htmlZero = withFakeStorage(() =>
      renderToString(<PropPanel descriptor={d} values={{}} onChange={() => {}} />),
    );
    expect(htmlZero).not.toContain('data-prop-panel-advanced-count');

    // 2 set (loading away from default + srcset present)
    const htmlTwo = withFakeStorage(() =>
      renderToString(
        <PropPanel
          descriptor={d}
          values={{ loading: 'eager', srcset: 'x.png 1x' }}
          onChange={() => {}}
        />,
      ),
    );
    expect(htmlTwo).toContain('data-prop-panel-advanced-count');
    expect(htmlTwo).toContain('>2<');
  });

  test('(b/e) initial open state honors localStorage on mount', () => {
    const d = makeCanonicalDescriptor('Img', [
      { name: 'srcset', type: 'string', advanced: true, required: false },
    ]);
    const html = withFakeStorage(() => {
      persistAdvancedOpenState('Img', true);
      return renderToString(<PropPanel descriptor={d} values={{}} onChange={() => {}} />);
    });
    expect(html).toContain('data-state="open"');
  });
});

describe('getAutoFocusedPropName', () => {
  test('returns null when no prop has autoFocus', () => {
    const props: PropDef[] = [
      { name: 'src', type: 'string', required: true },
      { name: 'alt', type: 'string', required: false },
    ];
    expect(getAutoFocusedPropName(props)).toBeNull();
  });

  test('returns the first PropDefString with autoFocus: true', () => {
    const props: PropDef[] = [
      { name: 'alt', type: 'string', required: false },
      { name: 'src', type: 'string', required: true, autoFocus: true },
      { name: 'title', type: 'string', required: false, autoFocus: true },
    ];
    expect(getAutoFocusedPropName(props)).toBe('src');
  });

  test('skips hidden props', () => {
    const props: PropDef[] = [
      { name: 'internal', type: 'string', required: false, autoFocus: true, hidden: true },
      { name: 'src', type: 'string', required: true, autoFocus: true },
    ];
    expect(getAutoFocusedPropName(props)).toBe('src');
  });

  test('only matches PropDefString — number/enum/boolean autoFocus is not honored', () => {
    // PropDefBoolean does not declare an autoFocus field per D3 LOCKED. The
    // helper deliberately checks `type === 'string'` to avoid TS escape
    // hatches accidentally surfacing a non-string focus target.
    const props: PropDef[] = [
      // biome-ignore lint/suspicious/noExplicitAny: synthetic shape — autoFocus only valid on string in the type
      { name: 'count', type: 'number', required: false, autoFocus: true } as any,
      { name: 'src', type: 'string', required: true, autoFocus: true },
    ];
    expect(getAutoFocusedPropName(props)).toBe('src');
  });

  test('skips advanced props — would be inside collapsed CollapsibleContent on mount', () => {
    // Defensive guard: a prop with `advanced: true` lives inside the
    // Collapsible (closed by default), so its `<Input>` is not visible on
    // mount. Honoring `autoFocus` on it would tell the browser to focus a
    // hidden element. The helper skips advanced props so the next
    // common-tier autoFocus prop wins, or null if none.
    const props: PropDef[] = [
      { name: 'srcset', type: 'string', required: false, autoFocus: true, advanced: true },
      { name: 'src', type: 'string', required: true, autoFocus: true },
    ];
    expect(getAutoFocusedPropName(props)).toBe('src');
  });

  test('returns null when only advanced prop has autoFocus (no common-tier fallback)', () => {
    const props: PropDef[] = [
      { name: 'srcset', type: 'string', required: false, autoFocus: true, advanced: true },
      { name: 'alt', type: 'string', required: false },
    ];
    expect(getAutoFocusedPropName(props)).toBeNull();
  });
});

describe('PropPanel — upload button affordance', () => {
  test('(a) renders upload button when prop has accept set', () => {
    const d = makeCanonicalDescriptor('img', [
      {
        name: 'src',
        type: 'string',
        required: true,
        accept: ['image/png', 'image/jpeg'],
      },
    ]);
    const html = withFakeStorage(() =>
      renderToString(<PropPanel descriptor={d} values={{}} onChange={() => {}} />),
    );
    expect(html).toContain('data-prop-upload-trigger');
    expect(html).toContain('data-prop-upload-input');
    expect(html).toContain('accept="image/png,image/jpeg"');
  });

  test('(a) does NOT render upload button when prop has no accept', () => {
    const d = makeCanonicalDescriptor('Callout', [
      { name: 'title', type: 'string', required: false },
    ]);
    const html = withFakeStorage(() =>
      renderToString(<PropPanel descriptor={d} values={{}} onChange={() => {}} />),
    );
    expect(html).not.toContain('data-prop-upload-trigger');
    expect(html).not.toContain('data-prop-upload-input');
  });

  test('upload button uses aria-label="Upload file"', () => {
    const d = makeCanonicalDescriptor('img', [
      { name: 'src', type: 'string', required: true, accept: ['image/png'] },
    ]);
    const html = withFakeStorage(() =>
      renderToString(<PropPanel descriptor={d} values={{}} onChange={() => {}} />),
    );
    expect(html).toMatch(/aria-label="Upload file"/);
  });
});

describe('PropPanel — autoFocus marker on string Input', () => {
  test('(e) descriptor with autoFocus prop renders data-prop-autofocus on its Input', () => {
    const d = makeCanonicalDescriptor('img', [
      { name: 'src', type: 'string', required: true, autoFocus: true },
      { name: 'alt', type: 'string', required: false },
    ]);
    const html = withFakeStorage(() =>
      renderToString(<PropPanel descriptor={d} values={{}} onChange={() => {}} />),
    );
    // Marker is rendered for the first matching prop only.
    const matches = html.match(/data-prop-autofocus=""/g) ?? [];
    expect(matches.length).toBe(1);
  });

  test('(f) descriptor without autoFocus renders no autofocus marker', () => {
    const d = makeCanonicalDescriptor('Callout', [
      { name: 'title', type: 'string', required: false },
      { name: 'icon', type: 'string', required: false },
    ]);
    const html = withFakeStorage(() =>
      renderToString(<PropPanel descriptor={d} values={{}} onChange={() => {}} />),
    );
    expect(html).not.toContain('data-prop-autofocus');
  });
});

// runUpload unit tests were removed — Bun on Linux fires its
// unhandled-rejection observer for any rejected promise constructed in
// the same `mock.module()` scope (regardless of rejection shape: string,
// object, Error, throw-inside-async-body, Promise.reject with synchronous
// .catch pre-attach, or process.on('unhandledRejection') absorbing
// handler — all five tried, all five failed). The observer's event
// bleeds into the next test file's `##[group]` boundary
// (image-upload/upload-file.test.ts) and reports every test there as
// failed, regardless of whether the await/then chain actually catches
// the rejection. The function is 8 lines of standard try/catch + toast;
// runtime exercise via the PropPanel UI provides equivalent coverage at
// a layer Bun's observer doesn't intermediate.
