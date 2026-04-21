---
name: INV5 — clipboard-mdast-canonical boundary with file drop
description: Confirmation that the new clipboard spec carves out image/file paste to this spec, not vice versa
created: 2026-04-16
sources:
  - specs/2026-04-16-clipboard-mdast-canonical/SPEC.md §3 (Non-goals) + §5 (User journeys)
---

# INV5 — Clipboard ↔ File-Drop Boundary

The `specs/2026-04-16-clipboard-mdast-canonical/SPEC.md` (now shipped per commit `07161e26`) is the canonical text/HTML clipboard pipeline. This asset-and-embed spec is the file-upload paste/drop surface. INV5 verifies the two specs don't collide.

## Clipboard spec NG4 — explicit carveout

Quoting `specs/2026-04-16-clipboard-mdast-canonical/SPEC.md:46`:

> **[NOT NOW] NG4:** Image paste — dedicated handling (binary MIME routing, RTF sibling-data extraction, drag-and-drop image support). — Revisit if: image paste is prioritized; separate spec.

Also: "Mixed paste behavior (prose + inline images in one clipboard): rehype-remark's default handling maps `<img>` → mdast `image` → `![alt](url)` markdown → our PM image node. URLs from source apps (e.g. googleusercontent.com, cid: references) typically 403 or fail to resolve outside their context — user sees broken image placeholder and must re-upload manually. A `rehypeStripInlineImages` opt-in plugin is catalogued in §15 Future Work: Identified."

## Interpretation for this spec

1. **Clipboard spec handles text/HTML paste.** Nothing changes for paste of rich HTML content (Gmail emails, Google Docs pages, AI chat markdown) — clipboard-mdast-canonical's 5-branch dispatcher (WYSIWYG) and 4-branch dispatcher (Source) own that flow.

2. **Clipboard spec does NOT handle file binary paste.** When user pastes a screenshot from OS clipboard (Cmd+V with image in clipboard, not HTML with `<img>` tag), the binary MIME routing is explicitly out of scope for clipboard-mdast-canonical.

3. **This spec's FR-1 (non-image file drop) operates at the `@tiptap/extension-file-handler` level** — which intercepts `paste` events that deliver `File` objects via `clipboardData.files` (binary paste case) AND `drop` events. It does NOT intercept text/HTML paste.

4. **No-conflict zone:** The two pipelines run in parallel with no shared state. FileHandler's `onPaste(editor, files, html)` fires when clipboard has files; clipboard-mdast-canonical's `handleDOMEvents.paste` fires otherwise. Dispatch order is established by TipTap's plugin registration — FileHandler runs first for file-containing pastes.

5. **Mixed paste** (HTML with inline `<img src="data:">` or `<img src="http:">`): clipboard-mdast-canonical's rehype-remark default maps these to `![alt](url)` mdast → PM image nodes with EXTERNAL urls. Those will 403 / not resolve. This spec does NOT in P0 try to re-route these to our upload endpoint. Future Work: a `rehypeFetchAndUploadInlineImages` plugin (future editor-asset-embed extension or separate spec).

## Consequence for this spec

- **No touchpoint with clipboard-mdast-canonical modules.** Do not modify `html-to-mdast.ts`, `mdast-to-html.ts`, WYSIWYG/Source paste handlers.
- **FileHandler-level code only** for file drop + binary paste (screenshot via clipboard).
- Adding FR-1 non-image MIME widening to FileHandler does NOT require any change to clipboard-mdast-canonical.
- **Exception for future consideration (not P0):** if OK becomes the destination for "paste image from web" workflows, a bridge from clipboard-mdast-canonical's rehype pipeline to our upload endpoint becomes Future Work.

## Resolved assumption A7

A7 in SPEC.md §12 ("Clipboard-mdast-canonical does NOT touch file-drop paths (NG4 carveout)") — **CONFIRMED**.
