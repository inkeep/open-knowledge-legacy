# Evidence: Git Branch-Aware Index Strategies

## Git Hooks for Index Invalidation

**Source**: [git-scm.com/docs/githooks](https://git-scm.com/docs/githooks)

### post-checkout (Primary Hook)
- Arguments: `<previous-HEAD> <new-HEAD> <branch-flag>`
- `branch-flag`: `1` = branch checkout, `0` = file checkout
- Also fires after `git clone` and `git worktree add`
- **This is the key hook**: provides both old and new SHAs for computing minimal diffs

### post-merge
- Arguments: `<squash-flag>` (1 = squash, 0 = normal)
- Does NOT receive merged refs — must read HEAD manually
- Only fires on successful merges

### post-commit
- Arguments: none
- Must compute `git diff HEAD~1 --name-only` to find changes

### Recommended Combination
`post-checkout` + `post-merge` + `post-commit` covers all common cases.

---

## Incremental Update via Git Diff

**Source**: [git-scm.com/docs/git-diff](https://git-scm.com/docs/git-diff)

### Key Command
```bash
git diff --name-status <old-sha> <new-sha>
```
Returns: `A` (added), `M` (modified), `D` (deleted), `R` (renamed), `C` (copied)

### Three-Dot Form
```bash
git diff main...feature --name-only
```
Finds merge base automatically — shows "what this branch changed."

### Node.js: simple-git
- `.diffSummary(['--name-status', oldSha, newSha])` → structured `DiffResult`
- Source: [npm simple-git](https://www.npmjs.com/package/simple-git)

### Incremental Update Algorithm
```
on post-checkout(oldSha, newSha, flag):
  if flag == 0: return  // file checkout, skip
  changes = git diff --name-status oldSha newSha
  for (status, filepath) in changes:
    if status == 'D': index.remove(filepath)
    if status in ('A', 'M'): index.upsert(filepath, reparse(filepath))
    if status == 'R': index.remove(oldPath); index.upsert(newPath, reparse(newPath))
```

---

## Isomorphic-git for Pure-JS Diffing

**Source**: [isomorphic-git/isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) | [Docs](https://isomorphic-git.org/)

### Key APIs
- `currentBranch({ fs, dir })` — current branch name
- `resolveRef({ fs, dir, ref: 'HEAD' })` — resolve ref to SHA
- `statusMatrix({ fs, dir, ref, filter })` — [filepath, HEAD, WORKDIR, STAGE] status array
- `listFiles({ fs, dir, ref })` — all tracked files at a ref
- `walk({ fs, dir, trees, map })` — parallel tree traversal (most powerful)

### Diffing Two Branches with walk()
```javascript
const changes = await git.walk({
  fs, dir,
  trees: [TREE({ ref: 'main' }), TREE({ ref: 'feature' })],
  map: async (filepath, [main, feature]) => {
    if (!main && feature) return { filepath, status: 'added' }
    if (main && !feature) return { filepath, status: 'deleted' }
    const oidA = await main.oid()
    const oidB = await feature.oid()
    if (oidA !== oidB) return { filepath, status: 'modified' }
    return null // unchanged
  }
})
```
- Confirmed pattern: [issue #732](https://github.com/isomorphic-git/isomorphic-git/issues/732)
- OID comparison (not content) makes this fast

### Limitations
- No native change events or file watching (pull-based only)
- No built-in unified diff — use `walk()` to find changed files, diff content separately

---

## Branch-Aware Caching Strategies

### Strategy A: Per-Branch Cache Files
- Store as `<cache-dir>/<branch-name>.json` or `.sqlite`
- Simple; grows with branch count

### Strategy B: Base + Delta
- One "base" index (main branch) + per-branch deltas
- Effective index = base + delta overlay

### Strategy C: Content-Addressed Deduplication (Zoekt Pattern)
- Entries keyed by `(filepath, content-hash)`
- Branch index = set of pointers into shared entry pool
- **Bitmask** indicates which branches contain each version
- Source: [Zoekt indexing system](https://deepwiki.com/sourcegraph/zoekt/4-indexing-system)

### Strategy D: Lazy Invalidation with Version Stamps
- Cache key: `(branch, commit-sha)`
- On switch: if cache for `(new-branch, HEAD)` exists, use it
- Otherwise: find nearest ancestor cache, apply incremental updates

---

## Sourcegraph / Zoekt: Branch-Aware Search at Scale

**Source**: [sourcegraph.com/docs](https://sourcegraph.com/docs/admin/search) | [Zoekt DeepWiki](https://deepwiki.com/sourcegraph/zoekt/4-indexing-system)

- Indexes default branch by default, configurable up to **64 branches per repo**
- **Bitmask deduplication**: files identical across branches stored once
- Index size proportional to unique documents, not branches × files
- `.zoekt` shard files with incremental indexing (skip unchanged) and delta indexing (tombstone changed)

---

## File Watching + Git Operations

**Source**: [paulmillr/chokidar](https://github.com/paulmillr/chokidar)

### The Core Problem
`git checkout` triggers thousands of filesystem events (adds, deletes, modifies) simultaneously.

### Recommended Strategy
1. **Watch `.git/HEAD` and `.git/refs/`** — detect branch switches via ref changes
2. **Debounce + batch** — on detecting git operation, pause file watcher for ~500ms, then use `git diff` instead of individual file events
3. **Two-tier watching** — `.git/HEAD` for git operations; working tree for manual edits

### Prior Art: Atom GitHub Package
- [PR #700](https://github.com/atom/github/pull/700): Decorator-based `@invalidate()` cache system
- Cache organized into groups for targeted eviction
- Branch switches invalidate branch-related groups by monitoring `.git/refs/heads`

---

## Dendron: VS Code Knowledge Base with Caching

**Source**: [dendronhq/dendron](https://github.com/dendronhq/dendron)

- Client-server: VSCode plugin → Express server → engine → fileSystem → noteParser
- `.dendron.cache.json` per vault, checked against file modification times at startup
- 5x+ speedup for 10k+ notes when cache is valid
- SQLite `SQLiteMetadataStore` for metadata persistence
- `ReloadIndex` command for full re-index
- **Not branch-aware**: index reflects current working directory state only
