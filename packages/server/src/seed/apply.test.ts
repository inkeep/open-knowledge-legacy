import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applySeed } from './apply.ts';
import { planSeed } from './plan.ts';
import { STARTER_PACKS } from './starter.ts';

const KNOWLEDGE_BASE_PACK = STARTER_PACKS['knowledge-base'];
const STARTER_FOLDERS = KNOWLEDGE_BASE_PACK.folders;
const STARTER_TEMPLATES = KNOWLEDGE_BASE_PACK.templates;
const LOG_MD_TEMPLATE = KNOWLEDGE_BASE_PACK.rootFiles?.['log.md'];
if (!LOG_MD_TEMPLATE) throw new Error('knowledge-base pack is missing log.md');

describe('applySeed — nested .ok/ era', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'seed-apply-'));
    mkdirSync(join(projectDir, '.ok'), { recursive: true });
    writeFileSync(join(projectDir, '.ok', 'config.yml'), '', 'utf-8');
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  test('writes every starter folder + nested .ok/frontmatter.yml + starter template', async () => {
    const plan = await planSeed({ projectDir });
    const result = await applySeed(plan, { projectDir });

    expect(result.errors).toEqual([]);
    expect(result.applied).toBe(plan.created.length);

    for (const folder of STARTER_FOLDERS) {
      expect(existsSync(join(projectDir, folder.path))).toBe(true);
      expect(existsSync(join(projectDir, folder.path, '.ok'))).toBe(true);
      expect(existsSync(join(projectDir, folder.path, '.ok', 'frontmatter.yml'))).toBe(true);
      expect(existsSync(join(projectDir, folder.path, '.ok', 'templates'))).toBe(true);
      expect(
        existsSync(
          join(projectDir, folder.path, '.ok', 'templates', `${folder.starterTemplate}.md`),
        ),
      ).toBe(true);
    }
    expect(existsSync(join(projectDir, 'log.md'))).toBe(true);
  });

  test('frontmatter.yml carries the folder defaults verbatim from STARTER_FOLDERS', async () => {
    const plan = await planSeed({ projectDir });
    await applySeed(plan, { projectDir });

    for (const folder of STARTER_FOLDERS) {
      const fmContent = readFileSync(
        join(projectDir, folder.path, '.ok', 'frontmatter.yml'),
        'utf-8',
      );
      expect(fmContent).toContain(folder.title);
      expect(fmContent).toContain(folder.description.slice(0, 30));
      for (const tag of folder.tags) {
        expect(fmContent).toContain(`- ${tag}`);
      }
    }
  });

  test('starter template files contain the registered STARTER_TEMPLATES body verbatim', async () => {
    const plan = await planSeed({ projectDir });
    await applySeed(plan, { projectDir });

    for (const folder of STARTER_FOLDERS) {
      const tplContent = readFileSync(
        join(projectDir, folder.path, '.ok', 'templates', `${folder.starterTemplate}.md`),
        'utf-8',
      );
      expect(tplContent).toBe(STARTER_TEMPLATES[folder.starterTemplate]);
    }
  });

  test('log.md gets the LOG_MD_TEMPLATE content verbatim', async () => {
    const plan = await planSeed({ projectDir });
    await applySeed(plan, { projectDir });
    const logContent = readFileSync(join(projectDir, 'log.md'), 'utf-8');
    expect(logContent).toBe(LOG_MD_TEMPLATE);
  });

  test('rerunning seed is idempotent — existing files are skipped, no errors', async () => {
    const firstPlan = await planSeed({ projectDir });
    const firstResult = await applySeed(firstPlan, { projectDir });
    expect(firstResult.errors).toEqual([]);

    const secondPlan = await planSeed({ projectDir });
    const secondResult = await applySeed(secondPlan, { projectDir });
    expect(secondResult.errors).toEqual([]);
    expect(secondPlan.created).toEqual([]);
    expect(secondResult.applied).toBe(0);
  });

  test('user-edited frontmatter.yml is preserved across reseed', async () => {
    const plan1 = await planSeed({ projectDir });
    await applySeed(plan1, { projectDir });

    const fmPath = join(projectDir, 'external-sources', '.ok', 'frontmatter.yml');
    const userEdit =
      'title: My Custom External Sources\ndescription: edited by user\ntags:\n  - mine\n';
    writeFileSync(fmPath, userEdit, 'utf-8');

    const plan2 = await planSeed({ projectDir });
    await applySeed(plan2, { projectDir });

    expect(readFileSync(fmPath, 'utf-8')).toBe(userEdit);
  });

  test('rootDir scopes apply under a subfolder', async () => {
    const plan = await planSeed({ projectDir, rootDir: 'brain' });
    const result = await applySeed(plan, { projectDir });

    expect(result.errors).toEqual([]);
    for (const folder of STARTER_FOLDERS) {
      expect(existsSync(join(projectDir, 'brain', folder.path, '.ok', 'frontmatter.yml'))).toBe(
        true,
      );
      expect(
        existsSync(
          join(
            projectDir,
            'brain',
            folder.path,
            '.ok',
            'templates',
            `${folder.starterTemplate}.md`,
          ),
        ),
      ).toBe(true);
    }
    expect(existsSync(join(projectDir, 'brain', 'log.md'))).toBe(true);
  });

  test('reports an error for unknown template ids without crashing', async () => {
    const result = await applySeed(
      {
        created: [
          {
            path: 'phantom/.ok/templates/unknown.md',
            kind: 'file',
            template: 'phantom/.ok/templates/unknown.md',
          },
        ],
        skipped: [],
        warnings: [],
      },
      { projectDir },
    );

    expect(result.applied).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.error).toContain('No content template registered');
  });
});
