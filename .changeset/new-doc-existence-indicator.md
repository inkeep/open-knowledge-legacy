---
"@inkeep/open-knowledge": patch
---

feat: indicate when an editor doc does not yet exist on disk

- EditorHeader shows a "New file" badge next to the filename when navigating to a non-existent document; disappears after the file is created
- WYSIWYG mode shows contextual placeholder text: "Start writing to create this page…" for new docs, "Start writing…" for empty existing docs
- Source (Markdown) mode shows the same contextual placeholder text via a CodeMirror Compartment
