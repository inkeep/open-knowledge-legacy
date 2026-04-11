---
title: "PR #39 actual conflict surface — falsifies PROJECT.md PQ3 premise"
type: raw-proof
sources:
  - "gh pr view 39"
  - "gh pr diff 39 (saved to /tmp/pr39-full.diff)"
  - packages/server/src/standalone.ts
  - packages/app/src/server/hocuspocus-plugin.ts
created: 2026-04-11
baseline-commit: 2d35736
---

## TLDR

PROJECT.md PQ3 ("Heavy conflict-avoidance weight vs Miles's PR #39") was a precautionary framing based on file-list overlap, not textual diff analysis. Real conflict surface with Miles's PR #39 is **effectively zero** for the stories we care about:

- **`standalone.ts`**: Miles's entire change is **+1 line inside the `createApiExtension({...})` config object at lines 143-153**. The diff header shows `@@ -137,6 +137,7 @@` which is anchored to the pre-PR-38 version of the file; in the current codebase at baseline `2d35736`, the insertion target is the `createApiExtension` call at lines 143-153 (specifically after `contentRoot,` on line 151). The `applyToDoc` we'd modify is at 177-205; the `initAsync` we'd modify for S3 is at 426+. Zero textual overlap with either of our edit regions.
- **`hocuspocus-plugin.ts`**: Miles adds shadow repo init (lines 14-40 region). We don't need to touch this file for S1/S3/S4/S7.
- **`api-extension.ts`**: Miles has large additions. We don't touch this file.

Additionally, Miles's branch hasn't been rebased since PR #38 merged. His `hocuspocus-plugin.ts` changes are against the pre-#38 version of the file (which lacks the `isTestIsolated` logic). **Miles is already going to rebase regardless of our work** — the additional rebase burden from our stories is approximately zero.

## Detail

### Evidence: `gh pr view 39 --json files`

```json
{
  "additions": 3008,
  "deletions": 184,
  "changedFiles": 22,
  "title": "feat: Timeline with rollbacks",
  "state": "OPEN",
  "files": [
    { "path": "packages/server/src/standalone.ts", "additions": 1, "deletions": 0 },
    { "path": "packages/app/src/server/hocuspocus-plugin.ts", "additions": 25, "deletions": 6 },
    { "path": "packages/server/src/api-extension.ts", "additions": 370, "deletions": 7 },
    { "path": "packages/server/src/shadow-repo.ts", "additions": 163, "deletions": 125 },
    { "path": "packages/server/src/timeline-query.ts", "additions": 272, "deletions": 0 },
    { "path": "packages/server/src/timeline-query.test.ts", "additions": 250, "deletions": 0 },
    { "path": "packages/server/src/shadow-repo.test.ts", "additions": 130, "deletions": 2 },
    /* + app/components/*, spec files, package.json */
  ]
}
```

Full change: 3008 additions across 22 files. Our Now scope touches a maximum of 4 files; of those, only `standalone.ts` is in Miles's change set, and it's +1 line.

### Evidence: the standalone.ts diff

```diff
@@ -137,6 +137,7 @@ export function createServer(options: ServerOptions): ServerInstance {
     shadowRef,
     projectRoot: projectDir,
     contentRoot,
+    flushGitCommit: () => persistence.flushPendingGitCommit(),
   });
   hocuspocus.configuration.extensions.push(apiExtension);
```

**CONFIRMED** — one-line addition inside the `createApiExtension({...})` call object. In Miles's PR diff, the header shows `@@ -137,6 +137,7 @@` but this is anchored to the PRE-PR-38 file. In the current `main` / baseline `2d35736`, the `createApiExtension` call spans lines 143-153 and Miles's addition lands inside that object (after `contentRoot,` on line 151). Purpose: give the API extension a way to flush pending git commits (for the save-version endpoint).

### Evidence: where our stories would edit

From a fresh read of `packages/server/src/standalone.ts` at baseline `2d35736`:

