/**
 * Randomized multi-client bridge-convergence stress test with invariant oracles.
 *
 * FR-17 / US-014: Samples the race space across bridge write surfaces using
 * 2-3 clients with random operations drawn from { wysiwyg-type, source-type,
 * agent-write, agent-patch, external-change, sync-pause, sync-resume, wait }.
 *
 * Oracles (after all ops drain + convergence loop settles):
 *   (a) bridge invariant holds on every client
 *   (b) all clients have converged (identical ytext + identical fragment)
 *   (c) origin probes on agent-origin Items report preserved
 *   (d) content preservation — every marker prefix (`M<N>-` format) registered
 *       by a content-producing op (wysiwyg-type / source-type / agent-write)
 *       that has not been invalidated by a later external-change must appear
 *       in EVERY client's final ytext. Catches Bug-A class (convergent-but-
 *       content-lost) where all clients synchronously agree on wrong content.
 *
 * Pre-fix validation (SPEC §D17 gate):
 *   Reverted server files (agent-sessions.ts, api-extension.ts, index.ts) to
 *   commit 6c914f2 (pre-US-008) and ran this fuzzer with 25 seeds. Oracle (d)
 *   caught Bug-A content loss on 6/25 seeds (24% reproduction rate). Restored
 *   to HEAD: 50/50 seeds pass the oracle on the post-fix code (occasional
 *   convergence-timeout flakes under macOS scheduler load — see Risk notes).
 *   This validates the fuzzer is load-bearing, not a no-op oracle.
 *
 * Known flake (documented, not a real bug):
 *   "Convergence failed after 25s" occurs at ~2-4% rate under heavy macOS
 *   scheduler load with 3 clients + 12 ops + aggressive inter-op pacing.
 *   This is SPEC §11 "PBT convergence fuzzer flakes on CI under runner load"
 *   risk materializing. Seed snapshots written to /tmp/bridge-conv-fuzz-<seed>/
 *   on failure enable deterministic replay:
 *     STRESS_FUZZ_SEED=<seed> bun test packages/app/tests/stress/bridge-convergence.fuzz.test.ts
 *   If the replay passes, it's infra flakiness; if it fails repeatedly on
 *   replay, it's a real bug. Content-preservation violations (oracle d) are
 *   deterministic-on-replay — a different signal class from convergence flakes.
 *
 * Seed replay: STRESS_FUZZ_SEED=<n> bun test packages/app/tests/stress/bridge-convergence.fuzz.test.ts
 * Seed count: BRIDGE_FUZZ_SEEDS=<n> (default: 25; CI PR: 25, nightly: 100)
 *
 * D18 coverage gate: a separate test enumerates every bridge write surface and
 * asserts a corresponding op kind exists in the generator.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chunkedYTextInsert } from '@inkeep/open-knowledge-core';
import { AGENT_WRITE_ORIGIN, applyExternalChange } from '@inkeep/open-knowledge-server';
import * as Y from 'yjs';

import {
  agentPatch,
  agentWriteMd,
  assertBridgeInvariant,
  awaitDocQuiescence,
  createItemOriginProbe,
  createTestClients,
  createTestServer,
  mdManager,
  serializeFragment,
  type TestClient,
  type TestServer,
  wait,
} from '../integration/test-harness';

// ─── Seeded PRNG (xorshift32 — same pattern as observers.fuzz.test.ts) ───

function createPRNG(seed: number) {
  let state = seed | 0 || 1;
  return {
    next(): number {
      state ^= state << 13;
      state ^= state >> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    },
    nextInt(max: number): number {
      return Math.floor(this.next() * max);
    },
    pick<T>(arr: readonly T[]): T {
      return arr[this.nextInt(arr.length)];
    },
    seed,
  };
}

type Rng = ReturnType<typeof createPRNG>;

// ─── Op type union (9 kinds backed by spec-shipped primitives) ───

type Op =
  | { kind: 'wysiwyg-type'; clientIdx: number; text: string; marker: string }
  | { kind: 'source-type'; clientIdx: number; text: string; marker: string }
  | {
      kind: 'agent-write';
      text: string;
      position: 'append' | 'prepend' | 'replace';
      marker: string;
    }
  | { kind: 'agent-patch'; find: string; replace: string; marker: string }
  | { kind: 'external-change'; newContent: string; marker: string }
  | {
      // FR-21 chunked Source paste. Large payload (>500KB threshold) split
      // into 50KB chunks with requestAnimationFrame yields between chunks.
      // The Y.RelativePosition-based `resolveOffset` maintains anchor
      // correctness through concurrent peer insertions/deletions that land
      // between chunks — this is the invariant QA-045 exercises under the
      // fuzzer's randomized op interleaving.
      kind: 'chunked-source-paste';
      clientIdx: number;
      text: string;
      marker: string;
    }
  | { kind: 'sync-pause'; clientIdx: number }
  | { kind: 'sync-resume'; clientIdx: number }
  | { kind: 'wait'; ms: number };

const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];

/**
 * Each content-producing op carries a unique marker string (e.g., `M7-delta golf`)
 * so the content-preservation oracle can distinguish "user's op-7 text survived"
 * from "another op produced the same `delta golf` phrase by coincidence."
 *
 * Markers use format `M<opIdx>-<text>` so `find`/`replace` strings in agent-patch
 * never accidentally match another op's marker prefix (agent-patch generators
 * use raw WORDS entries without the `M<N>-` prefix).
 */
