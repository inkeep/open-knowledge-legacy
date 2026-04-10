# Link Format Conventions + Git Compatibility

**Research direction:** Investigate wiki-link format conventions across the knowledge management ecosystem and how these formats interact with git version control.

**Parent report:** Wiki-links and backlinks architecture for an agent-native knowledge platform (CRDT + git + MCP).

**Date:** 2026-04-04

---

## Executive Summary

Wiki-link syntax (`[[page-name]]`) has become the de facto standard for internal linking in knowledge management tools, descending from MediaWiki's original convention and adopted by Obsidian, Logseq, Foam, and Dendron. Standard markdown links (`[text](path.md)`) remain the universal portable format supported by GitHub, Docusaurus, and all static site generators. For an agent-native platform built on CRDT + git + MCP, the evidence strongly favors **wikilinks as the primary authoring format** with a **derived standard-markdown representation** for portability — following the pattern Foam pioneered with link reference definitions.

Wikilinks are equally git-compatible as markdown links at the operations level (diff, merge, blame), but produce **smaller diffs on rename/refactor** because they encode less path information. The critical architectural decision is whether links encode **names** (wikilink style) or **paths** (markdown style), which determines how renames propagate through the system.

---

## D1: Link Format Conventions Across Tools

### D1.1: The Format Landscape

| Tool | Primary Format | Alias Syntax | Heading Links | Block Links | Embed Syntax |
|------|---------------|-------------|---------------|-------------|-------------|
| **MediaWiki** | `[[Page]]` | `[[Page\|display]]` | `[[Page#Section]]` | N/A | `[[File:...]]` |
| **Obsidian** | `[[Page]]` | `[[Page\|display]]` | `[[Page#Heading]]` | `[[Page#^blockid]]` | `![[Page]]` |
| **Logseq** | `[[page]]` | N/A | N/A | `((block-uuid))` | `{{embed ((uuid))}}` |
| **Foam** | `[[note-name]]` | N/A | `[[note#Section]]` | `[[note#^blockid]]` | N/A |
| **Dendron** | `[[note]]` | N/A | `[[note#Section]]` | N/A | N/A |
| **Notion** | UUID-based blocks | N/A | UUID-based | UUID-based | Inline blocks |
| **Confluence** | `<ac:link><ri:page/>` | `<ac:link-body>` | Anchor macros | N/A | `<ac:structured-macro>` |
| **GitHub** | `[text](path.md)` | N/A (display is first) | `[text](path.md#heading)` | N/A | N/A |
| **Docusaurus** | `[text](./path.mdx)` | N/A | `[text](./path.mdx#heading)` | N/A | N/A |

**Evidence:** [obsidian-link-format.md](evidence/obsidian-link-format.md), [logseq-link-format.md](evidence/logseq-link-format.md), [mediawiki-link-format.md](evidence/mediawiki-link-format.md), [notion-confluence-link-format.md](evidence/notion-confluence-link-format.md), [docs-frameworks-link-format.md](evidence/docs-frameworks-link-format.md)

### D1.2: MediaWiki — The Original Convention

MediaWiki established the `[[Page Name]]` syntax that all PKM wikilinks derive from. Key characteristics of the original:

- **Case rules:** First character case-insensitive, subsequent characters case-sensitive.
- **Pipe trick:** `[[Page|]]` auto-generates display text by stripping namespace prefixes and trailing parentheticals.
- **Namespace system:** `[[Category:X]]` performs a categorization action; `[[:Category:X]]` creates a plain link. The colon prefix is an escape hatch.
- **Auto-capitalization:** First letter of target is auto-capitalized.
- **Spaces = underscores:** `[[Main Page]]` and `[[Main_Page]]` are identical.

