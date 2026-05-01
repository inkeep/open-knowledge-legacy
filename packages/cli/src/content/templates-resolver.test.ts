import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTemplatesAvailable, type TemplateEntry } from './templates-resolver.ts';

describe('resolveTemplatesAvailable', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'tpl-resolver-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  function writeTemplate(folder: string, name: string, body: string): void {
    const dir = join(projectDir, folder, '.ok', 'templates');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.md`), body);
  }

  function withFm(title: string, description: string, body = ''): string {
    return `---\ntitle: ${title}\ndescription: ${description}\n---\n${body}`;
  }

  test('returns empty when no .ok/templates/ exists anywhere', () => {
    expect(resolveTemplatesAvailable(projectDir, 'meetings')).toEqual([]);
    expect(resolveTemplatesAvailable(projectDir, '')).toEqual([]);
  });

  test('local templates: scope local at the target folder', () => {
    writeTemplate('meetings', 'prep-notes', withFm('Meeting Prep', 'Use before a meeting.'));
    writeTemplate('meetings', 'post-notes', withFm('Meeting Post', 'Use after a meeting.'));

    const tpls = resolveTemplatesAvailable(projectDir, 'meetings');
    expect(tpls).toHaveLength(2);
    const names = tpls.map((t) => t.name).sort();
    expect(names).toEqual(['post-notes', 'prep-notes']);
    for (const t of tpls) {
      expect(t.scope).toBe('local');
      expect(t.source_folder).toBe('meetings');
    }
    const prep = tpls.find((t) => t.name === 'prep-notes');
    expect(prep?.title).toBe('Meeting Prep');
    expect(prep?.description).toBe('Use before a meeting.');
    expect(prep?.path).toBe('meetings/.ok/templates/prep-notes.md');
  });

  test('inherited templates: ancestor templates surface as scope inherited', () => {
    writeTemplate('meetings', 'prep-notes', withFm('Meeting Prep', 'Top-level prep.'));
    // No local templates at meetings/prep-notes/
    mkdirSync(join(projectDir, 'meetings', 'prep-notes'), { recursive: true });

    const tpls = resolveTemplatesAvailable(projectDir, 'meetings/prep-notes');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]).toEqual({
      name: 'prep-notes',
      title: 'Meeting Prep',
      description: 'Top-level prep.',
      path: 'meetings/.ok/templates/prep-notes.md',
      source_folder: 'meetings',
      scope: 'inherited',
    });
  });

  test('closest wins on filename collision in the inheritance chain (D7)', () => {
    writeTemplate('meetings', 'prep-notes', withFm('Generic Prep', 'From meetings/.'));
    writeTemplate(
      'meetings/prep-notes',
      'prep-notes',
      withFm('Specific Prep', 'From prep-notes/.'),
    );

    const tpls = resolveTemplatesAvailable(projectDir, 'meetings/prep-notes');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.title).toBe('Specific Prep');
    expect(tpls[0]?.scope).toBe('local');
    expect(tpls[0]?.source_folder).toBe('meetings/prep-notes');
  });

  test('siblings are NOT visible (scope rule)', () => {
    writeTemplate('meetings', 'prep-notes', withFm('Prep', 'For meetings.'));
    writeTemplate('research', 'research-log', withFm('Research', 'For research.'));

    const tpls = resolveTemplatesAvailable(projectDir, 'research');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.name).toBe('research-log');
    // meetings/prep-notes must NOT appear here
    expect(tpls.find((t) => t.name === 'prep-notes')).toBeUndefined();
  });

  test('descendants surface only when depth > 1, flagged scope descendant', () => {
    // No local at meetings/, but prep-notes/ has its own template
    writeTemplate(
      'meetings/prep-notes',
      'agenda',
      withFm('Detailed Agenda', 'For larger meetings.'),
    );

    // depth=1 (default): no descendants surface
    const d1 = resolveTemplatesAvailable(projectDir, 'meetings');
    expect(d1).toEqual([]);

    // depth=2: prep-notes/ template visible as descendant
    const d2 = resolveTemplatesAvailable(projectDir, 'meetings', { depth: 2 });
    expect(d2).toHaveLength(1);
    expect(d2[0]?.name).toBe('agenda');
    expect(d2[0]?.scope).toBe('descendant');
    expect(d2[0]?.source_folder).toBe('meetings/prep-notes');
  });

  test('depth controls subtree descent: 1 = self only, N = N levels deep, Infinity = full subtree', () => {
    writeTemplate('a/b/c', 'deep', withFm('Deep', 'Buried in a/b/c.'));

    // depth=1: just `a/` itself — no template here
    expect(resolveTemplatesAvailable(projectDir, 'a')).toEqual([]);
    // depth=2: `a/` + direct children (`a/b/`) — no template at `a/b/`
    expect(resolveTemplatesAvailable(projectDir, 'a', { depth: 2 })).toEqual([]);
    // depth=3: `a/` + `a/b/` + `a/b/c/` — template visible
    const d3 = resolveTemplatesAvailable(projectDir, 'a', { depth: 3 });
    expect(d3).toHaveLength(1);
    expect(d3[0]?.name).toBe('deep');
    expect(d3[0]?.source_folder).toBe('a/b/c');
    expect(d3[0]?.scope).toBe('descendant');
    // Infinity walks the whole subtree
    const deep = resolveTemplatesAvailable(projectDir, 'a', { depth: Infinity });
    expect(deep).toHaveLength(1);
    expect(deep[0]?.name).toBe('deep');
  });

  test('templates without title/description still surface (D16 soft contract)', () => {
    // No frontmatter at all
    writeTemplate('meetings', 'no-meta', '# Just a body\n');

    const tpls = resolveTemplatesAvailable(projectDir, 'meetings');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.name).toBe('no-meta');
    expect(tpls[0]?.title).toBeUndefined();
    expect(tpls[0]?.description).toBeUndefined();
    expect(tpls[0]?.scope).toBe('local');
  });

  test('non-md files in templates/ are ignored', () => {
    writeTemplate('meetings', 'good', withFm('Good', 'OK'));
    const dir = join(projectDir, 'meetings', '.ok', 'templates');
    writeFileSync(join(dir, 'README.txt'), 'not a template');
    writeFileSync(join(dir, 'image.png'), 'fake png');

    const tpls = resolveTemplatesAvailable(projectDir, 'meetings');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.name).toBe('good');
  });

  test('skips junk directories during descent (.git, node_modules, dist)', () => {
    // Plant a template in node_modules (must not surface)
    writeTemplate('node_modules/somepkg', 'leak', withFm('Leak', 'Should not be visible.'));
    // Plant a real template in a normal subfolder
    writeTemplate('meetings/prep-notes', 'agenda', withFm('Agenda', 'OK.'));

    const tpls = resolveTemplatesAvailable(projectDir, '', { depth: Infinity });
    const names = tpls.map((t: TemplateEntry) => t.name);
    expect(names).toContain('agenda');
    expect(names).not.toContain('leak');
  });

  test('project-root templates are inherited everywhere', () => {
    writeTemplate('', 'global', withFm('Global Template', 'Available everywhere.'));

    // From a deep nested folder, inherit it
    mkdirSync(join(projectDir, 'meetings', 'prep-notes'), { recursive: true });
    const tpls = resolveTemplatesAvailable(projectDir, 'meetings/prep-notes');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.name).toBe('global');
    expect(tpls[0]?.scope).toBe('inherited');
    expect(tpls[0]?.source_folder).toBe('');
  });

  test('malformed frontmatter is treated as no metadata, not an error', () => {
    const dir = join(projectDir, 'broken', '.ok', 'templates');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'broken.md'), '---\ntitle: [no closing\nbroken yaml\n---\nbody\n');

    const tpls = resolveTemplatesAvailable(projectDir, 'broken');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.name).toBe('broken');
    expect(tpls[0]?.title).toBeUndefined();
    expect(tpls[0]?.description).toBeUndefined();
  });
});
