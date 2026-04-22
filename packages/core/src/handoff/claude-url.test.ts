import { expect, test } from 'bun:test';
import { buildClaudeUrl } from './claude-url.ts';
import type { HandoffPayload } from './types.ts';

function payload(overrides: Partial<HandoffPayload> = {}): HandoffPayload {
  return {
    target: 'claude-cowork',
    projectDir: '/Users/who/proj',
    docPath: '/Users/who/proj/docs/note.md',
    prompt: 'open this',
    ...overrides,
  };
}

test('buildClaudeUrl emits claude://cowork/new?q=...&folder=...&file=... for cowork mode', () => {
  expect(buildClaudeUrl({ mode: 'cowork' }, payload())).toBe(
    'claude://cowork/new?q=open%20this&folder=%2FUsers%2Fwho%2Fproj&file=%2FUsers%2Fwho%2Fproj%2Fdocs%2Fnote.md',
  );
});

test('buildClaudeUrl emits claude://code/new?q=...&folder=...&file=... for code mode', () => {
  expect(buildClaudeUrl({ mode: 'code' }, payload({ target: 'claude-code' }))).toBe(
    'claude://code/new?q=open%20this&folder=%2FUsers%2Fwho%2Fproj&file=%2FUsers%2Fwho%2Fproj%2Fdocs%2Fnote.md',
  );
});

test('buildClaudeUrl single-encodes literal % in path (cowork)', () => {
  const url = buildClaudeUrl(
    { mode: 'cowork' },
    payload({
      projectDir: '/Users/who/My %Project',
      docPath: '/Users/who/My %Project/a.md',
    }),
  );
  expect(url).toContain('&folder=%2FUsers%2Fwho%2FMy%20%25Project');
  expect(url).toContain('&file=%2FUsers%2Fwho%2FMy%20%25Project%2Fa.md');
});

test('buildClaudeUrl single-encodes em-dash in path (code)', () => {
  const url = buildClaudeUrl(
    { mode: 'code' },
    payload({
      target: 'claude-code',
      docPath: '/Users/who/proj/café — notes.md',
    }),
  );
  // em-dash U+2014 → UTF-8 E2 80 94 → %E2%80%94; é → %C3%A9; space → %20
  expect(url).toContain('&file=%2FUsers%2Fwho%2Fproj%2Fcaf%C3%A9%20%E2%80%94%20notes.md');
});

test('buildClaudeUrl single-encodes unicode (é) in path (cowork)', () => {
  const url = buildClaudeUrl(
    { mode: 'cowork' },
    payload({ docPath: '/Users/who/proj/café-notes.md' }),
  );
  expect(url).toContain('&file=%2FUsers%2Fwho%2Fproj%2Fcaf%C3%A9-notes.md');
});

test('buildClaudeUrl single-encodes space in path (code)', () => {
  const url = buildClaudeUrl(
    { mode: 'code' },
    payload({
      target: 'claude-code',
      projectDir: '/Users/who/My Project',
      docPath: '/Users/who/My Project/README.md',
    }),
  );
  expect(url).toContain('&folder=%2FUsers%2Fwho%2FMy%20Project');
  expect(url).toContain('&file=%2FUsers%2Fwho%2FMy%20Project%2FREADME.md');
});

test('buildClaudeUrl single-encodes literal & in filename (cowork) — DC8.5', () => {
  const url = buildClaudeUrl(
    { mode: 'cowork' },
    payload({
      projectDir: '/Users/who/A & B',
      docPath: '/Users/who/A & B/doc.md',
    }),
  );
  // & → %26; each separator stays as %2F; URL's three &-separators between
  // query params remain literal &, but the path itself contains %26 not &
  expect(url).toContain('&folder=%2FUsers%2Fwho%2FA%20%26%20B');
  expect(url).toContain('&file=%2FUsers%2Fwho%2FA%20%26%20B%2Fdoc.md');
  // Exactly 2 literal & (q→folder, folder→file) — the path's & is escaped
  expect(url.split('&').length - 1).toBe(2);
});

test('buildClaudeUrl single-encodes # in filename (code) — DC8.5', () => {
  const url = buildClaudeUrl(
    { mode: 'code' },
    payload({
      target: 'claude-code',
      docPath: '/Users/who/proj/notes#1.md',
    }),
  );
  // # → %23
  expect(url).toContain('&file=%2FUsers%2Fwho%2Fproj%2Fnotes%231.md');
  // No bare # in the URL (would terminate the query string otherwise)
  expect(url.includes('#')).toBe(false);
});

test('buildClaudeUrl single-encodes Windows backslash path (cowork) — DC8.5', () => {
  const url = buildClaudeUrl(
    { mode: 'cowork' },
    payload({
      projectDir: 'C:\\Users\\who\\proj',
      docPath: 'C:\\Users\\who\\proj\\docs\\note.md',
    }),
  );
  // \ → %5C; : → %3A
  expect(url).toContain('&folder=C%3A%5CUsers%5Cwho%5Cproj');
  expect(url).toContain('&file=C%3A%5CUsers%5Cwho%5Cproj%5Cdocs%5Cnote.md');
});
