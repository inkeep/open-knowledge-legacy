# Evidence: FU2.3 — Grammar-Aware / Structured Mutation for Markdown in JS

**Dimension:** Grammar-aware / tree-structural mutation
**Date:** 2026-04-19
**Sources:** Grammarinator/Nautilus/Domato repos, mdast-util ecosystem, npm, MdPerfFuzz artifact

---

## Key files / pages referenced

- https://github.com/renatahodovan/grammarinator — Python + C++ (no JS target)
- https://github.com/nautilus-fuzz/nautilus — Rust, fuzzes JS engines not JS packages
- https://github.com/uds-se/FormatFuzzer — C++ binary formats only
- https://github.com/googleprojectzero/domato — Python DOM/CSS/JS grammar generator
- https://github.com/ChristianMurphy/mdast-util-arbitrary — fast-check arbitrary for mdast (single author, ~40 weekly dl)
- https://www.npmjs.com/package/mdast-util-arbitrary
- https://github.com/syntax-tree/mdast-util-from-markdown
- https://github.com/syntax-tree/mdast-util-to-markdown — README: roundtrip explicitly NOT lossless
- https://raw.githubusercontent.com/micromark/micromark/main/package.json — `test-fuzz` disabled with comment
- https://github.com/cuhk-seclab/MdPerfFuzz — ASE 2021, DOI 10.1109/ASE51524.2021.9678611
- https://github.com/google/fuzzing/blob/master/docs/structure-aware-fuzzing.md — libFuzzer custom-mutator pattern

---

## Findings

### Finding: micromark's own package.json disables its fuzz test with comment "jazzer is unmaintained, with sec vulns"
**Confidence:** CONFIRMED
**Evidence:** https://raw.githubusercontent.com/micromark/micromark/main/package.json — `packages/micromark/package.json` scripts block:
```
"#": "fuzzer turned off for now as jazzer is unmaintained, with sec vulns",
"#test-fuzz": "..."
```
The comment references **jazzer** (JVM), not **jazzer.js**, indicating micromark previously had a JVM-based Jazzer integration they turned off. No evidence of active JS-native fuzzing in micromark upstream.
**Implications:** Upstream project does not currently fuzz itself. The "ZERO CVEs" finding in the parent report is unrelated to active fuzzing pressure.

### Finding: Grammarinator, Nautilus, FormatFuzzer, Domato — none have a JS implementation; Dharma/Domato could generate markdown corpora offline but do not plug into a CGF feedback loop
**Confidence:** CONFIRMED
**Evidence:**
- Grammarinator docs https://grammarinator.readthedocs.io/en/stable/grammarinator.tool.html — generators emit Python3 or C++; no JS target.
- Nautilus: Rust+Python, used to fuzz JS *engines* (ChakraCore) per NDSS '19 https://www.ndss-symposium.org/ndss-paper/nautilus-fishing-for-deep-bugs-with-grammars/.
- FormatFuzzer: 010 Editor `.bt` binary templates, not text grammars.
- Domato: Python grammar generator, DOM/CSS/JS oriented, not markdown-oriented, not in-loop.
**Implications:** No drop-in "grammar-aware markdown CGF" exists in JS. Any structure-aware approach must either (a) use offline corpus pre-generation, or (b) build custom JS tooling on top of Jazzer.js.

### Finding: Three granularities of markdown mutation differ dramatically in available JS tooling
**Confidence:** CONFIRMED
**Evidence:**

| Level | What gets mutated | JS tooling |
|---|---|---|
| String/bytes | Raw UTF-8 bitflips, havoc | Jazzer.js `FuzzedDataProvider`, fast-check `fc.string()` |
| micromark token stream | `Event[]`/`Token[]` between parse and compile | **NOT FOUND** — no published library. Would require custom code against micromark's `postprocess` internals |
| mdast AST | Parsed tree → mutate → serialize | `mdast-util-from-markdown` + `mdast-util-to-markdown`, plus `mdast-util-arbitrary` for generation (not mutation) |

