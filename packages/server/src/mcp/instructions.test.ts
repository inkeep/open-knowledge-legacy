import { test as _bunTest, expect } from 'bun:test';

// Skip-on-CI gate (oven-sh/bun#11892): simple-git fixture pattern in MCP
// test setup spawns git children that Bun fails to reap on ubuntu-latest
// GHA runners; post-test cgroup never drains, hanging test (test) at the
// 15-min timeout. Tests run normally locally; follow-up PR will migrate
// fixtures to execFileSync. PR #377 evidence in jobs 73874363184+.
const test = process.env.CI ? _bunTest.skip : _bunTest;

import { type Config, ConfigSchema } from '../config/schema.ts';
import { buildInstructions } from './instructions.ts';

function defaultContent(): Config['content'] {
  return ConfigSchema.parse({}).content;
}

test('buildInstructions carries the STOP rule on native tools for in-scope markdown', () => {
  const text = buildInstructions(defaultContent());
  expect(text).toContain('STOP');
  expect(text).toContain('when `.ok/` exists');
  expect(text).toContain('write_document');
  expect(text).toContain('edit_document');
});

test('buildInstructions carries the preview-attach rule', () => {
  const text = buildInstructions(defaultContent());
  expect(text).toContain('Preview');
  expect(text).toContain('attach-preview-once');
  expect(text).toContain('previewUrl');
});

test('buildInstructions points readers at the Agent Skill for full guidance (wiki-links, frontmatter, anti-patterns)', () => {
  const text = buildInstructions(defaultContent());
  expect(text).toContain('## Full guidance');
  expect(text).toContain('open-knowledge');
  expect(text).toContain('Agent Skill');
  expect(text).toContain('wiki-link');
  expect(text).toContain('frontmatter');
  expect(text).toContain('anti-patterns');
});

test('buildInstructions documents the read tool routing (exec / read_document / search)', () => {
  const text = buildInstructions(defaultContent());
  expect(text).toContain('## Reads');
  expect(text).toContain('exec(');
  expect(text).toContain('read_document');
  expect(text).toContain('search');
});

test('buildInstructions surfaces an explicit native-tool escape hatch', () => {
  const text = buildInstructions(defaultContent());
  expect(text).toContain('Escape hatch');
  expect(text).toContain('no `.ok/`');
  expect(text).toContain('Open Knowledge MCP unavailable:');
});

test('buildInstructions interpolates content.dir and points at .okignore for path scope', () => {
  const content: Config['content'] = {
    dir: 'wiki',
  };
  const text = buildInstructions(content);
  expect(text).toContain('Content dir: wiki');
  expect(text).toContain('.okignore');
});

test('buildInstructions stays under the 2 KB Claude Code per-server cap', () => {
  // Claude Code truncates instruction strings above 2 KB. The legacy stdio
  // server lived under this ceiling; the consolidated function must too.
  const text = buildInstructions(defaultContent());
  expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(2048);
});
