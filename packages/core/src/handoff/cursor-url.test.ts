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

test('buildCursorUrl emits cwd-only workspace + mode=agent for doc-scoped handoff', () => {
  expect(buildCursorUrl(payload())).toBe(
    'cursor://anysphere.cursor-deeplink/prompt?workspace=proj&mode=agent',
  );
});

test('buildCursorUrl doc-scoped omits text= even when prompt contains literal %', () => {
  const url = buildCursorUrl(payload({ prompt: 'a%b' }));
  expect(url).not.toContain('text=');
  expect(url).not.toContain('a%25b');
  expect(url).not.toContain('a%2525b');
});

test('buildCursorUrl doc-scoped omits text= even when prompt contains em-dash', () => {
  const url = buildCursorUrl(payload({ prompt: 'a — b' }));
  expect(url).not.toContain('text=');
  expect(url).not.toContain('%E2%80%94');
  expect(url).not.toContain('%25E2%2580%2594');
});

test('buildCursorUrl doc-scoped omits text= even when prompt contains literal %41', () => {
  const url = buildCursorUrl(payload({ prompt: 'check %41 please' }));
  expect(url).not.toContain('text=');
  expect(url).not.toContain('%2541');
  expect(url).not.toContain('%252541');
});

test('buildCursorUrl doc-scoped omits text= even when prompt contains a pct-encoded URL', () => {
  const url = buildCursorUrl(payload({ prompt: 'see https://example.com/p?q=a%20b' }));
  expect(url).not.toContain('text=');
  expect(url).not.toContain('example.com');
});

test('buildCursorUrl doc-scoped omits text= even when prompt contains literal & — DC8.5', () => {
  const url = buildCursorUrl(payload({ prompt: 'A & B' }));
  expect(url).not.toContain('text=');
  expect(url.split('&').length - 1).toBe(1);
});

test('buildCursorUrl takes basename of POSIX projectDir for workspace= (doc-scoped, no text=)', () => {
  const url = buildCursorUrl(payload({ projectDir: '/Users/who/projects/open-knowledge' }));
  expect(url).toBe('cursor://anysphere.cursor-deeplink/prompt?workspace=open-knowledge&mode=agent');
});

test('buildCursorUrl takes basename of Windows projectDir for workspace= — DC8.5 (doc-scoped, no text=)', () => {
  const url = buildCursorUrl(payload({ projectDir: 'C:\\Users\\who\\projects\\open-knowledge' }));
  expect(url).toBe('cursor://anysphere.cursor-deeplink/prompt?workspace=open-knowledge&mode=agent');
});

test('buildCursorUrl single-encodes spaces in workspace basename (doc-scoped, no text=)', () => {
  const url = buildCursorUrl(payload({ projectDir: '/Users/who/My Project' }));
  expect(url).toBe('cursor://anysphere.cursor-deeplink/prompt?workspace=My%20Project&mode=agent');
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

test('buildCursorUrl project-scoped double-encodes adversarial prompt (round-trip invariant)', () => {
  const adversarialPrompt = 'check %41 and https://x.com/p?q=a%20b please';
  const url = buildCursorUrl(payload({ prompt: adversarialPrompt, docPath: '' }));
  const text = url.match(/text=([^&]+)/)?.[1];
  expect(text).toBeDefined();
  expect(decodeURIComponent(decodeURIComponent(text as string))).toBe(adversarialPrompt);
});

test('INVARIANT: doc-scoped buildCursorUrl never emits text=, across input variations', () => {
  const cases: ReadonlyArray<{
    projectDir: string;
    docPath: string;
    prompt: string;
  }> = [
    { projectDir: '/Users/a/proj', docPath: '/Users/a/proj/a.md', prompt: 'hi' },
    {
      projectDir: '/Users/a/proj',
      docPath: '/Users/a/proj/sub/x.md',
      prompt: 'longer prompt with spaces',
    },
    {
      projectDir: '/Users/a/My Project',
      docPath: '/Users/a/My Project/note.md',
      prompt: 'x',
    },
    { projectDir: '/Users/a/A & B', docPath: '/Users/a/A & B/doc.md', prompt: 'x' },
    {
      projectDir: '/Users/a/proj',
      docPath: '/Users/a/proj/café — notes.md',
      prompt: 'x',
    },
    {
      projectDir: 'C:\\Users\\a\\proj',
      docPath: 'C:\\Users\\a\\proj\\d.md',
      prompt: 'x',
    },
    { projectDir: '/Users/a/proj', docPath: '/Users/a/proj/notes#1.md', prompt: 'x' },
    { projectDir: '/Users/a/proj', docPath: '/Users/a/proj/log.md', prompt: '' },
  ];
  for (const c of cases) {
    const url = buildCursorUrl({
      target: 'cursor',
      projectDir: c.projectDir,
      docPath: c.docPath,
      prompt: c.prompt,
    });
    expect(url).not.toContain('text=');
    expect(url).toContain('workspace=');
    expect(url).toContain('mode=agent');
  }
});
