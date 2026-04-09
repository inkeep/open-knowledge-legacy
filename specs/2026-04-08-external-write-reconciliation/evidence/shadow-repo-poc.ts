/**
 * Shadow Repo POC — demonstrates the attribution journal pattern
 *
 * Run: cd packages/server && bun run src/poc/shadow-repo-poc.ts
 *      cd packages/server && bun run src/poc/shadow-repo-poc.ts --keep  # don't clean up
 *
 * What it does:
 * 1. Creates a temp project repo (simulating a Fumadocs project)
 * 2. Inits a shadow bare repo at .git/openknowledge/
 * 3. Simulates human + agent WIP writes to the shadow
 * 4. Simulates an upstream pull (external change)
 * 5. Performs a Save Version → real commit on the project repo
 * 6. Creates a checkpoint ref in the shadow with full tree snapshot
 * 7. Dumps the state of both repos for inspection
 * 8. Cleans up temp dir (unless --keep is passed)
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const KEEP = process.argv.includes('--keep');

import simpleGit from 'simple-git';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShadowHandle {
  gitDir: string;
  workTree: string;
}

interface WriterIdentity {
  id: string;
  name: string;
  email: string;
}

const WRITERS = {
  human: {
    id: 'human-nick',
    name: 'Nick Gomez',
    email: 'nick@example.com',
  } satisfies WriterIdentity,
  agent: {
    id: 'agent-cursor',
    name: 'cursor-agent',
    email: 'cursor@openknowledge.local',
  } satisfies WriterIdentity,
  upstream: {
    id: 'upstream',
    name: 'upstream',
    email: 'noreply@openknowledge.local',
  } satisfies WriterIdentity,
} as const;

// ─── Shadow repo interface ───────────────────────────────────────────────────

/** Create a simple-git instance pointed at the shadow bare repo */
function shadowGit(shadow: ShadowHandle) {
  return simpleGit(shadow.workTree).env({
    GIT_DIR: shadow.gitDir,
    GIT_WORK_TREE: shadow.workTree,
  });
}

/** Initialize the shadow bare repo at .git/openknowledge/ */
async function initShadowRepo(projectRoot: string): Promise<ShadowHandle> {
  // Resolve shadow location: inside .git/ if project repo exists
  const projectGitDir = resolve(projectRoot, '.git');
  const hasProjectRepo = (() => {
    try {
      return statSync(projectGitDir).isDirectory();
    } catch {
      return false;
    }
  })();

  const shadowDir = hasProjectRepo
    ? resolve(projectGitDir, 'openknowledge')
    : resolve(projectRoot, '.openknowledge');
  mkdirSync(shadowDir, { recursive: true });

  // Init bare repo, then unset core.bare before setting core.worktree
  const git = simpleGit(projectRoot);
  await git.raw('init', '--bare', shadowDir);
  const sg = simpleGit().env({ GIT_DIR: shadowDir });
  await sg.raw('config', '--unset', 'core.bare');
  await sg.raw('config', 'core.worktree', projectRoot);
  await sg.raw('config', 'user.name', 'openknowledge');
  await sg.raw('config', 'user.email', 'noreply@openknowledge.local');

  const location = hasProjectRepo ? '.git/openknowledge/' : '.openknowledge/';
  console.log(`  ✓ Shadow bare repo at ${location}`);
  console.log(`    core.worktree → ${projectRoot}`);
  if (hasProjectRepo) {
    console.log('    (nested inside .git/ — no .gitignore needed)');
  }

  return { gitDir: shadowDir, workTree: projectRoot };
}

/** Commit content changes to a per-writer WIP ref in the shadow */
async function commitWip(
  shadow: ShadowHandle,
  writer: WriterIdentity,
  contentRoot: string,
  message: string,
): Promise<string> {
  const tmpIndex = resolve(shadow.gitDir, `index-wip-${writer.id}`);
  const ref = `refs/wip/${writer.id}`;
  const sg = shadowGit(shadow);

  try {
    // Seed index from current ref state (if exists)
    try {
      const refTree = (await sg.raw('rev-parse', `${ref}^{tree}`)).trim();
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('read-tree', refTree);
    } catch {
      // First commit on this ref — start fresh
    }

    // Stage content files
    await sg
      .env({ GIT_DIR: shadow.gitDir, GIT_WORK_TREE: shadow.workTree, GIT_INDEX_FILE: tmpIndex })
      .raw('add', contentRoot);
    const treeSha = (
      await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: tmpIndex }).raw('write-tree')
    ).trim();

    // Find parent
    let parentSha: string | null = null;
    try {
      parentSha = (await sg.raw('rev-parse', ref)).trim();
    } catch {
      // No parent — first commit
    }

    // Create commit with writer identity
    const args = ['commit-tree', treeSha, '-m', message];
    if (parentSha) args.push('-p', parentSha);

    const commitSha = (
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_AUTHOR_NAME: writer.name,
          GIT_AUTHOR_EMAIL: writer.email,
          GIT_COMMITTER_NAME: 'openknowledge',
          GIT_COMMITTER_EMAIL: 'noreply@openknowledge.local',
        })
        .raw(...args)
    ).trim();

    await sg.raw('update-ref', ref, commitSha);
    return commitSha;
  } finally {
    try {
      rmSync(tmpIndex);
    } catch {
      // ignore
    }
  }
}

