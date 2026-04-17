import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import simpleGit from 'simple-git';
import {
  buildHistoricalGraph,
  diffHistoricalGraphs,
  type HistoricalGraph,
} from './historical-graph';
import {
  commitWip,
  initShadowRepo,
  type ShadowHandle,
  saveVersion,
  shadowGit,
  type WriterIdentity,
} from './shadow-repo';

async function resolveRef(shadow: ShadowHandle, ref: string): Promise<string> {
  return (await shadowGit(shadow).raw('rev-parse', ref)).trim();
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(resolve(tmpdir(), 'ok-historical-graph-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

const human: WriterIdentity = {
  id: 'human-nick',
  name: 'Nick Gomez',
  email: 'nick@example.com',
};

async function setup(contentSubdir = 'content') {
  const projectRoot = resolve(tmpDir, 'project');
  const contentDir = resolve(projectRoot, contentSubdir);
  mkdirSync(contentDir, { recursive: true });
  const git = simpleGit(projectRoot);
  await git.init();
  await git.raw('config', 'user.name', 'Test');
  await git.raw('config', 'user.email', 'test@test.com');
  writeFileSync(resolve(contentDir, 'seed.md'), '# seed\n');
  await git.add('.');
  await git.commit('Initial commit');
  const shadow = await initShadowRepo(projectRoot);
  return { projectRoot, contentDir, shadow, contentRoot: contentSubdir };
}

function idOf(docName: string): string {
  // BacklinkIndex builds doc-node IDs that match the docName verbatim.
  return docName;
}

describe('buildHistoricalGraph', () => {
  test('reconstructs a simple two-doc graph with a single wiki link', async () => {
    const { contentDir, shadow, contentRoot } = await setup();

    writeFileSync(resolve(contentDir, 'alpha.md'), '# Alpha\n\nLinks to [[beta]].\n');
    writeFileSync(resolve(contentDir, 'beta.md'), '# Beta\n');
    await commitWip(shadow, human, contentRoot, 'WIP');
    const { checkpointRef } = await saveVersion(shadow, contentRoot, [human]);
    const sha = await resolveRef(shadow, checkpointRef);

    const g = await buildHistoricalGraph(shadow, sha, contentRoot);

    expect(g.sha).toBe(sha);
    const ids = g.nodes.map((n) => n.id).sort();
    // 'seed' is the setup fixture's bootstrap doc; alpha and beta are the
    // ones the test cares about. Assert membership rather than exact match
    // so future setup tweaks don't cascade into every assertion.
    expect(ids).toContain(idOf('alpha'));
    expect(ids).toContain(idOf('beta'));

    const alpha = g.nodes.find((n) => n.id === idOf('alpha'));
    expect(alpha?.kind).toBe('doc');
    if (alpha?.kind === 'doc') {
      expect(alpha.label).toBe('Alpha');
      expect(alpha.docName).toBe('alpha');
    }

    expect(g.links).toEqual([{ source: 'alpha', target: 'beta' }]);
  });

  test('ignores files outside the content root', async () => {
    const { projectRoot, contentDir, shadow, contentRoot } = await setup();
    writeFileSync(resolve(contentDir, 'inside.md'), '# Inside\n');
    // Place a doc sibling to (not inside) the content root. It must not show
    // up in the historical graph — the same rule as the live graph.
    const outsideDir = resolve(projectRoot, 'unrelated');
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(resolve(outsideDir, 'leak.md'), '# Leak\n');

    await commitWip(shadow, human, '.', 'WIP');
    const { checkpointRef } = await saveVersion(shadow, '.', [human]);
    const sha = await resolveRef(shadow, checkpointRef);

    const g = await buildHistoricalGraph(shadow, sha, contentRoot);
    const docNames = g.nodes
      .filter(
        (n): n is Extract<HistoricalGraph['nodes'][number], { kind: 'doc' }> => n.kind === 'doc',
      )
      .map((n) => n.docName);
    expect(docNames).toContain('inside');
    expect(docNames).not.toContain('leak');
    expect(docNames).not.toContain('unrelated/leak');
  });

  test('produces distinct graphs at two different checkpoints', async () => {
    const { contentDir, shadow, contentRoot } = await setup();

    writeFileSync(resolve(contentDir, 'alpha.md'), '# Alpha\n\n[[beta]]\n');
    writeFileSync(resolve(contentDir, 'beta.md'), '# Beta\n');
    await commitWip(shadow, human, contentRoot, 'WIP 1');
    const cp1 = await saveVersion(shadow, contentRoot, [human]);
    const sha1 = await resolveRef(shadow, cp1.checkpointRef);

    // Add gamma + a new link alpha → gamma; remove alpha → beta by rewriting.
    writeFileSync(resolve(contentDir, 'alpha.md'), '# Alpha\n\n[[gamma]]\n');
    writeFileSync(resolve(contentDir, 'gamma.md'), '# Gamma\n');
    await commitWip(shadow, human, contentRoot, 'WIP 2');
    const cp2 = await saveVersion(shadow, contentRoot, [human]);
    const sha2 = await resolveRef(shadow, cp2.checkpointRef);

    const g1 = await buildHistoricalGraph(shadow, sha1, contentRoot);
    const g2 = await buildHistoricalGraph(shadow, sha2, contentRoot);

    expect(g1.links).toEqual([{ source: 'alpha', target: 'beta' }]);
    expect(g2.links).toContainEqual({ source: 'alpha', target: 'gamma' });
    expect(g2.links).not.toContainEqual({ source: 'alpha', target: 'beta' });

    const diff = diffHistoricalGraphs(g1, g2);
    expect(diff.from).toBe(sha1);
    expect(diff.to).toBe(sha2);

    const addedDocNames = diff.addedNodes
      .filter((n) => n.kind === 'doc')
      .map((n) => (n as Extract<typeof n, { kind: 'doc' }>).docName);
    const removedDocNames = diff.removedNodes
      .filter((n) => n.kind === 'doc')
      .map((n) => (n as Extract<typeof n, { kind: 'doc' }>).docName);

    expect(addedDocNames).toContain('gamma');
    // beta is still in the second snapshot (its file still exists), but
    // alpha no longer links to it, so it must appear in removedNodes iff the
    // second snapshot truly lost it. In this setup beta remains a node in
    // g2 because its file still exists, so the diff must NOT remove beta.
    expect(removedDocNames).not.toContain('beta');

    const addedLinks = diff.addedLinks.map((l) => `${l.source}->${l.target}`);
    const removedLinks = diff.removedLinks.map((l) => `${l.source}->${l.target}`);
    expect(addedLinks).toContain('alpha->gamma');
    expect(removedLinks).toContain('alpha->beta');
  });

  test('rejects malformed SHAs', async () => {
    const { shadow, contentRoot } = await setup();
    await expect(buildHistoricalGraph(shadow, 'not-a-sha', contentRoot)).rejects.toThrow(
      /Invalid sha/,
    );
  });
});

describe('diffHistoricalGraphs', () => {
  test('returns empty diff for identical graphs', () => {
    const g: HistoricalGraph = {
      sha: 'a'.repeat(40),
      nodes: [{ kind: 'doc', id: 'doc:x', docName: 'x', label: 'X', anchor: null }],
      links: [],
    };
    const diff = diffHistoricalGraphs(g, { ...g, sha: 'b'.repeat(40) });
    expect(diff.addedNodes).toEqual([]);
    expect(diff.removedNodes).toEqual([]);
    expect(diff.addedLinks).toEqual([]);
    expect(diff.removedLinks).toEqual([]);
  });
});