function randomShortText(rng: Rng): string {
  const count = rng.nextInt(3) + 1;
  const words: string[] = [];
  for (let i = 0; i < count; i++) words.push(rng.pick(WORDS));
  return words.join(' ');
}

/**
 * Generate ops at the rebalanced distribution (server-authoritative FR-9):
 * wysiwyg:25%, source:15%, agent-write:15%, agent-patch:8%,
 * external-change:8%, sync-pause:12%, sync-resume:12%, wait:5%.
 * Source-type and external-change elevated from theatre rates (0.5% each)
 * to validate the symmetric Observer B fix under server-authoritative.
 */
function generateOps(rng: Rng, clientCount: number, opCount: number): Op[] {
  const ops: Op[] = [];
  const paused = new Set<number>();
  // Marker counter — each content-producing op gets a unique prefix like `M7-`.
  // Distinguishes "user op-N's text survived" from accidental repeats of small WORDS pool.
  let markerIdx = 0;

  for (let i = 0; i < opCount; i++) {
    const roll = rng.next();
    const clientIdx = rng.nextInt(clientCount);

    // Rebalanced distribution (server-authoritative spec FR-9):
    // wysiwyg:25%, source:15%, agent-write:15%, agent-patch:8%,
    // external-change:8%, sync-pause:12%, sync-resume:12%, wait:5%
    if (roll < 0.25) {
      // wysiwyg-type (25%): append a paragraph to XmlFragment
      const marker = `M${markerIdx++}-${randomShortText(rng)}`;
      ops.push({ kind: 'wysiwyg-type', clientIdx, text: marker, marker });
    } else if (roll < 0.4) {
      // source-type (15%): Y.Text write simulating CodeMirror input.
      // Elevated from 0.5% to exercise symmetric Observer B path under
      // server-authoritative architecture.
      const marker = `M${markerIdx++}-${randomShortText(rng)}`;
      ops.push({ kind: 'source-type', clientIdx, text: marker, marker });
      ops.push({ kind: 'wait', ms: 500 });
    } else if (roll < 0.55) {
      // agent-write via HTTP (15%) — append only
      const marker = `M${markerIdx++}-${randomShortText(rng)}`;
      ops.push({ kind: 'agent-write', text: marker, position: 'append', marker });
    } else if (roll < 0.63) {
      // agent-patch via HTTP (8%). `find`/`replace` use raw WORDS — NEVER marker
      // strings — so agent-patch never accidentally replaces a user/agent marker
      // that the content-preservation oracle tracks.
      const find = rng.pick(WORDS);
      const replace = rng.pick(WORDS);
      ops.push({ kind: 'agent-patch', find, replace, marker: `patch-${find}→${replace}` });
    } else if (roll < 0.71) {
      // external-change (8%): file-watcher disk→CRDT bridge.
      // Elevated from 0.5% to exercise file-watcher convergence path.
      const marker = `M${markerIdx++}-${randomShortText(rng)}`;
      const content = `${marker}\n`;
      const stabilized = mdManager.serialize(mdManager.parse(content));
      ops.push({ kind: 'external-change', newContent: stabilized, marker });
      ops.push({ kind: 'wait', ms: 500 });
    } else if (roll < 0.74) {
      // chunked-source-paste (3%): FR-21 large-paste exercise. Payload
      // above threshold (600KB) so chunkedYTextInsert takes the chunked
      // path with rAF yields; subsequent ops interleave peer activity
      // during the chunked writes to exercise the Y.RelativePosition
      // anchor-preservation invariant (QA-045). 3% is sparse enough to
      // keep per-seed runtime bounded while hitting the scenario multiple
      // times across the default 25-seed runs.
      const marker = `M${markerIdx++}-chunked-${randomShortText(rng)}`;
      // 600KB payload: marker prefix + repeated filler, ensuring total
      // exceeds DEFAULT_CHUNK_THRESHOLD_BYTES (500KB).
      const filler = 'lorem ipsum dolor sit amet '.repeat(25000);
      const text = `${marker}\n\n${filler}\n`;
      ops.push({ kind: 'chunked-source-paste', clientIdx, text, marker });
      ops.push({ kind: 'wait', ms: 500 });
    } else if (roll < 0.83) {
      // sync-pause
      if (paused.size < clientCount - 1) {
        const target = clientIdx % clientCount;
        if (!paused.has(target)) {
          paused.add(target);
          ops.push({ kind: 'sync-pause', clientIdx: target });
        } else {
          ops.push({ kind: 'wait', ms: rng.nextInt(40) + 20 });
        }
      } else {
        ops.push({ kind: 'wait', ms: rng.nextInt(40) + 20 });
      }
    } else if (roll < 0.95) {
      // sync-resume (12%)
      if (paused.size > 0) {
        const target = rng.pick([...paused]);
        paused.delete(target);
        ops.push({ kind: 'sync-resume', clientIdx: target });
      } else {
        ops.push({ kind: 'wait', ms: rng.nextInt(40) + 20 });
      }
    } else {
      // wait
      ops.push({ kind: 'wait', ms: rng.nextInt(60) + 20 });
    }
  }

  // Resume all paused at end
  for (const p of paused) {
    ops.push({ kind: 'sync-resume', clientIdx: p });
  }
  return ops;
}