**Implications:** Token-stream mutation has zero tooling. String-level mutation is what Jazzer.js does by default. mdast-level mutation is theoretically possible but non-lossless roundtrip contaminates results.

### Finding: `mdast-util-to-markdown` explicitly documents roundtrip is NOT lossless
**Confidence:** CONFIRMED
**Evidence:** `mdast-util-to-markdown` README: "there are several cases where that is impossible... complete roundtripping is impossible given that any value could be injected into the tree."
**Implications:** An AST-level fuzzer that does `parse → mutate → serialize → re-parse → compare` will generate false-positive divergences unrelated to real bugs. This forces either (a) oracle changes, or (b) fuzzing at a different granularity.

### Finding: `mdast-util-arbitrary` is the only published JS library providing structured markdown generation via fast-check — but it is a generator, not a mutator, with ~40 weekly downloads
**Confidence:** CONFIRMED
**Evidence:** https://www.npmjs.com/package/mdast-util-arbitrary — `commonmark().Root` builds fast-check arbitraries for mdast trees. Author: ChristianMurphy (individual contributor, not the syntax-tree organization). Weekly-download signal ~40 per unifiedjs.com listing.
**Implications:** This library gives structured markdown generation out of the box for PBT, but does NOT implement coverage-guided mutation. Low-activity signal implies low community investment.

### Finding: MdPerfFuzz (ASE 2021) is the one academic work on markdown-parser fuzzing — but it is C-based (AFL + Superion + PerfFuzz) and targets `cmark`
**Confidence:** CONFIRMED (existence); UNCERTAIN on parser list
**Evidence:** https://github.com/cuhk-seclab/MdPerfFuzz — language breakdown C 52.6% / C++ 40.6% / Python 2.5%. DOI `10.1109/ASE51524.2021.9678611`, ACM https://dl.acm.org/doi/abs/10.1109/ASE51524.2021.9678611. Conference page https://conf.researchr.org/details/ase-2021/ase-2021-papers/8/Understanding-and-Detecting-Performance-Bugs-in-Markdown-Compilers confirms 216 new performance bugs found across markdown compilers. Primary-source PDF at `cse.cuhk.edu.hk` returned ECONNREFUSED during research — could not confirm full parser list. Artifact mirror at https://github.com/peng-hui/ase21-mdperffuzz-artifact.
**Implications:** Precedent exists for markdown fuzzing using grammar-aware CGF (Superion), but the implementation is C-native. Direct JS translation would require re-implementing syntax-tree mutation against mdast/micromark tokens.

### Finding: Jazzer.js has NO `LLVMFuzzerCustomMutator` equivalent — so in-loop custom mutation is not supported natively
**Confidence:** CONFIRMED
**Evidence:** Jazzer.js fuzz-targets docs mention `--customHooks` but these are instrumentation/tracing hooks, not input mutators. libFuzzer's structure-aware-fuzzing doc (https://github.com/google/fuzzing/blob/master/docs/structure-aware-fuzzing.md) describes the custom-mutator pattern but contains no JS guidance. Searched: "Jazzer.js custom mutator", "jazzer.js LLVMFuzzerCustomMutator".
**Implications:** Structure-aware mutation must live *above* Jazzer.js (pre-generate corpus) or in a harness that treats mutated strings as inputs. No in-loop grammar mutation.

---

## Negative searches (for NOT FOUND)

- Searched: "micromark postprocess token mutation library" — no hits.
- Searched: "micromark tokenize API structured fuzzer" — no hits.
- Searched: "LLVMFuzzerCustomMutator JavaScript Node.js" — no JS-specific implementation.
- Searched: "ANTLR grammar JavaScript fuzzer npm" — no hits.
- Searched: "Chen markdown compiler fuzzing 2023 2024" — no paper under that authorship.

---

## Gaps / follow-ups

- The fuzzing-survey.org entry for MdPerfFuzz (https://fuzzing-survey.org/?k=MDPERFFUZZ) corroborates its listing as a greybox fuzzer but does not enumerate the parser test set.
- "AntiPattern" ReDoS paper referenced in scoping — could not verify a DOI under that exact name. Flagged unverified.
