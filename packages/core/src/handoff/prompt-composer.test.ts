import { expect, test } from 'bun:test';
import { composePrompt } from './prompt-composer.ts';

test('composePrompt interpolates relativePath into the canonical template', () => {
  expect(composePrompt({ relativePath: 'foo.md' })).toBe(
    'Open Knowledge doc: foo.md. Use the open-knowledge MCP tool for backlinks and related context.',
  );
});

test('composePrompt is deterministic — identical inputs produce identical outputs', () => {
  const ctx = { relativePath: 'specs/2026-04-21-open-in-agent-desktop/SPEC.md' };
  expect(composePrompt(ctx)).toBe(composePrompt(ctx));
});

test('composePrompt passes edge-case path characters through verbatim (no encoding at compose)', () => {
  const ctx = { relativePath: 'My %Project — docs/café-notes.md' };
  const out = composePrompt(ctx);
  expect(out).toContain('My %Project — docs/café-notes.md');
  expect(out).not.toContain('%25');
  expect(out).not.toContain('%E2%80%94');
});

test('composePrompt stays under the 1024-char budget for pathologically long paths (AC10)', () => {
  const longSegment = 'a'.repeat(200);
  const longPath = `${longSegment}/${longSegment}/${longSegment}/${longSegment}.md`;
  const out = composePrompt({ relativePath: longPath });
  expect(out.length).toBeLessThan(1024);
});

test('composePrompt handles the boundary case of an empty relative path', () => {
  expect(composePrompt({ relativePath: '' })).toBe(
    'Open Knowledge doc: . Use the open-knowledge MCP tool for backlinks and related context.',
  );
});
