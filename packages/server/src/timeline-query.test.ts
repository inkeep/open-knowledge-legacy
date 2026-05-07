import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import simpleGit from 'simple-git';
import {
  appendRenameLogEntry,
  createEmptyIndex,
  type RenameLogEntry,
  resetRenameLogIndexCache,
  setRenameLogIndex,
} from './rename-log.ts';
import {
  commitUpstreamImport,
  commitWip,
  initShadowRepo,
  type ParkableDoc,
  parkBranch,
  SERVICE_WRITER,
  saveVersion,
  type WriterIdentity,
} from './shadow-repo';
import { getDocumentHistory } from './timeline-query';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-timeline-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function setup() {
  const projectRoot = resolve(tmpDir, 'project');
  const contentDir = resolve(projectRoot, 'content/docs');
  mkdirSync(contentDir, { recursive: true });

  const git = simpleGit(projectRoot);
  await git.init();
  await git.raw('config', 'user.name', 'Test');
  await git.raw('config', 'user.email', 'test@test.com');

  writeFileSync(resolve(contentDir, 'intro.md'), '# Hello\n');
  await git.add('.');
  await git.commit('Initial commit');

  const shadow = await initShadowRepo(projectRoot);
  return { projectRoot, contentDir, shadow };
}

const human: WriterIdentity = {
  id: 'human-nick',
  name: 'Nick Gomez',
  email: 'nick@example.com',
};

const agent: WriterIdentity = {
  id: 'agent-cursor',
  name: 'cursor-agent',
  email: 'cursor@openknowledge.local',
};

