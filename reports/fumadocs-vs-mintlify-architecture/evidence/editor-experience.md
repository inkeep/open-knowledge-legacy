# Evidence: Editor Experience

**Dimension:** Editor Experience
**Date:** 2026-04-02
**Sources:** mintlify.com, fumadocs.dev

---

## Key files / pages referenced

- https://www.mintlify.com/docs/editor — Mintlify web editor overview
- https://www.mintlify.com/blog/improved-web-editor — Editor improvements
- https://ferndesk.com/blog/mintlify-review — Feature review with editor details
- https://fumadocs.dev/docs — Fumadocs development workflow

---

## Findings

### Finding: Mintlify has a full browser-based visual editor with bi-directional Git sync
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/docs/editor, https://ferndesk.com/blog/mintlify-review

Web editor capabilities:
- Dual editing modes: visual WYSIWYG and Markdown source
- Live preview updates in real time — no local build needed
- Drag-and-drop navigation organization
- Built-in media asset management
- Branch-based workflows for feature development
- "/" command menu for component insertion
- AI-powered content generation, rewriting, restructuring
- Multiple users can edit simultaneously via branches
- Shareable preview links for review
- All changes sync automatically with documentation repository
- Publish button deploys immediately

**Implications:** Mintlify solves the "non-technical contributor" problem. Product managers and writers can author without Git knowledge. The visual editor IS the product for many users.

### Finding: Fumadocs is code-only with local dev server preview
**Confidence:** CONFIRMED
**Evidence:** https://fumadocs.dev/docs

Authoring workflow:
- Write MDX files directly in IDE/editor
- `npm run dev` starts local dev server at localhost:3000/docs
- Hot-reload via framework dev server (Next.js/Vite)
- No built-in visual editor
- No web-based editing interface
- No collaborative editing features
- VSCode recommended for MDX authoring with Fumadocs extensions

**Implications:** Pure developer experience. Fast iteration for engineers, but a barrier for non-technical contributors. No WYSIWYG layer.

### Finding: Mintlify's editor commits back to Git, maintaining docs-as-code integrity
**Confidence:** CONFIRMED
**Evidence:** https://www.mintlify.com/blog/improved-web-editor

Bi-directional sync model:
- Web editor changes → Git commits
- Git pushes → reflected in web editor
- Engineering teams work in IDEs and push via Git
- Product managers use browser-based editor
- Both workflows converge on the same Git repository

**Implications:** The bi-directional sync is architecturally significant — it means Git remains the source of truth regardless of authoring surface. This is the key pattern for an agent-native platform.

---

## Gaps / follow-ups

- Mintlify's conflict resolution when web editor and Git push collide is not documented
- Whether Mintlify's visual editor supports all MDX component types or only built-in ones
