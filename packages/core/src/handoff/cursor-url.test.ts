import { expect, test } from 'bun:test';
import { buildCursorUrl } from './cursor-url.ts';
import type { HandoffPayload } from './types.ts';

function payload(overrides: Partial<HandoffPayload> = {}): HandoffPayload {
  return {
    target: 'cursor',
    projectDir: '/Users/who/proj',
    docPath: '/Users/who/proj/docs/note.md',
    prompt: 'open this',
    ...overrides,
  };
}

test('buildCursorUrl emits the prompt-router path + single-encoded basename + literal mode=agent', () => {
  expect(buildCursorUrl(payload())).toBe(
    'cursor://anysphere.cursor-deeplink/prompt?text=open%2520this&workspace=proj&mode=agent',
  );
});

test('buildCursorUrl double-encodes literal % in prompt (% → %2525)', () => {
  const url = buildCursorUrl(payload({ prompt: 'a%b' }));
  // First encode: 'a%25b'; second encode: 'a%2525b' (% becomes %25)
  expect(url).toContain('text=a%2525b');
});

test('buildCursorUrl double-encodes em-dash in prompt (— → %25E2%2580%2594)', () => {
  const url = buildCursorUrl(payload({ prompt: 'a — b' }));
  // First: 'a%20%E2%80%94%20b'; second: 'a%2520%25E2%2580%2594%2520b'
  expect(url).toContain('text=a%2520%25E2%2580%2594%2520b');
});

test('buildCursorUrl prevents silent-corruption of %41 (literal) — double-encode round-trips cleanly', () => {
  // The `%41` in a user's prompt would under single-encode decode twice to `A`
  // (silent corruption per evidence Finding 4). Double-encoding produces
  // on-wire bytes that decode to `%41` → then to the literal `%41` string.
  const url = buildCursorUrl(payload({ prompt: 'check %41 please' }));
  // First: 'check%20%2541%20please'; second: 'check%2520%252541%2520please'
  expect(url).toContain('text=check%2520%252541%2520please');

  // Verify the two-pass decode round-trips cleanly to the original prompt
  // (this is the invariant that protects against silent corruption).
  const text = url.match(/text=([^&]+)/)?.[1];
  expect(decodeURIComponent(decodeURIComponent(text))).toBe('check %41 please');
});

test('buildCursorUrl prevents silent-corruption of pct-encoded URL in prompt', () => {
  const url = buildCursorUrl(payload({ prompt: 'see https://example.com/p?q=a%20b' }));
  // The inner `%20` would under single-encode decode twice to a space (silent
  // corruption). Double-encode round-trips cleanly.
  const text = url.match(/text=([^&]+)/)?.[1];
  expect(decodeURIComponent(decodeURIComponent(text))).toBe('see https://example.com/p?q=a%20b');
});

test('buildCursorUrl double-encodes literal & in prompt — DC8.5', () => {
  const url = buildCursorUrl(payload({ prompt: 'A & B' }));
  // First: 'A%20%26%20B'; second: 'A%2520%2526%2520B'
  expect(url).toContain('text=A%2520%2526%2520B');
  // Exactly 2 literal & (text→workspace, workspace→mode) — the prompt's & is escaped
  expect(url.split('&').length - 1).toBe(2);
});

test('buildCursorUrl takes basename of POSIX projectDir for workspace=', () => {
  const url = buildCursorUrl(payload({ projectDir: '/Users/who/projects/open-knowledge' }));
  expect(url).toContain('&workspace=open-knowledge&');
});

test('buildCursorUrl takes basename of Windows projectDir for workspace= — DC8.5', () => {
  const url = buildCursorUrl(payload({ projectDir: 'C:\\Users\\who\\projects\\open-knowledge' }));
  expect(url).toContain('&workspace=open-knowledge&');
});

test('buildCursorUrl single-encodes spaces in workspace basename', () => {
  const url = buildCursorUrl(payload({ projectDir: '/Users/who/My Project' }));
  // basename 'My Project' → single-encoded '%20' (NOT double-encoded like text=)
  expect(url).toContain('&workspace=My%20Project&');
});

test('buildCursorUrl mode= is the literal enum value (not encoded)', () => {
  const url = buildCursorUrl(payload());
  // URL ends with literal &mode=agent — no encoding, not a query-string tail
  expect(url.endsWith('&mode=agent')).toBe(true);
});
