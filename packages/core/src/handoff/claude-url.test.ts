import { expect, test } from 'bun:test';
import { buildClaudeUrl } from './claude-url.ts';
import { composeProjectPrompt } from './prompt-composer.ts';
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

test('buildClaudeUrl emits cwd-only claude://cowork/new?folder=... for doc-scoped cowork', () => {
  expect(buildClaudeUrl({ mode: 'cowork' }, payload())).toBe(
    'claude://cowork/new?folder=%2FUsers%2Fwho%2Fproj',
  );
});

test('buildClaudeUrl emits cwd-only claude://code/new?folder=... for doc-scoped code', () => {
  expect(buildClaudeUrl({ mode: 'code' }, payload({ target: 'claude-code' }))).toBe(
    'claude://code/new?folder=%2FUsers%2Fwho%2Fproj',
  );
});

test('buildClaudeUrl single-encodes literal % in projectDir (cowork)', () => {
  const url = buildClaudeUrl(
    { mode: 'cowork' },
    payload({
      projectDir: '/Users/who/My %Project',
      docPath: '/Users/who/My %Project/a.md',
    }),
  );
  expect(url).toContain('folder=%2FUsers%2Fwho%2FMy%20%25Project');
  expect(url).not.toContain('file=');
  expect(url).not.toContain('q=');
});

test('buildClaudeUrl doc-scoped omits file= even when docPath contains em-dash (code)', () => {
  const url = buildClaudeUrl(
    { mode: 'code' },
    payload({
      target: 'claude-code',
      docPath: '/Users/who/proj/café — notes.md',
    }),
  );
  expect(url).not.toContain('file=');
  expect(url).not.toContain('q=');
  expect(url).not.toContain('%E2%80%94');
});

test('buildClaudeUrl doc-scoped omits file= even when docPath contains unicode (cowork)', () => {
  const url = buildClaudeUrl(
    { mode: 'cowork' },
    payload({ docPath: '/Users/who/proj/café-notes.md' }),
  );
  expect(url).not.toContain('file=');
  expect(url).not.toContain('q=');
});

test('buildClaudeUrl single-encodes space in projectDir (code)', () => {
  const url = buildClaudeUrl(
    { mode: 'code' },
    payload({
      target: 'claude-code',
      projectDir: '/Users/who/My Project',
      docPath: '/Users/who/My Project/README.md',
    }),
  );
  expect(url).toContain('folder=%2FUsers%2Fwho%2FMy%20Project');
  expect(url).not.toContain('file=');
  expect(url).not.toContain('q=');
});

test('buildClaudeUrl single-encodes literal & in projectDir (cowork) — DC8.5', () => {
  const url = buildClaudeUrl(
    { mode: 'cowork' },
    payload({
      projectDir: '/Users/who/A & B',
      docPath: '/Users/who/A & B/doc.md',
    }),
  );
  expect(url).toContain('folder=%2FUsers%2Fwho%2FA%20%26%20B');
  expect(url).not.toContain('file=');
  expect(url).not.toContain('q=');
  expect(url.split('&').length - 1).toBe(0);
});

test('buildClaudeUrl doc-scoped omits file= even when docPath contains # (code) — DC8.5', () => {
  const url = buildClaudeUrl(
    { mode: 'code' },
    payload({
      target: 'claude-code',
      docPath: '/Users/who/proj/notes#1.md',
    }),
  );
  expect(url).not.toContain('file=');
  expect(url).not.toContain('q=');
  expect(url.includes('#')).toBe(false);
});

test('buildClaudeUrl single-encodes Windows backslash projectDir (cowork) — DC8.5', () => {
  const url = buildClaudeUrl(
    { mode: 'cowork' },
    payload({
      projectDir: 'C:\\Users\\who\\proj',
      docPath: 'C:\\Users\\who\\proj\\docs\\note.md',
    }),
  );
  expect(url).toContain('folder=C%3A%5CUsers%5Cwho%5Cproj');
  expect(url).not.toContain('file=');
  expect(url).not.toContain('q=');
});

test('buildClaudeUrl empty-prompt + empty docPath drops q and file, keeps folder', () => {
  const url = buildClaudeUrl({ mode: 'cowork' }, payload({ prompt: '', docPath: '' }));
  expect(url).toBe('claude://cowork/new?folder=%2FUsers%2Fwho%2Fproj');
  expect(url).not.toContain('q=');
  expect(url).not.toContain('file=');
});

test('buildClaudeUrl empty-prompt fallback applies to code mode as well', () => {
  const url = buildClaudeUrl(
    { mode: 'code' },
    payload({ target: 'claude-code', prompt: '', docPath: '' }),
  );
  expect(url).toBe('claude://code/new?folder=%2FUsers%2Fwho%2Fproj');
});

test('buildClaudeUrl project-scoped (composeProjectPrompt + empty docPath) emits q + folder, no file', () => {
  const prompt = composeProjectPrompt();
  const url = buildClaudeUrl({ mode: 'cowork' }, payload({ prompt, docPath: '' }));
  expect(url).toBe(
    `claude://cowork/new?q=${encodeURIComponent(prompt)}&folder=%2FUsers%2Fwho%2Fproj`,
  );
  expect(url).not.toContain('file=');
});

test('INVARIANT: doc-scoped buildClaudeUrl never emits q= or file=, across input variations', () => {
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
    for (const mode of ['cowork', 'code'] as const) {
      const target: HandoffPayload['target'] = mode === 'cowork' ? 'claude-cowork' : 'claude-code';
      const url = buildClaudeUrl(
        { mode },
        { target, projectDir: c.projectDir, docPath: c.docPath, prompt: c.prompt },
      );
      expect(url).not.toContain('file=');
      expect(url).not.toContain('q=');
      expect(url).toContain('folder=');
    }
  }
});
