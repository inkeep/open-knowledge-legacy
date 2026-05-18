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
  expect(text).toContain('Open Knowledge MCP configured');
  expect(text).toContain('write_document');
  expect(text).toContain('edit_document');
});

test('buildInstructions carries the preview-attach rule', () => {
  const text = buildInstructions(defaultContent());
  expect(text).toContain('Preview');
  expect(text).toContain('attach-preview-once');
  expect(text).toContain('previewUrl');
});

test('buildInstructions points readers at the bundled open-knowledge skill for full guidance', () => {
  const text = buildInstructions(defaultContent());
  expect(text).toContain('open-knowledge');
  expect(text).toContain('skill');
  expect(text).toContain('~/.ok/skills/open-knowledge/SKILL.md');
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
  expect(text).toContain('Open Knowledge MCP unavailable:');
});

test('buildInstructions surfaces the scope-recap section pointing at .okignore', () => {
  const text = buildInstructions(defaultContent());
  expect(text).toContain('## Scope recap');
  expect(text).toContain('.okignore');
  expect(text).toContain('content.dir');
});

test('buildInstructions leads with the identity prefix', () => {
  const text = buildInstructions(defaultContent());
  expect(text.startsWith('Open Knowledge is a markdown-CRDT knowledge base exposed via MCP.')).toBe(
    true,
  );
});

test('buildInstructions exceeds the legacy 2 KB Claude Code cap (generator emits a warning; see generate-instructions.test.ts)', () => {
  const text = buildInstructions(defaultContent());
  const bytes = Buffer.byteLength(text, 'utf8');
  expect(bytes).toBeGreaterThan(2048);
  expect(bytes).toBeLessThan(8192);
});
