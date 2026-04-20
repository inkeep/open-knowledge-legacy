# Evidence: D1 Git's tree merge

**Dimension:** Git's own tree merge — what does "solved" look like for Git's domain?
**Date:** 2026-04-17
**Sources:** git-scm.com official docs, git-merge-tree(1) man page, ORT merge strategy docs, Atlassian git tutorials

---

## Key files / pages referenced

- [git-merge-tree docs](https://git-scm.com/docs/git-merge-tree) — the plumbing command that exposes Git's tree merge algorithm
- [merge-strategies docs](https://git-scm.com/docs/merge-strategies) — Git's catalog of merge strategies
- [git/merge-recursive.c source](https://github.com/git/git/blob/5f95c9f850b19b368c43ae399cc831b17a26a5ac/merge-recursive.c) — pre-v2.50 recursive implementation
- [Git Merge Strategies and Algorithms (mattrickard.com)](https://mattrickard.com/git-merge-strategies-and-algorithms) — external summary
- [kernel.org git-merge-tree man page mirror](https://www.kernel.org/pub/software/scm/git/docs/git-merge-tree.html)

---

## Findings

### Finding: Git's tree merge is path-aware, but content merge at each path is text-line diff3

**Confidence:** CONFIRMED
**Evidence:** [git-scm.com/docs/merge-strategies](https://git-scm.com/docs/merge-strategies), [git-scm.com/docs/git-merge-tree](https://git-scm.com/docs/git-merge-tree)

From the git-merge-tree man page:
> "git-merge-tree reads three tree-ish objects and outputs trivial merge results and conflicting stages to standard output in a semi-diff format, designed for higher level scripts to consume and merge the results back into the index."

From the merge-strategies docs:
> "Paths that merged cleanly are updated both in the index file and in your working tree, while for conflicting paths, the index file records up to three versions: stage 1 stores the version from the common ancestor, stage 2 from HEAD, and stage 3 from MERGE_HEAD. The working tree files contain the result of the merge operation with 3-way merge results that include familiar conflict markers."

**What this means:** Git's "tree" is a filesystem tree (paths → blobs + mode + permissions). Its tree-level merge operates on **path identity**:
- For each path that exists in two or more of {ancestor, HEAD, MERGE_HEAD}, Git decides whether the path was added/deleted/renamed/modified.
- When the same path is modified on both sides, Git invokes line-level diff3 **on the blob content** — which is text, treated as a sequence of lines.
- When a path exists only on one side with no ancestor version, it's an unambiguous add.
- Renames are detected heuristically (similarity threshold on blob content) to suppress spurious delete+add conflicts.

### Finding: Git's tree merge NEVER looks inside the blob as structure

**Confidence:** CONFIRMED
**Evidence:** [git-scm.com/docs/merge-strategies](https://git-scm.com/docs/merge-strategies) (merge-strategies doc enumerates no structural merge mode for blob contents)

Git's recursive/ort merge strategies do not parse blob contents as code, JSON, XML, or markdown. A `.ts` file and a `.md` file are both "sequences of lines" from the merger's perspective. Semantic awareness is **out of scope** — it's the job of external tools (SemanticMerge, git custom merge drivers, IDE plugins) to handle that when needed.

### Finding: The ORT strategy (default as of v2.50.0) is still path-keyed with line-level content merge

**Confidence:** CONFIRMED
**Evidence:** [git-scm.com/docs/merge-strategies](https://git-scm.com/docs/merge-strategies), Atlassian git tutorial

From merge-strategies:
> "The recursive strategy is now a synonym for ort (it was an alternative implementation until v2.49.0, but was redirected to mean ort in v2.50.0)"

ORT ("Ostensibly Recursive's Twin") is a reimplementation for correctness and performance, but maintains the same algorithmic contract: **path-keyed three-way merge, with line-level diff3 for blob content**.

### Finding: Criss-cross merges use virtual-merge-base recursion — still no structural merge

**Confidence:** CONFIRMED
**Evidence:** [git-scm.com/docs/merge-strategies](https://git-scm.com/docs/merge-strategies)

> "When there is more than one common ancestor that can be used for 3-way merge, Git creates a merged tree of the common ancestors and uses that as the reference tree for the 3-way merge. This has been reported to result in fewer merge conflicts without causing mismerges by tests done on actual merge commits taken from Linux 2.6 kernel development history."

The recursive step merges **ancestors against each other** to produce a virtual base — but the recursion is in the ancestor-graph dimension, not inside blob structure. Each sub-merge is again a path-keyed + line-level merge.

---

## Implications for the central research question

Git is the most widely-deployed three-way merge system in software, and its "tree merge" is:
- **Tree-aware at the filesystem level** (paths, renames, mode bits)
- **Line-level at the content level** (blobs are opaque to the tree algorithm)

This is the canonical reference for "what solved looks like in the domain Git serves." But:
- Git's filesystem tree is NOT an editor's document tree (AST / ProseMirror doc / Y.XmlFragment).
- Git's approach is the direct architectural ancestor of the **serialize-merge-parse fallback**: CRDT editor serializes to text, git merges paths + line-diff3, parse back into CRDT.
- The "structural semantics" question (is a `<h1>` ≅ `<h2>` rename in the tree?) is one Git chooses not to answer. It treats the change as a line diff inside a blob and leaves semantics to the editor.

---

## Negative searches

- Searched git-scm.com + github.com/git for "AST merge" / "structural merge" / "tree-shape merge inside blob" → no hits. The capability is explicitly not provided.
- Searched for "git custom merge driver" AST examples → returns SemanticMerge and community merge drivers as *external add-ons*, not Git core functionality.

---

## Gaps / follow-ups

- Git's design decision (tree = filesystem, content = opaque) is well-documented philosophically but the exact historical rationale isn't in scope here.
- ORT's algorithmic contract vs the old recursive strategy is described in merge-strategies but doesn't affect the line-level claim.
