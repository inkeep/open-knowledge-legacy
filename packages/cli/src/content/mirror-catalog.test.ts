import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { rebuildMirroredCatalogs } from './mirror-catalog.ts';

describe('rebuildMirroredCatalogs', () => {
  let projectDir: string;
  let okDir: string;

  beforeEach(() => {
    projectDir = resolve(
      tmpdir(),
      `mirror-catalog-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    okDir = join(projectDir, '.open-knowledge');
    mkdirSync(okDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('generates mirrored catalogs for markdown files', () => {
    // Create some source files
    mkdirSync(join(projectDir, 'specs'), { recursive: true });
    writeFileSync(
      join(projectDir, 'specs', 'feature-a.md'),
      '---\ntitle: Feature A\ndescription: The first feature\ntags:\n  - spec\n---\n\nContent.',
    );
    writeFileSync(
      join(projectDir, 'specs', 'feature-b.md'),
      '---\ntitle: Feature B\ndescription: The second feature\n---\n\nContent.',
    );

    rebuildMirroredCatalogs({
      projectDir,
      okDir,
      include: ['**/*.md'],
      exclude: [],
    });

    // Should create mirrored catalog
    const specsIndex = join(okDir, 'catalogs', 'specs', 'INDEX.md');
    expect(existsSync(specsIndex)).toBe(true);

    const content = readFileSync(specsIndex, 'utf-8');
    expect(content).toContain('Feature A');
    expect(content).toContain('Feature B');
    expect(content).toContain('specs/feature-a.md');
    expect(content).toContain('generated: true');
  });

  it('handles nested directory structures', () => {
    mkdirSync(join(projectDir, 'reports', 'crdt-analysis', 'evidence'), { recursive: true });
    writeFileSync(
      join(projectDir, 'reports', 'crdt-analysis', 'REPORT.md'),
      '---\ntitle: CRDT Analysis\ndescription: Analysis report\n---\n\nContent.',
    );
    writeFileSync(
      join(projectDir, 'reports', 'crdt-analysis', 'evidence', 'finding-1.md'),
      '---\ntitle: Finding 1\ndescription: First finding\n---\n\nContent.',
    );

    rebuildMirroredCatalogs({
      projectDir,
      okDir,
      include: ['**/*.md'],
      exclude: [],
    });

    // reports/ catalog should list crdt-analysis as subfolder
    const reportsIndex = join(okDir, 'catalogs', 'reports', 'INDEX.md');
    expect(existsSync(reportsIndex)).toBe(true);
    const reportsContent = readFileSync(reportsIndex, 'utf-8');
    expect(reportsContent).toContain('crdt-analysis');

    // crdt-analysis/ catalog should list REPORT.md and evidence subfolder
    const analysisIndex = join(okDir, 'catalogs', 'reports', 'crdt-analysis', 'INDEX.md');
    expect(existsSync(analysisIndex)).toBe(true);
    const analysisContent = readFileSync(analysisIndex, 'utf-8');
    expect(analysisContent).toContain('CRDT Analysis');
    expect(analysisContent).toContain('evidence');

    // evidence/ catalog should list finding-1.md
    const evidenceIndex = join(
      okDir,
      'catalogs',
      'reports',
      'crdt-analysis',
      'evidence',
      'INDEX.md',
    );
    expect(existsSync(evidenceIndex)).toBe(true);
    const evidenceContent = readFileSync(evidenceIndex, 'utf-8');
    expect(evidenceContent).toContain('Finding 1');
  });

  it('excludes node_modules and .git by default', () => {
    mkdirSync(join(projectDir, 'node_modules', 'pkg'), { recursive: true });
    mkdirSync(join(projectDir, '.git', 'refs'), { recursive: true });
    mkdirSync(join(projectDir, 'docs'), { recursive: true });
    writeFileSync(join(projectDir, 'node_modules', 'pkg', 'README.md'), '# readme');
    writeFileSync(join(projectDir, '.git', 'refs', 'heads.md'), '# refs');
    writeFileSync(join(projectDir, 'docs', 'guide.md'), '---\ntitle: Guide\n---\n\nContent.');

    rebuildMirroredCatalogs({
      projectDir,
      okDir,
      include: ['**/*.md'],
      exclude: [],
    });

    // Only docs/ should have a catalog
    expect(existsSync(join(okDir, 'catalogs', 'docs', 'INDEX.md'))).toBe(true);
    expect(existsSync(join(okDir, 'catalogs', 'node_modules'))).toBe(false);
    expect(existsSync(join(okDir, 'catalogs', '.git'))).toBe(false);
  });

  it('respects custom exclude patterns', () => {
    mkdirSync(join(projectDir, 'docs'), { recursive: true });
    mkdirSync(join(projectDir, 'drafts'), { recursive: true });
    writeFileSync(join(projectDir, 'docs', 'guide.md'), '---\ntitle: Guide\n---\n\nContent.');
    writeFileSync(join(projectDir, 'drafts', 'wip.md'), '---\ntitle: WIP\n---\n\nContent.');

    rebuildMirroredCatalogs({
      projectDir,
      okDir,
      include: ['**/*.md'],
      exclude: ['drafts/**'],
    });

    expect(existsSync(join(okDir, 'catalogs', 'docs', 'INDEX.md'))).toBe(true);
    expect(existsSync(join(okDir, 'catalogs', 'drafts'))).toBe(false);
  });

  it('preserves sticky title/description across rebuilds', () => {
    mkdirSync(join(projectDir, 'specs'), { recursive: true });
    writeFileSync(join(projectDir, 'specs', 'feature.md'), '---\ntitle: Feature\n---\n\nContent.');

    // First rebuild
    rebuildMirroredCatalogs({ projectDir, okDir, include: ['**/*.md'], exclude: [] });

    const catalogPath = join(okDir, 'catalogs', 'specs', 'INDEX.md');
    const firstContent = readFileSync(catalogPath, 'utf-8');
    expect(firstContent).toContain('title: specs'); // default dirname

    // Edit sticky metadata
    const edited = firstContent
      .replace('title: specs', 'title: Technical Specs')
      .replace('description: ""', 'description: Feature specifications');
    writeFileSync(catalogPath, edited, 'utf-8');

    // Second rebuild should preserve sticky fields
    rebuildMirroredCatalogs({ projectDir, okDir, include: ['**/*.md'], exclude: [] });

    const secondContent = readFileSync(catalogPath, 'utf-8');
    expect(secondContent).toContain('title: Technical Specs');
    expect(secondContent).toContain('description: Feature specifications');
    expect(secondContent).toContain('Feature'); // article still listed
  });

  it('skips write when content is unchanged', () => {
    mkdirSync(join(projectDir, 'docs'), { recursive: true });
    writeFileSync(join(projectDir, 'docs', 'intro.md'), '---\ntitle: Intro\n---\n\nContent.');

    rebuildMirroredCatalogs({ projectDir, okDir, include: ['**/*.md'], exclude: [] });

    const catalogPath = join(okDir, 'catalogs', 'docs', 'INDEX.md');
    const firstMtime = Bun.file(catalogPath).lastModified;

    Bun.sleepSync(50);

    rebuildMirroredCatalogs({ projectDir, okDir, include: ['**/*.md'], exclude: [] });

    const secondMtime = Bun.file(catalogPath).lastModified;
    expect(secondMtime).toBe(firstMtime);
  });

  it('generates root catalog listing top-level directories', () => {
    mkdirSync(join(projectDir, 'specs'), { recursive: true });
    mkdirSync(join(projectDir, 'reports'), { recursive: true });
    writeFileSync(join(projectDir, 'specs', 'a.md'), '---\ntitle: Spec A\n---\n\nContent.');
    writeFileSync(join(projectDir, 'reports', 'b.md'), '---\ntitle: Report B\n---\n\nContent.');

    rebuildMirroredCatalogs({ projectDir, okDir, include: ['**/*.md'], exclude: [] });

    const rootIndex = join(okDir, 'catalogs', 'INDEX.md');
    expect(existsSync(rootIndex)).toBe(true);

    const content = readFileSync(rootIndex, 'utf-8');
    expect(content).toContain('reports');
    expect(content).toContain('specs');
  });

  it('includes files inside .open-knowledge/ but excludes catalogs/ and cache/', () => {
    mkdirSync(join(okDir, 'articles'), { recursive: true });
    mkdirSync(join(okDir, 'catalogs'), { recursive: true });
    mkdirSync(join(okDir, 'cache'), { recursive: true });
    writeFileSync(
      join(okDir, 'articles', 'arch.md'),
      '---\ntitle: Architecture\ndescription: System architecture\n---\n\nContent.',
    );
    writeFileSync(join(okDir, 'catalogs', 'stale.md'), '# stale');
    writeFileSync(join(okDir, 'cache', 'derived.md'), '# derived');

    rebuildMirroredCatalogs({ projectDir, okDir, include: ['**/*.md'], exclude: [] });

    // articles/ should be cataloged
    const articlesIndex = join(okDir, 'catalogs', '.open-knowledge', 'articles', 'INDEX.md');
    expect(existsSync(articlesIndex)).toBe(true);
    const content = readFileSync(articlesIndex, 'utf-8');
    expect(content).toContain('Architecture');

    // catalogs/ and cache/ should NOT be cataloged
    expect(existsSync(join(okDir, 'catalogs', '.open-knowledge', 'catalogs', 'INDEX.md'))).toBe(
      false,
    );
    expect(existsSync(join(okDir, 'catalogs', '.open-knowledge', 'cache', 'INDEX.md'))).toBe(false);
  });

  it('handles root-level markdown files', () => {
    writeFileSync(
      join(projectDir, 'README.md'),
      '---\ntitle: README\ndescription: Project readme\n---\n\nContent.',
    );
    mkdirSync(join(projectDir, 'docs'), { recursive: true });
    writeFileSync(join(projectDir, 'docs', 'guide.md'), '---\ntitle: Guide\n---\n\nContent.');

    rebuildMirroredCatalogs({ projectDir, okDir, include: ['**/*.md'], exclude: [] });

    // Root catalog should list README.md as an article and docs/ as subfolder
    const rootIndex = join(okDir, 'catalogs', 'INDEX.md');
    expect(existsSync(rootIndex)).toBe(true);

    const content = readFileSync(rootIndex, 'utf-8');
    expect(content).toContain('README');
    expect(content).toContain('docs');
  });
});
