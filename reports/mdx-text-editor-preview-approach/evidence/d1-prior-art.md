# Evidence: D1 — Prior Art for MDX Text Editor + Live Preview

**Dimension:** Prior art — who has built "MDX text editor + live preview"?
**Date:** 2026-04-03
**Sources:** MDX.js playground, MDXEditor, Mintlify, Fumadocs, Docusaurus, Vrite, Dhub, HackMD/HedgeDoc, VS Code extensions, Storybook, CodeSandbox/StackBlitz

---

## Key sources referenced

- https://mdxjs.com/playground/ — Official MDX playground
- https://www.mdxblog.io/blog/building-a-live-mdx-playground-with-codemirror-and-nextjs — Tutorial building MDX playground with CodeMirror + Next.js
- https://mdxeditor.dev/ — MDXEditor WYSIWYG React component
- https://www.npmjs.com/package/@mdxeditor/source-preview-plugin — Source/preview split pane plugin for MDXEditor
- https://www.mintlify.com/docs/editor — Mintlify web editor docs
- https://vrite.io/blog/wysiwyg-for-mdx-introducing-vrite-s-hybrid-editor/ — Vrite hybrid MDX editor
- https://dhub.dev/ — Dhub git-based CMS
- https://marketplace.visualstudio.com/items?itemName=xyc.vscode-mdx-preview — VS Code MDX Preview extension
- https://marketplace.visualstudio.com/items?itemName=unifiedjs.vscode-mdx — Official VS Code MDX extension
- https://github.com/mileskies/Docusaurus-MDX-VSCode-Previewer — Docusaurus MDX VS Code Previewer
- https://storybook.js.org/docs/writing-docs/mdx — Storybook MDX docs
- https://hackmd.io — HackMD collaborative markdown editor
- https://hedgedoc.org/ — HedgeDoc open-source collaborative markdown

---

## Findings

### Finding: The MDX.js Playground is the canonical "text editor + live preview" for MDX
**Confidence:** CONFIRMED
**Evidence:** https://mdxjs.com/playground/, https://github.com/mdx-js/mdx/blob/main/docs/playground.mdx

The official MDX playground at mdxjs.com/playground uses CodeMirror as the text editor and `evaluate()` from @mdx-js/mdx to compile and render MDX in the browser in real-time. Users can see the rendered result, generated JavaScript code, and intermediary ASTs. The editor component is mounted client-side into a `<div id="js-editor" />` container. The playground demonstrates the full pattern: text editing on the left, rendered preview on the right.

Known issue: GitHub issue #1791 reports the CodeMirror instance "crashes sporadically when typing or backspacing." This is a stability concern for production use.

### Finding: A complete tutorial exists for building MDX playground with CodeMirror + Next.js
**Confidence:** CONFIRMED
**Evidence:** https://www.mdxblog.io/blog/building-a-live-mdx-playground-with-codemirror-and-nextjs

Packages used: @uiw/react-codemirror (React wrapper), @codemirror/lang-markdown (syntax), @replit/codemirror-vim (keybindings), @mdx-js/mdx (compilation), remark-gfm (GFM tables/task lists). The compilation pipeline uses evaluate() with React runtime, debounced to avoid per-keystroke compilation. Custom renderers are passed through useMDXComponents(). The editor lives in a client component because CodeMirror and MDX compilation are browser-only. Stated limitations: cannot import modules from local files in browser compilation mode.

### Finding: MDXEditor has a source-preview-plugin for split-pane editing
**Confidence:** CONFIRMED
**Evidence:** https://www.npmjs.com/package/@mdxeditor/source-preview-plugin

The @mdxeditor/source-preview-plugin wraps MDXEditor (WYSIWYG) with a source code editor that can be toggled alongside the rich-text WYSIWYG view. Users can switch between rich-text editing and viewing/editing raw markdown source. The plugin accepts a custom SourceEditor component (e.g., Monaco Editor) and supports viewMode parameter for initial view ('rich-text' or 'source'). This is a hybrid approach: WYSIWYG + source toggle, not a pure text editor + preview.

### Finding: Mintlify's web editor supports visual + Markdown modes but not a pure text editor
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/editor, https://www.mintlify.com/blog/introducing-web-editor

Mintlify's web editor is described as "inspired by editors like VS Code" and supports switching between visual and Markdown editing modes. Visual mode is WYSIWYG with live preview. AI suggests syntax fixes for MDX errors. The editor connects to Git repository through GitHub App or GitLab integration. Changes commit directly to git. It includes /snippet command for inserting reusable snippets. This is more a "Notion-like editor with markdown fallback" than a "CodeMirror text editor with preview panel."

### Finding: Fumadocs and Docusaurus are code-only with dev server preview
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.dev/docs/mdx/performance, https://docusaurus.io/docs/markdown-features

Fumadocs: Code-only editing via IDE + dev server preview at localhost:3000. No built-in web editor, no visual editing surface. The editing experience is: edit MDX files in VS Code, run `npm run dev`, see changes via hot module replacement (HMR). Fumadocs focuses on build-time MDX performance optimization (on-demand compilation rather than pre-compiling all files).

