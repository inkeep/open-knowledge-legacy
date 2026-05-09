import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  __resetUserHomeProviderForTest,
  __setUserHomeProviderForTest,
  resolveTemplatesAvailable,
} from './templates-resolver.ts';

describe('resolveTemplatesAvailable', () => {
  let projectDir: string;
  let isolatedHome: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'tpl-resolver-'));
    isolatedHome = await mkdtemp(join(tmpdir(), 'tpl-resolver-home-isolated-'));
    __setUserHomeProviderForTest(() => isolatedHome);
  });

  afterEach(async () => {
    __resetUserHomeProviderForTest();
    await rm(projectDir, { recursive: true, force: true });
    await rm(isolatedHome, { recursive: true, force: true });
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
    expect(tpls.find((t) => t.name === 'prep-notes')).toBeUndefined();
  });

  test('descendant templates do NOT surface in the parent folder (D17 — two-value scope)', () => {
    writeTemplate(
      'meetings/prep-notes',
      'agenda',
      withFm('Detailed Agenda', 'For larger meetings.'),
    );

    expect(resolveTemplatesAvailable(projectDir, 'meetings')).toEqual([]);

    expect(resolveTemplatesAvailable(projectDir, 'meetings', { depth: 2 })).toEqual([]);
    expect(resolveTemplatesAvailable(projectDir, 'meetings', { depth: Infinity })).toEqual([]);

    const ownTpls = resolveTemplatesAvailable(projectDir, 'meetings/prep-notes');
    expect(ownTpls).toHaveLength(1);
    expect(ownTpls[0]?.name).toBe('agenda');
    expect(ownTpls[0]?.scope).toBe('local');
    expect(ownTpls[0]?.source_folder).toBe('meetings/prep-notes');
  });

  test('depth parameter is a no-op — no descent into subfolders from the resolver', () => {
    writeTemplate('a/b/c', 'deep', withFm('Deep', 'Buried in a/b/c.'));

    expect(resolveTemplatesAvailable(projectDir, 'a')).toEqual([]);
    expect(resolveTemplatesAvailable(projectDir, 'a', { depth: 2 })).toEqual([]);
    expect(resolveTemplatesAvailable(projectDir, 'a', { depth: 100 })).toEqual([]);
    expect(resolveTemplatesAvailable(projectDir, 'a', { depth: Infinity })).toEqual([]);

    const own = resolveTemplatesAvailable(projectDir, 'a/b/c');
    expect(own).toHaveLength(1);
    expect(own[0]?.name).toBe('deep');
    expect(own[0]?.scope).toBe('local');
  });

  test('templates without description still surface; title is required at write time but readable here without it (resolver tolerates legacy)', () => {
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

  test('project-root templates are inherited everywhere', () => {
    writeTemplate('', 'global', withFm('Global Template', 'Available everywhere.'));

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

describe('resolveTemplatesAvailable — user-global layer (~/.ok/templates/)', () => {
  let projectDir: string;
  let userHome: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'tpl-resolver-proj-'));
    userHome = await mkdtemp(join(tmpdir(), 'tpl-resolver-home-'));
    __setUserHomeProviderForTest(() => userHome);
  });

  afterEach(async () => {
    __resetUserHomeProviderForTest();
    await rm(projectDir, { recursive: true, force: true });
    await rm(userHome, { recursive: true, force: true });
  });

  function writeUserTemplate(name: string, body: string): void {
    const dir = join(userHome, '.ok', 'templates');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.md`), body);
  }

  function writeProjectTemplate(folder: string, name: string, body: string): void {
    const dir = join(projectDir, folder, '.ok', 'templates');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${name}.md`), body);
  }

  function withFm(title: string, description: string, body = ''): string {
    return `---\ntitle: ${title}\ndescription: ${description}\n---\n${body}`;
  }

  test('missing ~/.ok/templates/ is a graceful no-op', () => {
    expect(resolveTemplatesAvailable(projectDir, '')).toEqual([]);
    expect(resolveTemplatesAvailable(projectDir, 'meetings')).toEqual([]);
  });

  test('user templates surface with scope: "user" and source_folder: "~/.ok"', () => {
    writeUserTemplate('weekly-review', withFm('Weekly Review', 'A personal template.'));
    writeUserTemplate('daily-standup', withFm('Daily Standup', 'Quick notes.'));

    const tpls = resolveTemplatesAvailable(projectDir, '');
    expect(tpls).toHaveLength(2);
    const names = tpls.map((t) => t.name).sort();
    expect(names).toEqual(['daily-standup', 'weekly-review']);
    for (const t of tpls) {
      expect(t.scope).toBe('user');
      expect(t.source_folder).toBe('~/.ok');
    }
    const review = tpls.find((t) => t.name === 'weekly-review');
    expect(review?.title).toBe('Weekly Review');
    expect(review?.description).toBe('A personal template.');
    expect(review?.path.endsWith('/.ok/templates/weekly-review.md')).toBe(true);
  });

  test('user templates surface in any project folder', () => {
    writeUserTemplate('weekly-review', withFm('Weekly Review', 'Personal.'));

    const fromRoot = resolveTemplatesAvailable(projectDir, '');
    const fromNested = resolveTemplatesAvailable(projectDir, 'meetings/2026-05-08');
    expect(fromRoot).toHaveLength(1);
    expect(fromNested).toHaveLength(1);
    expect(fromNested[0]?.scope).toBe('user');
    expect(fromNested[0]?.name).toBe('weekly-review');
  });

  test('closest-wins: project-local template shadows user template of the same name', () => {
    writeUserTemplate('meeting-notes', withFm('User Version', 'Personal flavor.'));
    writeProjectTemplate('meetings', 'meeting-notes', withFm('Project Version', 'Team flavor.'));

    const tpls = resolveTemplatesAvailable(projectDir, 'meetings');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.scope).toBe('local');
    expect(tpls[0]?.title).toBe('Project Version');
    expect(tpls[0]?.source_folder).toBe('meetings');
  });

  test('closest-wins: project-root template shadows user template of the same name', () => {
    writeUserTemplate('global-template', withFm('User Version', 'Personal flavor.'));
    writeProjectTemplate('', 'global-template', withFm('Project Version', 'Team flavor.'));

    const tpls = resolveTemplatesAvailable(projectDir, 'meetings');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.scope).toBe('inherited');
    expect(tpls[0]?.title).toBe('Project Version');
    expect(tpls[0]?.source_folder).toBe('');
  });

  test('mixed scopes: local + inherited + user all surface with correct labels', () => {
    writeUserTemplate('weekly-review', withFm('Weekly Review', 'Personal.'));
    writeProjectTemplate('', 'global', withFm('Global', 'Team-wide.'));
    writeProjectTemplate('meetings', 'prep-notes', withFm('Prep', 'Local to meetings.'));

    const tpls = resolveTemplatesAvailable(projectDir, 'meetings');
    expect(tpls).toHaveLength(3);
    const byName = Object.fromEntries(tpls.map((t) => [t.name, t]));
    expect(byName['prep-notes']?.scope).toBe('local');
    expect(byName.global?.scope).toBe('inherited');
    expect(byName['weekly-review']?.scope).toBe('user');
  });

  test('non-md files in ~/.ok/templates/ are ignored', () => {
    writeUserTemplate('good', withFm('Good', 'OK'));
    const dir = join(userHome, '.ok', 'templates');
    writeFileSync(join(dir, 'README.txt'), 'not a template');
    writeFileSync(join(dir, 'image.png'), 'fake png');

    const tpls = resolveTemplatesAvailable(projectDir, '');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.name).toBe('good');
    expect(tpls[0]?.scope).toBe('user');
  });

  test('user templates without frontmatter still surface', () => {
    writeUserTemplate('no-meta', '# Just a body\n');

    const tpls = resolveTemplatesAvailable(projectDir, '');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.name).toBe('no-meta');
    expect(tpls[0]?.scope).toBe('user');
    expect(tpls[0]?.title).toBeUndefined();
    expect(tpls[0]?.description).toBeUndefined();
  });

  test('degenerate case: projectDir === homedir() — no double-count of templates', () => {
    const sharedHome = userHome;
    const sharedDir = join(sharedHome, '.ok', 'templates');
    mkdirSync(sharedDir, { recursive: true });
    writeFileSync(
      join(sharedDir, 'shared.md'),
      withFm('Shared', 'Same dir as both project and user'),
    );

    const tpls = resolveTemplatesAvailable(sharedHome, '');
    expect(tpls).toHaveLength(1);
    expect(tpls[0]?.name).toBe('shared');
    expect(tpls[0]?.scope).toBe('local');
    expect(tpls[0]?.source_folder).toBe('');
  });
});
