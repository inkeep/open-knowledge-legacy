import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { OK_DIR } from '../constants.ts';
import {
  CLAUDE_MD_SECTION,
  initContent,
  OK_MARKER_BEGIN,
  OK_MARKER_END,
  PREVIEW_GUIDANCE,
  upsertRootInstructions,
} from './init.ts';

describe('initContent', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `content-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates config-only .open-knowledge/ scaffold from scratch', () => {
    const result = initContent(testDir);

    const okDir = join(testDir, OK_DIR);
    expect(existsSync(okDir)).toBe(true);
    expect(existsSync(join(okDir, 'cache'))).toBe(true);
    expect(existsSync(join(okDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(okDir, '.gitignore'))).toBe(true);
    expect(existsSync(join(okDir, 'config.yml'))).toBe(true);

    // Content subdirs are NOT scaffolded per V0-24.2 catalog teardown —
    // wiki content lives wherever `content.dir` points (project root by default),
    // not in opinionated subfolders.
    expect(existsSync(join(okDir, 'articles'))).toBe(false);
    expect(existsSync(join(okDir, 'external-sources'))).toBe(false);
    expect(existsSync(join(okDir, 'research'))).toBe(false);

    expect(result.created.length).toBeGreaterThan(0);
    expect(result.skipped.length).toBe(0);
  });

  it('is idempotent — does not clobber existing files', () => {
    // First init
    initContent(testDir);

    // Write custom content to AGENTS.md
    const agentsPath = join(testDir, OK_DIR, 'AGENTS.md');
    writeFileSync(agentsPath, 'custom content');

    // Second init
    const result = initContent(testDir);

    // Custom content should be preserved
    expect(readFileSync(agentsPath, 'utf-8')).toBe('custom content');
    expect(result.skipped.length).toBeGreaterThan(0);
  });

  it('generates files with expected content', () => {
    initContent(testDir);

    const okDir = join(testDir, OK_DIR);

    // AGENTS.md describes the config-only scaffold + exec-first navigation
    const agents = readFileSync(join(okDir, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('Navigation');
    expect(agents).toContain('exec');

    // .gitignore excludes cache/ and the per-process lock files
    const gitignore = readFileSync(join(okDir, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('cache/');
    expect(gitignore).toContain('server.lock');
    expect(gitignore).toContain('ui.lock');

    // config.yml is the fully-commented starter — every section header
    // present, every key commented out so the file parses to a no-op.
    const configYml = readFileSync(join(okDir, 'config.yml'), 'utf-8');
    expect(configYml).toContain('Open Knowledge — workspace configuration');
    expect(configYml).toContain('# content:');
    expect(configYml).toContain('# persistence:');
    expect(configYml).toContain('include:');
    // No uncommented top-level keys — every non-empty, non-comment line
    // would mean we accidentally shipped an active override.
    const activeLines = configYml
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    expect(activeLines).toEqual([]);
  });

  it('AGENTS.md scaffold describes both per-file and config.yml folders: surfaces (US-006 / QA-009)', () => {
    initContent(testDir);
    const agents = readFileSync(join(testDir, OK_DIR, 'AGENTS.md'), 'utf-8');
    // No longer claims per-file is the ONLY surface
    expect(agents).not.toContain('the **only** authored metadata surface');
    // Describes both surfaces
    expect(agents).toContain('Per-file frontmatter');
    expect(agents).toContain('folders:');
    // Clarifies the rejected pattern was INDEX.md-in-content, not folder metadata
    expect(agents).toContain('INDEX.md');
  });

  it('config.yml scaffold includes commented folders: example with picomatch nuance doc (US-006 / QA-009)', () => {
    initContent(testDir);
    const configYml = readFileSync(join(testDir, OK_DIR, 'config.yml'), 'utf-8');
    // Folders block documented
    expect(configYml).toContain('Folders:');
    expect(configYml).toContain('# folders:');
    expect(configYml).toContain("#   - match: 'specs/**'");
    // Picomatch globstar nuance explicitly flagged
    expect(configYml).toMatch(/foo-\*\*/);
    expect(configYml).toMatch(/foo-\*\/\*\*/);
    // Last-match-wins ordering documented
    expect(configYml).toMatch(/LATER rules.*override/i);
  });
});

describe('upsertRootInstructions', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `root-instructions-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates AGENTS.md when it does not exist', () => {
    const results = upsertRootInstructions(testDir, false);

    const agentsPath = join(testDir, 'AGENTS.md');
    expect(existsSync(agentsPath)).toBe(true);
    expect(readFileSync(agentsPath, 'utf-8')).toContain(OK_MARKER_BEGIN);
    expect(results.map((r) => r.action)).toEqual(['created']);
  });

  it('appends to existing AGENTS.md without markers', () => {
    const agentsPath = join(testDir, 'AGENTS.md');
    writeFileSync(agentsPath, '# My Project\n\nExisting content.\n');

    const results = upsertRootInstructions(testDir, false);

    const written = readFileSync(agentsPath, 'utf-8');
    expect(written).toContain('# My Project');
    expect(written).toContain('Existing content.');
    expect(written).toContain(CLAUDE_MD_SECTION);
    // Exactly one blank line between prior content and the section.
    expect(written).toMatch(/Existing content\.\n\n<!-- open-knowledge:begin -->/);
    expect(results.find((r) => r.file === 'AGENTS.md')?.action).toBe('appended');
  });

  it('normalizes spacing when existing file lacks trailing newline', () => {
    const agentsPath = join(testDir, 'AGENTS.md');
    writeFileSync(agentsPath, '# My Project\n\nExisting content.');

    upsertRootInstructions(testDir, false);

    const written = readFileSync(agentsPath, 'utf-8');
    expect(written).toMatch(/Existing content\.\n\n<!-- open-knowledge:begin -->/);
  });

  it('is idempotent — skips when marker is already present', () => {
    const agentsPath = join(testDir, 'AGENTS.md');
    const preamble = '# My Project\n\n';
    writeFileSync(agentsPath, `${preamble}${CLAUDE_MD_SECTION}\n`);
    const before = readFileSync(agentsPath, 'utf-8');

    const results = upsertRootInstructions(testDir, false);

    expect(readFileSync(agentsPath, 'utf-8')).toBe(before);
    expect(results.find((r) => r.file === 'AGENTS.md')?.action).toBe('skipped-existing');
  });

  it('replaces the marker block when force=true', () => {
    const agentsPath = join(testDir, 'AGENTS.md');
    const staleSection = `${OK_MARKER_BEGIN}\nOLD CONTENT\n${OK_MARKER_END}`;
    writeFileSync(agentsPath, `# My Project\n\n${staleSection}\n\nAfter section.\n`);

    const results = upsertRootInstructions(testDir, true);

    const written = readFileSync(agentsPath, 'utf-8');
    expect(written).not.toContain('OLD CONTENT');
    expect(written).toContain('Open Knowledge');
    expect(written).toContain('After section.');
    expect(results.find((r) => r.file === 'AGENTS.md')?.action).toBe('replaced');
  });

  it('CLAUDE_MD_SECTION embeds PREVIEW_GUIDANCE', () => {
    expect(CLAUDE_MD_SECTION).toContain(PREVIEW_GUIDANCE);
  });

  it('PREVIEW_GUIDANCE mentions the key call-sequence terms', () => {
    expect(PREVIEW_GUIDANCE).toContain('get_preview_url');
    expect(PREVIEW_GUIDANCE).toContain('write_document');
    expect(PREVIEW_GUIDANCE).toContain('edit_document');
  });

  it('writes extraFiles alongside AGENTS.md', () => {
    const results = upsertRootInstructions(testDir, false, ['CLAUDE.md']);

    expect(existsSync(join(testDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(testDir, 'CLAUDE.md'))).toBe(true);
    expect(readFileSync(join(testDir, 'CLAUDE.md'), 'utf-8')).toContain(OK_MARKER_BEGIN);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.file === 'AGENTS.md')?.action).toBe('created');
    expect(results.find((r) => r.file === 'CLAUDE.md')?.action).toBe('created');
  });

  it('deduplicates extraFiles that symlink to an already-written file', () => {
    const agentsPath = join(testDir, 'AGENTS.md');
    const claudePath = join(testDir, 'CLAUDE.md');
    writeFileSync(agentsPath, '# Existing\n');
    symlinkSync(agentsPath, claudePath);

    const results = upsertRootInstructions(testDir, false, ['CLAUDE.md']);

    // AGENTS.md gets the section appended; CLAUDE.md is skipped (same canonical path)
    expect(results.find((r) => r.file === 'AGENTS.md')?.action).toBe('appended');
    expect(results.find((r) => r.file === 'CLAUDE.md')?.action).toBe('skipped-symlink');
    // Only one copy of the section in the file (symlink means both paths read the same content)
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content.split(OK_MARKER_BEGIN)).toHaveLength(2); // exactly one marker
  });
});
