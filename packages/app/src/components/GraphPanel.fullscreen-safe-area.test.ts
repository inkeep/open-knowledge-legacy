import { describe, expect, test } from 'bun:test';
import SRC from './GraphPanel?raw';

const SAFE_AREA_AFFORDANCES: ReadonlyArray<{ marker: string; rationale: string }> = [
  { marker: 'pl-[78px]', rationale: 'inline literal mirroring EditorHeader.tsx:69' },
  {
    marker: 'pl-[var(--ok-titlebar-reserve-left,1rem)]',
    rationale: 'CSS-variable indirection with web-safe 1rem fallback',
  },
];

describe('GraphPanel — fullscreen-overlay safe-area contract', () => {
  test('expanded-state overlay reserves macOS traffic-light footprint', () => {
    const matchedMarkers = SAFE_AREA_AFFORDANCES.filter(({ marker }) => SRC.includes(marker));
    if (matchedMarkers.length === 0) {
      const lines = [
        'GraphPanel.tsx does not adopt any known safe-area affordance for its',
        'fullscreen-overlay state. The macOS traffic-light region (x=22..~100,',
        'y=18..30) is currently overlapped by the PanelHeader content at',
        '(x≈16, y≈12) when `isExpanded === true`.',
        '',
        'Expected one of:',
        ...SAFE_AREA_AFFORDANCES.map(({ marker, rationale }) => `  - "${marker}"  (${rationale})`),
        '',
        'If a genuinely new shape is required, extend `SAFE_AREA_AFFORDANCES`',
        'above in the same commit that introduces it.',
      ];
      throw new Error(lines.join('\n'));
    }
    expect(matchedMarkers.length).toBeGreaterThan(0);
  });

  test('expanded-state className expression is NOT the bare bug-present literal', () => {
    expect(SRC).not.toContain("'fixed inset-0 z-50 bg-background overflow-hidden'");
  });

  test('safe-area CSS-variable reserve carries a web-safe var() fallback', () => {
    expect(SRC).not.toContain('pl-[var(--ok-titlebar-reserve-left)]');
  });
});