/** Record an upstream-import commit in the shadow */
async function commitUpstreamImport(
  shadow: ShadowHandle,
  contentRoot: string,
  oldHead: string | null,
  newHead: string,
): Promise<string> {
  const message = oldHead
    ? `upstream: import from ${oldHead.slice(0, 8)}..${newHead.slice(0, 8)}`
    : `upstream: initial import at ${newHead.slice(0, 8)}`;

  return commitWip(shadow, WRITERS.upstream, contentRoot, message);
}

/**
 * Save Version — the graduation point:
 * 1. Create a real commit on the project repo
 * 2. Write a checkpoint ref in the shadow with full tree snapshot
 */
async function saveVersion(
  shadow: ShadowHandle,
  projectRoot: string,
  contentRoot: string,
  writers: WriterIdentity[],
): Promise<{ projectCommitSha: string; checkpointRef: string }> {
  const projectGit = simpleGit(projectRoot);
  const sg = shadowGit(shadow);
  const tmpIndex = resolve(projectRoot, '.git/index-save-version');

  try {
    // ── Step 1: Create project repo commit ──

    // Seed from current HEAD
    try {
      const headTree = (await projectGit.raw('rev-parse', 'HEAD^{tree}')).trim();
      await projectGit.env({ GIT_INDEX_FILE: tmpIndex }).raw('read-tree', headTree);
    } catch {
      // Empty repo
    }

    // Stage current content
    await projectGit.env({ GIT_INDEX_FILE: tmpIndex }).raw('add', contentRoot);
    const treeSha = (await projectGit.env({ GIT_INDEX_FILE: tmpIndex }).raw('write-tree')).trim();

    // Find parent
    let parentSha: string | null = null;
    try {
      parentSha = (await projectGit.raw('rev-parse', 'HEAD')).trim();
    } catch {
      // First commit
    }

    // Build commit message with co-authored-by trailers
    const primaryWriter = writers[0]!;
    const coAuthors = writers
      .slice(1)
      .map((w) => `Co-authored-by: ${w.name} <${w.email}>`)
      .join('\n');

    const message = coAuthors
      ? `Save Version: content update\n\n${coAuthors}`
      : 'Save Version: content update';

    const commitArgs = ['commit-tree', treeSha, '-m', message];
    if (parentSha) commitArgs.push('-p', parentSha);

    const projectCommitSha = (
      await projectGit
        .env({
          GIT_INDEX_FILE: tmpIndex,
          GIT_AUTHOR_NAME: primaryWriter.name,
          GIT_AUTHOR_EMAIL: primaryWriter.email,
          GIT_COMMITTER_NAME: primaryWriter.name,
          GIT_COMMITTER_EMAIL: primaryWriter.email,
        })
        .raw(...commitArgs)
    ).trim();

    // Advance HEAD
    await projectGit.raw('update-ref', 'HEAD', projectCommitSha);

    // ── Step 2: Checkpoint ref in shadow with full tree snapshot ──

    // The checkpoint stores the content tree at this moment
    const shadowTmpIndex = resolve(shadow.gitDir, 'index-checkpoint');
    try {
      // Build a shadow tree from current content
      await sg
        .env({
          GIT_DIR: shadow.gitDir,
          GIT_WORK_TREE: shadow.workTree,
          GIT_INDEX_FILE: shadowTmpIndex,
        })
        .raw('add', contentRoot);
      const shadowTreeSha = (
        await sg.env({ GIT_DIR: shadow.gitDir, GIT_INDEX_FILE: shadowTmpIndex }).raw('write-tree')
      ).trim();

      // Find latest shadow WIP to parent on
      let shadowParent: string | null = null;
      for (const w of writers) {
        try {
          shadowParent = (await sg.raw('rev-parse', `refs/wip/${w.id}`)).trim();
          break;
        } catch {}
      }

      const checkpointArgs = [
        'commit-tree',
        shadowTreeSha,
        '-m',
        `checkpoint: Save Version → project commit ${projectCommitSha.slice(0, 8)}`,
      ];
      if (shadowParent) checkpointArgs.push('-p', shadowParent);

      const checkpointSha = (
        await sg
          .env({
            GIT_DIR: shadow.gitDir,
            GIT_AUTHOR_NAME: 'openknowledge',
            GIT_AUTHOR_EMAIL: 'noreply@openknowledge.local',
            GIT_COMMITTER_NAME: 'openknowledge',
            GIT_COMMITTER_EMAIL: 'noreply@openknowledge.local',
          })
          .raw(...checkpointArgs)
      ).trim();

      const checkpointRef = `refs/checkpoints/${projectCommitSha}`;
      await sg.raw('update-ref', checkpointRef, checkpointSha);

      return { projectCommitSha, checkpointRef };
    } finally {
      try {
        rmSync(shadowTmpIndex);
      } catch {
        // ignore
      }
    }
  } finally {
    try {
      rmSync(tmpIndex);
    } catch {
      // ignore
    }
  }
}

