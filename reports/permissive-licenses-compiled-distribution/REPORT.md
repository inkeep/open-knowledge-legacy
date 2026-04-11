---
title: "Permissive Licenses and Compiled-Only Distribution: Can MIT/Apache npm Packages Ship Without Source?"
description: "Whether MIT, Apache 2.0, BSD, and ISC licenses allow distributing compiled/minified npm packages without providing readable source code. Short answer: yes — permissive licenses have zero source distribution requirements. This opens a simpler architecture for open-core split licensing than proprietary modules or AGPL + linking exceptions."
createdAt: 2026-04-11
updatedAt: 2026-04-11
subjects:
  - MIT License
  - Apache 2.0
  - BSD
  - ISC
  - MPL 2.0
  - npm
topics:
  - permissive licensing
  - compiled distribution
  - source requirements
---

# Permissive Licenses and Compiled-Only Distribution

**Purpose:** Determine whether permissive OSS licenses allow distributing compiled npm packages without source — and whether this opens a simpler architecture than proprietary modules for the engine tier of an open-core product.

---

## Executive Summary

**Yes. MIT and Apache 2.0 have zero source code distribution requirements.** You can legally publish an npm package containing only compiled/minified JavaScript, include the LICENSE file, and be in full compliance. No source repo, no source maps, no readable code required.

This is confirmed by the license texts themselves — the word "source" does not appear anywhere in the MIT License. Apache 2.0 Section 4 explicitly permits distribution "in Source or Object form" with no obligation to provide Source when distributing Object.

**Key Findings:**

- **MIT requires only two things:** include the copyright notice and include the license text. That's it. Full stop.
- **Apache 2.0 requires:** LICENSE file, NOTICE file (if applicable), modification notices. No source. Plus an automatic patent grant — a meaningful bonus over MIT.
- **BSD and ISC** are identical to MIT in practice — no source requirements.
- **MPL 2.0 is the exception** — it requires source availability for covered files (file-level copyleft).
- **The OSI Open Source Definition requires source availability from the LICENSE, not from each distributor.** MIT is OSI-approved because it PERMITS source sharing, not because it REQUIRES it.
- **Community perception:** "MIT-licensed but no source published" is legally sound but may be perceived as "permissively-licensed freeware" rather than "open source in spirit." The legal rights exist; the practical ability to exercise them is limited.

**This opens a dramatically simpler architecture for Open Knowledge:**

```
AGPL framework (source visible)     +    Apache 2.0 engine (compiled-only)
├── Anti-commercialization                ├── No source distribution required
├── Community credibility                 ├── Patent grant included
├── Full source on GitHub                 ├── OSI-approved license
└── Copyleft for modifications            └── Compiled JS + .d.ts types only
```

No proprietary licenses. No linking exceptions. No fallback implementations. Both tiers use OSI-approved licenses.

---

## Detailed Findings

### 1. License Source Requirements: The Complete Picture

**Evidence:** [evidence/permissive-source-requirements.md](evidence/permissive-source-requirements.md)

| License | Source required? | What you MUST include | Patent grant? |
|---------|-----------------|----------------------|--------------|
| **MIT** | No | Copyright + license text | No (implied only) |
| **Apache 2.0** | No | LICENSE + NOTICE + modification marks | **Yes** (explicit) |
| **BSD 2/3** | No | Copyright + conditions + disclaimer | No |
| **ISC** | No | Copyright + permission notice | No |
| **MPL 2.0** | **Yes** (file-level) | Source of covered files | No |
| **LGPL 2.1/3** | **Yes** (library) | Source + allow relinking | Varies |
| **GPL/AGPL** | **Yes** (full) | Complete Corresponding Source | Yes (v3) |

### 2. What a Compiled-Only Apache 2.0 npm Package Looks Like

A fully compliant Apache 2.0 npm package with NO source:

```
@inkeep/ok-engine/
├── dist/
│   ├── index.js          ← compiled, minified (terser)
│   └── index.d.ts        ← TypeScript type declarations
├── LICENSE               ← Apache 2.0 full text
├── NOTICE                ← "Open Knowledge Engine, Copyright 2026 Inkeep Inc."
└── package.json          ← "license": "Apache-2.0"
```

**What's NOT required:**
- No `src/` directory
- No `.ts` source files
- No source maps
- No link to a source repository
- No "written offer" for source
- No README explaining how to get source

