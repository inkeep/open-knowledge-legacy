---
type: evidence
source: web search + GitHub issue search + community forum search
date: 2026-04-03
confidence: high (absence of evidence is itself evidence when searching broadly)
---

# Prior Art Search: Has Anyone Built MDX + CRDT Collaboration?

## Verdict: NO proven implementation of the full MDX + CRDT chain exists.

Two products claim MDX + real-time collaboration, but neither has published
evidence that the full round-trip (MDX -> Editor -> Yjs -> Editor -> MDX)
works correctly with conflict resolution.

---

## Products Claiming MDX + Collaboration

### Dhub (dhub.dev)

Claims: "Members can edit together in real time" + "natively supports
Docusaurus MDX format."

What is NOT known:
- Whether collaboration uses Yjs/CRDT or OT (operational transform)
- Whether MDX components participate in real-time collaboration or are
  treated as opaque blocks
- Whether MDX round-trip fidelity is maintained during collaborative sessions
- No public source code, no architecture documentation found

Assessment: Dhub may have solved the problem or may have sidestepped it
(e.g., locking MDX components during collaboration, treating them as opaque
code blocks). Without published architecture details, this is unverifiable.

### Holocron (holocron.so)

Claims: "real-time collaboration" + "MDX support" + "CRDTs" + "sync with GitHub"

What IS known:
- They published safe-mdx, an MDX renderer that avoids eval
- MDX code is "editable in an embedded code editor" (i.e., as raw text,
  not as a structured visual editor)

What is NOT known:
- Whether their CRDT operates on the structured MDX AST or on raw text
- Whether component props are collaboratively editable at the prop level
- No published architecture details on their CRDT implementation

Assessment: Likely operating on MDX as RAW TEXT with a plain text CRDT,
not as structured AST nodes. This sidesteps the prop-level merge problem
entirely but provides no visual editing. Their safe-mdx library suggests
they render MDX for preview, not for editing.

---

## OSS Projects Searched

### TinaCMS

- No issues or discussions about CRDT/Yjs/real-time collaboration
- TinaCMS uses its own GraphQL-based sync, not CRDTs
- "Real-time editing" refers to WYSIWYG preview, not multi-user collab
- Their cloud product has "collaborators" but this is role-based access,
  not concurrent editing

### Plate (platejs.org)

- Has Yjs collaboration support via slate-yjs
- Has MDX serialization/deserialization via @platejs/markdown
- BUT: No evidence these two features have been used TOGETHER
- No GitHub issues about MDX + Yjs combined
- No demo or test that exercises both simultaneously
- The markdown plugin docs and the Yjs docs exist independently

This is the closest to our target combination but remains untested
as a combined system.

### Milkdown

- Has collaborative editing via @milkdown/plugin-collaborative (y-prosemirror)
- MDX support is "a major direction" but "far from complete" (per maintainer)
- Discussion #772 shows someone trying remark-mdx + Milkdown and "hitting
  a wall" at the ProseMirror schema definition for MDX JSX elements
- No evidence of MDX + collaboration working together

### slate-yjs (BitPhinix/slate-yjs)

- 50 issues reviewed. No issues mention MDX, JSX, or custom component props
- Discussion #279 discusses "Collaborative Editable Voids" (relevant to MDX
  components) but the discussion is about nested editors, not MDX specifically
- Project is abandoned (last commit July 2023)

### y-prosemirror (yjs/y-prosemirror)

- No issues mention MDX
- Issue #116 (attribute type coercion) is relevant but not MDX-specific
- Issue #48 (doc attrs stripped) is relevant for frontmatter
- No evidence of anyone using y-prosemirror with MDX node types

### mdx-editor (mdx-editor/editor)

- Uses Lexical (not Slate or ProseMirror) as the editor framework
- No Yjs or CRDT support
- No real-time collaboration features
- Most mature visual MDX editor but single-user only

---

## Conference Talks, Blog Posts, Research Papers

Web search for "MDX CRDT collaboration" returns zero relevant results.
Web search for "collaborative MDX editing" returns generic CRDT tutorials
and the Dhub/Holocron marketing pages above.

No academic papers found.
No conference talks found.
No proof-of-concept repositories found.

---

## What This Means

The combination of MDX visual editing + CRDT collaboration is a genuinely
untested seam. The individual pieces exist:

1. MDX -> Slate -> MDX: Plate does this (via @platejs/markdown with remark-mdx)
2. Slate -> Yjs -> Slate: slate-yjs does this
3. MDX -> ProseMirror -> MDX: Milkdown is attempting this (incomplete)
4. ProseMirror -> Yjs -> ProseMirror: y-prosemirror does this

But nobody has published evidence of the full chain working end-to-end.
The Plate project is the closest, having both capabilities in the same
framework, but there is no integration test, demo, or documentation
showing them combined.

This absence is not surprising: it is an extremely niche combination
that only matters if you want BOTH visual MDX editing (not raw text)
AND real-time multi-user collaboration. Most users want one or the other.