/** Query shadow attribution between two checkpoint refs */
async function queryAttribution(
  shadow: ShadowHandle,
  writerIds: string[],
): Promise<Map<string, string[]>> {
  const sg = shadowGit(shadow);
  const result = new Map<string, string[]>();

  for (const id of writerIds) {
    const ref = `refs/wip/${id}`;
    try {
      const log = await sg.raw('log', '--oneline', '--author-date-order', ref);
      result.set(id, log.trim().split('\n').filter(Boolean));
    } catch {
      result.set(id, []);
    }
  }

  return result;
}

// ─── Main scenario ───────────────────────────────────────────────────────────

async function main() {
  const tmpDir = mkdtempSync(resolve(tmpdir(), 'ok-shadow-poc-'));
  const projectRoot = resolve(tmpDir, 'my-fumadocs-project');
  const contentRoot = 'content/docs';
  const contentDir = resolve(projectRoot, contentRoot);

  console.log('\n═══ Shadow Repo POC ═══\n');
  console.log(`Working directory: ${tmpDir}\n`);

  try {
    // ── 1. Create a simulated Fumadocs project repo ──
    console.log('1. Creating simulated Fumadocs project repo...');
    mkdirSync(contentDir, { recursive: true });
    const projectGit = simpleGit(projectRoot);
    await projectGit.init();
    await projectGit.raw('config', 'user.name', 'Project User');
    await projectGit.raw('config', 'user.email', 'user@project.dev');

    writeFileSync(resolve(contentDir, 'intro.mdx'), '# Introduction\n\nWelcome to the docs.\n');
    writeFileSync(resolve(contentDir, 'guide.mdx'), '# Getting Started\n\nFollow these steps.\n');
    await projectGit.add('.');
    await projectGit.commit('Initial Fumadocs setup');

    const initialHead = (await projectGit.raw('rev-parse', 'HEAD')).trim();
    console.log(`  ✓ Project repo at ${projectRoot}`);
    console.log(`  ✓ Initial commit: ${initialHead.slice(0, 8)}\n`);

    // ── 2. Init shadow repo ──
    console.log('2. Initializing shadow repo...');
    const shadow = await initShadowRepo(projectRoot);

    console.log('  (no .gitignore modification needed — shadow is inside .git/)\n');

    // ── 3. Human makes edits → WIP commit in shadow ──
    console.log('3. Human edits intro.mdx...');
    writeFileSync(
      resolve(contentDir, 'intro.mdx'),
      '# Introduction\n\nWelcome to the docs.\n\n## What is OpenKnowledge?\n\nA collaborative knowledge editor.\n',
    );

    const humanWip1 = await commitWip(
      shadow,
      WRITERS.human,
      contentRoot,
      'WIP: added What is OK section',
    );
    console.log(
      `  ✓ Shadow WIP commit (human): ${humanWip1.slice(0, 8)} → refs/wip/${WRITERS.human.id}\n`,
    );

    // ── 4. Agent makes edits → WIP commit in shadow ──
    console.log('4. Agent rewrites guide.mdx...');
    writeFileSync(
      resolve(contentDir, 'guide.mdx'),
      '# Getting Started\n\nFollow these steps to get up and running.\n\n## Installation\n\n```bash\nnpx openknowledge init\n```\n',
    );

    const agentWip1 = await commitWip(
      shadow,
      WRITERS.agent,
      contentRoot,
      'WIP: expanded getting started guide',
    );
    console.log(
      `  ✓ Shadow WIP commit (agent): ${agentWip1.slice(0, 8)} → refs/wip/${WRITERS.agent.id}\n`,
    );

    // ── 5. Simulate upstream pull (external change in project repo) ──
    console.log('5. Simulating upstream pull (external change to project repo)...');

    // Create a "remote" change by committing directly to project repo
    writeFileSync(
      resolve(contentDir, 'api-reference.mdx'),
      '# API Reference\n\nEndpoint documentation.\n',
    );
    await projectGit.add('.');
    await projectGit.commit('upstream: add API reference');
    const newHead = (await projectGit.raw('rev-parse', 'HEAD')).trim();

    // Record the upstream import in shadow
    const upstreamWip = await commitUpstreamImport(shadow, contentRoot, initialHead, newHead);
    console.log(`  ✓ Upstream import commit: ${upstreamWip.slice(0, 8)} → refs/wip/upstream`);
    console.log(`    (import from ${initialHead.slice(0, 8)}..${newHead.slice(0, 8)})\n`);

    // ── 6. Human makes more edits ──
    console.log('6. Human makes more edits...');
    writeFileSync(
      resolve(contentDir, 'intro.mdx'),
      '# Introduction\n\nWelcome to the docs.\n\n## What is OpenKnowledge?\n\nA collaborative knowledge editor for teams.\n\n## Why?\n\nBecause docs should be alive.\n',
    );

    const humanWip2 = await commitWip(shadow, WRITERS.human, contentRoot, 'WIP: added Why section');
    console.log(
      `  ✓ Shadow WIP commit (human): ${humanWip2.slice(0, 8)} → refs/wip/${WRITERS.human.id}\n`,
    );

    // ── 7. Save Version → real project commit + shadow checkpoint ──
    console.log('7. ★ Save Version → creating project repo commit...');
    const { projectCommitSha, checkpointRef } = await saveVersion(
      shadow,
      projectRoot,
      contentRoot,
      [WRITERS.human, WRITERS.agent],
    );
    console.log(`  ✓ Project repo commit: ${projectCommitSha.slice(0, 8)}`);
    console.log(`  ✓ Shadow checkpoint: ${checkpointRef}\n`);

    // ── 8. Dump state for inspection ──
    console.log('═══ Results ═══\n');

    console.log('── Project repo log (what the user sees in git log): ──');
    const projectLog = await projectGit.raw('log', '--oneline', '--all');
    console.log(projectLog);

    console.log('── Project repo: Save Version commit details: ──');
    const commitShow = await projectGit.raw(
      'log',
      '-1',
      '--format=Author: %an <%ae>%nDate: %ai%n%n%B',
      projectCommitSha,
    );
    console.log(commitShow);

    console.log('── Shadow repo refs: ──');
    const sg = shadowGit(shadow);
    try {
      const refs = await sg.raw(
        'for-each-ref',
        '--format=%(refname) → %(objectname:short) by %(authorname)',
        'refs/',
      );
      console.log(refs || '  (no refs)');
    } catch {
      console.log('  (no refs)');
    }

    console.log('\n── Shadow attribution journal (per-writer history): ──');
    const attribution = await queryAttribution(shadow, [
      WRITERS.human.id,
      WRITERS.agent.id,
      WRITERS.upstream.id,
    ]);
    for (const [writer, commits] of attribution) {
      console.log(`\n  ${writer}:`);
      for (const c of commits) {
        console.log(`    ${c}`);
      }
      if (commits.length === 0) console.log('    (no commits)');
    }

    console.log('\n── Files on disk: ──');
    const intro = readFileSync(resolve(contentDir, 'intro.mdx'), 'utf-8');
    const guide = readFileSync(resolve(contentDir, 'guide.mdx'), 'utf-8');
    const api = readFileSync(resolve(contentDir, 'api-reference.mdx'), 'utf-8');
    console.log(`  intro.mdx (${intro.split('\n').length} lines)`);
    console.log(`  guide.mdx (${guide.split('\n').length} lines)`);
    console.log(`  api-reference.mdx (${api.split('\n').length} lines)`);

    console.log('\n── Checkpoint tree snapshot (self-contained in shadow): ──');
    try {
      const checkpointTree = await sg.raw('ls-tree', '-r', '--name-only', checkpointRef);
      console.log(checkpointTree);
    } catch (e) {
      console.log(`  Error reading checkpoint: ${e}`);
    }

    if (KEEP) {
      console.log(`\n✓ POC complete. Temp dir preserved: ${tmpDir}`);
      console.log('  Inspect with:');
      console.log(`    cd ${projectRoot} && git log --all --oneline`);
      console.log(`    GIT_DIR=${shadow.gitDir} git log --all --oneline`);
      console.log(`    GIT_DIR=${shadow.gitDir} git log refs/wip/human-nick --oneline`);
      console.log(`    GIT_DIR=${shadow.gitDir} git for-each-ref refs/`);
      console.log(`\n  Clean up with: rm -rf ${tmpDir}`);
    } else {
      rmSync(tmpDir, { recursive: true });
      console.log('\n✓ POC complete. Temp dir cleaned up.');
      console.log('  (run with --keep to preserve for manual inspection)');
    }
  } catch (e) {
    console.error('POC failed:', e);
    // Clean up on failure too (unless --keep)
    if (!KEEP) {
      try {
        rmSync(tmpDir, { recursive: true });
      } catch {}
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
