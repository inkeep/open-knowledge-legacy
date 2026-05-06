import { test as _bunTest, expect } from 'bun:test';

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

test('buildInstructions documents the read tool routing (exec / read_document / search / grep)', () => {
  const text = buildInstructions(defaultContent());
  expect(text).toContain('## Reads');
  expect(text).toContain('exec(');
  expect(text).toContain('read_document');
  expect(text).toContain('search');
  expect(text).toContain('grep');
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
  const text = buildInstructions(defaultContent());
  expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(2048);
});
