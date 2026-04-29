# Round-trip byte-for-byte preservation audit

**Status:** Stub — needs research + scoped implementation
**Date:** 2026-04-29
**Scope:** Cross-cutting — applies to every parse-then-serialize path in OK

## The principle

When a file traverses OK's editor pipeline (disk → mdast → ProseMirror → Y.Doc → mdast → disk), the bytes that come out should equal the bytes that went in unless an explicit normalization is desired. Today, several round-trip paths drift in non-trivial ways. This document captures the bug class so a future research+implementation effort can audit it systematically rather than playing whack-a-mole as instances surface.

## Observed instances on `cb-v2-md-foundation` (2026-04-28 → 2026-04-29)

These showed up while preparing PR #310 — they are not new bugs introduced by the PR; they are pre-existing surface that the PR's editor-roundtrip flow re-exposed.

| File | Symptom | Probable mechanism |
|------|---------|-------------------|
| `showcase/03-video.mdx:87` | `<iframe src="https://…">` becomes `src="[https://…](https://…)"` (malformed HTML) | `iframe` not in `LOWERCASE_JSX_CANONICAL_TAGS` → PUA guard angle-bracket-only; remark-gfm autolink-literal claims URL bytes inside attribute string. **Fix documented:** [`reports/cb-v2-iframe-embed-pattern/REPORT.md`](../cb-v2-iframe-embed-pattern/REPORT.md). |
| `THIRD_PARTY_NOTICES.md` | `Homepage: https://...` becomes `Homepage: [https://...](https://...)`; blank lines added before some prose lines | remark-gfm autolink-literal promotes bare URLs to `link` nodes; mdast-util-to-markdown serializes link nodes as `[text](url)` even when text === url. Sometimes acceptable; in generated/canonical files it breaks the drift checker. |
| `PROJECT.md`, `README.md`, `STORIES.md`, `PRECEDENTS.md` | Working tree had 2× to ~36× duplicate-content blocks appended | Class also seen in commit `f63332a9` (`showcase/01-callout.mdx` was committed at 768× duplication of original 93-line content; restored in `11561305`). The duplication-detection guard mentioned for the `01-callout` regression apparently does not cover all entry paths — the `cb-v2-md-foundation` branch reproduced 2× duplication on four large repo docs. |
| `showcase/05-accordion.mdx` | Wiki-link bracket form `[[ ]]` accumulated alongside HTML `<details>` content | Wiki-link insertion via PropPanel test, not a parser bug per se — but illustrates how the editor's write paths can leave residue authors didn't intend. |

## What an audit should cover

1. **Enumerate every round-trip path.** disk→mdast→PM (parse), PM→mdast→disk (serialize), Y.Doc→file watcher write, agent-write API → applyAgentMarkdownWrite, paste pipeline, source-mode toggle. For each, define the byte-for-byte contract and enumerate where it does NOT hold today (existing NG1-NG11 catalogue is a starting point but is not exhaustive of the surface).
2. **Categorize each gap.** Three buckets:
   - **Structural normalization** (e.g., `## H\nP` → `## H\n\nP` per CommonMark §4.4) — accept and document.
   - **GFM autolink-literal promotion** in prose — preserve bare-URL form when `link.url === link.children[0].value`. Fix at the to-markdown extension level (mdast-util-to-markdown's `link` handler is configurable).
   - **Bug** (URL inside attribute string, runaway duplication, mangled JSX children) — fix at the source.
3. **Add fidelity tests for each gap.** I1-I11 cover invariants but not all the concrete corruptions observed above (e.g., the `<iframe src="...">` byte-shape is not asserted in any current PBT — it falls under I1/I4 only as a side effect of the descriptor's existence, which iframe lacks).
4. **Triage the duplication regression.** The class that produced `01-callout.mdx`@72,199-lines and that re-surfaced as 2× on PROJECT/README/STORIES/PRECEDENTS during this PR's working tree is the most dangerous gap — silent data corruption at scale. The guard merged after `f63332a9` (per the deferred US-007 investigation note carried over from the prior session) appears to not cover the docs-files write path.

## Concrete near-term work (drops out of this audit)

- **Iframe canonical descriptor** — implementation per [`reports/cb-v2-iframe-embed-pattern/REPORT.md`](../cb-v2-iframe-embed-pattern/REPORT.md). One-line PUA guard + descriptor + renderer + showcase fix. ~200 LoC.
- **Bare-URL preservation in prose** — switch mdast-util-to-markdown's `link` handler (or post-process the mdast tree) to emit bare URL form when text equals URL. Likely ~30 LoC + a fidelity test that locks in the contract for future regressions. Affects every markdown file with bare URLs in prose; THIRD_PARTY_NOTICES.md drift would self-correct.
- **Duplication regression triage** — per the still-deferred US-007 investigation: find the guard, determine why it didn't fire on the four docs files, harden it. Highest priority of the three.
- **Upload allowlist widening** — implementation per [`reports/cb-v2-upload-mime-widening/REPORT.md`](../cb-v2-upload-mime-widening/REPORT.md). +11 MIMEs across image/video/audio.

## Out of scope

- Storage-layer sanitization changes (NG4 is intentional — sanitization is render-side).
- Dropping GFM extensions wholesale (would lose deliberate features).
- Changes to the existing NG1-NG11 catalogue (those are documented intentional normalizations).

## Why this lives in `reports/` rather than `specs/` or `stories/`

It's pre-research — needs an investigation pass before the SPEC can be written. The investigation will produce: (a) the full enumeration of round-trip paths, (b) the matrix of intentional vs unintentional drift per path, (c) a per-bug fix decision (storage-layer vs render-layer vs serializer-config vs parser-extension). Once that's in hand, the implementation pieces split into separate specs.