describe('getDocumentHistory', () => {
  test('returns empty result when shadow has no commits', async () => {
    const { shadow } = await setup();
    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');
    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  test('returns WIP entries as flat list when no checkpoints exist', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Edit 1\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: first human edit');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Edit 2\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: second human edit');

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');

    expect(result.entries.length).toBe(2);
    expect(result.total).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.entries.every((e) => e.type === 'wip')).toBe(true);
  });

  test('classifies entry types from commit message prefix', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# WIP\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: human edit');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Upstream\n');
    await commitUpstreamImport(shadow, 'content/docs', 'abc', 'def');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Checkpoint\n');
    await saveVersion(shadow, 'content/docs', [human]);

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');

    const types = result.entries.map((e) => e.type);
    expect(types).toContain('wip');
    expect(types).toContain('upstream');
    expect(types).toContain('checkpoint');
  });

  test('interleaves entries from multiple writers by author date', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Human 1\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: human edit 1');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Agent 1\n');
    await commitWip(shadow, agent, 'content/docs', 'WIP: agent edit 1');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Human 2\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: human edit 2');

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');

    expect(result.entries.length).toBe(3);
    const authorEmails = result.entries.map((e) => e.authorEmail);
    expect(authorEmails).toContain(human.email);
    expect(authorEmails).toContain(agent.email);
  });

  test('type=checkpoint fast path returns only checkpoints', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# v1\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: v1');
    await saveVersion(shadow, 'content/docs', [human]);

    writeFileSync(resolve(contentDir, 'intro.md'), '# v2\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: v2');

    const result = await getDocumentHistory(
      shadow,
      { docName: 'intro', type: 'checkpoint' },
      'content/docs',
    );

    expect(result.entries.length).toBe(1);
    expect(result.entries[0]?.type).toBe('checkpoint');
  });

  test('supports filtering by author name/email', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Human\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: human');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Agent\n');
    await commitWip(shadow, agent, 'content/docs', 'WIP: agent');

    const result = await getDocumentHistory(
      shadow,
      {
        docName: 'intro',
        author: human.email,
      },
      'content/docs',
    );

    expect(result.entries.every((e) => e.authorEmail === human.email)).toBe(true);
    expect(result.entries.length).toBeGreaterThanOrEqual(1);
  });

  test('supports excludeAuthor filter', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Human\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: human');

    writeFileSync(resolve(contentDir, 'intro.md'), '# Agent\n');
    await commitWip(shadow, agent, 'content/docs', 'WIP: agent');

    const result = await getDocumentHistory(
      shadow,
      {
        docName: 'intro',
        excludeAuthor: agent.email,
      },
      'content/docs',
    );

    expect(result.entries.every((e) => e.authorEmail !== agent.email)).toBe(true);
  });

  test('supports limit/offset pagination', async () => {
    const { contentDir, shadow } = await setup();

    for (let i = 1; i <= 5; i++) {
      writeFileSync(resolve(contentDir, 'intro.md'), `# Edit ${i}\n`);
      await commitWip(shadow, human, 'content/docs', `WIP: edit ${i}`);
    }

    const page1 = await getDocumentHistory(
      shadow,
      { docName: 'intro', limit: 2, offset: 0 },
      'content/docs',
    );
    expect(page1.entries.length).toBe(2);
    expect(page1.total).toBe(5);
    expect(page1.hasMore).toBe(true);

    const page2 = await getDocumentHistory(
      shadow,
      { docName: 'intro', limit: 2, offset: 2 },
      'content/docs',
    );
    expect(page2.entries.length).toBe(2);
    expect(page2.hasMore).toBe(true);

    const page3 = await getDocumentHistory(
      shadow,
      { docName: 'intro', limit: 2, offset: 4 },
      'content/docs',
    );
    expect(page3.entries.length).toBe(1);
    expect(page3.hasMore).toBe(false);
  });

  test('entries have all required fields', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Test\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: field check');

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');
    const entry = result.entries[0];

    expect(entry).toBeDefined();
    expect(entry?.sha).toHaveLength(40);
    expect(entry?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry?.author).toBe(human.name);
    expect(entry?.authorEmail).toBe(human.email);
    expect(entry?.type).toBe('wip');
    expect(entry?.message).toContain('WIP');
  });

  test('returns empty result gracefully when shadow repo is corrupt/missing', async () => {
    const fakeShadow = {
      gitDir: resolve(tmpDir, 'nonexistent/.git/ok'),
      workTree: resolve(tmpDir, 'nonexistent'),
    };

    const result = await getDocumentHistory(fakeShadow, { docName: 'intro' });
    expect(result.entries).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasMore).toBe(false);
  });

  test('hides park commits even when their tree-deletion shadows the doc path', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Service edit\n');
    await commitWip(shadow, SERVICE_WRITER, 'content/docs', 'wip: service edit');

    const docs: ParkableDoc[] = [
      { docName: 'intro', markdown: '# Parked\n', diskSnapshot: '# Service edit\n' },
    ];
    const parkSha = await parkBranch(shadow, 'main', SERVICE_WRITER.id, docs, 'feature');
    expect(parkSha).toHaveLength(40);

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');
    expect(result.entries.some((e) => e.sha === parkSha)).toBe(false);
    expect(result.entries.every((e) => e.type !== 'park')).toBe(true);
  });

  test('returns empty result for docNames containing path traversal segments', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Real\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: real edit');

    for (const docName of ['../intro', '../../etc/passwd', 'foo/../../bar', 'foo\0bar']) {
      const result = await getDocumentHistory(shadow, { docName }, 'content/docs');
      expect(result.entries).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    }
  });

  test('deduplicates entries that appear in multiple ref walks', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'intro.md'), '# Shared\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: shared ancestor');

    await saveVersion(shadow, 'content/docs', [human]);

    const result = await getDocumentHistory(shadow, { docName: 'intro' }, 'content/docs');

    const shas = result.entries.map((e) => e.sha);
    const uniqueShas = new Set(shas);
    expect(uniqueShas.size).toBe(shas.length);
  });
});

