---
name: markdown asset conventions survey
sources:
  - https://gohugo.io/content-management/page-bundles/
  - https://scripter.co/hugo-leaf-and-branch-bundles/
  - https://jekyllrb.com/docs/step-by-step/07-assets/
  - https://nhoizey.github.io/jekyll-postfiles/
  - https://squidfunk.github.io/mkdocs-material/reference/images/
  - https://github.com/squidfunk/mkdocs-material/discussions/3424
  - https://docusaurus.io/docs/markdown-features/assets
  - https://docs.astro.build/en/guides/images/
  - https://docs.astro.build/en/guides/content-collections/
  - https://github.com/withastro/astro/issues/1618
  - https://www.11ty.dev/docs/plugins/image/
  - https://www.11ty.dev/docs/copy/
  - https://github.com/chriskirknielsen/eleventy-plugin-copy-local-assets
  - https://www.getzola.org/documentation/content/overview/
  - https://help.obsidian.md/Files+and+folders/Manage+vaults
  - https://forum.obsidian.md/t/default-location-for-attachments/59846
  - https://github.com/reorx/obsidian-paste-image-rename
  - https://www.obsidianstats.com/plugins/hash-pasted-image
  - https://discuss.logseq.com/t/understanding-the-proper-way-to-handle-attachements-assets/8910
  - https://wiki.dendron.so/notes/a91fd8da-6895-49fe-8164-a17acd8d9a17/
  - https://github.com/dendronhq/dendron-paste-image/issues/6
  - https://www.notion.com/help/export-your-content
  - https://github.blog/changelog/2022-02-13-upload-images-to-wiki-pages/
  - https://github.com/orgs/community/discussions/11521
  - https://code.visualstudio.com/docs/languages/markdown
  - https://github.com/microsoft/vscode/pull/203391
  - https://support.typora.io/Images/
  - https://ia.net/writer/support/library/content-blocks
  - https://vitepress.dev/guide/asset-handling.html
  - https://www.gatsbyjs.com/plugins/gatsby-remark-images/
---

# Markdown Asset Conventions Survey

Scope: where do real markdown tools put images relative to `.md` files, how do they discover them, and how do they handle upload-time concerns (collisions, rename, attachments-folder config)?

## 1. Convention table (tool → default → configurable?)

| Tool | Default asset location | Discovery | Configurable? |
|---|---|---|---|
| Hugo (leaf bundle) | Same directory as `index.md` (per-page folder) | Bundle-scoped (reads filesystem inside bundle dir) | Yes — branch bundles also allowed; `static/` alt |
| Hugo (branch bundle) | Same directory as `_index.md`, no page-resources | Bundle-scoped | Yes |
| Jekyll | Top-level `/assets/` (convention, not enforced); `_posts` has no native per-post folders | Globbed passthrough of everything not `_` prefixed | Yes — `jekyll-postfiles` plugin enables per-post folders |
| MkDocs / Material | Anywhere under `docs_dir`; Material convention is `docs/assets/` or `docs/assets/images/` | Globs `docs_dir` | Yes — `docs_dir` only constraint |
| Docusaurus | Both supported: co-located relative paths, or `static/` absolute paths | Relative paths resolved at build via `require()`; `static/` globbed | Yes — either pattern works |
| Astro Content Collections | Co-located `src/content/<collection>/<slug>/` with images next to `.md`, or `src/assets/` | Schema `image()` helper validates references; `import.meta.glob` for runtime | Yes |
| 11ty (Eleventy) | Passthrough copy of declared dirs; HTML-relative passthrough copies anything referenced in `[src]` / `[href]` at build | **Reference-driven** (HTML-Relative Passthrough) OR globbed | Yes — plugin opts in |
| Zola | Co-located in page's directory as `<slug>/index.md` + siblings; or top-level `static/` | Bundle-scoped copy | Yes |
| Obsidian | Default: vault root. Options: vault root, same-folder-as-note, specified folder, subfolder-of-current | Filesystem-wide (vault scope) | Yes — `Files & Links → Default location for new attachments` |
| Logseq | `assets/` at graph root | Filesystem-wide | Limited |
| Dendron | `<vault>/assets/images/` (via Paste Image extension) | Filesystem-wide | Yes |
| Notion MD export | `assets/` (or per-page subfolder matching page title) inside export zip | Export-time | No |
| GitHub Wiki (web) | Uploaded to a single flat `_assets/` directory returned as raw CDN URL | N/A (stored in wiki git repo) | No (for web uploads) |
| GitHub repo READMEs | No convention — usually `docs/images/`, `.github/`, or per-directory | Rendered by GitHub; any relative path works | User choice |
| VS Code built-in paste (since 1.79) | Same folder as `.md` by default; configurable via `markdown.copyFiles.destination` with variables `${documentBaseName}`, `${documentDirName}`, `${fileName}` | N/A (drop/paste only) | Yes (glob → destination map) |
| VS Code "Paste Image" (mushan) | Same folder with timestamp filename | N/A | Yes |
| Typora | Default: keeps absolute path. Opt-in: "Copy image to folder" + "Use relative path if possible" → writes `typora-copy-images-to:` into YAML frontmatter | N/A | Yes (per-doc frontmatter) |
| iA Writer | Content Blocks syntax referencing relative paths; no enforced convention | N/A | User choice |
| VitePress | Referenced assets detected automatically and copied; `public/` for untracked | **Reference-driven** at build via Vite asset pipeline | Yes |
| Gatsby (gatsby-remark-images) | Relative to markdown file (via `gatsby-source-filesystem`) | **Reference-driven** — walks remark AST for `image` nodes, resolves via parent File node | Yes |

## 2. Sibling vs separate folder vs bundle

