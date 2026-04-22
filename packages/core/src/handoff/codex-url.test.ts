import { expect, test } from 'bun:test';
import { buildCodexUrl } from './codex-url.ts';
import type { HandoffPayload } from './types.ts';

function payload(overrides: Partial<HandoffPayload> = {}): HandoffPayload {
  return {
    target: 'codex',
    projectDir: '/Users/who/proj',
    docPath: '/Users/who/proj/docs/note.md',
    prompt: 'open this',
    ...overrides,
  };
}

test('buildCodexUrl emits codex://new?prompt=...&path=... with single-encoded params', () => {
  expect(buildCodexUrl(payload())).toBe(
    'codex://new?prompt=open%20this&path=%2FUsers%2Fwho%2Fproj',
  );
});

test('buildCodexUrl single-encodes % in path', () => {
  const url = buildCodexUrl(payload({ projectDir: '/Users/who/My %Project' }));
  expect(url).toContain('&path=%2FUsers%2Fwho%2FMy%20%25Project');
});

test('buildCodexUrl single-encodes em-dash and unicode in prompt', () => {
  const url = buildCodexUrl(payload({ prompt: 'Read café — notes about the feature' }));
  // é → %C3%A9; em-dash U+2014 → %E2%80%94; space → %20
  expect(url).toContain('prompt=Read%20caf%C3%A9%20%E2%80%94%20notes%20about%20the%20feature');
});

test('buildCodexUrl single-encodes literal & in path — DC8.5', () => {
  const url = buildCodexUrl(payload({ projectDir: '/Users/who/A & B' }));
  // & → %26; exactly one literal & in the URL (the prompt→path separator)
  expect(url).toContain('&path=%2FUsers%2Fwho%2FA%20%26%20B');
  expect(url.split('&').length - 1).toBe(1);
});

test('buildCodexUrl does NOT thread docPath (only projectDir via path=)', () => {
  const url = buildCodexUrl(payload({ docPath: '/Users/who/proj/docs/SPECIFIC-FILE.md' }));
  expect(url).not.toContain('SPECIFIC-FILE');
  expect(url).not.toContain('file=');
});