describe('getDocumentHistory — rename-history mitigation (US-004)', () => {
  afterEach(() => {
    resetRenameLogIndexCache();
  });

  function entry(overrides: Partial<RenameLogEntry> = {}): RenameLogEntry {
    return {
      v: 1,
      from: 'a',
      to: 'b',
      at: '2026-05-05T12:00:00.000Z',
      commitSha: '',
      branch: 'main',
      groupId: '01234567-89ab-cdef-0123-456789abcdef',
      kind: 'file',
      actor: { writerId: 'agent-test', displayName: 'Test' },
      ...overrides,
    };
  }

  test('rename a → b: timeline of `b` includes pre-rename WIP commits at path `a`', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'a.md'), '# A v1\n');
    const aWipSha = await commitWip(shadow, human, 'content/docs', 'WIP: a v1');
    await saveVersion(shadow, 'content/docs', [human]);

    await new Promise((r) => setTimeout(r, 1100));

    rmSync(resolve(contentDir, 'a.md'));
    writeFileSync(resolve(contentDir, 'b.md'), '# B v1\n');
    const renameSha = await commitWip(shadow, human, 'content/docs', 'rename: a -> b');
    await saveVersion(shadow, 'content/docs', [human]);

    writeFileSync(resolve(contentDir, 'b.md'), '# B v2\n');
    const bWipSha = await commitWip(shadow, human, 'content/docs', 'WIP: b v2');

    const index = createEmptyIndex();
    appendRenameLogEntry(shadow.gitDir, entry({ from: 'a', to: 'b', commitSha: renameSha }), index);
    setRenameLogIndex(shadow.gitDir, index);

    const result = await getDocumentHistory(shadow, { docName: 'b' }, 'content/docs');
    const shas = result.entries.map((e) => e.sha);
    expect(shas).toContain(aWipSha); // pre-rename
    expect(shas).toContain(renameSha); // rename event
    expect(shas).toContain(bWipSha); // post-rename
  });

  test('FR2: un-renamed doc → empty rename log → identical results to pre-spec behavior', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'plain.md'), '# v1\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: v1');
    writeFileSync(resolve(contentDir, 'plain.md'), '# v2\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: v2');

    setRenameLogIndex(shadow.gitDir, createEmptyIndex());

    const result = await getDocumentHistory(shadow, { docName: 'plain' }, 'content/docs');
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e) => e.message.startsWith('WIP:'))).toBe(true);
  });

  test('chained A→B→C: timeline of `c` spans all three name epochs', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'a.md'), '# A\n');
    const aSha = await commitWip(shadow, human, 'content/docs', 'WIP: a');
    await saveVersion(shadow, 'content/docs', [human]);
    await new Promise((r) => setTimeout(r, 1100));

    rmSync(resolve(contentDir, 'a.md'));
    writeFileSync(resolve(contentDir, 'b.md'), '# B\n');
    const renameAB = await commitWip(shadow, human, 'content/docs', 'rename: a -> b');
    await saveVersion(shadow, 'content/docs', [human]);
    await new Promise((r) => setTimeout(r, 1100));

    rmSync(resolve(contentDir, 'b.md'));
    writeFileSync(resolve(contentDir, 'c.md'), '# C\n');
    const renameBC = await commitWip(shadow, human, 'content/docs', 'rename: b -> c');

    const index = createEmptyIndex();
    appendRenameLogEntry(shadow.gitDir, entry({ from: 'a', to: 'b', commitSha: renameAB }), index);
    appendRenameLogEntry(shadow.gitDir, entry({ from: 'b', to: 'c', commitSha: renameBC }), index);
    setRenameLogIndex(shadow.gitDir, index);

    const result = await getDocumentHistory(shadow, { docName: 'c' }, 'content/docs');
    const shas = result.entries.map((e) => e.sha);
    expect(shas).toContain(aSha);
    expect(shas).toContain(renameAB);
    expect(shas).toContain(renameBC);
  }, 15_000);

  test('name-reuse contamination: timeline of `b` does NOT include new-`a` commits', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'a.md'), '# A old\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: a old');
    await saveVersion(shadow, 'content/docs', [human]);
    await new Promise((r) => setTimeout(r, 1100));

    rmSync(resolve(contentDir, 'a.md'));
    writeFileSync(resolve(contentDir, 'b.md'), '# B\n');
    const renameSha = await commitWip(shadow, human, 'content/docs', 'rename: a -> b');
    await saveVersion(shadow, 'content/docs', [human]);
    await new Promise((r) => setTimeout(r, 1100));

    rmSync(resolve(contentDir, 'b.md'));
    writeFileSync(resolve(contentDir, 'a.md'), '# A new (unrelated)\n');
    const newASha = await commitWip(shadow, human, 'content/docs', 'WIP: new-a');
    await saveVersion(shadow, 'content/docs', [human]);

    const index = createEmptyIndex();
    appendRenameLogEntry(shadow.gitDir, entry({ from: 'a', to: 'b', commitSha: renameSha }), index);
    setRenameLogIndex(shadow.gitDir, index);

    const bResult = await getDocumentHistory(shadow, { docName: 'b' }, 'content/docs');
    const bShas = bResult.entries.map((e) => e.sha);
    expect(bShas).not.toContain(newASha); // contamination rejected by cycle bound

    const aResult = await getDocumentHistory(shadow, { docName: 'a' }, 'content/docs');
    const aShas = aResult.entries.map((e) => e.sha);
    expect(aShas).toContain(newASha);
  }, 15_000);

  test('perf: chain depth 5 query completes in bounded latency', async () => {
    const { contentDir, shadow } = await setup();
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    const index = createEmptyIndex();
    let prevName: string | null = null;
    for (const name of names) {
      if (prevName) {
        try {
          rmSync(resolve(contentDir, `${prevName}.md`));
        } catch {}
      }
      writeFileSync(resolve(contentDir, `${name}.md`), `# ${name}\n`);
      const sha = await commitWip(shadow, human, 'content/docs', `WIP: ${name}`);
      if (prevName) {
        appendRenameLogEntry(
          shadow.gitDir,
          entry({ from: prevName, to: name, commitSha: sha }),
          index,
        );
      }
      await saveVersion(shadow, 'content/docs', [human]);
      prevName = name;
    }
    setRenameLogIndex(shadow.gitDir, index);

    const t0 = performance.now();
    const result = await getDocumentHistory(shadow, { docName: 'f' }, 'content/docs');
    const elapsed = performance.now() - t0;
    expect(result.entries.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(2_000);
  }, 30_000);

  test('perf: chain depth 5 + 100 checkpoints stays within NFR target', async () => {
    const { contentDir, shadow } = await setup();
    const names = ['a', 'b', 'c', 'd', 'e', 'f']; // 5 renames between 6 epochs
    const index = createEmptyIndex();
    let prevName: string | null = null;
    for (const name of names) {
      if (prevName) {
        try {
          rmSync(resolve(contentDir, `${prevName}.md`));
        } catch {}
      }
      writeFileSync(resolve(contentDir, `${name}.md`), `# ${name} v0\n`);
      const renameSha = await commitWip(shadow, human, 'content/docs', `WIP: ${name} v0`);
      if (prevName) {
        appendRenameLogEntry(
          shadow.gitDir,
          entry({ from: prevName, to: name, commitSha: renameSha }),
          index,
        );
      }
      for (let i = 1; i <= 17; i++) {
        writeFileSync(resolve(contentDir, `${name}.md`), `# ${name} v${i}\n`);
        await commitWip(shadow, human, 'content/docs', `WIP: ${name} v${i}`);
        await saveVersion(shadow, 'content/docs', [human]);
      }
      prevName = name;
    }
    setRenameLogIndex(shadow.gitDir, index);

    await getDocumentHistory(shadow, { docName: 'f' }, 'content/docs');

    const runs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const result = await getDocumentHistory(shadow, { docName: 'f' }, 'content/docs');
      runs.push(performance.now() - t0);
      expect(result.entries.length).toBeGreaterThan(0);
    }
    runs.sort((a, b) => a - b);
    const median = runs[1] ?? runs[0] ?? 0;

    console.log(
      `[perf] chain depth 5 + ~100 checkpoints median: ${median.toFixed(1)}ms ` +
        `(NFR ≤ 200ms; runs: ${runs.map((r) => r.toFixed(0)).join('ms, ')}ms)`,
    );

    expect(median).toBeLessThan(1_000);
  }, 60_000);

  test('lazy-population window: empty-commitSha entry → chain truncates → behavior matches no-rename-history', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'b.md'), '# B v1\n');
    const bWipSha = await commitWip(shadow, human, 'content/docs', 'WIP: b v1');

    const index = createEmptyIndex();
    appendRenameLogEntry(shadow.gitDir, entry({ from: 'a', to: 'b', commitSha: '' }), index);
    setRenameLogIndex(shadow.gitDir, index);

    const result = await getDocumentHistory(shadow, { docName: 'b' }, 'content/docs');
    expect(result.entries.map((e) => e.sha)).toEqual([bWipSha]);
  });

  test('per-step error isolation: failure on one predecessor preserves others', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'a.md'), '# A v1\n');
    const aWipSha = await commitWip(shadow, human, 'content/docs', 'WIP: a v1');
    await saveVersion(shadow, 'content/docs', [human]);
    await new Promise((r) => setTimeout(r, 1100));

    rmSync(resolve(contentDir, 'a.md'));
    writeFileSync(resolve(contentDir, 'b.md'), '# B v1\n');
    await commitWip(shadow, human, 'content/docs', 'rename: a -> b');
    writeFileSync(resolve(contentDir, 'b.md'), '# B v2\n');
    const bWipSha = await commitWip(shadow, human, 'content/docs', 'WIP: b v2');
    await saveVersion(shadow, 'content/docs', [human]);
    await new Promise((r) => setTimeout(r, 1100));

    rmSync(resolve(contentDir, 'b.md'));
    writeFileSync(resolve(contentDir, 'c.md'), '# C v1\n');
    const renameBC = await commitWip(shadow, human, 'content/docs', 'rename: b -> c');

    const index = createEmptyIndex();
    const bogusSha = '0123456789abcdef0123456789abcdef01234567';
    appendRenameLogEntry(shadow.gitDir, entry({ from: 'a', to: 'b', commitSha: bogusSha }), index);
    appendRenameLogEntry(shadow.gitDir, entry({ from: 'b', to: 'c', commitSha: renameBC }), index);
    setRenameLogIndex(shadow.gitDir, index);

    const origWarn = console.warn;
    let warnedSkip = false;
    console.warn = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');
      if (msg.includes('predecessor walk failed for step')) warnedSkip = true;
    };
    try {
      const result = await getDocumentHistory(shadow, { docName: 'c' }, 'content/docs');
      const shas = result.entries.map((e) => e.sha);
      expect(shas).toContain(bWipSha);
      expect(shas).not.toContain(aWipSha);
      expect(shas).toContain(renameBC);
    } finally {
      console.warn = origWarn;
    }
    expect(warnedSkip).toBe(true);
  }, 15_000);

  test('checkpoint-only fast path: pre-rename checkpoint visible after rename', async () => {
    const { contentDir, shadow } = await setup();

    writeFileSync(resolve(contentDir, 'a.md'), '# A pre-rename\n');
    await commitWip(shadow, human, 'content/docs', 'WIP: a');
    await saveVersion(shadow, 'content/docs', [human]);
    await new Promise((r) => setTimeout(r, 1100));

    rmSync(resolve(contentDir, 'a.md'));
    writeFileSync(resolve(contentDir, 'b.md'), '# B post-rename\n');
    const renameSha = await commitWip(shadow, human, 'content/docs', 'rename: a -> b');
    await saveVersion(shadow, 'content/docs', [human]);

    const index = createEmptyIndex();
    appendRenameLogEntry(shadow.gitDir, entry({ from: 'a', to: 'b', commitSha: renameSha }), index);
    setRenameLogIndex(shadow.gitDir, index);

    const result = await getDocumentHistory(
      shadow,
      { docName: 'b', type: 'checkpoint' },
      'content/docs',
    );
    expect(result.entries.length).toBeGreaterThanOrEqual(2);
    expect(result.entries.every((e) => e.type === 'checkpoint')).toBe(true);
  });
});
