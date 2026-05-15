import { expect, test } from 'bun:test';
import { buildCodexUrl } from './codex-url.ts';
import { composeProjectPrompt } from './prompt-composer.ts';
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

test('buildCodexUrl emits cwd-only codex://new?path=... for doc-scoped handoff', () => {
  expect(buildCodexUrl(payload())).toBe('codex://new?path=%2FUsers%2Fwho%2Fproj');
});

test('buildCodexUrl single-encodes % in projectDir (doc-scoped, no prompt=)', () => {
  const url = buildCodexUrl(payload({ projectDir: '/Users/who/My %Project' }));
  expect(url).toContain('path=%2FUsers%2Fwho%2FMy%20%25Project');
  expect(url).not.toContain('prompt=');
});

test('buildCodexUrl doc-scoped omits prompt= even when prompt contains em-dash + unicode', () => {
  const url = buildCodexUrl(payload({ prompt: 'Read café — notes about the feature' }));
  expect(url).not.toContain('prompt=');
  expect(url).not.toContain('caf%C3%A9');
  expect(url).not.toContain('%E2%80%94');
});

test('buildCodexUrl single-encodes literal & in projectDir — DC8.5', () => {
  const url = buildCodexUrl(payload({ projectDir: '/Users/who/A & B' }));
  expect(url).toContain('path=%2FUsers%2Fwho%2FA%20%26%20B');
  expect(url).not.toContain('prompt=');
  expect(url.split('&').length - 1).toBe(0);
});

test('buildCodexUrl does NOT thread docPath (only projectDir via path=)', () => {
  const url = buildCodexUrl(payload({ docPath: '/Users/who/proj/docs/SPECIFIC-FILE.md' }));
  expect(url).not.toContain('SPECIFIC-FILE');
  expect(url).not.toContain('file=');
  expect(url).not.toContain('prompt=');
});

test('buildCodexUrl defensive empty-prompt drops prompt= and keeps path=', () => {
  const url = buildCodexUrl(payload({ prompt: '', docPath: '' }));
  expect(url).toBe('codex://new?path=%2FUsers%2Fwho%2Fproj');
  expect(url).not.toContain('prompt=');
});

test('buildCodexUrl project-scoped (composeProjectPrompt) includes encoded prompt + path', () => {
  const prompt = composeProjectPrompt();
  const url = buildCodexUrl(payload({ prompt, docPath: '' }));
  expect(url).toBe(`codex://new?prompt=${encodeURIComponent(prompt)}&path=%2FUsers%2Fwho%2Fproj`);
});

test('INVARIANT: doc-scoped buildCodexUrl never emits prompt=, across input variations', () => {
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
    const url = buildCodexUrl({
      target: 'codex',
      projectDir: c.projectDir,
      docPath: c.docPath,
      prompt: c.prompt,
    });
    expect(url).not.toContain('prompt=');
    expect(url).not.toContain('file=');
    expect(url).toContain('path=');
  }
});