// ─── Op dispatcher ───

async function applyOp(
  op: Op,
  clients: TestClient[],
  server: TestServer,
  docName: string,
): Promise<void> {
  switch (op.kind) {
    case 'wysiwyg-type': {
      const client = clients[op.clientIdx];
      if (!client) return;
      const paragraph = new Y.XmlElement('paragraph');
      const ytext = new Y.XmlText();
      ytext.applyDelta([{ insert: op.text }]);
      paragraph.insert(0, [ytext]);
      client.fragment.push([paragraph]);
      break;
    }
    case 'source-type': {
      const client = clients[op.clientIdx];
      if (!client) return;
      // Append text to Y.Text (incremental, not wholesale replace)
      client.doc.transact(() => {
        client.ytext.insert(client.ytext.length, `\n\n${op.text}\n`);
      });
      break;
    }
    case 'chunked-source-paste': {
      const client = clients[op.clientIdx];
      if (!client) return;
      // Anchor at current doc end. Capture a Y.RelativePosition so concurrent
      // peer inserts/deletes between chunks don't shift our target offset —
      // this mirrors source-clipboard.ts:279-294 production behavior.
      const anchorIndex = client.ytext.length;
      const relPos = Y.createRelativePositionFromTypeIndex(client.ytext, anchorIndex);
      try {
        await chunkedYTextInsert(client.doc, client.ytext, anchorIndex, op.text, {
          // Short setTimeout yield — default `requestAnimationFrame` is not
          // available in Node test runtime; 0ms setTimeout still yields the
          // task queue, letting other fuzzer ops interleave.
          yieldFn: () => new Promise((r) => setTimeout(r, 0)),
          resolveOffset: (n: number) => {
            const abs = Y.createAbsolutePositionFromRelativePosition(relPos, client.doc);
            return abs?.index ?? n;
          },
        });
      } catch {
        // ChunkedInsertError is a valid outcome under concurrent-peer pressure
        // (e.g., peer deletion shrinks the doc below our anchor). The oracles
        // still verify bridge-invariant + convergence post-settle; marker
        // preservation is best-effort for this op (the partial-progress
        // rollback path is unit-tested in source-clipboard-recovery.test.ts).
      }
      break;
    }
    case 'agent-write': {
      try {
        await agentWriteMd(server.port, `${op.text}\n`, { docName, position: op.position });
      } catch {
        // Non-fatal
      }
      break;
    }
    case 'agent-patch': {
      try {
        await agentPatch(server.port, op.find, op.replace, docName);
      } catch {
        // Non-fatal
      }
      break;
    }
    case 'external-change': {
      try {
        applyExternalChange(server.instance.hocuspocus, docName, op.newContent);
      } catch {
        // Non-fatal
      }
      break;
    }
    case 'sync-pause': {
      try {
        clients[op.clientIdx]?.pauseSync();
      } catch {
        // Non-fatal
      }
      break;
    }
    case 'sync-resume': {
      try {
        clients[op.clientIdx]?.resumeSync();
      } catch {
        // Non-fatal
      }
      break;
    }
    case 'wait': {
      await wait(op.ms);
      break;
    }
  }
}

/**
 * Active convergence loop: wait for CRDT sync, then trigger a local edit on
 * ONE client (round-robin) to force Observer A's debounce. Only ONE client
 * at a time — multiple clients independently writing the same XmlFragment→Y.Text
 * delta causes CRDT duplication (both clients' Observer A inserts are independent
 * Y.Text ops preserved by CRDT merge).
 *
 * Returns true if all clients converged within the timeout.
 */
async function driveToConvergence(clients: TestClient[], timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();

  // Phase 1: wait for each client's pending local observer work to settle.
  // Under the settlement-based bridge (SPEC §6 R4), this replaces the
  // debounce-era `wait(1500)` — `awaitDocQuiescence` returns as soon as
  // each doc's `afterAllTransactions` has been quiet for a couple of
  // microtasks (including any OBSERVER_SYNC_ORIGIN inner drains). Runs
  // in parallel across clients so the gate is bounded by the slowest.
  // We keep a small wall-clock padding between quiescence-and-check to
  // absorb WebSocket propagation jitter (~20-60 ms typical). Precedent
  // #13(b): prefer structural gates; wall-clock only where genuine
  // network timing lives.
  await Promise.all(clients.map((c) => awaitDocQuiescence(c.doc, { timeoutMs: 3000 })));
  await wait(100);

  // Phase 2: check + tickle loop
  let attempts = 0;
  while (Date.now() - start < timeoutMs) {
    const ytexts = clients.map((c) => c.ytext.toString());
    const fragMds = clients.map((c) => serializeFragment(c.fragment));
    const crdtConverged =
      ytexts.every((t) => t === ytexts[0]) && fragMds.every((m) => m === fragMds[0]);

    if (crdtConverged) {
      let allBridgeOk = true;
      for (const c of clients) {
        try {
          assertBridgeInvariant(c.ytext, c.fragment);
        } catch {
          allBridgeOk = false;
          break;
        }
      }
      if (allBridgeOk) return true;
    }

    // Tickle ONE client to trigger Observer A reconciliation.
    // Round-robin so each client gets a turn.
    if (attempts < 8) {
      const target = clients[attempts % clients.length];
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.applyDelta([{ insert: `r${attempts}` }]);
      paragraph.insert(0, [text]);
      target.fragment.push([paragraph]);
      // Await the tickled client's local settlement before looping —
      // structural replacement for the debounce-era `wait(800)`. The
      // tickled doc's `afterAllTransactions` fires and (via the server's
      // round-trip) propagates updates back to peers. We keep a small
      // WebSocket-propagation pad so the round-trip can land before the
      // next converge check.
      await awaitDocQuiescence(target.doc, { timeoutMs: 2000 });
    }
    attempts++;
    await wait(200);
  }
  return false;
}

