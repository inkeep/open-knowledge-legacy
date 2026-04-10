# Evidence: Prior Art Landscape (D1)

**Dimension:** Who uses the compiled truth + timeline pattern?
**Date:** 2026-04-07
**Sources:** GBrain gist, ByteRover paper (arXiv:2604.01599), Karpathy llm-wiki gist, intelligence analysis literature, Zettelkasten sources, Wikipedia policies, agent memory systems survey

---

## Key systems referenced

- GBrain (Garry Tan) — https://gist.github.com/garrytan/49c88e83cf8d7ae95e087426368809cb
- ByteRover — https://arxiv.org/abs/2604.01599
- Karpathy llm-wiki — https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- NIE/PDB/ICD 203 — intelligence analysis tradecraft
- Zettelkasten (Luhmann) — zettelkasten.de/introduction/
- Wikipedia — article/talk/history three-zone model
- Letta/MemGPT — core/recall/archival memory
- Mem0 — ADD/UPDATE/DELETE/NOOP consolidation
- A-MEM (NeurIPS 2025) — retroactive recompilation
- Claude Code — MEMORY.md + topic files (no evidence layer)
- AWS AgentCore — session events → memory records pipeline

---

## Findings

### Finding: Six independent systems converge on the same structural pattern
**Confidence:** CONFIRMED
**Evidence:** GBrain, Karpathy llm-wiki, ByteRover, NIEs, Wikipedia, Zettelkasten all independently implement a two-zone architecture: rewritable current assessment + append-only evidence base. The naming differs but the structure is isomorphic.

| System | Compiled Zone | Evidence Zone | Separator |
|--------|--------------|---------------|-----------|
| GBrain | `compiled_truth` column / above `---` | `timeline` column / below `---` | Horizontal rule |
| Karpathy | `wiki/` directory | `raw/` directory + `log.md` | Directory boundary |
| ByteRover | Narrative (V_i) section | Raw Concept (C_i) section | Section headers |
| NIE | Key Judgments | Body + appendices | Document structure |
| Wikipedia | Article text | Talk page + edit history | Separate pages |
| Zettelkasten | Permanent notes (Slip-Box 1) | Literature notes (Slip-Box 2) | Separate physical boxes |

### Finding: Agent memory systems mostly discard evidence
**Confidence:** CONFIRMED
**Evidence:** Of 10 agent memory systems surveyed, only 4 maintain meaningful evidence alongside compiled truth: Letta (recall memory), Karpathy llm-wiki (raw/), A-MEM (raw content alongside metadata), Devin DeepWiki (source links). The rest (Claude Code MEMORY.md, Cursor rules, Mem0, LangGraph/LangMem) discard raw evidence after extraction.

### Finding: The intelligence community has the deepest formalization
**Confidence:** CONFIRMED
**Evidence:** ICD 203 codifies the exact semantic contract between compiled assessments and their evidence base: confidence levels (High/Moderate/Low), standardized probability language, source summary statements, explicit separation of intelligence/assumptions/judgments. The NIE process has been refined over 75+ years.

---

## Gaps / follow-ups

- No survey of how journaling/note-taking apps (Roam, Logseq) handle this split
- Limited data on how the pattern works at scale (>10K entries)
