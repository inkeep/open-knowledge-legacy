# Evidence: D3 — Git query mechanics (pathspec, multi-ref walks, performance, alternatives, compositions)

**Dimension:** D3 — Query-layer patterns for scope-variable history queries
**Date:** 2026-04-20 (research access date 2026-04-17)
**Sources:** git-scm.com man pages (T1 primary), GitHub engineering blog (T2), empirical verification against git 2.39.5 in this repo

---

## Key files / pages referenced

- [git-scm.com — gitglossary (pathspec)](https://git-scm.com/docs/gitglossary)
- [git-scm.com — git-log](https://git-scm.com/docs/git-log)
- [git-scm.com — git-rev-list (ref options)](https://git-scm.com/docs/git-rev-list)
- [git-scm.com — gitrevisions](https://git-scm.com/docs/gitrevisions)
- [git-scm.com — git-commit-graph](https://git-scm.com/docs/git-commit-graph)
- [git-scm.com — git-config (commitGraph.readChangedPaths)](https://git-scm.com/docs/git-config)
- [git-scm.com — commit-graph file format](https://git-scm.com/docs/commit-graph)
- [GitHub Blog — Commits are snapshots, not diffs](https://github.blog/2020-12-17-commits-are-snapshots-not-diffs/)
- [GitHub Blog — Get up to speed with partial clone and shallow clone](https://github.blog/2020-12-21-get-up-to-speed-with-partial-clone-and-shallow-clone/)

---

## Findings

### D3.1 (CONFIRMED) — Pathspec semantics: `fnmatch(3)` over directory-prefix split; multiple pathspecs are OR
**Finding:** `git log -- <pathspec>` matches via `fnmatch(3)` with a "directory prefix + pattern" split on the last `/`. A pathspec that is a plain directory (`some/dir/`) is a directory prefix with no trailing pattern — matches any file under that tree. Multiple pathspecs combine with OR semantics: a commit is included if it touches any of the listed paths. Git's canonical description: "commits that are enough to explain how the files that match the specified paths came to be" (TREESAME / !TREESAME simplification).

**Evidence:**
- gitglossary: *"The pathspec up to the last slash represents a directory prefix. The scope of that pathspec is limited to that subtree. The rest of the pathspec is a pattern for the remainder of the pathname. Paths relative to the directory prefix will be matched against that pattern using `fnmatch(3)`; in particular, `*` and `?` can match directory separators."*
- git-log History Simplification: *"Commits modifying the given <paths> are selected."* and *"Show only commits that are enough to explain how the files that match the specified paths came to be."*
- Empirical (this repo, git 2.39.5): `git log --oneline -- packages/server/ docs/` returns a unioned result ordered by commit date, including commits touching either tree.
- Pathspec magic prefixes: `:(top)` roots at worktree; `:(glob)` switches to `FNM_PATHNAME` (so `*` does NOT cross `/`); `:(icase)` case-insensitive; `:(exclude)` / `:!` / `:^` is exclusion applied after includes match.
- Double-asterisk (`**`) shapes: leading `**/foo` matches anywhere, trailing `foo/**` matches everything inside, `a/**/b` matches zero-or-more intermediate dirs.

**Implications:** For Open Knowledge, `docPath` → `git log -- <docPath>` works for files unchanged. To scope to a folder: pass the directory (trailing slash optional — `packages/server` == `packages/server/` per directory-prefix rules). Multi-doc scope ("commits touching these N docs") is free via multi-pathspec OR. **Watch out:** `*` and `?` cross `/` by default — if user-supplied globs are ever exposed, wrap in `:(glob)` magic to get `FNM_PATHNAME` semantics.

---

### D3.2 (CONFIRMED) — Multi-ref walks: `--glob` is surgical; `--all` is broad; dedup is free
**Finding:** `git log --all` unions HEAD with every ref under `refs/` (branches, tags, remotes, stashes, custom namespaces). For a surgical walk over specific namespaces, use `git log --glob='refs/wip/*' --glob='refs/checkpoints/*'` or explicit `git log ref1 ref2 ref3 -- <paths>`. Deduplication is automatic: git walks reachability as a set — a commit reachable from multiple refs appears once in output.

**Evidence:**
- git-log `--all`: *"Pretend as if all the refs in refs/, along with HEAD, are listed on the command line as <commit>."*
- git-log `--branches[=<pattern>]`: *"Pretend as if all the refs in refs/heads are listed on the command line as <commit>. If <pattern> is given, limit branches to ones matching given shell glob."*
- git-rev-list `--glob`: *"Pretend as if all the refs matching shell glob <glob-pattern> are listed on the command line as <commit>. Leading refs/, is automatically prepended if missing. If pattern lacks ?, *, or [, /\* at the end is implied."*
- gitrevisions: *"Specifying several revisions means the set of commits reachable from any of the given commits"* — set-union with implicit dedup.
- git-rev-list `--exclude=<glob-pattern>`: *"Do not include refs matching <glob-pattern> that the next --all, --branches, --tags, --remotes, or --glob would otherwise consider."*
- Empirical (this repo): `git log --oneline --all -- packages/server/src/persistence.ts` returned 46 commits vs. 21 for default (HEAD-only). The delta is commits reachable only from other refs.

**Implications:** For Open Knowledge's shadow-repo model (WIP in `refs/wip/*`, checkpoints in `refs/checkpoints/*`):
1. **Don't use bare `--all`** — pulls in stashes, tag decorations, possibly unrelated namespaces. Prefer targeted globs.
2. **Canonical pattern for "everything the shadow repo cares about":**
   `git log --glob='refs/wip/*' --glob='refs/checkpoints/*' HEAD -- <paths>`
3. **Dedup is free** — set semantics mean a commit surfaces once even across many refs. Add `--source` to see which ref brought it in.
4. **For "WIP-only, not merged ancestry":** `git log refs/wip/agent-x ^main -- <paths>`.

The existing `timeline-query.ts` code already does explicit ref enumeration via `for-each-ref` then passes the collected refs to `git log` — equivalent to `--glob` but with more round-trips. Migration to `--glob` would be a minor optimization, not a correctness change.

---

### D3.3 (CONFIRMED cost model; CONFIRMED Bloom filters; UNCERTAIN numeric speedups) — Changed-path Bloom filters are the main lever
**Finding:** `git log -- <path>` is known-slow on large repos because the default implementation tree-diffs every commit against its parent to determine TREESAME/!TREESAME. Git shipped changed-path Bloom filters in Git 2.27 (May 2020) as an opt-in optimization stored in the commit-graph file — each commit stores a small Bloom filter of paths changed relative to its first parent, letting `git log -- <path>` skip full tree-diff for commits whose filter proves the path unchanged. `--follow` is single-file-only by hard constraint (`fatal: --follow requires exactly one pathspec` — confirmed empirically in this repo).

**Evidence:**
- git-commit-graph `--changed-paths`: *"With the --changed-paths option, compute and write information about the paths changed between a commit and its first parent. This operation can take a while on large repositories. **It provides significant performance gains for getting history of a directory or a file with `git log -- <path>`.** If this option is given, future commit-graph writes will automatically assume that this option was intended."*
- git-config `commitGraph.readChangedPaths`: *"If true, then git will use the changed-path Bloom filters in the commit-graph file (if it exists, and they are present). Defaults to true."*
- commit-graph file format doc: supplemental data structure with commit OIDs, parents, tree OID, generation number; accelerates "listing and filtering commit history" and "computing merge bases"; requires `core.commitGraph = true` (default).
- git-log `--follow`: *"Continue listing the history of a file beyond renames (works only for a single file)."*
- Empirical (this repo): `git log --follow -- file1 file2` fails with `fatal: --follow requires exactly one pathspec`.
- GitHub Blog "Commits are snapshots, not diffs": tree-diff cost "relative to the number of paths with different content"; at each commit, git "traverses trees only where content differs."
- GitHub Blog "Get up to speed with partial clone": blobless clones (`--filter=blob:none`) can perform `git log -- <path>` "with the same performance as a full clone" (only commit+tree data needed). Treeless clones (`--filter=tree:0`) make path-filtered log "extremely slow and not recommended." Shallow clones break path-filtered log entirely.

**Implications:** For Open Knowledge:
1. **Enable commit-graph with changed-path Bloom filters** on the shadow repo at startup or in periodic GC:
   `git commit-graph write --reachable --changed-paths --split`
   Single biggest perf lever for folder/project scopes. One-time cost per new commit.
2. **Ensure the shadow repo is not treeless.** Full or blobless is fine.
3. **Avoid `--follow` for project-wide** — hard-capped at one pathspec; accuracy issues under renames.
4. **For UX latency**, enumerate-then-paginate (`-n <batch> --skip <offset>` or `--since=<date>`) keeps tail latency bounded.

**Confidence caveat:** The man page says "significant performance gains" but doesn't cite a number. Commonly-cited 2–10× speedups for path-filtered log on large repos appear in community sources (Microsoft DevBlog, GitHub Blog posts), but specific URLs returned 404 in this research session. The qualitative claim (Bloom filters help) is rock-solid; specific speedup numbers should be re-verified before quoting. Similarly, "--follow is heuristic" is widely attested on Stack Overflow but not explicit in the man page — label as "community-attested" if quoted.

---

### D3.4 (INFERRED) — Pre-indexed alternatives: event log, materialized view, hybrid
**Finding:** When `git log`-at-query-time isn't fast or flexible enough, dominant patterns:
- **Event-sourced audit log table** (Postgres/SQLite row-per-event with `created_at` + path + actor indexes)
- **Materialized views** pre-aggregating counts/rollups
- **Hybrid live-index + git-fallback** — tool streams git events into its own index, falls back to `git log` on cache miss

**Evidence:** Not a git-scm.com topic — this is deliberately outside git. Architectural tradeoff table:

| Approach | Read latency | Write cost | Operational | Scope flexibility |
|---|---|---|---|---|
| Pure `git log` at query time | O(commits walked × tree-diff); Bloom filters help path queries | Zero (git does it) | Zero new infra | Any git scope composes |
| Event log table (Postgres) | O(log N) on indexed columns | Per-event INSERT + git→table sync | DB instance + migration | Limited to denormalized fields |
| Materialized view / rollup | O(1) for precomputed slices | Per-event + view refresh | DB + refresh scheduler | Fixed per view |
| Hybrid (live-index + git fallback) | Hot O(1); cold falls back | Streaming writes during git events | Dual stores to reason about | Flexible; correctness across boundary is hard |

**Implications:** For Open Knowledge:
- The shadow repo is already an "event log" in git form — each agent edit is a commit. Commit-graph + Bloom filters should scale to millions of agent commits per workspace before query latency becomes UX problem.
- **Don't build a Postgres audit table pre-emptively.** The codebase precedent (`.open-knowledge` model, shadow repo) is "git is the source of truth." A parallel DB introduces a dual-write problem that's expensive to keep correct.
- **If scale bites, incremental path:**
  1. Enable commit-graph with `--changed-paths` (free, keeps git-log semantics)
  2. Add lightweight on-disk cache of `(path → last N commit OIDs)` built lazily per path, invalidated on ref update. Next to shadow repo, not in separate service.
  3. Only if needed: SQLite sidecar with `(commit_oid, path, actor, committed_at)` keyed by path for project-wide feeds fanning across many paths simultaneously.
- **Don't go straight to Postgres/materialized views** — that's the pattern for audit logs where events don't originate in git. Here they do.

---

### D3.5 (CONFIRMED) — Scope compositions: AND across filter dimensions, OR within pathspec list
**Finding:** `git log` composes revision ranges, multiple pathspecs, author filters, and date filters in one command with implicit AND across filter categories and OR within pathspec list. Synopsis: `git log [<options>] [<revision-range>] [[--] <path>...]` — all three zones populated simultaneously. Main gotchas: (1) `--follow` requires exactly one pathspec (hard fatal); (2) `--` separator required when a pathspec could be mistaken for ref or option; (3) `--full-diff` changes pathspec meaning from "limit commits and diff" to "limit only commits."

**Evidence:**
- git-log synopsis: *"git log [<options>] [<revision-range>] [[--] <path>…]"*
- git-log on combining filters: *"Using more options generally further limits the output (e.g. --since=<date1> limits to commits newer than <date1>, and using it with --grep=<pattern> further limits to commits whose log message has a line that matches <pattern>), unless otherwise noted."* — explicit AND across dimensions.
- git-log: *"Paths may need to be prefixed with -- to separate them from options or the revision range, when confusion arises."*
- git-log `--full-diff`: *"Without this flag, `git log -p <path>...` shows commits that touch the specified paths, and diffs about the same specified paths. With this, the full diff is shown for commits that touch the specified paths; this means that '<path>...' limits only commits, and doesn't limit diff for those commits."*
- Empirical: `git log --follow -- file1 file2` → `fatal: --follow requires exactly one pathspec`.
- git-log composition example: `$ git log foo bar ^baz` — unions foo/bar reachability, excludes baz's. Set-algebra basis of all composition.

**Full composition template for Open Knowledge's query layer:**

```
git log \
  --glob='refs/wip/*' --glob='refs/checkpoints/*' HEAD \
  --author='alice@example.com' \
  --since='2026-03-01' --until='2026-04-17' \
  --no-merges \
  --pretty=format:'%H%x00%ae%x00%ai%x00%s' \
  -- path/to/doc.md path/to/other.md
```

Composes: multi-ref walk + author + date range + merge-filter + format + 2-path OR — one command, predictable AND-across-filters / OR-within-pathspec semantics.

**Implications:** For Open Knowledge's query layer:
1. **Model filter API as (refs, path-set, author, since, until, max-count) → compose into one `git log`.** Every dimension composes safely; only hard compositional constraints are `--follow ⟹ len(paths) == 1` and `--` separator hygiene.
2. **If exposing a "follow renames" UX toggle**, gate on pathspec count = 1 at the query-builder layer — catch there rather than letting git's fatal error surface.
3. **Prefer `--no-merges`** when the timeline shows user-intent edits; merges add noise in a shadow repo with many branch switches.
4. **Use `--pretty=format:` with explicit NUL delimiters** (as `timeline-query.ts` already does with `%x00`) rather than parsing `--oneline` — tool layer needs to distinguish subject-with-colons from field boundaries.
5. **`--source` decorates each commit with the ref it was reached from** — relevant if surfacing "which writer's ref this came from" in the timeline UI.

---

## Gaps / follow-ups

- Specific numeric speedups for Bloom filters (commonly quoted 2-10×) not confirmed against primary source in this session — URL 404s on Microsoft DevBlog and some GitHub Blog posts
- `--follow` rename-detection as heuristic: widely repeated on Stack Overflow, not in the man page text itself
- GitLab Events API filter semantics not verified (flagged UNCERTAIN — not in scope for this git-mechanics evidence file)
- Not benchmarked: typical latency for `git log -- <folder>` on repos with 10K/100K/1M commits with vs. without commit-graph

---

## Negative searches

- Searched git-log man page for "hierarchical" / "folder" / "directory" — directory is mentioned only in the Bloom filter context; no hierarchical pathspec primitives beyond `fnmatch(3)`.
- Searched git-scm.com for "performance comparison" — only qualitative "significant gains" language in the man pages; no numeric benchmarks in primary source.