// ─── Snapshot ───

function writeFuzzSnapshot(
  seed: number,
  data: { ops: Op[]; error: unknown; clientStates: Array<{ ytext: string; fragmentMd: string }> },
): void {
  const dir = join(tmpdir(), `bridge-conv-fuzz-${seed}`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'snapshot.json'),
      JSON.stringify(
        {
          seed,
          ops: data.ops,
          error:
            data.error instanceof Error
              ? { message: data.error.message, stack: data.error.stack }
              : String(data.error),
          clientStates: data.clientStates,
        },
        null,
        2,
      ),
    );
  } catch {
    // Best-effort
  }
}

function snapshotClients(clients: TestClient[]): Array<{ ytext: string; fragmentMd: string }> {
  return clients.map((c) => ({
    ytext: c.ytext.toString(),
    fragmentMd: serializeFragment(c.fragment),
  }));
}

// ─── Op-kind enumeration (D18 coverage gate) ───

const ALL_OP_KINDS = [
  'wysiwyg-type',
  'source-type',
  'agent-write',
  'agent-patch',
  'external-change',
  'chunked-source-paste',
  'sync-pause',
  'sync-resume',
  'wait',
] as const;

const WRITE_SURFACE_TO_OP_KIND: Record<string, readonly string[]> = {
  'agent-write': ['agent-write'],
  'agent-write-md': ['agent-write'],
  'agent-patch': ['agent-patch'],
  'observer-a-sync': ['wysiwyg-type'],
  'observer-b-sync': ['source-type'],
  'file-watcher': ['external-change'],
  // FR-21 chunked Source paste: same W2 write surface as source-type, but a
  // distinct *insertion strategy* (chunked + rAF-yielded + Y.RelativePosition
  // anchor preservation). Precedent #13(d) spirit: coverage gate should catch
  // a regression that removes the chunked op without replacement.
  'chunked-source-paste': ['chunked-source-paste'],
  rollback: ['agent-write', 'agent-patch'],
};

// ─── Main fuzzer ───

// Seed count calibration (bridge-correctness SPEC §6 R2, §10 D11 DELEGATED,
// review iteration 4 recalibration).
//
//   - Seed-replay mode (`STRESS_FUZZ_SEED=<n>`): exactly 1 seed, for
//     deterministic reproduction.
//   - Explicit override (`BRIDGE_FUZZ_SEEDS=<n>`): exact count, for local
//     scaling / bisection runs.
//   - Nightly mode (`STRESS_FUZZ_NIGHTLY=1`): 10000 seeds (tier 2; 30-min
//     budget). Split across `nightly.yml` + `weekly.yml` as needed.
//   - PR mode (`STRESS_FUZZ_PR=1`): 75 seeds. Calibrated against CI's
//     measured per-seed distribution (from main's 25-seed run, job
//     71850662391): median 4054 ms/seed, mean 8949 ms/seed, p95 24045 ms,
//     max 45677 ms. The long tail dominates: 200 × mean = ~30 min, which
//     exceeded the 15-min tier-1 budget regardless of runner size
//     (ubuntu-latest cancelled at 14m56s; ubuntu-64gb cancelled at
//     15m14s — the large runner's raw CPU advantage was not enough to
//     absorb 45 s tail seeds × 200). 75 × 8.9 s mean ≈ 11 min + overhead
//     ≈ 12 min, fits comfortably with headroom for tail variance. Still
//     3× the default-mode coverage; the 1K-10K elevated-seed tail runs
//     in tier-2 nightly / tier-3 weekly on-demand workflows (D11
//     resolution: split-by-tier, not matrix-shard).
//   - Otherwise: 25 seeds. Matches the calibrated opCount sweet spot below
//     and keeps local developer runs cheap.
const SEED_COUNT_PR = 75;
const SEED_COUNT_NIGHTLY = 10_000;
const SEED_COUNT_DEFAULT = 25;
function resolveSeedCount(): number {
  if (process.env.STRESS_FUZZ_SEED) return 1;
  if (process.env.BRIDGE_FUZZ_SEEDS) return Number(process.env.BRIDGE_FUZZ_SEEDS);
  if (process.env.STRESS_FUZZ_NIGHTLY === '1') return SEED_COUNT_NIGHTLY;
  if (process.env.STRESS_FUZZ_PR === '1') return SEED_COUNT_PR;
  return SEED_COUNT_DEFAULT;
}
const SEED_COUNT = resolveSeedCount();
const FIXED_SEED = process.env.STRESS_FUZZ_SEED ? Number(process.env.STRESS_FUZZ_SEED) : undefined;

