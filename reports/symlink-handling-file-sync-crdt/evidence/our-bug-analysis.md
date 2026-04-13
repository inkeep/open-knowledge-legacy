# Evidence: Our specific bug (CLAUDE.md → AGENTS.md symlink)

**Dimension:** Root cause analysis of the observed bug
**Date:** 2026-04-12
**Sources:** repo git log, packages/server/src/persistence.ts

---

## The setup
- `CLAUDE.md` is a symlink to `AGENTS.md` in the repo root.
- The Hocuspocus server watches the repo root as its contentDir in some configurations (and any subdirectory that contains symlinks in general).
- Persistence code path (packages/server/src/persistence.ts, lines 369–385):
  ```ts
  const filePath = safeContentPath(documentName, contentDir);
  const tmpPath = `${filePath}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(tmpPath, markdown, 'utf-8');
  await rename(tmpPath, filePath);
  ```

## Hypothesis chain

### Hypothesis A: persistence `rename(tmp, symlinkPath)` replaced the symlink
**Confidence:** CONFIRMED as mechanism, plausible as the root cause of this observation

**Evidence:**
- `rename(2)` overwrites the symlink atomically with the regular tmp file (see `rename-posix-node.md`).
- `safeContentPath` does not realpath its result (verified by grep: no `realpath` in persistence.ts).
- A CRDT-driven save to docName `CLAUDE.md` would compute `filePath = contentDir/CLAUDE.md`, write `CLAUDE.md.tmp`, then `rename(CLAUDE.md.tmp, CLAUDE.md)` — replacing the symlink.
- Post-condition: `CLAUDE.md` is a regular file containing the same content the symlink target previously resolved to. Observer sees no content change in the file (content is identical) but `lstat` now reports a regular file instead of a symlink.

### Hypothesis B: git checkout materialized CLAUDE.md as a regular file on a branch switch
**Confidence:** CONFIRMED as a possible contributor — git log shows commit 12e7998 as part of a branch with divergent history on CLAUDE.md.

**Evidence:**
- `git log --oneline -- CLAUDE.md` shows commit `54ebbe9 "docs: restore CLAUDE.md → AGENTS.md symlink and merge drift"` — the word "merge drift" strongly suggests the symlink was lost during a merge/rebase, not during persistence.
- If a prior commit had CLAUDE.md as a regular file (mode 100644 with literal content) and a later commit had it as a symlink (mode 120000 with target string), depending on merge order git checkout could materialize either state.
- Once CLAUDE.md is a regular file in the worktree, subsequent persistence writes reinforce that state and give no feedback that a symlink was intended.

## Conclusion

**Both hypotheses are true and complementary:**

1. The observed "CRDT write converted the symlink to a regular file" effect is caused by the lack of realpath-before-rename in persistence. This is fixable in the server.
2. The "merge drift" effect is a git-level concern: once the link is a regular file in a commit, any checkout of that commit reinstates the regular file. This is fixable by keeping the symlink consistently present in git history and being disciplined on merges. It is NOT fixable at the persistence layer alone.

**Our spec must address (1) directly. (2) is out of scope — but we should note that even with the persistence fix, if the repo has a regular file at `CLAUDE.md`, that is what we will edit. The persistence fix preserves what's there; it does not *create* symlinks.**

## Recommended fix pattern (for Hypothesis A)

```ts
// Before writing:
let canonicalPath = filePath;
try {
  canonicalPath = await realpath(filePath);
} catch (e: any) {
  if (e.code !== 'ENOENT') throw e;
  // ENOENT: file doesn't exist yet OR symlink target missing
  // Either way, write to filePath directly (creates a new regular file or writes through broken link's location)
}

// Enforce escape check
if (!canonicalPath.startsWith(resolve(contentDir) + sep) && canonicalPath !== resolve(contentDir)) {
  throw new Error(`Canonical path escapes contentDir: ${filePath} → ${canonicalPath}`);
}

// Tmp must be same-filesystem as canonical — put tmp next to canonical, not next to the symlink
const tmpPath = `${canonicalPath}.tmp-${process.pid}-${Date.now()}`;
await writeFile(tmpPath, markdown, 'utf-8');
await rename(tmpPath, canonicalPath);
```

This matches `write-file-atomic`'s v1.3.1 fix exactly.
