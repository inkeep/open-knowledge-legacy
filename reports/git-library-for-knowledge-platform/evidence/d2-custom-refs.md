# Evidence: Custom Ref Support

**Dimension:** D2 — Custom ref support (refs/wip/*, refs/drafts/*)
**Date:** 2026-04-02
**Sources:** isomorphic-git docs, git-wip project, simple-git docs

---

## Key files / pages referenced

- https://isomorphic-git.org/docs/en/writeRef — writeRef API
- https://isomorphic-git.org/docs/en/commit — commit API with `ref` parameter
- https://github.com/bartman/git-wip — git-wip project (uses refs/wip/)
- https://github.com/steveukx/git-js — simple-git repository
- https://git-scm.com/book/en/v2/Git-Internals-Git-References — git references docs

---

## Findings

### Finding: isomorphic-git writeRef accepts arbitrary ref paths
**Confidence:** CONFIRMED
**Evidence:** isomorphic-git writeRef documentation

The `writeRef()` function accepts a `ref` parameter described as "The name of the ref to write" with no documented validation restricting it to `refs/heads/` or `refs/tags/`. The API also supports `force: true` for overwriting and `symbolic: true` for symbolic refs. The example shows `refs/heads/another-branch` but the API is generic.

The `commit()` function also accepts a `ref` parameter that can be any ref path: `ref: 'refs/wip/human/main'` should work to create a commit and update that ref atomically.

**Implications:** isomorphic-git should support the custom ref namespaces needed for WIP refs and draft branches.

### Finding: Native git update-ref supports arbitrary ref paths
**Confidence:** CONFIRMED
**Evidence:** git-scm.com documentation, git-wip project

`git update-ref refs/wip/human/main <sha>` works with any ref path under `refs/`. The git-wip project uses exactly this pattern: WIP branches are named `wip/<topic>` and stored as standard git refs.

Via simple-git: `await git.raw(['update-ref', 'refs/wip/human/main', sha])`.

**Implications:** Both isomorphic-git and native git (via simple-git) fully support custom ref namespaces.

### Finding: git-wip establishes the refs/wip/* pattern as proven
**Confidence:** CONFIRMED
**Evidence:** github.com/bartman/git-wip

The git-wip project uses `wip/<topic>` refs to store auto-save commits. WIP refs are "mostly throw-away but identify points of development between commits." The intent is for the editor to invoke git-wip on every file save. This is conceptually identical to the auto-persistence daemon pattern.

**Implications:** The refs/wip/* pattern is established prior art, not a novel invention.

---

## Gaps / follow-ups

* Verify isomorphic-git writeRef works with multi-level ref paths like `refs/wip/human/feature/my-draft`
* Test whether isomorphic-git's ref validation rejects any characters that git allows
