import { expect, test } from 'bun:test';
import { buildCursorUrl } from './cursor-url.ts';
import { composeProjectPrompt } from './prompt-composer.ts';
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
  expect(url).toContain('text=a%2525b');
});

test('buildCursorUrl double-encodes em-dash in prompt (— → %25E2%2580%2594)', () => {
  const url = buildCursorUrl(payload({ prompt: 'a — b' }));
  expect(url).toContain('text=a%2520%25E2%2580%2594%2520b');
});

test('buildCursorUrl prevents silent-corruption of %41 (literal) — double-encode round-trips cleanly', () => {
  const url = buildCursorUrl(payload({ prompt: 'check %41 please' }));
  expect(url).toContain('text=check%2520%252541%2520please');

  const text = url.match(/text=([^&]+)/)?.[1];
  expect(decodeURIComponent(decodeURIComponent(text))).toBe('check %41 please');
});

test('buildCursorUrl prevents silent-corruption of pct-encoded URL in prompt', () => {
  const url = buildCursorUrl(payload({ prompt: 'see https://example.com/p?q=a%20b' }));
  const text = url.match(/text=([^&]+)/)?.[1];
  expect(decodeURIComponent(decodeURIComponent(text))).toBe('see https://example.com/p?q=a%20b');
});

test('buildCursorUrl double-encodes literal & in prompt — DC8.5', () => {
  const url = buildCursorUrl(payload({ prompt: 'A & B' }));
  expect(url).toContain('text=A%2520%2526%2520B');
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
  expect(url).toContain('&workspace=My%20Project&');
});

test('buildCursorUrl mode= is the literal enum value (not encoded)', () => {
  const url = buildCursorUrl(payload());
  expect(url.endsWith('&mode=agent')).toBe(true);
});

test('buildCursorUrl defensive empty-prompt drops text= and keeps workspace + mode', () => {
  const url = buildCursorUrl(payload({ prompt: '', docPath: '' }));
  expect(url).toBe('cursor://anysphere.cursor-deeplink/prompt?workspace=proj&mode=agent');
  expect(url).not.toContain('text=');
});

test('buildCursorUrl project-scoped (composeProjectPrompt) double-encodes prompt + keeps workspace + mode', () => {
  const prompt = composeProjectPrompt();
  const url = buildCursorUrl(payload({ prompt, docPath: '' }));
  const doubleEncoded = encodeURIComponent(encodeURIComponent(prompt));
  expect(url).toBe(
    `cursor://anysphere.cursor-deeplink/prompt?text=${doubleEncoded}&workspace=proj&mode=agent`,
  );
});
