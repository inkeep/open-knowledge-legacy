# Evidence: D3 — Collaboration / Concurrency Story

**Dimension:** Collaboration / concurrency story (or absence)
**Date:** 2026-04-12
**Sources:** `~/.claude/oss-repos/tinacms`; TinaCMS GitHub issues/discussions; tina.io docs

---

## Key files / pages referenced

- `packages/@tinacms/graphql/src/database/index.ts:389-406` — document save path: plain `bridge.put` with no version check, no lock, no OCC
- `packages/tinacms/src/toolkit/form-builder/editorial-workflow-constants.ts` — Editorial Workflow states (branch + PR creation), no content-merge primitives
- `packages/tinacms/src/toolkit/form-builder/create-branch-modal.tsx:143-180` — UI that kicks off branch+PR generation
- `packages/tinacms/src/unifiedClient/index.ts:2,49,76,138` — only `Lock` primitive in codebase is `AsyncLock` for HTTP response cache deduplication
- `packages/tinacms/src/toolkit/react-sidebar/components/sync-status.tsx` — "SyncStatus" is a git/indexing event log viewer, NOT presence
- GitHub [Discussion #4639](https://github.com/tinacms/tinacms/discussions/4639) — "Conflict free multiple users editing" (2024-07) — direct user report of last-writer-wins, maintainer redirects to branching
- GitHub [Discussion #2962](https://github.com/tinacms/tinacms/discussions/2962) — "Draft Documents" editorial-workflow proposal (4 upvotes, 7 comments over 4 years, no development)
- GitHub [Discussion #3096](https://github.com/tinacms/tinacms/discussions/3096) — "Self-hosted alternative to Tina Cloud" (361 upvotes — most-upvoted, about hosting not collab)
- [tina.io/docs/tinacloud/editorial-workflow](https://tina.io/docs/tinacloud/editorial-workflow) (accessed 2026-04-12)
- [tina.io/cms-for-teams](https://tina.io/cms-for-teams) (accessed 2026-04-12)

---

## Findings

### Finding 1: TinaCMS has zero real-time collaboration primitives — no Yjs, Automerge, Hocuspocus, presence, awareness, cursor sharing, OT

**Confidence:** CONFIRMED
**Evidence:** Repo grep across `packages/` on 2026-04-12:
- `yjs|y-prosemirror|automerge|hocuspocus|crdt` → 0 meaningful matches (only pnpm-lock noise unrelated to Tina packages)
- `find . -name package.json -exec grep -lE '"(yjs|automerge|hocuspocus|y-prosemirror|y-websocket)' {} \;` → zero hits

No package in the monorepo declares a CRDT/OT dependency.

**Implications for OK:** Validates OK's CRDT bet as a clean differentiation axis. This is not "they have weaker collab" — they have none. No backend session, no ephemeral presence channel, no cursor broadcasting. The Plate.js editor inside TinaCMS ships without Plate's optional Yjs plugin enabled.

---

### Finding 2: Save model is last-writer-wins at the file level with no optimistic concurrency control

**Confidence:** CONFIRMED
**Evidence:** `packages/@tinacms/graphql/src/database/index.ts:388-406`:

```ts
const normalizedPath = normalizePath(filepath);
if (!collection?.isDetached) {
  if (this.bridge) {
    await this.bridge.put(normalizedPath, stringifiedFile);
  }
  …
}
```

No `If-Match` header, no ETag, no `expectedVersion`, no compare-and-swap. The `version` references in the same file (line 252-292) are a schema-migration counter, not per-document concurrency tokens. Corroborated by user report in discussion #4639:

> "when multiple users are trying to edit the same page, the content gets overridden by the last save"

**Implications for OK:** Pattern to avoid. Concurrent edits on the same file silently destroy the slower save's work — no warning, no prompt, no stale-data indicator. OK's CRDT + shadow-repo + rescue-buffer stack is a direct response.

---

### Finding 3: TinaCMS has no soft or advisory locking of any kind

**Confidence:** CONFIRMED
**Evidence:** Repo grep for `Lock\b|sessionLock|editLock|docLock|pageLock|fileLock|lockFor|isLocked|acquireLock` (2026-04-12). Only 3 matches:
1. `unifiedClient/index.ts` uses `AsyncLock` from `async-lock` npm package — solely for in-process HTTP response-cache key deduplication (`this.cacheLock.acquire(key, …)`), not user-visible
2. `Lock.tsx` icon component
3. `FaLock/FaUnlock` icons on `CollectionCreatePage.tsx` — readonly-field UI hints (schema, not session)

No locks exist at document, field, section, or branch level.

**Implications for OK:** Differentiation opportunity. Even the lightweight "editor N is currently editing this page" banner that Sanity/Contentful offer is absent from TinaCMS.

---

### Finding 4: Tina's official story for multi-editor teams is "use branches" — Editorial Workflow auto-creates branch + draft PR per save to protected branch

**Confidence:** CONFIRMED
**Evidence:** `packages/tinacms/src/toolkit/form-builder/editorial-workflow-constants.ts:6-17` defines states `QUEUED → SETTING_UP → CREATING_BRANCH → INDEXING → CONTENT_GENERATION → CREATING_PR → COMPLETE`. Error codes `BRANCH_EXISTS`, `BRANCH_HIERARCHY_CONFLICT`, `VALIDATION_FAILED` — all branch-namespace errors, no content-merge errors.

`create-branch-modal.tsx:180`:
```ts
tinaApi.executeEditorialWorkflow({
  prTitle: `${branchName.replace('tina/', '').replace('-', ' ')} (PR from TinaCMS)`
})
```

tina.io docs fetch: *"When editors save changes to a protected branch like main, the system automatically creates a new branch and generates a draft pull request."*

**Implications for OK:** Git's normal merge semantics are the entire conflict story. Two editors on separate branches converge via human PR review in GitHub. Two editors on the *same* branch still get last-writer-wins on push; conflict surfaces at merge time with git conflict markers — no in-editor resolution UI. OK can position instant merge + live presence as the "no branch-juggling required" alternative.

---

### Finding 5: The "Draft Documents" proposal — the only official acknowledgement of multi-editor pain — has been open without delivered work for ~4 years

**Confidence:** CONFIRMED
**Evidence:** Discussion [#2962](https://github.com/tinacms/tinacms/discussions/2962) by @jamespohalloran (TinaCMS maintainer), opened 2022-06-08.

> "the concept of working in branches isn't always intuitive for non-developers."
>
> "At the time of writing, no development work has been started on this project."

4 upvotes, 7 comments. Latest comment 2026-01-13 by @joacimeldre:

> "I would also like the ability to save multiple new, edited and deleted content before publishing. Is this something you're looking into developing into a smoother workflow than Git branches for TinaCMS?"

No Tina-team response to that comment. Prior comment 2024-12-11 @cascading-jox: "Are there any updates on this?" — also no team response.

**Implications for OK:** Gap to differentiate on. A maintainer-pinned proposal sitting unanswered through 4 years of user follow-ups is the strongest possible signal that collab/draft workflow is not on Tina's near-term roadmap. Opportunity: "the Tina-like git CMS where drafts and multi-editor just work."

---

### Finding 6: No document-level draft state exists; community workarounds are homegrown

**Confidence:** CONFIRMED
**Evidence:** #2962 proposes a 2-branch `main` + `main-staging` draft model; never implemented. Community responses describe workarounds:
- "Building up release branches manually" (2 developers cherry-picking commits)
- `published: boolean` schema flag approach
- NetlifyCMS-style branch-per-document
- User @dasmeet (2022-11): "Disable auto-build on Git push. Use Tina to make and save changes as usual. When I am done, I manually trigger build using webhooks."

Open pleas through 2026.

**Implications for OK:** Any OK story around drafts/preview that doesn't require users to understand git branches is a direct answer to this gap.

---

### Finding 7: Tina maintainer's official answer to "multiple users overwriting each other" is "use branching"

**Confidence:** CONFIRMED
**Evidence:** Discussion [#4639](https://github.com/tinacms/tinacms/discussions/4639) (2024-07-12). User @99ansh:

> "For self hosted TinaCMS I have observed that when multiple users are trying to edit the same page, the content gets overridden by the last save. There should be a way to introduce locking (page level/field level) for conflict free editing experience."

Response from @bradystroud (Tina team member) 2024-07-13:

> "If you have multiple users, branching might be the way to go https://tina.io/docs/tina-cloud/branching/"

Plus a YouTube link. No follow-up from Tina, discussion remains open with no chosen answer.

**Implications for OK:** Primary-source quote for the report. Production team hits concurrency, asks for locking, team's answer is "branch per editor" — assumes editors understand git. For non-dev editors (the target CMS-buyer persona), this is untenable at any reasonable team size.

---

### Finding 8: "Real-time" in TinaCMS marketing means contextual visual editing (live preview on your own screen), not multi-user co-editing

**Confidence:** CONFIRMED
**Evidence:** tina.io blog and cms-for-teams pages use "real-time editing experience where they can navigate to any area of the site, start making changes, and immediately see these changes reflected within the site." Describes one-user WYSIWYG preview, not co-editing. No presence, cursors, co-presence, or simultaneous editing mentioned on tina.io/cms-for-teams (accessed 2026-04-12).

**Implications for OK:** Careful in competitive messaging. Don't let "Tina has real-time editing" confuse contextual-preview with multi-user collab. Precise framing: "Tina has real-time preview; OK has real-time collaboration."

---

## Negative searches

- Searched tinacms repo for `yjs|y-prosemirror|automerge|hocuspocus|crdt` (case-insensitive) → 0 meaningful hits in source
- Searched all `package.json` in monorepo for `"yjs"`, `"automerge"`, `"hocuspocus"`, `"y-prosemirror"`, `"y-websocket"` → 0 hits
- Searched tinacms repo for `collaborat|real.?time|presence|awareness|cursor.?shar` → hits are "collaborators" URL link, marketing copy, e2e test labels. No code implementing any of these
- Searched TinaCMS GitHub issues for `"real-time collaboration"` → 0 hits
- Searched TinaCMS GitHub issues for `"concurrent editing"` → 0 hits
- Searched TinaCMS GitHub issues for `"multiple editors"` → 0 hits
- Searched TinaCMS GitHub issues for `"yjs"` → 0 hits
- Searched TinaCMS GitHub issues for `"CRDT"` → 0 hits
- Searched TinaCMS GitHub issues for `"presence"` → 0 hits on multi-user topic
- Searched TinaCMS discussions for `"real-time"` → top result is "Self-hosted alternative" (hosting), then Hugo support, then unrelated
- Only `AsyncLock` for local HTTP cache dedup; no document/session locks

**The absence is itself the finding:** TinaCMS's community has not organized around collaboration as a gap (few direct feature requests, low upvote counts), likely because users who need real-time co-editing self-select out of TinaCMS early, or accept the branch-based workflow. The loudest community demand is "self-host" (361 upvotes), not "collab."

---

## Gaps / follow-ups

- Unknown whether TinaCloud (closed-source) adds any server-side edit-lock or presence layer. OSS shows no hooks for it; the "collaborators" page is user-management/RBAC, not live presence.
- Did not verify whether the `/api/tina/editorial-workflow` server endpoint has rebase/merge handling beyond BRANCH_EXISTS. Based on error-code surface, appears purely branch-management.
- Could quantify sentiment by polling Tina Discord/Slack; did not attempt (not primary source, no lasting URL).
