import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planSeed } from './plan.ts';
import { STARTER_FOLDERS } from './starter.ts';
import { SeedPrerequisiteError, SeedRootDirError } from './types.ts';

describe('planSeed — nested .ok/ era', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'seed-plan-'));
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test('throws SeedPrerequisiteError when .ok/ is absent', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'seed-bare-'));
    try {
      await expect(planSeed({ projectDir: bare })).rejects.toThrow(SeedPrerequisiteError);
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });

  test('plans every starter folder + nested .ok/ + frontmatter.yml + templates/<name>.md', async () => {
    const plan = await planSeed({ projectDir });
    const createdPaths = new Set(plan.created.map((e) => e.path));

    for (const folder of STARTER_FOLDERS) {
      expect(createdPaths.has(folder.path)).toBe(true); // the folder itself
      expect(createdPaths.has(`${folder.path}/.ok`)).toBe(true); // nested .ok/
      expect(createdPaths.has(`${folder.path}/.ok/frontmatter.yml`)).toBe(true);
      expect(createdPaths.has(`${folder.path}/.ok/templates`)).toBe(true);
      expect(createdPaths.has(`${folder.path}/.ok/templates/${folder.starterTemplate}.md`)).toBe(
        true,
      );
    }
    expect(createdPaths.has('log.md')).toBe(true);
  });

  test('plan has no configEdits field — folders[] write path retired (FR8 / D19)', async () => {
    const plan = await planSeed({ projectDir });
    expect((plan as unknown as Record<string, unknown>).configEdits).toBeUndefined();
  });

  test('frontmatter.yml + template entries carry their template id for apply()', async () => {
    const plan = await planSeed({ projectDir });
    for (const folder of STARTER_FOLDERS) {
      const fmEntry = plan.created.find((e) => e.path === `${folder.path}/.ok/frontmatter.yml`);
      expect(fmEntry?.template).toBe(`${folder.path}/.ok/frontmatter.yml`);

      const tplEntry = plan.created.find(
        (e) => e.path === `${folder.path}/.ok/templates/${folder.starterTemplate}.md`,
      );
      expect(tplEntry?.template).toBe(`${folder.path}/.ok/templates/${folder.starterTemplate}.md`);
    }
  });

  test('skips entries that already exist on disk', async () => {
    mkdirSync(join(projectDir, 'external-sources', '.ok'), { recursive: true });
    writeFileSync(
      join(projectDir, 'external-sources', '.ok', 'frontmatter.yml'),
      'title: User had this already\n',
    );

    const plan = await planSeed({ projectDir });
    const skippedPaths = new Set(plan.skipped.map((e) => e.path));
    expect(skippedPaths.has('external-sources')).toBe(true);
    expect(skippedPaths.has('external-sources/.ok')).toBe(true);
    expect(skippedPaths.has('external-sources/.ok/frontmatter.yml')).toBe(true);

    const createdPaths = new Set(plan.created.map((e) => e.path));
    expect(createdPaths.has('research')).toBe(true);
    expect(createdPaths.has('articles')).toBe(true);
  });

  test('rootDir scopes the scaffold under a subfolder', async () => {
    const plan = await planSeed({ projectDir, rootDir: 'brain' });
    const createdPaths = new Set(plan.created.map((e) => e.path));

    expect(createdPaths.has('brain')).toBe(true);
    for (const folder of STARTER_FOLDERS) {
      expect(createdPaths.has(`brain/${folder.path}`)).toBe(true);
      expect(createdPaths.has(`brain/${folder.path}/.ok/frontmatter.yml`)).toBe(true);
      expect(
        createdPaths.has(`brain/${folder.path}/.ok/templates/${folder.starterTemplate}.md`),
      ).toBe(true);
    }
    expect(createdPaths.has('brain/log.md')).toBe(true);
  });

  test('rootDir rejects absolute paths', async () => {
    await expect(planSeed({ projectDir, rootDir: '/etc/evil' })).rejects.toThrow(SeedRootDirError);
  });

  test('rootDir rejects path traversal', async () => {
    await expect(planSeed({ projectDir, rootDir: '../escape' })).rejects.toThrow(SeedRootDirError);
  });
});