Docusaurus: Same pattern — edit MDX in IDE, preview via dev server HMR. Has @docusaurus/theme-live-codeblock for interactive code blocks in docs (using react-live), but this is for rendering interactive code examples in documentation, not for editing the MDX document itself.

### Finding: Vrite is a hybrid editor with Element blocks for MDX components
**Confidence:** CONFIRMED
**Evidence:** https://vrite.io/blog/wysiwyg-for-mdx-introducing-vrite-s-hybrid-editor/

Vrite v0.3 adds an "Element" block type for JSX-like syntax within ProseMirror/TipTap WYSIWYG editor. Users edit Element blocks by clicking the opening tag (syntax highlighting appears). Content stored as ProseMirror JSON internally; MDX transformer (remote, via batched POST requests) handles conversion. Limitations: cannot process non-JSON-parseable props (e.g., JSX elements as props), only block-level elements (no inline), Git sync may not work with heavily customized MDX. This is NOT a text editor + preview; it's a WYSIWYG with custom blocks for JSX.

### Finding: HackMD/HedgeDoc implement the classic split-pane markdown pattern with CodeMirror
**Confidence:** CONFIRMED
**Evidence:** https://hackmd.io, https://hedgedoc.org/, https://github.com/hackmdio/codimd

HackMD/HedgeDoc: Classic dual-pane markdown editor — edit raw markdown on the left, rendered preview on the right. Uses CodeMirror as the editor. Socket.IO for real-time collaboration. This is the prior art pattern that a MDX text editor + preview would follow, extended to support JSX components. HedgeDoc is open-source (Node.js backend, CodeMirror frontend, Socket.IO for sync). Does NOT support MDX — only standard markdown.

### Finding: VS Code has MDX preview extensions but they are limited
**Confidence:** CONFIRMED
**Evidence:** https://marketplace.visualstudio.com/items?itemName=xyc.vscode-mdx-preview, https://github.com/microsoft/vscode/issues/205448

MDX Preview extension (xyc.vscode-mdx-preview): Provides side-by-side preview for MDX files in VS Code. Includes built-in dependencies for React rendering. Supports importing other .md/.mdx files. Custom layout config possible. Error overlay for runtime errors. However: VS Code's built-in markdown preview does NOT support MDX (issue #205448 filed requesting it). The Docusaurus MDX VSCode Previewer (mileskies) provides real-time preview for Docusaurus MDX files specifically. The official unified MDX VS Code extension provides syntax highlighting and IntelliSense but NOT preview.

### Finding: Storybook uses MDX for documentation with live component rendering
**Confidence:** CONFIRMED
**Evidence:** https://storybook.js.org/docs/writing-docs/mdx

Storybook Docs addon supports MDX for writing long-form documentation with embedded interactive stories. The live preview is Storybook's component rendering canvas. A storybook-addon-code-editor exists that uses Monaco Editor for live editing of React components with real-time preview. However, this is for editing React component code within Storybook, not for general MDX document editing.

### Finding: Dhub is a git-based CMS with WYSIWYG for MDX, not text+preview
**Confidence:** CONFIRMED
**Evidence:** https://dhub.dev/, https://dhub.dev/blog/dhub-visual-editor-docusaurus-content

Dhub provides a "Notion-like Markdown editor" with two-way GitHub sync. WYSIWYG editing (Google Docs-like), not split-pane text + preview. Supports MDX components via slash menu. Targets non-technical content editors. Uses Docusaurus for rendering. This is WYSIWYG, not the text editor + preview pattern.

---

## Summary: Prior Art Landscape

| Tool | Pattern | MDX Support | Collaboration |
|------|---------|-------------|---------------|
| MDX.js Playground | Text editor + live preview | Full MDX | None |
| mdxblog tutorial | Text editor + live preview | Full MDX | None |
| MDXEditor + source-preview-plugin | WYSIWYG + source toggle | Full MDX | None |
| Mintlify web editor | WYSIWYG + markdown mode | Full MDX | Git-based |
| Fumadocs | IDE + dev server HMR | Full MDX | Git-based |
| Docusaurus | IDE + dev server HMR | Full MDX | Git-based |
| Vrite | WYSIWYG + element blocks | Partial MDX | Real-time |
| HackMD/HedgeDoc | Text editor + live preview | Markdown only | Real-time (Socket.IO) |
| VS Code extensions | Text editor + preview panel | Full MDX (limited) | None |
| Storybook | MDX + component canvas | MDX for docs | None |
| Dhub | WYSIWYG | Full MDX | Git-based |

**Key insight:** The text editor + live preview pattern for MDX exists primarily in playground/demo form (MDX.js playground, mdxblog tutorial). No production-grade, collaborative MDX text editor with live preview has been built. HackMD/HedgeDoc prove the pattern at scale for markdown (with collaboration), but nobody has extended it to MDX with component rendering.

---

## Gaps / follow-ups

* The MDX.js playground source code was not fully accessible — the editor component file path has changed. A direct code review of the implementation would strengthen findings.
* No evidence found of CodeSandbox/StackBlitz having MDX-specific editing + preview modes (they support MDX files but through their general file editing experience).
