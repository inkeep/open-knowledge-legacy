import { describe, expect, test } from 'bun:test';
import { ALLOWED_SCHEMES, checkOutboundUrl } from '../../src/main/shell-allowlist.ts';

// Drift-detector import — will be unskipped in US-007 once KNOWN_TARGETS exists
// in packages/app/src/lib/handoff/targets.ts. Keep as a commented import until
// that story lands. The drift-detector test below is `.skip`ed in the
// meantime per specs/2026-04-21-open-in-agent-desktop/ US-003 notes.
//
// import { KNOWN_TARGETS } from '@inkeep/open-knowledge-app/src/lib/handoff/targets.ts';

describe('checkOutboundUrl (D47 outbound scheme allowlist)', () => {
  test('allows https:', () => {
    expect(checkOutboundUrl('https://example.com')).toEqual({ ok: true });
  });

  test('allows http:', () => {
    expect(checkOutboundUrl('http://example.com')).toEqual({ ok: true });
  });

  test('allows mailto:', () => {
    expect(checkOutboundUrl('mailto:hello@example.com')).toEqual({ ok: true });
  });

  test('allows openknowledge: (our own deep-link scheme)', () => {
    expect(checkOutboundUrl('openknowledge://open?project=/tmp')).toEqual({ ok: true });
  });

  test('rejects ms-msdt: (Shabarkin 2022 RCE class)', () => {
    const result = checkOutboundUrl('ms-msdt:launch?id=xyz');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('scheme-not-allowed');
  });

  test('rejects file:', () => {
    const result = checkOutboundUrl('file:///etc/passwd');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('scheme-not-allowed');
  });

  test('rejects javascript:', () => {
    const result = checkOutboundUrl('javascript:alert(1)');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('scheme-not-allowed');
  });

  test('rejects search-ms:', () => {
    const result = checkOutboundUrl('search-ms:query=x');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('scheme-not-allowed');
  });

  test('rejects malformed URL', () => {
    const result = checkOutboundUrl('not a url');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid-url');
  });
});

describe('ALLOWED_SCHEMES exact-set contract (D47 + handoff extension)', () => {
  test('exact-set allowlist membership', () => {
    // Per specs/2026-04-21-open-in-agent-desktop/ §6.6 — reviewer can grep for
    // this list to find every scheme shell.openExternal will dispatch. Any
    // addition requires a spec-level decision + per-scheme JSDoc rationale.
    expect([...ALLOWED_SCHEMES].sort()).toEqual([
      'claude:',
      'codex:',
      'cursor:',
      'http:',
      'https:',
      'mailto:',
      'openknowledge:',
    ]);
  });
});

describe('checkOutboundUrl — handoff scheme coverage (specs/2026-04-21-open-in-agent-desktop §6.6)', () => {
  test.each([
    ['claude://cowork/new?q=x&folder=y&file=z', true],
    ['claude://code/new?q=x&folder=y&file=z', true],
    ['codex://new?prompt=x&path=y', true],
    ['cursor://anysphere.cursor-deeplink/prompt?text=x&workspace=y&mode=agent', true],
    ['file:///etc/passwd', false],
    ['ms-msdt:/id/PCWDiagnostic', false],
    ['javascript:alert(1)', false],
  ] as const)('checkOutboundUrl(%s).ok === %s', (url, expected) => {
    expect(checkOutboundUrl(url).ok).toBe(expected);
  });
});

describe('drift detector — KNOWN_TARGETS schemes ⊆ ALLOWED_SCHEMES', () => {
  // Unskip this test in US-007 (specs/2026-04-21-open-in-agent-desktop/) when
  // KNOWN_TARGETS is introduced in packages/app/src/lib/handoff/targets.ts.
  // Uncomment the import at the top of this file and remove `.skip` below.
  //
  // Intent: if a future spec adds a target to KNOWN_TARGETS without also
  // adding its scheme to ALLOWED_SCHEMES, this test fails at PR tier and
  // blocks the merge. Operates on the pure-data `KNOWN_TARGETS` constant
  // per specs §6.1.5 / E1-b DIRECTED (no registry type; hand-rolled switch).
  test.skip('every KNOWN_TARGETS scheme is in ALLOWED_SCHEMES', () => {
    // const knownSchemes = new Set(KNOWN_TARGETS.flatMap((t) => t.schemes));
    // for (const scheme of knownSchemes) {
    //   expect(ALLOWED_SCHEMES.has(scheme)).toBe(true);
    // }
  });
});