- **Sibling/co-located (image next to .md):** Hugo leaf bundles, Zola, Astro content collections (recommended), VS Code default paste, Typora (opt-in), iA Writer, 11ty copy-local-assets, Docusaurus (one of two supported modes). Optimizes for *portability* (move the folder, references travel with it) and *authoring locality* (one directory = one page's world).
- **Bundle directory (`<slug>/index.md` + siblings):** Hugo, Zola, Astro. Same as sibling but forces a directory-per-page. Optimizes for clean URLs + atomic move/delete semantics.
- **Separate assets folder:** Jekyll (`/assets/`), MkDocs Material (`docs/assets/`), Logseq (`assets/`), Dendron (`assets/images/`), Notion export (`assets/`), Obsidian default (vault root, which for flat vaults *is* a central dump). Optimizes for *de-duplication*, *pipeline simplicity* (one CDN prefix), and *image processing* (one bucket to sharpen/resize).
- **Hybrid/configurable:** Obsidian (four modes, user picks), Docusaurus (both), VS Code (glob→dest mapping), Typora (per-document via frontmatter).

## 3. Reference-driven discovery

Yes — several tools treat "asset reachable from markdown" as the inclusion criterion, but **only at build time**, never as a content ownership boundary:

- **11ty HTML-Relative Passthrough** — scans rendered HTML for `[src]`/`[href]` and copies matches from the content tree ([docs](https://www.11ty.dev/docs/copy/)).
- **VitePress/Vite** — any asset imported/referenced from markdown enters the Vite pipeline automatically ([docs](https://vitepress.dev/guide/asset-handling.html)).
- **Gatsby `gatsby-remark-images`** — walks the mdast AST for `image` nodes and resolves paths via `File` node parent chain ([docs](https://www.gatsbyjs.com/plugins/gatsby-remark-images/)).
- **Docusaurus** — markdown image paths are converted to `require()` calls, which Webpack resolves.

**Nobody uses reference-driven as the *content source* criterion.** It's always a build-pipeline concern on top of a globbed source. Reasons (synthesized from issue trackers and plugin designs):

1. **Unreferenced-but-valid assets:** Dropped image that hasn't been linked yet, assets referenced only via JS/templates, images referenced via MDX `<img src={dynamicUrl}/>` or computed paths.
2. **Watch-time vs build-time race:** In a live editor the user drops a file at t=0 and types the reference at t=5s; a reference-driven watcher wouldn't see the asset until t=5s. Unacceptable for a live-collab editor.
3. **Broken-link/stale-reference asymmetry:** A deleted reference shouldn't evict the asset (user may undo). A missing asset referenced in text shouldn't crash anything.
4. **Forward references:** Templates, includes, frontmatter-sourced images, conditional MDX.
5. **External URLs** are non-discoverable by definition — mixed local+remote makes reference-walk a subset.

## 4. Upload-time rename / collision strategies

| Tool | Strategy |
|---|---|
| Obsidian (default) | `Pasted image YYYYMMDDHHMMSS.png` — timestamp, effectively collision-free |
| Obsidian Paste Image Rename plugin | User prompt; auto-suffix `-1`, `-2` for duplicates |
| Obsidian Hash Pasted Image plugin | SHA-512 hash filename (content-addressed) |
| VS Code built-in | `image.png` → `image-1.png`, `image-2.png` on conflict |
| VS Code Paste Image (mushan) | Timestamp default; configurable pattern |
| Typora | Preserves original filename; no collision strategy documented |
| Dendron | Timestamp via Paste Image extension |
| Notion export | Title-slug + hash suffix |
| Hugo/Jekyll/Zola | No upload UX — out of scope |

**Dominant pattern:** timestamp-based filenames for paste (collision-avoiding by construction), numeric-suffix for drop (preserves original name but deconflicts). Content-hash naming is a minority but growing.

## 5. "Attachments folder" config pattern

Obsidian's four-option model (vault root | specified folder | same as current | subfolder of current) is **the de facto pattern** for markdown editors. VS Code's `markdown.copyFiles.destination` glob-to-destination map with `${documentBaseName}` variables is the generalization — more powerful but less discoverable. Typora uses per-document YAML frontmatter (`typora-copy-images-to:`). Logseq/Dendron/Notion hardcode a single folder. The Obsidian four-mode UI is the usability sweet spot cited most often.

## 6. Failure modes of reference-driven include

Collected from GitHub issue trackers and RFC discussions:

1. **Just-dropped, not-yet-referenced asset.** User drops image, then types `![](./foo.png)` 3 seconds later. Reference-driven watcher can't see the asset until the text lands. In a CRDT system this race is *worse* — the write may never land (user closes tab).
2. **Dynamic MDX/JSX sources.** `<img src={someVar}/>` is unresolvable statically.
3. **Template-sourced images.** Layouts that inject `cover.png` from frontmatter — asset must be discoverable before the .md that consumes it is parsed.
4. **External URLs.** `![](https://...)` doesn't contribute to local inclusion but lives in the same syntax — reference-walker must distinguish.
5. **Broken references.** If inclusion requires live reference, deleting a `![](foo.png)` line orphans the asset invisibly. Deletion semantics get ambiguous.
6. **Cross-document references.** Image referenced only in doc A sitting in doc B's folder — whose "include set" does it belong to?
7. **CRDT write races.** Text and file arrive on different channels; race between the WebSocket delta containing the reference and the HTTP upload of the blob.
8. **Garbage collection boundary.** Unreferenced file → is it staged? draft? orphaned? Reference-driven has no answer; sibling-based treats it as "part of the folder."

Gatsby and VitePress sidestep most of this because the graph is rebuilt from scratch on every build — live-editor/CRDT systems don't have that luxury.
