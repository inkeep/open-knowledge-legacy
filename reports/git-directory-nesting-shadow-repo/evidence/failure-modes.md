# Evidence: Failure Modes for .git/ Nesting

**Dimension:** Failure modes, trade-offs vs .openknowledge/
**Date:** 2026-04-08
**Sources:** Empirical testing, git documentation

---

## Failure mode 1: `rm -rf .git && git init` (repo reset)

**Impact:** Shadow repo is destroyed along with the project repo.
**Severity for our design:** LOW — Save Version commits are the durable history and they're in the project repo's commit DAG. Losing the shadow loses attribution detail only. When the user does `rm -rf .git`, they're explicitly destroying their project history — our attribution journal being lost is consistent with that intent.
**Comparison with `.openknowledge/`:** `.openknowledge/` survives `rm -rf .git`, so shadow attribution would be preserved even after a repo reset. However, without the project repo's commits, the shadow's checkpoint refs point at nothing — the attribution data is orphaned.

---

## Failure mode 2: Fresh clone from remote

**Impact:** Shadow repo does NOT exist in the clone. User starts with no attribution history.
**Severity for our design:** LOW — this is expected behavior. `openknowledge init` would recreate the shadow on first run. Save Version commits are already in the project history.
**Same for `.openknowledge/`:** If `.openknowledge/` is in `.gitignore`, it also doesn't survive clone. Identical behavior.

---

## Failure mode 3: `git worktree add` — where does shadow live?

**Impact:** The shadow at `.git/openknowledge/history.git` is in the main repo's `.git/`. Worktrees have `.git` as a pointer file → they share the main `.git/` directory.
**Implication:** All worktrees would share the same shadow repo (via the main `.git/`). This is actually **desirable** — the attribution journal should be per-project, not per-worktree.
**Comparison with `.openknowledge/`:** If `.openknowledge/` is in the project root, each worktree gets its own checkout of the working tree but shares the same project `.git/`. With `.openknowledge/` in the working tree, worktrees would each have their own `.openknowledge/` directory — potentially creating conflicting shadow repos.

**Finding:** `.git/openknowledge/` is **better** for worktrees than `.openknowledge/` in the working tree.

---

## Failure mode 4: Shallow/partial clones

**Impact:** No effect — shadow is local-only, not transferred.
**Same for `.openknowledge/`:** Identical.

---

## Failure mode 5: git init --bare conversion

**Impact:** If someone converts the repo to bare (`git clone --bare`), the `.git/` becomes the repo root. `.openknowledge/history.git` would become `<bare-repo>/openknowledge/history.git` — harmless, but unexpected location.
**Severity:** VERY LOW — bare repo conversion is extremely rare for content repos.

---

## Failure mode 6: Future git versions adding an `openknowledge/` path

**Impact:** Theoretically, a future git version could add a `.git/openknowledge/` path.
**Severity:** EXTREMELY LOW — git has never reused a namespace that tools established. The pattern of `.git/<toolname>/` is well-established (lfs, annex, branchless). Using `.git/openknowledge/` follows the convention.
**Mitigation:** If this ever happened (it won't), we'd rename in the next version.
