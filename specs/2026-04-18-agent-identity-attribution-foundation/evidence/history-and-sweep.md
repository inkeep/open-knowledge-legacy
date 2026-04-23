---
title: Shadow git mechanics, ref topology, migration, attribution completeness
description: File:line-anchored answers to GPG signing, ref name cleanup, legacy migration, email escaping, effect-diff error handling, L2 drain partial-failure, branch-switch restore, park-during-active-session, park-ref naming conflict (D19/D8), reconcile-during-concurrent-write, FR-5 endpoint enumeration, metadata Y.Map attribution, observability conventions, testing strategy, documentation.
tags: [evidence, spec-input, shadow-repo, migration, attribution-sweep, testing]
sources: [packages/server/src/shadow-repo.ts, packages/server/src/persistence.ts, packages/server/src/api-extension.ts, packages/server/src/standalone.ts, packages/server/src/agent-sessions.ts, packages/server/src/contributor-tracker.ts, packages/server/src/external-change.ts, AGENTS.md]
---

# Shadow git + attribution sweep + observability + testing + docs

## Q23 — GPG signing and user hooks

`commit-tree` (shadow-repo.ts:126-203) is git plumbing: does NOT read `commit.gpgSign`, does NOT fire `pre-commit`/`commit-msg` hooks. Main-git save-version at `api-extension.ts:1878-1893` uses `pg.commit()` (porcelain): DOES honor `commit.gpgSign`, DOES fire hooks.

