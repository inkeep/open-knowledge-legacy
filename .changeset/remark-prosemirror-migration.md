---
"@inkeep/open-knowledge-core": minor
"@inkeep/open-knowledge-server": minor
---

feat: replace @tiptap/markdown with unified + remark pipeline

- Swap markdown parsing/serialization from marked + @tiptap/markdown to unified + remark-parse + remark-gfm + remark-frontmatter + remark-mdx + @handlewithcare/remark-prosemirror
- Rename ProseMirror schema nodes to mdast-canonical names: bold→strong, italic→emphasis, horizontalRule→thematicBreak, separate bulletList/orderedList→unified list+listItem
- Add source-form fidelity preservation via position-slice walker (delimiter, fence, bullet marker recovery)
- Add D20 escapeMark for backslash-escape round-trip of structurally-ambiguous characters
- Add R23 autolink/void-HTML guard for remark-mdx coexistence
- Public MarkdownManager.parse()/serialize() API preserved — no consumer changes required
