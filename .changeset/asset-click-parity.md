---
'@inkeep/open-knowledge-core': minor
'@inkeep/open-knowledge-server': minor
'@inkeep/open-knowledge-app': minor
'@inkeep/open-knowledge-desktop': minor
---

Asset-click parity closure (2026-04-24b amendment) — four defects closed end-to-end after dogfood surfaced a `.m4v` click flow that fell through to Vite's SPA fallback:

- Serve-side: widen `ASSET_EXTENSIONS` to common user-drop extensions; add `Content-Disposition` dispatch in the Vite plugin's sirv middleware (inline for renderable, attachment for everything else); harden SPA fallback to 404 for asset-extension paths sirv didn't serve.
- Renderer: FR-A5 `wikiLinkEmbed` NodeView (`packages/app/src/editor/extensions/wiki-link-embed.ts`) lands with InteractionLayer registration — drop-time chip clicks now route through `dispatchAssetClick` end-to-end.
- Classifier guard: softened `internal-link.ts` asset-branch guard to catch `sourceForm === 'wikiembed'` + has-extension hrefs regardless of `classifyMarkdownHref` return kind; `resolveAssetProjectPath` accepts leading-slash paths as project-root-relative.
- Security: widen `EXECUTABLE_BLOCKLIST_EXTENSIONS` with macOS installer classes (`.dmg`/`.pkg`/`.scpt`/`.applescript`/`.terminal`/`.prefpane`/`.mpkg`), URL-file classes (`.webloc`/`.inetloc`/`.fileloc`), cross-platform packages (`.jar`/`.appimage`/`.deb`/`.rpm`/`.msix`/`.appx`/`.ipa`/`.apk`), and Windows shortcut classes (`.pif`/`.scr`/`.lnk`/`.url`).

Classifier taxonomy cleanup (moving the asset-ext branch above the leading-slash guard in `classifyMarkdownHref` itself) is deferred to a follow-up PR — see `specs/2026-04-16-editor-asset-and-embed-surface/evidence/classifier-taxonomy-cleanup.md` for the full Option A vs Option B trade-off + Docmost/Obsidian peer-editor comparison.