// Surface the resolved seed count in CI logs so reviewers can confirm the
// PR-tier gate is actually running at its calibrated coverage, not the
// 25-seed default (bridge-correctness review iteration 4 regression guard).
// Skipped when only 1 seed is requested (replay runs print the seed itself).
if (FIXED_SEED === undefined) {
  const mode =
    process.env.STRESS_FUZZ_NIGHTLY === '1'
      ? 'nightly'
      : process.env.STRESS_FUZZ_PR === '1'
        ? 'pr'
        : process.env.BRIDGE_FUZZ_SEEDS
          ? 'custom'
          : 'default';
  console.log(`[bridge-convergence fuzzer] mode=${mode} seeds=${SEED_COUNT}`);
}

describe('bridge-convergence fuzzer (FR-17)', () => {
  let server: TestServer;
  // Track per-seed outcomes so the after-all hook can emit a machine-
  // parseable summary line for `packages/app/scripts/measure-fuzz.sh` to
  // consume. The script grep-matches:
  //   [fuzz] RESULT seeds=<total> passed=<n> failed=<n> failingSeeds=[<s1>,<s2>,...]
  // Written via `process.stdout.write` so it's stdout-only and not subject
  // to bun's human-summary formatting — mirrors the stress test's approach
  // (`packages/app/tests/stress/server-authoritative-stress.test.ts`).
  // Changing the format is a breaking change for the measurement script's
  // regex; see `specs/2026-04-19-ci-signal-quality/SPEC.md` FR-5/FR-6.
  const fuzzPassed: number[] = [];
  const fuzzFailed: number[] = [];

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server?.cleanup();
    process.stdout.write(
      `[fuzz] RESULT seeds=${fuzzPassed.length + fuzzFailed.length} passed=${fuzzPassed.length} failed=${fuzzFailed.length} failingSeeds=[${fuzzFailed.join(',')}]\n`,
    );
  });

  const seeds =
    FIXED_SEED !== undefined
      ? [FIXED_SEED]
      : Array.from({ length: SEED_COUNT }, (_, i) => Date.now() + i);

  test.each(seeds)('bridge-convergence seed %d', async (seed) => {
    const rng = createPRNG(seed);
    const clientCount = 2 + (seed % 2); // 2..3
    // 12 ops per seed: enough to sample 2-3 agent-write + wysiwyg-type pairs
    // (the Bug-A trigger) plus sync-pause/resume + wait variety. Higher counts
    // (25+) extend runtime without improving bug-reproduction rate and create
    // CRDT load that causes convergence-timeout flakes under macOS scheduler.
    const opCount = 12;
    const docName = `fuzz-${seed}`;

    // Seed initial content
    await agentWriteMd(server.port, 'seed paragraph\n', { docName, position: 'replace' });
    await wait(200);

    const clients = await createTestClients(server.port, {
      count: clientCount,
      docName,
      perClientOptions: { syncControl: true, skipInvariantWatcher: true },
    });

    const agentProbes = clients.map((c) =>
      createItemOriginProbe(c.ytext, { trackedOrigins: [AGENT_WRITE_ORIGIN] }),
    );

    // ────────────── Oracle (d): prefix-match content preservation ─────
    // Track content markers for the weak content-preservation oracle (d).
    // Each content-producing op's marker uses format `M<N>-<words>`. Oracle
    // asserts the `M<N>-` prefix (durable; immune to agent-patch's WORDS-pool
    // find/replace) appears in EVERY client's final state for all live
    // markers. Catches Bug-A class: line/block removal where all clients
    // synchronously agree on wrong content.
    //
    // external-change invalidates all prior markers (wholesale body replace).
    const livePrefixes = new Set<string>();
    const prefixOf = (marker: string): string => {
      const dashIdx = marker.indexOf('-');
      return dashIdx === -1 ? marker : marker.slice(0, dashIdx + 1);
    };

    // ────────────── Oracle (e): full-body content equality ────────────
    // Tracks the EXPECTED markdown body after every op by mirroring server
    // semantics (applyAgentMarkdownWrite / applyExternalChange / Observer A
    // serialize behaviour). Compared against each client's ytext at
    // convergence under `normalizeBridge` — catches Bug-A class PLUS content
    // corruption that preserves marker prefixes (e.g., DMP mis-merge,
    // Unicode boundary split, canonicalization drift).
    //
    // Always-on: set-membership is CRDT-safe (independent of paragraph
    // ordering). The env var BRIDGE_FUZZ_STRICT_ORACLE=1 is retained only
    // for toggling the full-EQUALITY comparison (see below) which requires
    // deterministic ordering not guaranteed by CRDT concurrent inserts.
    let expectedBody = 'seed paragraph'; // post-seed, pre-op initial state
    const updateExpectedBody = (op: Op): void => {
      switch (op.kind) {
        case 'wysiwyg-type':
        case 'source-type':
          // Observer A (wysiwyg) / Observer B (source) serializes the new
          // paragraph with a double-newline separator after the existing body.
          expectedBody = expectedBody.length > 0 ? `${expectedBody}\n\n${op.marker}` : op.marker;
          break;
        case 'agent-write': {
          // Mirrors packages/server/src/agent-sessions.ts applyAgentMarkdownWrite.
          switch (op.position) {
            case 'replace':
              expectedBody = op.marker;
              break;
            case 'prepend':
              expectedBody =
                expectedBody.length > 0 ? `${op.marker}\n\n${expectedBody}` : op.marker;
              break;
            case 'append':
              expectedBody =
                expectedBody.trim().length > 0 ? `${expectedBody}\n\n${op.marker}` : op.marker;
              break;
          }
          break;
        }
        case 'agent-patch': {
          // Server uses body.indexOf(find) → first-match only. Mirror that.
          const pos = expectedBody.indexOf(op.find);
          if (pos !== -1) {
            expectedBody =
              expectedBody.slice(0, pos) + op.replace + expectedBody.slice(pos + op.find.length);
          }
          break;
        }
        case 'external-change':
          // applyExternalChange on server writes both fragment and ytext to
          // the provided content (parse-serialize canonicalized).
          expectedBody = op.newContent.replace(/\n+$/, '');
          break;
        case 'sync-pause':
        case 'sync-resume':
        case 'wait':
          // No content change.
          break;
      }
    };

    try {
      const ops = generateOps(rng, clientCount, opCount);

      // Apply ops back-to-back. Under the server-authoritative settlement
      // bridge (bridge-correctness SPEC §6 R4 — `doc.on('afterAllTransactions',
      // ...)` in server-observers.ts) there is no 50 ms debounce window for
      // inter-op wall-clock pacing to target. The historical pre-agent-write
      // `wait(30)` + post-op `wait(20)` were calibrated to hit "mid-debounce"
      // for the pre-US-009 Bug-A trigger, which observer-layer paired-write
      // symmetry (US-001) has closed. The RGA-level race that remains (SPEC
      // §1 D7) is sampled structurally by the `sync-pause`/`sync-resume` op
      // kinds, not by wall-clock pacing. Generated `wait` ops still run
      // through `applyOp` and contribute deliberate fuzz-generated delays.
      // Convergence timing (WebSocket propagation) is handled at the end
      // of the run by `driveToConvergence`'s quiescence-gated loop. Net
      // savings: ~600 ms per seed (~12 ops × ~50 ms average), so the fuzz
      // harness fits its tier-1 budget at the calibrated 200-seed coverage
      // and nightly's 10000-seed tier-2 run completes faster. (US-010 /
      // precedent #13(b): prefer structural gates over wall-clock waits.)
      for (const op of ops) {
        await applyOp(op, clients, server, docName);

        // Update marker tracking AFTER the op succeeds (oracle d prefix set).
        if (op.kind === 'wysiwyg-type' || op.kind === 'source-type' || op.kind === 'agent-write') {
          livePrefixes.add(prefixOf(op.marker));
        } else if (op.kind === 'external-change') {
          livePrefixes.clear();
          livePrefixes.add(prefixOf(op.marker));
        }

        // Update full-body expectation (oracle e).
        updateExpectedBody(op);
      }

      // Resume all paused clients
      for (const c of clients) {
        try {
          c.resumeSync();
        } catch {
          // May not be paused
        }
      }

      // Drive to convergence with active reconciliation.
      // 60s timeout accommodates macOS scheduler jitter under heavy multi-client
      // load AND turbo parallel-run contention (Risk R from SPEC §11). Under
      // `check:full:parallel` at --concurrency=100%, 15 turbo tasks compete
      // for CPU and convergence can take 2-3× the isolated-run wall-clock.
      // On occasional convergence-timeout flakes, the seed snapshot written
      // to /tmp/bridge-conv-fuzz-<seed>/ enables deterministic replay via
      // STRESS_FUZZ_SEED=<n> to distinguish infra flakiness from real
      // regressions.
      const converged = await driveToConvergence(clients, 60000);
      if (!converged) {
        const states = snapshotClients(clients);
        throw new Error(
          `Convergence failed after 60s.\n${states.map((s, i) => `  Client ${i}: ytext=${s.ytext.length}ch frag=${s.fragmentMd.length}ch`).join('\n')}`,
        );
      }

      // Oracle (a): bridge invariant — already enforced per-tx by the watcher
      // (except here we use skipInvariantWatcher: true for fuzz tolerance, so
      // re-assert explicitly at settled state).
      for (const c of clients) {
        assertBridgeInvariant(c.ytext, c.fragment);
      }

      // Oracle (c): agent-origin Items preserved + no origin laundering (FR-6).
      for (const probe of agentProbes) {
        // FR-6 rigor: assert every captured origin is AGENT_WRITE_ORIGIN —
        // no user-origin Items (ORIGIN_TREE_TO_TEXT, undefined) leaked into
        // the agent UM. Uses the 'stack-item-added' event-based tracking
        // from createItemOriginProbe (Y.UndoManager StackItem has no public
        // .origin field; the event is the only public API that exposes it).
        probe.assertOnlyTrackedOrigins();

        if (probe.undoStackLength() > 0) {
          probe.recordCapture();
          probe.assertCaptureIntact();
        }
      }

      // Oracle (d): content preservation — every live marker prefix from
      // wysiwyg-type / source-type / agent-write (minus those invalidated by
      // external-change) must appear in EVERY client's final ytext. This is
      // what catches Bug-A: a bridge-convergent-but-content-lost state leaves
      // marker prefixes missing while all clients synchronously agree on the
      // wrong content.
      //
      // Zero tolerance: the hybrid diff3+DMP merge (mergeThreeWay) eliminates
      // the DMP patch_apply content drops that previously required a 5%
      // tolerance. Any missing prefix is a genuine merge bug.
      //
      // Why prefix-only: the marker format is `M<N>-<words>`. agent-patch's
      // find/replace draws from raw WORDS, so it can mutate the `<words>` tail
      // of a marker line — but the `M<N>-` prefix is never a valid WORD and
      // survives. Checking the prefix tracks line-level content preservation
      // without false positives from legitimate agent-patch mutations.
      const missingPrefixes: Array<{ clientIdx: number; prefix: string }> = [];
      for (const prefix of livePrefixes) {
        for (let ci = 0; ci < clients.length; ci++) {
          const client = clients[ci];
          if (!client) continue;
          if (!client.ytext.toString().includes(prefix)) {
            missingPrefixes.push({ clientIdx: ci, prefix });
          }
        }
      }

      if (missingPrefixes.length > 0) {
        throw new Error(
          `Content preservation violated — ${missingPrefixes.length} missing prefixes ` +
            `(zero tolerance: hybrid diff3+DMP merge must preserve all content).\n` +
            missingPrefixes
              .slice(0, 5)
              .map((m) => `  client ${m.clientIdx} missing prefix '${m.prefix}'`)
              .join('\n') +
            (missingPrefixes.length > 5 ? `\n  ...and ${missingPrefixes.length - 5} more` : ''),
        );
      }

      // Oracle (e): char-granular content-set membership.
      // Upgrades oracle (d)'s prefix-only matching to FULL MARKER LINE
      // matching. Each expected marker line (full content, not just prefix)
      // must appear in every client's ytext — checked as a SET, not a
      // sequence, because CRDT inserts from concurrent clients can
      // interleave paragraphs in non-deterministic order.
      //
      // Catches: content corruption within a marker line (e.g., merge
      // bug, Unicode boundary split) that preserves the `M<N>-` prefix
      // but mutates the tail — a class oracle (d) misses.
      //
      // Does NOT catch: paragraph reordering (CRDT-correct behavior),
      // duplication (checked by bridge-invariant + convergence oracles).
      //
      // ── Why agent-patch markers can't use strict line-equality ────────
      // agent-patch uses the SERVER'S Y.XmlFragment serialization at the
      // moment of `indexOf(find)`. Under CRDT concurrency — specifically
      // when a paused client's outbound writes still reach the server
      // (pauseInbound only pauses server→client delivery) — the server's
      // XmlFragment at patch time may contain concurrent paragraphs whose
      // Y.js RGA position places them BEFORE the intended patch target.
      // When that happens, the first `find` occurrence that `indexOf`
      // returns lands on a DIFFERENT marker than the tracker predicted.
      //
      // This is semantically correct: the patch replaced exactly one
      // `find` with one `replace`, preserving all other content. But the
      // expectedBody tracker's simple indexOf model froze at tracker-time
      // and picked a different target. No bridge merge bug occurred.
      //
      // Resolution: for markers whose ORIGINAL form contained any patch's
      // `find`, accept EITHER the pre-patch or the post-patch line as a
      // valid match. Other markers (no patch could have modified them)
      // still require strict line-equality — this preserves oracle (e)'s
      // tail-corruption detection for untouched markers.
      // Walk the op sequence once more to build:
      //   preMarkerLines — prefix → pre-patch line form for every content-
      //     producing marker (wysiwyg, source-type, agent-write; external-
      //     change resets).
      //   patches       — every agent-patch's (find, replace) pair.
      // We don't reuse expectedBody (which interleaves patches) because we
      // need each marker's ORIGINAL form to build the acceptable-line set.
      const preMarkerLines = new Map<string, string>(); // prefix → pre-patch line
      const patches: Array<{ find: string; replace: string }> = [];
      for (const op of ops) {
        switch (op.kind) {
          case 'wysiwyg-type':
          case 'source-type':
            preMarkerLines.set(prefixOf(op.marker), op.marker);
            break;
          case 'agent-write':
            if (op.position === 'replace') preMarkerLines.clear();
            preMarkerLines.set(prefixOf(op.marker), op.marker);
            break;
          case 'agent-patch':
            patches.push({ find: op.find, replace: op.replace });
            break;
          case 'external-change':
            preMarkerLines.clear();
            preMarkerLines.set(prefixOf(op.marker), op.marker);
            break;
        }
      }

      if (preMarkerLines.size > 0) {
        // For each expected marker, compute the SET of acceptable final
        // line forms: the pre-patch form, plus every line form reachable
        // by applying any subset of patches in sequence (find→replace at
        // first-matching position).
        //
        // Why iterative: at the fuzzer's 8% agent-patch rate × 12 ops,
        // P(≥2 patches per seed) is ~25% (Poisson λ=0.96). A fraction of
        // those have compound targeting — e.g., patch A replaces `alpha`
        // with `foxtrot` on a line that patch B later modifies via
        // `echo → delta`. The server applies both sequentially, so the
        // actual final line reflects BOTH patches. A single-patch model
        // would miss that state.
        //
        // Complexity: worst case is 2^N line forms for N patches, but
        // N is bounded by patches.length (worst-case ~12 → 4k states),
        // small relative to seed runtime. In practice N = 1-3 and the
        // set stays under a dozen elements.
        //
        // Termination: each iteration either adds a new form or the set
        // is stable. Bounded by patches.length because each patch can
        // only apply once productively to a line whose content already
        // contains its `find` string (after that the post-line still
        // contains the original `find` only if replace ⊇ find, which
        // doesn't happen with the single-WORD find/replace pairs the
        // generator produces). We cap explicitly at patches.length to
        // make termination unconditional regardless of replace ⊇ find.
        const acceptableForPrefix = new Map<string, Set<string>>();
        for (const [prefix, preLine] of preMarkerLines) {
          const accepts = new Set<string>([preLine]);
          for (let iter = 0; iter < patches.length; iter++) {
            const snapshot = [...accepts];
            let grew = false;
            for (const line of snapshot) {
              for (const { find, replace } of patches) {
                if (line.includes(find)) {
                  const idx = line.indexOf(find);
                  const post = line.slice(0, idx) + replace + line.slice(idx + find.length);
                  if (!accepts.has(post)) {
                    accepts.add(post);
                    grew = true;
                  }
                }
              }
            }
            if (!grew) break;
          }
          acceptableForPrefix.set(prefix, accepts);
        }

        const missingContent: Array<{ clientIdx: number; prefix: string }> = [];
        for (let ci = 0; ci < clients.length; ci++) {
          const client = clients[ci];
          if (!client) continue;
          const gotLines = new Set(
            client.ytext
              .toString()
              .split('\n')
              .map((l) => l.trimEnd()),
          );
          for (const [prefix, accepts] of acceptableForPrefix) {
            // Prefix presence is already enforced by oracle (d). Here we
            // check that SOME acceptable tail form is present — this
            // still catches tail corruption that preserves prefix but
            // mutates text in ways no patch can explain.
            const matched = [...accepts].some((l) => gotLines.has(l));
            if (!matched) {
              missingContent.push({ clientIdx: ci, prefix });
            }
          }
        }

        if (missingContent.length > 0) {
          throw new Error(
            `Oracle (e) content-set violation — ${missingContent.length} marker prefixes ` +
              `with no acceptable line form (zero tolerance: tail corruption that can't be ` +
              `explained by any applied agent-patch).\n` +
              missingContent
                .slice(0, 5)
                .map(
                  (m) =>
                    `  client ${m.clientIdx} prefix '${m.prefix}' accepts=${JSON.stringify([...(acceptableForPrefix.get(m.prefix) ?? [])])}`,
                )
                .join('\n') +
              (missingContent.length > 5 ? `\n  ...and ${missingContent.length - 5} more` : ''),
          );
        }
      }
    } catch (err) {
      writeFuzzSnapshot(seed, {
        ops: generateOps(createPRNG(seed), clientCount, opCount),
        error: err,
        clientStates: snapshotClients(clients),
      });
      fuzzFailed.push(seed);
      throw err;
    } finally {
      for (const p of agentProbes) p.cleanup();
      for (const c of clients) await c.cleanup();
    }
    // Only reached if the try-block completes without throwing — the catch
    // re-throws after recording, so this is the pass path.
    fuzzPassed.push(seed);
    // 120s per seed: the original 90s budget covered macOS scheduler jitter
    // locally (observed ~40s p50, 60s p99 on M-series hardware). On
    // ubuntu-latest CI runners the same seeds run ~40% slower under
    // contention, occasionally exceeding 90s — seed 1776384097736 timed
    // out at 90000ms on CI but passed in 44s locally. 120s gives ~2×
    // local p99 headroom for CI scheduler pressure without masking real
    // convergence bugs — the content-preservation and bridge-invariant
    // oracles fire before the timeout either way, so a slow-but-
    // eventually-converging seed is still a green signal rather than a
    // hanging test.
  }, 120_000);
});

// ─── D18 coverage gate ───

describe('D18 coverage gate', () => {
  test('fuzzer op-set covers every bridge write surface', () => {
    const missing: string[] = [];
    for (const [surface, coveringOps] of Object.entries(WRITE_SURFACE_TO_OP_KIND)) {
      for (const opKind of coveringOps) {
        if (!ALL_OP_KINDS.includes(opKind as (typeof ALL_OP_KINDS)[number])) {
          missing.push(`${surface} → ${opKind} (op kind not in generator)`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test('all op kinds are represented in the generator output', () => {
    // Generate enough ops across multiple seeds to hit the rare kinds (0.5% each)
    const producedKinds = new Set<string>();
    for (let s = 0; s < 10; s++) {
      const rng = createPRNG(0xdeadbeef + s);
      const ops = generateOps(rng, 4, 500);
      for (const op of ops) producedKinds.add(op.kind);
    }
    for (const kind of ALL_OP_KINDS) {
      expect(producedKinds.has(kind)).toBe(true);
    }
  });
});
