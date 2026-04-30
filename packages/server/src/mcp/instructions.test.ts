import { expect, test } from 'bun:test';
import { type Config, ConfigSchema } from '../config/schema.ts';
import { buildInstructions } from './instructions.ts';

function defaultContent(): Config['content'] {
  return ConfigSchema.parse({}).content;
}

test('buildInstructions carries the STOP rule on native tools for in-scope markdown', () => {
  const text = buildInstructions(defaultContent());
  expect(text).toContain('STOP — native tools on in-scope');
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
  expect(text).toContain('Open Knowledge MCP unavailable:');
});

test('buildInstructions interpolates content.dir, content.include, and content.exclude', () => {
  const content: Config['content'] = {
    dir: 'wiki',
    include: ['**/*.md'],
    exclude: ['drafts/**'],
  };
  const text = buildInstructions(content);
  expect(text).toContain('Content dir: wiki');
  expect(text).toContain('`**/*.md`');
  expect(text).toContain('`drafts/**`');
});

test('buildInstructions renders "(none)" when no exclude globs are configured', () => {
  const content: Config['content'] = {
    dir: '.',
    include: ['**/*.md', '**/*.mdx'],
    exclude: [],
  };
  const text = buildInstructions(content);
  expect(text).toContain('Exclude: (none)');
});

test('buildInstructions stays under the 2 KB Claude Code per-server cap', () => {
  // Claude Code truncates instruction strings above 2 KB. The legacy stdio
  // server lived under this ceiling; the consolidated function must too.
  const text = buildInstructions(defaultContent());
  expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(2048);
});