**LOCK: Split preserved.** Shadow = plumbing (internal, no signing/hooks needed). Main-git = porcelain (signing + hooks fire naturally from user's git config). Document the split in SPEC §8.8.

Risk: slow `pre-commit` hook on main-git save-version blocks latency inside `withParentLock`. Acknowledged; not new to this spec.

## Q24 — Ref name cleanup

**LOCK: Drop `human-` prefix.** Principal ID is already `principal-<UUID>` per SPEC §8.11. `refs/wip/<branch>/principal-<UUID>` is self-describing. `refs/wip/<branch>/agent-<connId>` parallels it. Classified writers are single-word (`file-system`, etc.) — no collision. Three visual classes in `refs/wip/<branch>/*`: `agent-*`, `principal-*`, single-word classified.

Update SPEC §8.6 ref table: remove `human-` prefix.

## Q26 — Legacy ref migration

**LOCK: Delete legacy refs on first-run post-upgrade.** Greenfield directive waives compat. Archive serves no consumer; rename misrepresents the past (legacy `server` ref bundled attributable agent work).

Implementation in `initShadowRepo` completion:
```bash
GIT_DIR=<shadowDir> git for-each-ref --format='%(refname)' refs/wip/ \
  | awk -F/ '$NF == "server"' \
  | xargs -n1 -I{} git update-ref -d {}
```

Log via bracket: `[shadow-migration] deleted N legacy server refs`. Idempotent. Failure tolerated (log error, continue startup).

## Q27 — Git identity sanitization

Git's author format (`Name <email>`): `<` and `>` are structural delimiters (forbidden in name); `\r\n` forbidden. UTF-8 safe. No escape mechanism for `<>`.

**LOCK: Shared `sanitizeGitIdentity()` utility:**
```ts
export function sanitizeGitIdentity(raw: string): string {
  return raw
    .replace(/[<>]/g, '')
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, 128);
}
```

Applied in `extractAgentIdentity` (extends existing CRLF strip) + principal.json → WriterIdentity boundary (new). Agent emails (`agent-<UUID>@openknowledge.local`) safe by construction. Fallback to `'Local User'` if sanitized name is empty.

## Q30 — Effect-diff capture error handling

**LOCK: Non-blocking catch + structured event + dev-mode escalation.**

```ts
try {
  // capture YTextEvent.delta
  persistEffectDiff(sessionId, docName, delta);
} catch (err) {
  console.warn(JSON.stringify({
    event: 'effect-diff-capture-failed',
    sessionId, docName, errMessage: err.message,
  }));
  metrics.effectDiffCaptureFailures++;
  if (process.env.NODE_ENV !== 'production') throw err;  // fail-loud in dev
}
// commit continues regardless — effect-diff is a side-channel, not load-bearing
```

Directive: fail-loud during dev, don't break user-facing flows in prod.

## Q31 — L2 drain per-writer partition

**LOCK: Per-writer partition.** Each `commitWip` call scoped to one writer; failure restores ONLY that writer's snapshot entry.

```ts
for (const [writerId, entry] of snapshot) {
  try {
    await commitWip(shadow, toWriterIdentity(entry), contentRoot, messageFor(entry), branch);
  } catch (e) {
    restoreContributorEntry(writerId, entry);  // new helper
    consecutiveGitFailuresByWriter.set(writerId, ...);
    log.error({ err: e, writerId }, `[persistence] commit failed`);
  }
}
```

New helper: `restoreContributorEntry(writerId, entry)` in `contributor-tracker.ts`. Matches per-writer tmp-index isolation in `commitWip` (`shadow-repo.ts:133`). Per-writer failure counters replace global `consecutiveGitFailures` for writer-scoped signal.

## Q32 — Branch-switch restore three-way merge

Mechanics exist at `standalone.ts:1157-1213`. Park commit stores `(markdown, diskSnapshot)` pair. Restore phase reads parked state, runs `reconcile({base: diskSnapshot, ours: parked-markdown, theirs: current-disk})`. Outcome dispatch at lines 1183-1200 applies merged content via `applyToDoc` + updates `reconciledBase`.

**No new code needed — existing mechanism.** Under D19 per-session park refactor, the restore loop iterates sessions, reads each's parked state per-branch. If two sessions parked state on the same doc, a merge policy is needed. (Narrow case; typical active-session-per-doc is 1.)

## Q33 — Park during active-session

No explicit mutex today. `setBatchInProgress(true)` is set AFTER park completes (standalone.ts:1058), so during park, new transacts can land. `parkableDoc.markdown = serializeDoc(docName)` captures at park-call time; a microsecond-late transact is lost on reset-phase overwrite.

**LOCK: Move `setBatchInProgress(true)` BEFORE the park loop.** Yjs internal lock serializes transacts; they can land during park but won't flush to L1 (blocked by batch gate). Park captures state at `serializeDoc` instant; inter-session ordering = loop order. Known tolerated smallness: microsecond-late transact between two sessions' captures.

## Q34 — Park ref naming

**LOCK: Park commits land on each session's own ref.** Subject: `park: <old-branch> -> <new-branch>`. `git-branch-switch` classified writer NOT used for park commits.

Reconciles D19 (per-session park) with D8 (writer = identity, subject = action). Author is the session; action is park. Reading restore in Q32: loop walks per-session refs on old branch, reads latest commit, matches subject `park:`.

Retention implication: session refs on an inactive branch GC'd after 30d of inactivity (FR-18) — parked dirty edits on that ref are discarded. Acceptable: user returning 30+ days later loses in-progress state, gains nothing from its retention.

## Q35 — Reconcile during concurrent agent write

**Bug under FR-6.** Today `applyExternalChange` does NOT call `recordContributor`. Concurrent agent-write + file-watcher-write → both transacts land in Y.Doc via Y.js queue serialization, but only the agent appears in `pendingContributors`. File-watcher's content is silently folded into the agent's commit tree.

**LOCK: `applyExternalChange` calls `recordContributor` equivalent with writer-id `file-system`.** L2 drain produces TWO commits — `refs/wip/main/agent-<connId>` and `refs/wip/main/file-system` — sharing the same tree SHA (both `git add contentRoot` from the same Y.Doc state at drain time), distinct commit objects (different authors/bodies).

Test: concurrent transacts, one agent + one file-watcher, drain, assert two refs advanced with equal tree SHAs, distinct commit SHAs, distinct authors.

## Q36 — FR-5 endpoint enumeration (exhaustive)

Handlers in `api-extension.ts` route registry (line 4186-4229) that need identity threading:

**Already threaded** (3): `handleAgentWrite`, `handleAgentWriteMd`, `handleAgentPatch`.

**Need threading** (9):
1. `handleSaveVersion` (1811) — writers[] partial; add clientName + colorSeed + populate writers from contributor-tracker snapshot.
2. `handleRollback` (2127) — no extractAgentIdentity today; add. Thread to ROLLBACK_ORIGIN context. L2 commit to triggering session.
3. `handleCreatePage` (2532) — disk write triggers file-watcher reconcile; attribute to triggering session, NOT file-system.
4. `handleRename` (2654) — add extractAgentIdentity; per-call rename-origin carries session.
5. `handleRenamePath` (2723) — disk rename; attribute to triggering session or openknowledge-service fallback.
6. `handleDeletePath` (2830) — disk delete; same.
7. `handleUploadImage` (2965) — asset write; add threading for future asset-history.
8. `handleSuggestLinks` (GET-only at line 2929) — NOT mutating; EXCLUDE.
9. `handleApplyLinks` — check existence; if mutating, thread.
10. `sync/resolve-conflict` (4219) — add threading.

**Explicitly excluded:** `test-reset`, `local-op/*`, GET-only handlers.

**LOCK: FR-5 covers all 9 mutating handlers above.** Meta-test: scan route registry, assert every POST handler calls `extractAgentIdentity` OR is on an explicit allowlist.

## Q38 — Metadata Y.Map attribution

Verified: `applyAgentMarkdownWrite` (`agent-sessions.ts:93-163`) does NOT call `transact` itself. Metadata write (`metaMap.set`) at line 148 is inside the caller's transact block (`api-extension.ts:1171-1181`) — inherits `AGENT_WRITE_ORIGIN`.

**LOCK: UM scope is `[ytext, metaMap, activityMap]`.** All session-originated writes in one transact become one undo step. Update FR-3 accordingly.

## Q44 — Observability conventions

Per AGENTS.md §Logging conventions (line 762-769):
1. **Bracket-prefixed** strings for operational warnings (human dev-server output).
2. **Structured JSON** (`console.warn(JSON.stringify({event: ...}))`) for counted/tested events.

Existing codebase uses Pino logger with structured fields + bracket-prefix in message.

**LOCK per path:**
| Path | Convention |
|---|---|
| Per-session UM create/destroy | Bracket: `[agent-session] Created / Closed session for:` |
| Keepalive-close cleanup | Bracket with structured: `log.info({connectionId, closedCount}, '[keepalive-close] cleaned N sessions')` |
| L2 drain fan-out per-writer | Bracket with structured writerId field |
| L2 partial failure | Bracket with structured writerId + attempt |
| `ok-actor:` body write | No log (visible via `git log`) |
| Effect-diff capture failure | Structured JSON (event-counted) |
| Principal creation | Bracket: `[principal] synthesized principal-<short>` |
| Legacy ref migration | Bracket: `[shadow-migration] deleted N legacy refs` |
| Attribution gate test failures | Structured JSON |

## Q45 — Testing strategy per spec requirement

- **FR-1 (F1 origin):** Unit in `agent-sessions.test.ts`. Integration in `bridge-matrix.test.ts`.
- **FR-2/FR-14 (lifecycle + cleanup):** Unit in `agent-sessions.test.ts`. New integration `session-cleanup.test.ts`. Stress: NFR-5 30-min soak.
- **FR-3/FR-4 (per-session UM + AGENT_UNDO_ORIGIN):** Unit + mirror `bug-d-v0-14-agent-undo-under-concurrent-typing.test.ts`. Fuzzer extension (FR-17 / D18 coverage gate).
- **FR-5 (attribution sweep):** Per-handler unit tests. Meta-test scanning route registry.
- **FR-7 (per-session fan-out):** `shadow-repo.test.ts` + new integration.
- **FR-8 (ok-actor body):** Contract test round-trip fidelity.
- **FR-9 (main-git save-version):** Integration running save-version, assert principal author + Co-Authored-By trailers.
- **FR-19 (per-session park):** Extend `shadow-repo.test.ts` parkBranch block.
- **FR-11 (effect-diff):** Unit with malformed item asserting metric + structured event.

Budget: Tier 1 stays <2m30s warm. Perf test (NFR-7) runs tier 2.

## Q46 — Documentation

**LOCK: Layered.**

1. **AGENTS.md precedent entries** (canonical). Add 2:
   - "Per-session actor identity at origin." (the F1 contract)
   - "Classified writer IDs for non-attributable actions + subject-prefix action encoding." (the D8 schema)
2. **`docs/content/internals/agent-write-path.mdx`** — update to describe per-session origin + shadow ref fan-out.
3. **Inline code comments** at F1 site, L2 drain fan-out, shadow-repo writer-ID tables, extractAgentIdentity.
4. **NOT in READMEs** — READMEs are setup docs, not architectural reference.

## Design recommendations — LOCKED

| ID | Decision |
|---|---|
| DR-23 | GPG/hooks split: shadow via commit-tree (bypass), main-git via pg.commit (honors) |
| DR-24 | Ref naming: drop `human-` prefix; use `refs/wip/<branch>/principal-<UUID>` |
| DR-26 | Legacy `refs/wip/<branch>/server` deleted on first-run (no archive, no rename) |
| DR-27 | `sanitizeGitIdentity()` utility at identity boundaries |
| DR-30 | Effect-diff capture: structured JSON + metric + dev-mode throw |
| DR-31 | L2 drain per-writer partition with per-writer failure counters |
| DR-33 | Park mutex: move `setBatchInProgress(true)` BEFORE park loop |
| DR-34 | Park commits on session refs with subject `park:`; no separate classified ref |
| DR-35 | `applyExternalChange` records contributor under `file-system` writer |
| DR-36 | FR-5 covers 9 mutating handlers + meta-test enforcement |
| DR-38 | UM scope = `[ytext, metaMap, activityMap]` |
| DR-44 | Observability: bracket+pino structured for operational; JSON events for counted/tested |
| DR-45 | Testing per FR-* + fuzzer extension + NFR-5 soak |
| DR-46 | Docs: AGENTS.md precedents + internals/agent-write-path.mdx + inline comments |
