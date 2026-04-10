# Evidence: Academic Research on CRDT Branching

**Dimension:** Research papers and prototypes combining CRDTs with branching/version control
**Date:** 2026-04-02
**Sources:** Ink & Switch (inkandswitch.com), Martin Kleppmann publications, EuroSys 2025, ArXiv

---

## Key files / pages referenced

- https://www.inkandswitch.com/upwelling/ -- Upwelling: drafts as CRDT branches
- https://www.inkandswitch.com/patchwork/notebook/ -- Patchwork: universal version control
- https://www.inkandswitch.com/patchwork/notebook/2024-version-control/06/ -- Simple branching
- https://arxiv.org/abs/2409.14252 -- Eg-walker paper (EuroSys 2025)
- https://martin.kleppmann.com/2022/03/28/rainbowfs-workshop.html -- Automerge meets version control
- https://www.inkandswitch.com/peritext/ -- Peritext: rich-text CRDT
- https://martin.kleppmann.com/papers/local-first.pdf -- Local-first software paper

---

## Findings

### Finding: Upwelling (Ink & Switch) is the closest prior art -- drafts as isolated CRDT branches in a collaborative editor
**Confidence:** CONFIRMED
**Evidence:** https://www.inkandswitch.com/upwelling/

Upwelling is a research prototype that directly implements "CRDT branching for collaborative writing":

**Architecture:**
- Built on Automerge (experimental fork with rich text + attribution)
- ProseMirror as the text editor
- TypeScript + React frontend, Node.js server

**Draft isolation model:**
- Drafts function as independent, unmerged layers
- "Drafts are independent from each other: edits made in one draft do not appear in other drafts"
- Users switch between drafts via a dropdown menu
- Each draft shows divergence count (similar to GitHub's added/removed lines)

**Merge mechanism:**
- "When a draft is merged onto the stack, the CRDT is used to incorporate the edits"
- All other active drafts "float" on top and are automatically rebased
- Within a single draft, changes are real-time collaborative
- Between drafts, collaboration is asynchronous (merge on demand)

**Conflict handling:**
- Syntactic conflicts produce interleaved text (e.g., "frostysoft" from "frosty" + "soft")
- Human review always required for merged results

**Key limitation:** Built on experimental Automerge fork, not available as a production library.

**Implications:** Upwelling validates the concept of CRDT branches in a collaborative editor. It uses a single Automerge document with metadata layers to track which edits belong to which draft -- NOT separate documents per branch. This is architecturally different from the "separate Y.Doc per branch" approach.

### Finding: Patchwork (Ink & Switch 2024) implements retroactive branching on Automerge CRDTs
**Confidence:** CONFIRMED
**Evidence:** https://www.inkandswitch.com/patchwork/notebook/

Patchwork explores version control for writing using Automerge:

**Branching model:**
- Fast, low-ceremony branch creation
- Retroactive branch creation: select past edits and move them to a new branch
- Branches can only fork from main and merge back to main (no branch-from-branch)
- Branch picker in the UI for switching

**Technical foundation:**
- Automerge's `clone()` + `merge()` provides the branching primitive
- "Automerge supports cloning documents and then merging them back together in reasonable ways using the CRDT algorithm"

**UX insights:**
- Side-by-side diff viewing
- Hover previews showing what changes would move to the branch
- Branch deletion on merge (like GitHub's "delete branch after merge")

**Key limitation:** Research prototype, not production software. Limited technical documentation of internals.

### Finding: Eg-walker (EuroSys 2025) proves efficient CRDT branch merging is possible
**Confidence:** CONFIRMED
**Evidence:** https://arxiv.org/abs/2409.14252

Eg-walker (Joseph Gentle + Martin Kleppmann) is an algorithm, not a product:

- "Compared to existing CRDTs, Eg-walker consumes an order of magnitude less memory"
- "Compared to OT, merging long-running branches is orders of magnitude faster"
- Core innovation: only replay divergent history between versions, not full CRDT state
- "Temporarily builds a CRDT structure, rearranges multiple divergent branches into a linear order, and after resolution completes, discards the internal CRDT, freeing memory"
- Loro uses eg-walker-inspired techniques for its merge implementation

**Implications:** The theoretical foundation for efficient CRDT branch merging exists. Loro is the primary implementation. This makes CRDT-level branch merge viable (vs. the "Yjs interleaves text" problem).

### Finding: Kleppmann explicitly identified CRDT branching as an open research problem
**Confidence:** CONFIRMED
**Evidence:** martin.kleppmann.com, local-first software paper

From the local-first software paper (2019) and subsequent talks:

> "Most CRDT research operates in a model where all collaborators immediately apply their edits to a single version of a document. However, practical local-first applications require more flexibility: users must have the freedom to reject edits made by another collaborator, or to make private changes to a version of the document that is not shared with others."

> "These concepts are well understood in the distributed source control world as 'branches,' 'forks,' 'rebasing,' and so on. There is little work to date on understanding the algorithms and programming models for collaboration in situations where multiple document versions and branches exist side-by-side."

From the 2022 RainbowFS workshop talk ("Automerge: CRDTs meet version control"):
- Proposed bringing git-like version control concepts to CRDTs
- Vision: offline editing naturally creates branches, merge on reconnect

**Implications:** As of 2022, CRDT branching was identified as a frontier. By 2025-2026, Loro and research prototypes (Upwelling, Patchwork) have made progress, but no production-grade system combines all pieces.

---

## Gaps / follow-ups

- Peritext (rich-text CRDT for async collaboration) -- could complement branching model
- No evidence of anyone combining Upwelling/Patchwork-style branching with a production editor
