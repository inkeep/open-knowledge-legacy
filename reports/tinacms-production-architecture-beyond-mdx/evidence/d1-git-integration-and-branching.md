# Evidence: D1 — Git Integration & Branching Model

**Dimension:** Git integration & branching model
**Date:** 2026-04-12
**Sources:** `~/.claude/oss-repos/tinacms` (HEAD c33e3d1, 2026-04-02); tina.io docs; GitHub issue #885

---

## Key files / pages referenced

- `packages/@tinacms/graphql/src/database/bridge/index.ts:22-40` — 4-method `Bridge` interface (glob/get/put/delete) — the I/O abstraction that decouples git from the rest of the stack
- `packages/@tinacms/graphql/src/database/bridge/filesystem.ts:90-150` — `FilesystemBridge` (no git) + `AuditFileSystemBridge` subclass
- `packages/@tinacms/graphql/src/database/bridge/isomorphic.ts:99-599` — `IsomorphicBridge` — commits to local git on every put via isomorphic-git
- `packages/@tinacms/graphql/src/database/index.ts:86-171` — `GitProvider` interface + `createDatabase`
- `packages/@tinacms/graphql/src/database/index.ts:388-406` — the put path: `bridge.put()` then `onPut()` — two writers, no merge step
- `packages/tinacms-gitprovider-github/src/index.ts:16-94` — `GitHubProvider` (canonical GitProvider impl using Octokit)
- `packages/tinacms/src/internalClient/index.ts:376-590` — client-side branch/PR API targeting Tina Cloud `content.tinajs.io`
- `packages/tinacms/src/internalClient/index.ts:619-715` — `executeEditorialWorkflow` — branch+PR orchestration POST+poll
- `packages/tinacms/src/toolkit/plugin-branch-switcher/branch-switcher.tsx:39-348` — editor UI, enforces `tina/` prefix
- `packages/tinacms/src/toolkit/form-builder/editorial-workflow-constants.ts:6-42` — FSM states + error codes
- `packages/tinacms/src/auth/TinaCloudProvider.tsx:501-527` — `editorial-workflow` is a Tina Cloud project-level feature flag
- GitHub Issue [#885](https://github.com/tinacms/tinacms/issues/885) (state: CLOSED, label `wontfix`) — simple-git → isomorphic-git motivation
- [tina.io/docs/reference/self-hosted/overview](https://tina.io/docs/reference/self-hosted/overview) (accessed 2026-04-12)
- [tina.io/docs/reference/self-hosted/database-adapter/overview](https://tina.io/docs/reference/self-hosted/database-adapter/overview) (accessed 2026-04-12)
- [tina.io/docs/tinacloud/branching](https://tina.io/docs/tinacloud/branching) (accessed 2026-04-12)

---

## Findings

### Finding 1: The simple-git → isomorphic-git motivation was deployability, not correctness — and the issue closed as `wontfix`

**Confidence:** CONFIRMED
**Evidence:** Issue #885 body (accessed 2026-04-12) and current code state

> "simple-git is exactly what is name says - a simple wrapper around the git binary. This means that the runtime environment needs the git binary. When deploying to production environments, this limits the deployment options and forces the user to have a backend or custom server… isomorphic-git is a pure Javascript implementation of git that works in both the NodeJS and the browser… This would allow TinaCMS to work on a static site against a git backend."

Current repo state: `simple-git` is no longer a real dependency — only a stale `.d.ts` shim survives at `packages/@tinacms/cli/types/simple-git/promise.d.ts:5` (`declare module 'simple-git/promise';`). `isomorphic-git` is a first-class dep in `packages/@tinacms/graphql/package.json:46` (`"isomorphic-git": "catalog:"`). Issue #885 itself is labeled `wontfix` / closed stale — the fix landed as a separate experimental `IsomorphicBridge` (CHANGELOG entry `b348f8b6b: Experimental isomorphic git bridge implementation`), not as an in-place replacement. The earliest contributor reply explicitly rejected the in-place swap:

> "I definitely think it is worth exploring, but I wouldn't take the approach of replacing simple-git in @tinacms/api-git with isomorphic-git. Instead I would prefer to create a new package."

**Implications for OK:** The lesson is that "git in the browser / serverless" is a different beast than "git on a dev box with a binary." Tina gated the migration on a new package boundary (`Bridge`) rather than swapping the lib. For OK's hypothetical serverless mode, this validates putting git behind a narrow interface early so shell-out and pure-JS implementations can coexist.

---

### Finding 2: The Bridge interface is a 4-method glob/get/put/delete CRUD — "git" is a pluggable implementation of content I/O

**Confidence:** CONFIRMED
**Evidence:** `packages/@tinacms/graphql/src/database/bridge/index.ts:22-40`

```ts
export interface Bridge {
  rootPath: string;
  glob(pattern: string, extension: string): Promise<string[]>;
  delete(filepath: string): Promise<void>;
  get(filepath: string): Promise<string>;
  put(filepath: string, data: string): Promise<void>;
  outputPath?: string;
}
```

`FilesystemBridge` reads/writes raw files (no git); `IsomorphicBridge` reads from git trees and commits on every put (`isomorphic.ts:552-598` — `writeBlob` → `updateTreeHierarchy` → `writeCommit` → `writeRef`); `AuditFileSystemBridge` is a write-muting subclass used by `tinacms audit`. Branch is just a `ref` parameter on `IsomorphicBridge` (`isomorphic.ts:86, 378-399`).

**Implications for OK:** Strong lesson — treat git as a content I/O strategy, not an architectural layer. A `Bridge`-like seam lets you swap filesystem (dev/local CRDT mode) ↔ git-commit-every-write ↔ GitHub-API-push (self-hosted) ↔ in-memory (tests) without touching the schema / query pipeline.

---

### Finding 3: The Database is always present — git↔GraphQL shim + KV index; git itself is not queryable

**Confidence:** CONFIRMED
**Evidence:** `packages/@tinacms/graphql/src/database/index.ts:86-171` and put-flow at lines 388-406

```ts
export interface GitProvider {
  onPut: (key: string, value: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
}

export const createDatabase = (config: CreateDatabase) => {
  if (!config.gitProvider) { throw new Error('createDatabase requires a gitProvider...'); }
  if (!config.databaseAdapter) { throw new Error('createDatabase requires a databaseAdapter...'); }
  return new Database({
    bridge: config.bridge,
    level: config.databaseAdapter,
    onPut: config.gitProvider.onPut.bind(config.gitProvider),
    onDelete: config.gitProvider.onDelete.bind(config.gitProvider),
    namespace: config.namespace || 'tinacms',
  });
};
```

Put flow:
```ts
if (this.bridge) { await this.bridge.put(normalizedPath, stringifiedFile); }
try { await this.onPut(normalizedPath, stringifiedFile); }
```

Docs confirm: *"A database adapter provides an interface between the Tina database and the underlying database implementation… a limited subset of functionality required by a sorted key-value store"* (tina.io/docs/reference/self-hosted/database-adapter/overview).

**Implications for OK:** Tina doesn't query git directly — git is slow for relational reads, so they parse-and-index into a Level KV store. The KV is namespaced by branch (`namespace: branch` in scaffolded `database.ts`), making per-branch views a KV-prefix concern, not a git concern. OK could maintain a queryable index (backlinks graph, section anchors) keyed by branch for per-view correctness on branch switches.

---

### Finding 4: Self-hosted GitHub writes commit DIRECTLY per-file via Octokit — no staging, no PRs, no atomic multi-file commits

**Confidence:** CONFIRMED
**Evidence:** `packages/tinacms-gitprovider-github/src/index.ts:36-61`

```ts
async onPut(key: string, value: string) {
  let sha;
  const path = this.rootPath ? `${this.rootPath}/${key}` : key;
  try {
    const { data: { sha: existingSha } } = await this.octokit.repos.getContent({
      owner: this.owner, repo: this.repo, path: path, ref: this.branch,
    });
    sha = existingSha;
  } catch (e) {}
  await this.octokit.repos.createOrUpdateFileContents({
    owner: this.owner, repo: this.repo, path: path,
    message: this.commitMessage || 'Edited with TinaCMS',
    content: Base64.encode(value),
    branch: this.branch,
    sha,
  });
}
```

Each file write = one REST call = one commit on whatever branch the provider was constructed with. If a form save touches N files, you get N commits. `sha` is a freshness-check (GitHub returns 409 on mismatch), so last-writer-wins with retry is the implicit contention model.

**Implications for OK:** Stark contrast to OK's staging/batching model (persistence debounce + shadow repo per-writer WIP refs + BatchBegin/BatchEnd). Tina's approach is operationally simpler but has fan-out at save time and zero atomicity across files. GitHub itself is the writer identity — no local shadow repo, no WIP refs, no reconciliation layer. OK's shadow-repo architecture is meaningfully more sophisticated.

---

### Finding 5: Editors get isolated `tina/*`-prefixed branches via Editorial Workflow FSM — but ONLY on Tina Cloud Business/Enterprise

**Confidence:** CONFIRMED
**Evidence:** `packages/tinacms/src/toolkit/form-builder/editorial-workflow-constants.ts:6-33`

```ts
export const EDITORIAL_WORKFLOW_STATUS = {
  QUEUED, PROCESSING, SETTING_UP, CREATING_BRANCH,
  INDEXING, CONTENT_GENERATION, CREATING_PR,
  COMPLETE, ERROR, TIMEOUT,
} as const;
export const EDITORIAL_WORKFLOW_ERROR = {
  BRANCH_EXISTS: 'BRANCH_EXISTS',
  BRANCH_HIERARCHY_CONFLICT: 'BRANCH_HIERARCHY_CONFLICT',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const;
```

`TinaCloudProvider.tsx:502-507`:
```ts
client.getProject().then((project) => {
  if (project?.features?.includes('editorial-workflow')) {
    cms.flags.set('branch-switcher', true);
    client.usingEditorialWorkflow = true;
    client.protectedBranches = project.protectedBranches;
```

`internalClient/index.ts:619-672` — `executeEditorialWorkflow` POSTs to `${contentApiBase}/editorial-workflow/${clientId}` and polls status. tina.io/docs/tinacloud/branching: *"For a more advanced branching and Pull-Request workflow, checkout TinaCloud's Editorial Workflow (only available on Business and Enterprise plans)."*

**Implications for OK:** The model: protected branches are read-only-to-editors; edits auto-spawn a `tina/<slug>` branch; indexing is async; PR creation is a separate user action. Crucially — **this is a Cloud-side service, not OSS.** The self-hosted path just commits directly; there is no OSS implementation of the FSM. The branching UX is valuable but implementing it requires a branch-and-index coordinator service.

---

### Finding 6: Branch switcher does a full-page reload and relies on per-branch indexing

**Confidence:** CONFIRMED
**Evidence:** `packages/tinacms/src/toolkit/plugin-branch-switcher/branch-switcher.tsx:67-73`

```ts
const initialBranch = React.useMemo(() => currentBranch, []);
React.useEffect(() => {
  if (initialBranch != currentBranch) {
    window.location.reload();
  }
}, [currentBranch]);
```

`internalClient/index.ts:476-520` — `waitForIndexStatus` polls every 5s for up to 15 minutes before bailing. A branch is not editable until `indexStatus === 'complete'`.

**Implications for OK:** Tina treats branch switch as a coarse event — bounce the editor app to pick up the new Level namespace. Cheap to implement, jarring UX. OK's shadow-repo + in-memory Y.Doc reset on BatchEnd is finer-grained. The 15-minute indexing timeout tells us parsing markdown into a queryable index is not free — OK will hit the same pain with backlinks graph rebuild on branch switch.

---

### Finding 7: There is NO conflict detection, NO merge, NO conflict-resolution UI in the write path

**Confidence:** CONFIRMED
**Evidence:** Negative evidence across codebase.

- `grep -rn 'conflict\|merge' packages/@tinacms/graphql/src/database` returns matches only in schema-level field-type conflicts (`database/index.ts:923-939` — "Field X has conflicting types in templates"), nothing in the put/delete path.
- `IsomorphicBridge.put` (`isomorphic.ts:552-598`): if hash matches existing → short-circuit; otherwise writes a new commit that directly replaces the file. No three-way merge, no `mergeBase`, no `readBlob-compare-and-swap` with remote HEAD.
- `GitHubProvider.onPut` (`tinacms-gitprovider-github/src/index.ts:36-61`): fetches current `sha`, calls `createOrUpdateFileContents`. GitHub rejects on sha mismatch → surface as error; no retry, no merge logic.
- `EDITORIAL_WORKFLOW_ERROR.BRANCH_HIERARCHY_CONFLICT` refers to branch-naming conflicts, not content merges.

**Searched:** `conflict`, `merge`, `ThreeWay`, `mergeBase` across `packages/@tinacms/graphql/src` and `packages/tinacms/src` → no content-conflict handling found.

**Implications for OK:** **The single most important contrast.** Tina's entire strategy for "two people edit the same file" is: (a) put each editor on their own `tina/*` branch so they don't touch the same commit, (b) defer merging to GitHub's PR UI / git itself. No online merge, no CRDT, no last-writer-wins arbitration beyond GitHub's SHA check. OK's CRDT/Y.Doc model + shadow-repo reconciliation is a **fundamentally different** answer to the same problem — trading real-time-collab-safety for operational simplicity.

---

### Finding 8: Tina Cloud mediates all branch/PR/indexing operations; self-hosted editors lose the branch UI entirely

**Confidence:** CONFIRMED
**Evidence:** `packages/tinacms/src/toolkit/plugin-branch-switcher/branch-switcher.tsx:167-192`

```tsx
{isLocalMode ? (
  <div>
    <p>Tina's branch switcher isn't available in local mode.{' '}
      <a href='https://tina.io/docs/r/what-is-tinacloud/'>
        Learn more about moving to production with TinaCloud.
      </a>
```

All branch API calls target `${this.contentApiBase}/github/${this.clientId}/...` (content.tinajs.io) — `create_pull_request`, `list_branches`, `create_branch`, `db/.../status/:ref`. **None of these endpoints exist in OSS.** Self-hosted (`LocalBackendAuthProvider` + `TinaNodeBackend`) only exposes a `/gql` route — branching is explicitly Tina-Cloud-only UX.

**Implications for OK:** The OSS pieces that ship are: Bridge (filesystem + isomorphic-git), Database + Level index, GraphQL resolver, GitProvider hooks. Everything above that — branch UI, PR creation, editorial workflow, multi-user draft isolation, cross-branch indexing — lives in Tina Cloud's proprietary backend. The answer to "what does 7 years of git-backed CMS look like" is: **the hard parts (branch coordination, indexing FSM, PR orchestration) were ultimately not solved in OSS**. They're the commercial moat.

---

## Negative searches

- Searched `conflict|merge|ThreeWay|mergeBase` in `packages/@tinacms/graphql/src/database` → only schema-level type conflicts, no content-merge logic.
- Searched `createBranch|listBranches|currentBranch|deleteBranch` in `packages/@tinacms/graphql` → only `git.currentBranch` in `IsomorphicBridge.getRef`; no server-side branch APIs. Branching is a Tina-Cloud-service concept, not a datalayer concept.
- Searched `simple-git` in all packages → only a stale `.d.ts` shim (`cli/types/simple-git/promise.d.ts`) and CHANGELOG/docs mentions. The library itself is gone.
- Searched `git.merge|git.pull|git.push` in `packages/@tinacms/graphql/src` → no isomorphic-git pull/push/merge calls. `IsomorphicBridge` only does local object-store mutations. Pushing upstream is left to whatever CI/sync the host provides — or done via the `GitProvider.onPut` path (GitHub Contents API).

---

## Gaps / follow-ups

- `IsomorphicBridge` commits locally; OSS code has no push. Presumably a CI runner or filesystem sync service owned by Tina Cloud — not visible in the OSS tree.
- `executeEditorialWorkflow` server-side implementation (branching, indexing, replaying the mutation, creating the PR) is closed source — only FSM states visible from client.
- The `IsomorphicBridge` runs Node-side (uses `fs-extra`) — so the original "git in the browser" motivation in #885 was NOT fulfilled. It solved serverless-no-git-binary, not static-site-direct-push.
- No data on how large-repo indexing scales beyond the 15-minute `waitForIndexStatus` timeout signal.
