# Evidence: D5 — Content-format fidelity and git-compat

**Dimension:** D5 (P1 Moderate)
**Date:** 2026-04-11
**Sources:** AFFiNE docs, BlockSuite docs, BlockSuite issues, BlockSuite source

---

## Key sources

- [AFFiNE docs: Transformer & Adapter](https://docs.affine.pro/blocksuite-wip/store/transformer-and-adapter) — explicit data-loss language
- [BlockSuite docs: Adapter guide](https://blocksuite.io/guide/adapter.html) — mirrors the same language
- BlockSuite issues surfacing live adapter bugs:
  - [#6043 Broken formatting when exporting as markdown](https://github.com/toeverything/blocksuite/issues/6043)
  - [#2854 Empty content in exported file](https://github.com/toeverything/blocksuite/issues/2854)
  - [#6291 Markdown content export/import](https://github.com/toeverything/blocksuite/issues/6291)
  - [#8486 Images are not loading after importing from Notion](https://github.com/toeverything/blocksuite/issues/8486)
  - [#2872 Advanced import format support in Notion and Markdown](https://github.com/toeverything/blocksuite/issues/2872)

---

## Findings

### Finding: Adapter documentation explicitly warns of data loss

**Confidence:** CONFIRMED (verbatim docs quote)
**Evidence:** docs.affine.pro and blocksuite.io both carry the same language:

> "Unlike transformers, adapters may result in data loss during the conversion process, as the target format might not support all the structures present in the original data. For example, background colors cannot be represented in a plain text editor like VS Code."

**Implication:** The landscape report's claim is verified: AFFiNE officially documents that markdown/plaintext adapters are lossy. This is an *intentional, by-design* acknowledgment, not a bug. It's architecturally honest but strategically disadvantageous for any agent-workflow that depends on markdown as the ground-truth substrate — you cannot round-trip AFFiNE → markdown → AFFiNE without losing information.

---

### Finding: Round-trip fidelity is worse in practice than the documented "format mismatch" warning suggests

**Confidence:** CONFIRMED
**Evidence:** User-reported issues in BlockSuite's tracker — current state per GitHub API (2026-04-11):
- #6043: "Broken formatting when exporting as markdown" — **closed** (resolution not re-verified; closure date not captured)
- #2854: "Empty content in exported file" — **closed** (from 2023; historical)
- #6291: "Markdown content export/import" — **open**, ongoing work, not feature-complete
- #2872: "Advanced import format support in Notion and Markdown [tasklist]" — **open**

**Implication:** Beyond the documented lossy conversions (colors, specific blocks), there are *active bugs* in the export path (#6291, #2872 open). Historical closed issues (#6043, #2854) signal that fidelity bugs have been a recurring maintenance burden, though specific closures may represent fixes. Practical workflows for "edit in AFFiNE, commit to git as markdown" remain unreliable today per the open issues, not just theoretically lossy. (A targeted verification of whether #6043's closure represents a real fix would sharpen this finding; not performed in this pass.)

---

### Finding: CRDT binary remains canonical; no markdown-as-canonical mode

**Confidence:** CONFIRMED
**Evidence:** docs.affine.pro/blocksuite-wip/store/transformer-and-adapter still describes CRDT snapshots as canonical and adapters as secondary conversion layers. No 2026 docs announce a markdown-canonical mode. Release notes v0.26.0–v0.26.3 do not mention markdown storage/format changes.

**Implication:** AFFiNE's format philosophy has not shifted. The open-knowledge bet (markdown canonical + CRDT overlay for live collab) remains architecturally distinct from AFFiNE's (CRDT canonical + markdown export as accommodation). The two are not converging.

---

### Finding: Notion adapter shares the same impedance-mismatch pattern

**Confidence:** CONFIRMED
**Evidence:**
- #8486: Images break after Notion import (blob reference issue)
- #2872: Advanced format-support backlog for both Notion and Markdown adapters

**Implication:** The fidelity problem is systemic to the CRDT-binary-canonical approach, not specific to markdown. Any external format adapter faces the same lossy-translation constraint. This reinforces the D4 finding that AFFiNE cannot credibly serve "teach agents our format" — the formats are multiple and all are secondary exports.

---

### Finding: Git workflow on AFFiNE content is infeasible today

**Confidence:** INFERRED
**Evidence:**
- CRDT binary snapshots are the persistent format; these don't human-diff.
- Markdown export is documented-lossy + live-buggy (see above).
- No tooling documented for "git-native AFFiNE workspace" or "CRDT-to-markdown round-trip for version control."

**Implication:** You cannot treat an AFFiNE workspace like a git repo. For the agent-workflow thesis — where agents edit content on branches that humans review and merge — this is a structural disqualifier. Mintlify is the only competitor with git-native content (per the landscape report). Obsidian is git-compatible via plugin. AFFiNE is neither.

---

## Strategic assessment for the reader

- **The markdown-canonical bet is the right one** if the target workflow is agent-accessible, git-diffable, portable content. AFFiNE's CRDT-binary-canonical choice is excellent for rich collaborative editing but poor for every other use case.
- **AFFiNE won't close this gap** without abandoning their architecture. The trade-off is deep in BlockSuite's foundations (Yjs binary as truth, adapters as translation). This is a structural, not tactical, divergence.
- **Decision trigger:** If AFFiNE ever announces a markdown-canonical mode (unlikely — would require re-architecting persistence), this assessment flips. No signal of such plans as of 2026-04-11.

---

## Gaps / follow-ups

- A hands-on fidelity benchmark (write AFFiNE page → export → re-import → diff) would quantify data loss but was out of scope for this research.
- Notion adapter's full fidelity story worth a targeted follow-up if the cross-platform migration angle matters.
