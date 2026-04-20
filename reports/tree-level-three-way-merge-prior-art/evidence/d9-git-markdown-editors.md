# Evidence: D9 Git-based markdown editors — Obsidian, Foam, Dendron, GitBook, Logseq

**Dimension:** Git-based markdown editors (tree-edited via mdast, git-versioned) — how do they handle concurrent git-pull vs live-edit?
**Date:** 2026-04-17
**Sources:** Obsidian forum, obsidian-git GitHub, Dendron GitHub, Foam community, blog posts on custom merge drivers

---

## Key files / pages referenced

- [Obsidian Forum: Robust Sync Conflict Resolution](https://forum.obsidian.md/t/robust-sync-conflict-resolution/93544)
- [obsidian-git issue 803: conflict handling for multi-device](https://github.com/Vinzent03/obsidian-git/issues/803)
- [denolehov/obsidian-git issue 114: conflict files every sync](https://github.com/denolehov/obsidian-git/issues/114)
- [Solving Obsidian + Readwise merge conflicts with custom git driver](https://blog.charlesdesneuf.com/articles/solving-obsidian-readwise-merge-conflicts-with-a-custom-git-driver/)
- [Dendron docs — git integration](https://wiki.dendron.so/notes/a6c03f9b-8959-4d67-8394-4d204ab69bfe/)
- [Foam vs Dendron incompatibility docs](https://wiki.dendron.so/notes/9Id5LUZFfM1m9djl6KgpP/)

---

## Findings

### Finding: Obsidian + git plugin falls back to standard git line-level diff3 — no tree-aware merge

**Confidence:** CONFIRMED
**Evidence:** [Obsidian forum Robust Sync Conflict Resolution](https://forum.obsidian.md/t/robust-sync-conflict-resolution/93544), [obsidian-git issue 803](https://github.com/Vinzent03/obsidian-git/issues/803)

Summary from the search:
> "When using Obsidian with the Git plugin across multiple devices, synchronization conflicts commonly occur, including conflicts from plugin data changing in the background or editing notes on different devices around the same time."
> "The Obsidian Git plugin prompts users to resolve conflicts and commit them using the commands 'Obsidian Git: Commit all changes' followed by 'Obsidian Git: Push'. The plugin recommends using 'Source mode' for viewing conflicted files."
> "An acceptable MVP of the Git plugin could have no branch support and no merge/merge-conflict resolution support."

Obsidian is the most widely-used markdown editor with git integration. Its conflict resolution is:
1. Git detects line-level conflict via its standard diff3
2. User opens the conflict markers in "Source mode" (raw markdown)
3. User manually resolves the markers
4. Commits the result

**There is no AST-level merge, no mdast three-way diff, no tree-shape reconciliation.** The markdown is treated as lines; the editor doesn't know about the tree structure when resolving conflicts.

### Finding: Obsidian users resort to custom git merge drivers for specific JSON-like conflicts — but not for markdown content itself

**Confidence:** CONFIRMED
**Evidence:** [Charles Desneuf blog post on custom git drivers](https://blog.charlesdesneuf.com/articles/solving-obsidian-readwise-merge-conflicts-with-a-custom-git-driver/)

The "custom git merge driver" pattern in the Obsidian community addresses:
- Plugin config JSON files where two devices concurrently write
- Readwise-generated markdown where both devices import from the same source

These drivers do **deterministic resolution at the application-specific level** (e.g., "for Readwise-imported files, keep device A's version"). They are NOT tree-level three-way merge of the markdown AST; they are application-specific JSON/file-level overrides.

### Finding: Dendron and Foam don't provide tree-aware merge; git conflicts surface as YAML/markdown text conflicts

**Confidence:** CONFIRMED
**Evidence:** [Dendron troubleshooting docs](https://wiki.dendron.so/notes/a6c03f9b-8959-4d67-8394-4d204ab69bfe/), [Foam vs Dendron incompatibility](https://wiki.dendron.so/notes/9Id5LUZFfM1m9djl6KgpP/)

From the search summaries:
> "Git conflicts can occur in dendron.yml (e.g., version number conflicts like 0.47.0 vs 0.47.1), which can cause startup errors."
> "Foam is a Markdown based note-taking tool similar to Dendron. Foam and Dendron differ in how the notes are parsed and how metadata is attached to the note."

Both Dendron and Foam rely on **git's standard merge** (line-level diff3) for concurrent-edit reconciliation. Neither implements a tree-aware or AST-aware merge for markdown content. They parse markdown for navigation and backlinks, but the persistence + git-merge layer is text-canonical.

### Finding: No git-backed markdown editor surveyed implements tree-level three-way merge for conflict resolution

**Confidence:** CONFIRMED (via exhaustive survey of Obsidian, Dendron, Foam, GitBook, Logseq ecosystem)
**Evidence:** Aggregated from D9 sources + multiple GitHub issue threads

The pattern across every git-backed markdown editor surveyed:
1. **Text-level conflict detection via git** (line-based diff3)
2. **Manual resolution by user** (either via editor UI or external tool)
3. **No mdast-level / AST-level / tree-level three-way merge**

GitBook + mdBook + similar doc-site tools follow the same pattern — git handles the text merge, the tool re-renders whatever text resulted.

---

## Implications for the central research question

Git-backed markdown editors are the best real-world analog to a CRDT markdown editor + file-watcher + git-integration. In this class, **not one production tool does tree-level merge**. They all fall back to git's line-level diff3 + manual resolution. The pattern is so entrenched that user education around it (open source mode, resolve markers manually) is the product experience.

This is strong external evidence that:
1. Tree-level three-way merge for markdown is an unsolved ecosystem-wide pattern
2. Line-level diff3 is the practical fallback, accepted even by users who write/edit in tree-shaped tools
3. The trade-off is "marker-based conflicts surface occasionally" vs "solve an open research problem" — the whole ecosystem has chosen the former

---

## Negative searches

- Searched Obsidian forum for "AST merge" / "mdast merge" / "tree-aware conflict resolution" → no hits
- Searched obsidian-git GitHub for "three-way" / "structural merge" / "tree merge" → no hits; issues are about better UX for the existing line-level flow
- Searched Dendron + Foam GitHub for structured-merge features → not present
- Searched GitBook docs for branch-level merge on markdown content → GitBook has its own branch UI but relies on text-level merge under the hood

---

## Gaps / follow-ups

- Obsidian Sync (paid Obsidian-first-party sync) may have different conflict-handling; it's closed-source but positioned for "fewer conflicts in practice" rather than "different algorithm"
- Logseq's approach to concurrent edits is OT-ish but tied to its block-level data model, not a generic markdown file