| Story | Line range we touch | Miles's diff location (post-PR-38 file) |
|---|---|---|
| Unification (delete applyToDoc lines 177-205, replace with thin wrapper) | 177-205 | createApiExtension block at 143-153 |
| S3 (expose degraded signal) | 82-88 (ServerInstance type), 428-680 (initAsync catches), 685-687 (return) | 143-153 |
| S6 god-function split (deferred) | Whole file | 143-153 — moves trivially |

None of our edits are within the 143-153 region. Unification's closest point (line 177) is ~25 lines away from line 153. Rebase would be mechanical.

### Evidence: Miles's hocuspocus-plugin.ts changes are pre-PR-38

```diff
@@ -27,21 +29,35 @@ const CONTENT_DIR = resolve(
   import.meta.dirname ?? new URL('.', import.meta.url).pathname,
   '../../../content',
 );
+const PROJECT_DIR = resolve(CONTENT_DIR, '..');
+
+// Shadow repo — initialized lazily on first use. The deferred ref pattern matches
+// standalone.ts: the ref starts undefined and is populated once init completes.
+const shadowRef: ShadowRef = { current: undefined };
+initShadowRepo(PROJECT_DIR)
+  .then((shadow) => {
+    shadowRef.current = shadow;
+    console.log(`[dev] Shadow repo initialized at ${shadow.gitDir}`);
+  })
+  .catch((e) => {
+    console.warn('[dev] Shadow repo init failed (timeline features unavailable):', e);
+  });
```

Miles's changes in `hocuspocus-plugin.ts` are adding shadow repo init + `shadowRef` threading into persistence. They're applied against a pre-PR-38 version of the file (no `isTestIsolated` branching logic, no `realpathSync(OK_TEST_CONTENT_DIR)` handling).

**Implication:** when Miles rebases his branch against `main` (which now contains PR #38), he'll have to reconcile his additions with the `isTestIsolated` logic we added. That rebase is already locked-in — it doesn't depend on our Now scope at all.

Secondary observation: Miles's additions to `hocuspocus-plugin.ts` **partially address S8** (dev plugin reconciliation gap) by adding shadow repo init to the dev plugin. S8 as originally scoped may be largely closed by Miles's PR, reducing the need for us to touch it in a Later phase.

## Implications for PROJECT.md phasing

1. **PQ3 "Heavy conflict-avoidance" premise is falsified.** Revise PQ3 from "Heavy — defer all 3 conflict stories to Later" to "Evidence-based — promote stories whose architectural value is clear even at the cost of a mechanical rebase for #39."

2. **S3 (silent-degradation) is no longer blocked by #39.** The only Major-severity finding from the PR #38 review can ship now. Its edits live in `initAsync` (lines 426-683) and the `ServerInstance` return type (lines 82-88) — both completely outside Miles's change area.

3. **Unifying `standalone.ts applyToDoc` with `createExternalChangeHandler`** is no longer blocked by #39. The unification edits are at lines 177-205, outside Miles's change area.

4. **S6 (god-function split) remains deferred — but for a different reason.** No longer conflict-blocked. Still lacks a forcing function. Speculative refactor with marginal evidence of pain.

5. **S5 (module-level state refactor) remains deferred — same reason.** File-watcher.ts and persistence.ts are untouched by Miles's PR. Still lacks a multi-instance forcing function.

6. **S8 (dev plugin reconciliation) is partially being done by Miles.** Once #39 merges, re-audit to see what remains. May close entirely.

## Pointers

- `gh pr view 39` — the PR metadata
- `/tmp/pr39-full.diff` — saved full diff for detailed analysis
- `packages/server/src/standalone.ts:137-138` — Miles's 1-line edit location
- `packages/server/src/standalone.ts:177-205` — our unification edit location
- `packages/server/src/standalone.ts:82-88, 426-687` — our S3 edit locations
- `packages/app/src/server/hocuspocus-plugin.ts:14-40` — Miles's dev plugin additions (partially addresses S8)

## Gaps / follow-ups

- Have not verified whether Miles's `api-extension.ts` additions touch any surface that S4 (provider-pool) indirectly depends on. S4 is a client-side change and doesn't talk to the API extension directly, so no concern expected — but worth a sanity check during implementation.