**Apache 2.0 Section 4 (Redistribution):** Permits distribution "in any medium, with or without modifications, and in Source or **Object** form" — compiled JS is explicitly "Object form."

### 3. Why Apache 2.0 Over MIT for the Engine

| Factor | MIT | Apache 2.0 |
|--------|-----|-----------|
| Source requirement | None | None |
| Patent grant | Implied (untested) | **Explicit** (Section 3) |
| Patent retaliation | None | **Yes** — terminates if licensee sues |
| NOTICE file | Not required | Required if exists |
| Modification marking | Not required | Required |
| GPL/AGPL compatible | Yes | Yes (one-way: Apache → GPL) |

The patent grant is the decisive advantage. For infrastructure software (CRDT engine, collaboration server), explicit patent protection is valuable. The retaliation clause deters patent trolling against the project ecosystem.

### 4. The OSI "Open Source" Label

The [OSI Open Source Definition](https://opensource.org/osd) Criterion 2 states: "The program must include source code." But this is a requirement for the **license** to qualify as OSI-approved — not a requirement for **each distribution** to include source.

MIT qualifies because it **permits** source distribution. An individual distributor choosing to ship compiled-only is exercising their rights under the license, not violating it.

**Can you call it "open source"?** Technically yes (OSI-approved license). Practically, the community draws a distinction between "open source" (source available) and "permissively-licensed" (rights granted, source may or may not be available). Being honest about this avoids backlash.

### 5. The Simplified Architecture This Enables

**Previous approach (proprietary engine):**
- AGPL framework + proprietary engine + linking exception
- Requires: custom license text, Section 7 exception, fallback implementations, split build pipeline
- Community perception: "open core with proprietary modules"

**New approach (Apache 2.0 engine):**
- AGPL framework + Apache 2.0 engine (compiled-only)
- Requires: LICENSE + NOTICE in npm package, that's it
- Community perception: "open core, both tiers OSI-licensed"

| Aspect | Proprietary Engine | Apache 2.0 Engine |
|--------|-------------------|------------------|
| License text | Custom proprietary | Standard Apache 2.0 |
| Linking exception needed | Yes (Section 7) | **No** (Apache is GPL-compatible) |
| Fallback implementations | Yes (AGPL coherence) | **Optional** (nice for forks, not legally required) |
| Build pipeline | Separate compiled + obfuscated | Same (compiled-only is the default) |
| Community perception | "Proprietary module" | "Apache-licensed module" |
| Patent grant | None | **Yes** |
| Source distribution | Not required (proprietary) | Not required (Apache doesn't mandate it) |
| Can competitors use the compiled code? | Depends on proprietary terms | Yes — Apache permits use/modify/redistribute |

**The trade-off:** Under Apache 2.0, competitors who obtain the compiled npm package CAN legally reverse-engineer and redistribute it. Under a proprietary license, they cannot. But reverse-engineering minified JS is practically difficult (as established in the npm obfuscation report), and the AGPL framework prevents incorporating any of it into a non-AGPL product.

---

## Limitations & Open Questions

- **Community perception of "Apache 2.0 but no source"** — No specific HN/Reddit threads found discussing this exact pattern. The community reaction is inferred from general discussions about source-available vs. open-source.
- **Whether AGPL's "Corresponding Source" includes the Apache engine** — If the AGPL framework "specifically requires" the engine, users could argue the engine source is part of Corresponding Source. Mitigated by degraded-mode fallbacks.

---

## References

### Evidence Files
- [evidence/permissive-source-requirements.md](evidence/permissive-source-requirements.md)

### External Sources
- [MIT License - OSI](https://opensource.org/license/mit)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [BSD 3-Clause - OSI](https://opensource.org/license/bsd-3-clause)
- [OSI Open Source Definition](https://opensource.org/osd)
- [FOSSA MIT License Analysis](https://fossa.com/blog/open-source-licenses-101-mit-license/)
- [MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)

### Related Research
- [../agpl-compiled-code-source-requirements/](../agpl-compiled-code-source-requirements/) — Why AGPL cannot be used for compiled-only distribution
- [../open-core-split-licensing-engineering/](../open-core-split-licensing-engineering/) — ee/ patterns, linking exceptions, npm obfuscation
- [../oss-licensing-strategies-open-core/](../oss-licensing-strategies-open-core/) — License selection strategy, 22 company case studies
