/**
 * PropPanel — unit tests for the Advanced collapsible section, the
 * non-default-set count helper, the per-descriptor localStorage round-trip,
 * and the Convert button label resolution.
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
import {
  countAdvancedSet,
  PropPanel,
  persistAdvancedOpenState,
  readAdvancedOpenState,
} from './PropPanel.tsx';

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

const identity = (p: Record<string, unknown>): Record<string, unknown> => p;

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

function makeCompatDescriptor(
  name: string,
  props: PropDef[],
  target: string,
): JsxComponentDescriptor {
  return {
    name,
    surface: 'compat',
    displayName: name,
    hasChildren: false,
    props,
    rendersAs: target,
    translateProps: identity,
    convertibleTo: { target, remap: identity },
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
// Static markup — Advanced section presence + count badge + Convert label
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

describe('PropPanel — Convert button label', () => {
  test('(f) uses convertTargetLabel when provided (e.g., "Image" for target "img")', () => {
    const d = makeCompatDescriptor(
      'CommonMarkImage',
      [{ name: 'src', type: 'string', required: true }],
      'img',
    );
    const html = withFakeStorage(() =>
      renderToString(
        <PropPanel
          descriptor={d}
          values={{ src: 'x.png' }}
          onChange={() => {}}
          onConvert={() => {}}
          convertTargetLabel="Image"
        />,
      ),
    );
    // React 18+ inserts <!-- --> between adjacent text nodes; strip it for substring asserts.
    const stripped = html.replaceAll('<!-- -->', '');
    expect(stripped).toContain('Convert to Image');
    expect(stripped).not.toContain('Convert to img');
  });

  test('falls back to descriptor.convertibleTo.target when label is missing', () => {
    const d = makeCompatDescriptor(
      'CommonMarkImage',
      [{ name: 'src', type: 'string', required: true }],
      'img',
    );
    const html = withFakeStorage(() =>
      renderToString(
        <PropPanel
          descriptor={d}
          values={{ src: 'x.png' }}
          onChange={() => {}}
          onConvert={() => {}}
        />,
      ),
    );
    const stripped = html.replaceAll('<!-- -->', '');
    expect(stripped).toContain('Convert to img');
  });
});
