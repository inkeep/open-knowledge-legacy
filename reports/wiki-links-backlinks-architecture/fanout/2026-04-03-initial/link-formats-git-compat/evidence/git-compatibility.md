# Evidence: Git Compatibility with Link Formats

## Sources
- **Primary:** [Obsidian Git Plugin - GitHub](https://github.com/Vinzent03/obsidian-git)
- **Primary:** [Foam Wikilinks Documentation](https://foamnotes.com/user/features/wikilinks.html)
- **Primary:** [Foam Link Reference Definitions](https://github.com/foambubble/foam/blob/main/docs/user/features/link-reference-definitions.md)
- **Primary:** [Git remembering-renames documentation](https://git-scm.com/docs/remembering-renames)
- **Primary:** [Relative links in markup files - GitHub Blog](https://github.blog/news-insights/product-news/relative-links-in-markup-files/)
- **Primary:** [Obsidian Forum - Vault.rename doesn't trigger link update](https://forum.obsidian.md/t/vault-rename-file-path-doesnt-trigger-link-update/32317)
- **Primary:** [Obsidian and Git: Quick Setup Guide](https://rob.cogit8.org/posts/2025-03-25-obsidian-git-quick-setup-for-developers/)
- **Primary:** [Zettelkasten Forum - Wiki vs Markdown Style Links](https://forum.zettelkasten.de/discussion/201/wiki-vs-markdown-style-links)
- **Primary:** [DEVONtechnologies Forum - Wiki-links vs regular item links](https://discourse.devontechnologies.com/t/using-links-in-markdown-documents-wiki-links-vs-regular-item-link-what-are-the-pros-cons/64853)

---

## D5.1: Do Wikilinks Survive Git Operations?

### git diff
- **Both formats survive identically.** Git diff treats markdown content as plain text. Whether the content contains `[[Target Page]]` or `[Target Page](target-page.md)`, git shows the character-level diff the same way.
- No special handling needed — `[[` and `]]` are not git metacharacters.
- Wikilinks are actually **better for diffs** because they're shorter: a wikilink change is a smaller textual diff than an equivalent markdown link change.

### git merge
- Both formats are plain text — git merges them using standard 3-way merge.
- **Conflict scenarios are identical** for both formats: if two branches edit the same line containing a link, git produces the standard conflict markers regardless of link syntax.
- Neither format has special merge-driver support.

### git blame
- Both formats work identically with `git blame` — each line is attributed to its last modifier.
- Wikilinks are slightly better for blame because a link and its display text are on a single `[[target|display]]` token, while markdown links span `[display](target)` which is also single-line but longer.

### Summary
**Wikilinks and markdown links are equally compatible with git's core operations.** Git treats all markdown content as plain text. There is no functional difference in diff, merge, or blame behavior.

---

## D5.2: File Renames and Link Updates — Git History Impact

### The Core Problem
When an article is renamed, all links pointing to it must be updated. This creates a **multi-file commit**: the rename itself + all files containing links to it. This is true for BOTH wikilinks and markdown links.

### Wikilinks Advantage: Shorter-Path References
With shortest-path wikilinks (`[[article-name]]`), renaming a file only requires updating the article name portion in referencing files. No path changes needed if the name is unique.

With relative markdown links (`[text](../../path/to/article.md)`), renaming OR moving a file requires updating the full path in every referencing file — a larger diff.

### Obsidian + Git Behavior
- Obsidian's UI rename triggers automatic link updates across all vault files
- The Obsidian Git plugin (Vinzent03/obsidian-git) then commits all changed files together
- This produces a single commit with the rename + all link updates — clean git history
- **Caveat:** Programmatic renames via `Vault.rename()` API do NOT trigger link updates — only UI renames do

### Foam + Git Behavior
- Foam auto-updates wikilinks on rename via `foam.links.sync.enable` (default: true)
- VS Code's built-in `markdown.updateLinksOnFileMove.enabled` handles markdown links
- Changes appear in VS Code's source control panel for git commit

### Git rename detection
- Git detects file renames via content similarity (default threshold: 50%)
- `git log --follow` tracks file history across renames
- Link update commits don't break rename detection — the content similarity of the renamed file itself (not the referencing files) determines detection

---

## D5.3: Wikilinks vs Relative Paths for Git Repos

### Arguments for Wikilinks in Git Repos

| Property | Wikilinks | Markdown Relative Links |
|----------|-----------|------------------------|
| Length | Shorter: `[[Page]]` | Longer: `[Page](../path/to/page.md)` |
| Rename impact | Update name only | Update full path |
| Move impact | No change (if shortest-path) | Update all relative paths |
| Readability in raw text | Higher — `[[Page]]` is clean | Lower — URL-encoded paths with `%20` |
| Git diff size | Smaller diffs | Larger diffs |

### Arguments for Markdown Links in Git Repos

| Property | Markdown Links | Wikilinks |
|----------|---------------|-----------|
| GitHub rendering | Renders as clickable links | Renders as literal text `[[Page]]` |
| Static site compat | Works with all SSGs | Requires preprocessing |
| Standard compliance | CommonMark/GFM standard | Non-standard extension |
| Explicit paths | Unambiguous file reference | Requires resolution logic |
| Tool portability | Universal markdown support | Only PKM tools support |

### The Hybrid Approach (Foam's Solution)
Foam solves this by using wikilinks in the body but auto-generating **link reference definitions** at file bottom:
```markdown
Some text with [[my-note]] reference.

[my-note]: path/to/my-note.md "My Note"
```
This makes the file valid standard markdown while maintaining wikilink ergonomics.

---

## D5.4: Obsidian Git Vault — Link Updates in Practice

### Obsidian Git Plugin (Vinzent03/obsidian-git)
- 12k+ GitHub stars, actively maintained
- Provides: auto commit/push on timer, pull on startup, source control view, diff view, history view
- No special handling for wikilinks — treats all vault files as plain text for git operations

### Practical Workflow
1. User renames file in Obsidian UI
2. Obsidian auto-updates all wikilinks across vault
3. User (or auto-timer) triggers git commit
4. All changed files committed together
5. Git sees: one file rename + N files with modified wikilink text

### Known Issues
- Merge conflicts in `.obsidian/` config directory are common (workspace state, plugin data)
- Recommended: `.gitignore` the `.obsidian/workspace.json` and similar transient state files
- Multi-device sync via git can cause conflicts if both devices rename the same note

---

## D5.5: Git Merge Conflicts — Wikilinks vs Markdown Links

### Conflict Structure
Both formats produce identical conflict markers:
```
<<<<<<< HEAD
Some text with [[renamed-note]] reference.
=======
Some text with [[old-note-name]] reference.
>>>>>>> branch-b
```

### Resolution Complexity
- **Wikilinks**: Conflicts are shorter and easier to read because links are compact
- **Markdown links**: Conflicts include full paths, making them harder to parse visually:
  ```
  <<<<<<< HEAD
  Some text with [Renamed Note](path/to/renamed-note.md) reference.
  =======
  Some text with [Old Note](different/path/to/old-note.md) reference.
  >>>>>>> branch-b
  ```

### Automated Resolution
- No standard git merge driver exists for either format
- Custom merge drivers could be built for either format
- Wikilinks are simpler to build merge tooling for because the format is more constrained