Most PKM tools simplified this: Obsidian dropped case sensitivity entirely, removed namespaces, and uses `|` for display text with reversed semantics (both use `[[target|display]]` but MediaWiki's pipe trick has no equivalent).

**Source:** [Help:Links - MediaWiki](https://www.mediawiki.org/wiki/Help:Links)

### D1.3: Obsidian — The De Facto PKM Standard

Obsidian is the largest wikilink-based PKM tool and has become the reference implementation for modern wikilink behavior.

**Core syntax:**
- `[[Page Name]]` — basic link
- `[[Page Name|Display Text]]` — aliased link
- `[[Page Name#Heading]]` — heading reference
- `[[Page Name#^block-id]]` — block reference (Obsidian-specific, not portable)
- `![[Page Name]]` — embed content inline
- `[[## heading]]` — vault-wide heading search

**Resolution modes** (Settings > Files & Links > New link format):
1. **Shortest path when possible** (default) — just the filename if unique, adds path segments only for disambiguation
2. **Relative path to file** — `[[./subfolder/note]]`
3. **Absolute path in vault** — `[[folder/subfolder/note]]`

**Case sensitivity:** Fully case-insensitive. `[[project alpha]]` = `[[Project Alpha]]`.

**Portability warnings from Obsidian's own docs:**
> "Block references are specific to Obsidian and not part of the standard Markdown format. Links containing block references won't work outside of Obsidian."

**Source:** [Internal links - Obsidian Help](https://help.obsidian.md/links), [Obsidian Help GitHub source](https://github.com/obsidianmd/obsidian-help/blob/master/en/Linking%20notes%20and%20files/Internal%20links.md)

### D1.4: Logseq — Block-Centric Linking

Logseq introduces a fundamentally different linking primitive at the block level:

- **Page references:** `[[page-name]]` (standard wikilink)
- **Block references:** `((block-uuid))` — triple parentheses around a UUID
- **Block embeds:** `{{embed ((block-uuid))}}`
- **Tags:** `#tag` equivalent to `[[tag]]`

The block UUID is an opaque identifier (e.g., `64a1b2c3-...`) stored as a property in the markdown file: `id:: 64a1b2c3-...`. This UUID is **not human-readable** and is **not portable** — it only resolves within Logseq's context. External editing of files can break block references if UUIDs are modified.

Logseq uses the [mldoc](https://github.com/logseq/mldoc) parser (OCaml compiled to JS) which handles both markdown and org-mode syntax.

**Source:** [Logseq block references](https://discuss.logseq.com/t/the-basics-of-logseq-block-references/8458), [mldoc parser](https://github.com/logseq/mldoc)

### D1.5: Notion and Confluence — Opaque Formats

**Notion** uses UUID v4 identifiers for all blocks. Links are stored as block references in a server-side database, not as text in files. When exported to markdown, links become standard `[text](https://notion.so/...)` URLs. This approach is **refactoring-resilient** (renaming never breaks links) but **not portable** to plain-text or git-based systems.

**Confluence** stores links as XML: `<ac:link><ri:page ri:content-title="Page" ri:space-key="SPACE"/></ac:link>`. This is proprietary, title-based (renaming breaks links), and not human-readable.

Neither format is relevant as a model for a git-native platform. Both demonstrate the UUID-vs-name tradeoff: Notion chooses UUIDs (stable but opaque), Confluence chooses titles (readable but fragile).

**Source:** [Notion data model blog](https://www.notion.com/blog/data-model-behind-notion), [Confluence Storage Format](https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html)

### D1.6: GitHub and Documentation Frameworks

**GitHub** only renders standard markdown links. `[[wikilink]]` renders as literal text. There is community demand for wikilink support ([Discussion #73062](https://github.com/orgs/community/discussions/73062)) but no implementation.

**Docusaurus** supports file-path links (`[text](./path.mdx)`) which are auto-converted to URL paths at build time. No wikilink support; some users preprocess wikilinks to markdown links before build.

**Mintlify** and **Fumadocs** use standard markdown links only. No wikilink support.

This means any wikilink-based system needs a **markdown export/rendering layer** for compatibility with the broader developer ecosystem.

**Source:** [Docusaurus markdown links](https://docusaurus.io/docs/markdown-features/links), [GitHub relative links blog](https://github.blog/news-insights/product-news/relative-links-in-markup-files/)

### D1.7: Foam — The Bridge Pattern

Foam (VS Code extension) provides the most instructive model for bridging wikilinks and standard markdown. It uses wikilinks as the authoring format but auto-generates **link reference definitions** at the bottom of each file:

```markdown
Here is a reference to [[my-note]] in the text.

[my-note]: ./path/to/my-note.md "My Note"
```

This approach means:
- Authors write clean wikilinks
- The file is **valid standard markdown** — any parser can resolve the links via the definitions
- Git sees the full file (including definitions) — diffs work normally
- Rename operations update both the wikilink and the definition

Configuration: `foam.edit.linkReferenceDefinitions` can emit `"withExtensions"` or `"withoutExtensions"`.

**Source:** [Foam wikilinks](https://foamnotes.com/user/features/wikilinks.html), [Foam link reference definitions](https://github.com/foambubble/foam/blob/main/docs/user/features/link-reference-definitions.md)

### D1.8: The Parsing Ecosystem

The JavaScript/TypeScript ecosystem has mature, layered wikilink parsing via the unified/remark/micromark stack:

| Layer | Package | Function |
|-------|---------|----------|
| Tokenizer | [micromark-extension-wiki-link](https://github.com/landakram/micromark-extension-wiki-link) | Character-level `[[` / `]]` recognition |
| AST Utility | [mdast-util-wiki-link](https://github.com/landakram/mdast-util-wiki-link) | Converts tokens to `wikiLink` AST nodes |
| Plugin | [remark-wiki-link](https://github.com/landakram/remark-wiki-link) | Top-level remark integration |
| OFM Variant | [@moritzrs/micromark-extension-ofm-wikilink](https://www.npmjs.com/package/@moritzrs/micromark-extension-ofm-wikilink) | Obsidian-flavored: `\|` aliases, `#^` blocks, `![[embed]]` |

The `remark-wiki-link` plugin produces structured AST nodes:
```json
{
  "type": "wikiLink",
  "value": "Page Name",
  "data": {
    "alias": "Display Text",
    "permalink": "page_name",
    "exists": true
  }
}
```

Key extension points for agent integration:
- **`pageResolver`**: Custom function to map names to files — an agent can inject CRDT document store resolution
- **`permalinks`**: Agents can provide current valid page list for link validation
- **`exists` flag**: Enables broken-link detection and repair

**Source:** [remark-wiki-link npm](https://www.npmjs.com/package/remark-wiki-link), [micromark-extension-wiki-link](https://github.com/landakram/micromark-extension-wiki-link)

---

## D5: Git Compatibility

### D5.1: Core Git Operations

**Finding: Wikilinks and markdown links are equally compatible with git's core operations.** Git treats all markdown content as plain text — `[[`, `]]`, `[`, `]`, `(`, `)` are not special characters for git.

| Operation | Wikilinks | Markdown Links | Difference |
|-----------|-----------|---------------|------------|
| `git diff` | Shows `[[name]]` changes | Shows `[text](path)` changes | Wikilinks produce smaller diffs |
| `git merge` | Standard 3-way merge | Standard 3-way merge | Identical behavior |
| `git blame` | Line-level attribution | Line-level attribution | Identical behavior |
| `git log -p` | Patch shows `[[]]` text | Patch shows `[]()` text | No functional difference |

**Evidence:** [git-compatibility.md](evidence/git-compatibility.md)

### D5.2: The Rename Problem

When a file is renamed, links pointing to it must be updated. This is the most significant git interaction for either format.

**Wikilinks (shortest-path):**
```diff
- Some text referencing [[old-name]].
+ Some text referencing [[new-name]].
```
One token changes. The diff is minimal.

**Markdown links (relative path):**
```diff
- Some text referencing [Old Name](../../articles/old-name.md).
+ Some text referencing [New Name](../../articles/new-name.md).
```
Both display text and path change. If the file also moved directories, every relative path differs.

**Wikilinks produce smaller, cleaner diffs on rename operations.** With shortest-path resolution, only the page name changes. With relative markdown links, the full path changes — and if the file moved, every referencing file gets different path updates depending on its own location.

### D5.3: Rename Workflows in Practice

**Obsidian + Git:**
1. Rename file via Obsidian UI → all wikilinks auto-updated
2. Obsidian Git plugin commits all changes together
3. Git sees: 1 file rename + N files with text modifications
4. `git log --follow` tracks the renamed file's history correctly
5. **Limitation:** `Vault.rename()` API calls do NOT trigger link updates — only UI renames do

**Foam + Git:**
1. Rename file in VS Code → Foam auto-updates wikilinks (`foam.links.sync.enable`)
2. Link reference definitions at file bottoms also updated
3. Standard VS Code git integration handles commit

**Source:** [Obsidian Git plugin](https://github.com/Vinzent03/obsidian-git), [Foam docs](https://foamnotes.com/user/features/wikilinks.html)

### D5.4: Merge Conflict Characteristics

Both formats produce standard git conflict markers. However, **wikilinks are easier to read in conflict state** because they're more compact:

Wikilink conflict:
```
<<<<<<< HEAD
References [[updated-concept]] in the text.
=======
References [[original-concept]] in the text.
>>>>>>> feature-branch
```

Markdown link conflict:
```
<<<<<<< HEAD
References [Updated Concept](../concepts/updated-concept.md) in the text.
=======
References [Original Concept](../../old-path/concepts/original-concept.md) in the text.
>>>>>>> feature-branch
```

The wikilink version is clearly easier to resolve — you just pick which name is correct. The markdown version requires understanding relative path differences too.

**No standard git merge driver exists for either format.** Custom merge drivers could be built; wikilinks would be simpler targets because their syntax is more constrained.

### D5.5: GitHub Rendering Gap

The primary git-compatibility argument **against** wikilinks: GitHub does not render them. Files with wikilinks display `[[Page Name]]` as literal text in GitHub's web UI, while markdown links render as clickable hyperlinks.

This is solvable via:
1. **Foam-style link reference definitions** — makes files valid standard markdown
2. **Build-time preprocessing** — convert wikilinks to markdown links before publishing
3. **GitHub Actions** — auto-generate a rendered version alongside the source

For a platform that stores content in git but primarily accesses it through its own UI (not GitHub), this gap is manageable but must be addressed for developer experience.

---

## The Core Tradeoff: Names vs Paths

The fundamental architectural question is whether links encode **names** or **file paths**.

### Name-Based Links (Wikilinks)
```
[[Concept Name]]
```
- **Resolution:** Requires a lookup index mapping names → files
- **Rename behavior:** Only the name token changes across referencing files
- **Ambiguity:** What if two files share a name? Requires disambiguation (Obsidian adds path segments)
- **Agent ergonomics:** Agents can create links without knowing file locations — just reference by name
- **CRDT compatibility:** Name-based links work naturally with CRDTs because the link is a semantic reference, not a filesystem pointer

### Path-Based Links (Standard Markdown)
```
[Display Text](./relative/path/to/file.md)
```
- **Resolution:** Direct filesystem path lookup — no index needed
- **Rename behavior:** Full path changes propagate to all referencing files
- **Ambiguity:** None — paths are unique by definition
- **Agent ergonomics:** Agents must know the exact file path to create a link
- **CRDT compatibility:** Paths may conflict if the file system and CRDT state diverge

### The Hybrid Answer
For an agent-native platform, the evidence points to a **layered approach**:

1. **Authoring layer:** Wikilinks (`[[name]]`) — compact, agent-friendly, CRDT-compatible
2. **Storage layer:** Wikilinks in markdown files, with resolution metadata in a derived index
3. **Portability layer:** Auto-generated standard markdown representations (link reference definitions or preprocessing)
4. **Resolution layer:** A name→file index maintained by the platform (analogous to Obsidian's vault index)

---

## Recommendations for Agent-Native Platform

### R1: Adopt Wikilinks as Primary Format
Use `[[Page Name]]` as the canonical link syntax. This aligns with the dominant PKM convention (Obsidian, Logseq, Foam, MediaWiki), produces minimal git diffs, and is the most agent-friendly format (agents reference concepts by name, not by path).

### R2: Support Obsidian-Compatible Syntax
Specifically support:
- `[[Page Name]]` — basic link
- `[[Page Name|Display Text]]` — aliased link (pipe as divider, matching Obsidian)
- `[[Page Name#Heading]]` — heading reference
- `![[Page Name]]` — embed syntax

Consider but evaluate carefully:
- `[[Page Name#^block-id]]` — block references (Obsidian-specific, not portable)

### R3: Case-Insensitive Resolution
Follow Obsidian's case-insensitive matching. `[[project alpha]]` and `[[Project Alpha]]` should resolve to the same target. This reduces friction for both human and agent authors.

### R4: Shortest-Path Resolution Default
Use shortest-path resolution (Obsidian's default) — if a name is unique, no path prefix needed. Add path segments only for disambiguation. This minimizes link verbosity and diff size.

### R5: Generate Standard Markdown Representations
Implement Foam-style link reference definitions or a build-time preprocessing step to ensure files are valid standard markdown when viewed outside the platform (e.g., on GitHub, in VS Code, in static site generators).

### R6: Build on remark/micromark Ecosystem
Use the existing [remark-wiki-link](https://github.com/landakram/remark-wiki-link) / [micromark-extension-wiki-link](https://github.com/landakram/micromark-extension-wiki-link) stack for parsing. Inject custom `pageResolver` and `permalinks` that query the platform's CRDT document store. The AST-based approach enables programmatic link analysis, broken-link detection, and agent-driven link management.

### R7: Platform-Managed Renames
When files are renamed, the platform must atomically update all referencing links. In a git context, this should produce a **single commit** containing the rename and all link updates. The Obsidian model (UI renames trigger link updates, API renames do not) is a known pain point to avoid — ensure programmatic renames also trigger link updates.

### R8: Avoid Opaque IDs in Link Syntax
Do not follow Logseq's `((block-uuid))` or Notion's UUID-in-URL approach for the primary link format. Opaque IDs break human readability and git diff legibility. If block-level references are needed, use human-readable identifiers (Obsidian's `^block-id` with Latin letters, numbers, dashes) rather than UUIDs.

---

## Confidence Assessment

| Finding | Confidence | Basis |
|---------|-----------|-------|
| Wikilinks are the dominant PKM link format | **High** | Obsidian (millions of users), MediaWiki (all Wikimedia sites), Logseq, Foam, Dendron all use `[[]]` |
| Wikilinks and markdown links are equally git-compatible | **High** | Both are plain text; git has no format-specific handling |
| Wikilinks produce smaller diffs on rename | **High** | Shortest-path `[[name]]` vs relative `[text](../../path/name.md)` — structural argument |
| Foam's link reference definitions solve portability | **Medium-High** | Foam has demonstrated this works, but at scale (thousands of files) the definitions add file size |
| remark/micromark stack is production-ready | **High** | Actively maintained, npm downloads, used by multiple production tools |
| Block references should use human-readable IDs | **Medium** | Opaque UUIDs have clear downsides; human IDs have disambiguation challenges at scale |

---

## Evidence Files

- [evidence/obsidian-link-format.md](evidence/obsidian-link-format.md) — Obsidian internal link format, resolution modes, auto-update behavior
- [evidence/logseq-link-format.md](evidence/logseq-link-format.md) — Logseq page/block references, UUID storage, mldoc parser
- [evidence/mediawiki-link-format.md](evidence/mediawiki-link-format.md) — MediaWiki original wikilink specification, case rules, pipe trick
- [evidence/notion-confluence-link-format.md](evidence/notion-confluence-link-format.md) — Notion UUID architecture, Confluence XML storage format
- [evidence/docs-frameworks-link-format.md](evidence/docs-frameworks-link-format.md) — Docusaurus, GitHub, Foam, Dendron, Mintlify link handling
- [evidence/git-compatibility.md](evidence/git-compatibility.md) — Git operations, rename workflows, merge conflicts, GitHub rendering
- [evidence/parsing-ecosystem.md](evidence/parsing-ecosystem.md) — remark-wiki-link, micromark-extension-wiki-link, AST structure, agent integration points
