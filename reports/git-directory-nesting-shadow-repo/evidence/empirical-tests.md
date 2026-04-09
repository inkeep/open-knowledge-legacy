# Evidence: Empirical Tests — Nesting a Bare Repo Inside .git/

**Dimension:** Maintenance safety, isolation, worktree behavior
**Date:** 2026-04-08
**Sources:** Direct empirical testing on macOS (git 2.x, Darwin 25.3.0)

---

## Test 1: Custom subdirectory survives git gc --aggressive --prune=now

```bash
cd /tmp && mkdir git-nesting-test && cd git-nesting-test
git init && echo "hello" > file.txt && git add . && git commit -m "init"
mkdir -p .git/openknowledge/history.git
echo "shadow data" > .git/openknowledge/test.txt
git gc --aggressive --prune=now
cat .git/openknowledge/test.txt  # → "shadow data"
```

**Result:** CONFIRMED — custom dir and contents survived gc --aggressive --prune=now.
**git fsck:** No warnings or errors about the custom directory.

---

## Test 2: Clone does NOT transfer custom .git/ subdirs

```bash
git clone git-nesting-test git-clone-test
ls git-clone-test/.git/openknowledge/  # → No such file or directory
```

**Result:** CONFIRMED — clone only recreates standard paths (config, HEAD, hooks, objects, refs, etc.). Custom dirs are NOT cloned.

---

## Test 3: git push --mirror does NOT transfer custom dirs

```bash
git init --bare git-mirror-test.git
git push --mirror test-mirror
ls /tmp/git-mirror-test.git/openknowledge/  # → No such file or directory
```

**Result:** CONFIRMED — mirror push only sends refs + objects via the git protocol. Custom filesystem dirs inside .git/ are not part of the transport.

---

## Test 4: Git worktree — custom dir accessible from main repo only

```bash
git worktree add -b feature-branch /tmp/git-wt-test
cat /tmp/git-wt-test/.git  # → "gitdir: /private/tmp/git-nesting-test/.git/worktrees/git-wt-test"
ls /tmp/git-nesting-test/.git/openknowledge/  # → history.git, test.txt (accessible)
```

**Result:** CONFIRMED — worktree's `.git` is a pointer file. Custom dir is in the main .git/ and accessible from there, but the worktree must resolve the pointer to find it.

---

## Test 5: Nested bare repo does not confuse parent git

```bash
git init --bare .git/openknowledge/history.git
git status   # → On branch main, nothing to commit
git fsck     # → (no output, no warnings)
git log      # → shows only parent repo commits
```

**Result:** CONFIRMED — parent git is completely unaware of the nested bare repo. No cross-contamination of objects, refs, or status.

---

## Test 6: Shadow repo commits work inside .git/ with correct init sequence

```bash
# Init bare, then unset core.bare and set core.worktree
git init --bare .git/openknowledge/history.git
GIT_DIR=.git/openknowledge/history.git git config --unset core.bare
GIT_DIR=.git/openknowledge/history.git git config core.worktree /tmp/git-nesting-test2

# Commit to shadow
GIT_DIR=.git/openknowledge/history.git GIT_WORK_TREE=/tmp/git-nesting-test2 git add file.txt
GIT_DIR=.git/openknowledge/history.git git commit -m "shadow commit" --author="upstream <noreply@openknowledge.local>"
```

**Result:** CONFIRMED — no warnings when core.bare is unset before setting core.worktree. Shadow commits work. Parent gc does not touch shadow objects.

**Caveat:** If you set core.worktree while core.bare=true, git emits `warning: core.bare and core.worktree do not make sense` but still works. Fix: unset core.bare first.

---

## Test 7: Parent gc does NOT touch shadow repo objects

After creating shadow commits with their own objects:
```bash
git gc --aggressive --prune=now  # on parent
GIT_DIR=.git/openknowledge/history.git git log --oneline  # → shadow commits still present
```

**Result:** CONFIRMED — parent gc operates only on its own object database. Shadow objects in .git/openknowledge/history.git/objects/ are untouched.
