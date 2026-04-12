# Evidence: Permissive License Source Code Requirements

**Dimension:** Source requirements for MIT, Apache 2.0, BSD, ISC
**Date:** 2026-04-11
**Sources:** License texts (OSI), FOSSA analyses, OSI Open Source Definition

---

## Key sources
- [MIT License - OSI](https://opensource.org/license/mit)
- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [BSD 3-Clause - OSI](https://opensource.org/license/bsd-3-clause)
- [OSI Open Source Definition](https://opensource.org/osd)
- [FOSSA MIT License Analysis](https://fossa.com/blog/open-source-licenses-101-mit-license/)
- [MPL 2.0 Text](https://www.mozilla.org/media/MPL/2.0/index.48a3fe23ed13.txt)

---

## Summary Table

| License | Source distribution required? | Obligations for compiled distribution |
|---------|------------------------------|---------------------------------------|
| **MIT** | **No** | Include copyright + license text |
| **Apache 2.0** | **No** | Include LICENSE + NOTICE files, mark modified files, patent grant automatic |
| **BSD 2/3-Clause** | **No** | Include copyright + conditions + disclaimer in docs |
| **ISC** | **No** | Include copyright + permission notice |
| **MPL 2.0** | **Yes (file-level)** | Must make source of covered files available |

## Findings

### Finding: MIT has ZERO source distribution requirements
**Confidence:** CONFIRMED
**Evidence:** MIT License full text — the word "source" does not appear anywhere.

The ONLY condition: "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software."

You can distribute compiled, minified, or obfuscated .js files with a LICENSE comment or file and be in full compliance.

### Finding: Apache 2.0 has no source requirement but more obligations than MIT
**Confidence:** CONFIRMED
**Evidence:** Apache 2.0 Section 4 explicitly permits distribution "in any medium, with or without modifications, and in Source or Object form."

For Object (compiled) distribution: (a) copy of License, (b) prominent notices on modified files, (c) NOTICE file contents if one exists. Patent grant (Section 3) applies regardless of distribution form.

### Finding: OSD requires source availability from the LICENSE, not from the DISTRIBUTOR
**Confidence:** CONFIRMED
**Evidence:** OSD Criterion 2: "The program must include source code..."

The OSD is criteria a LICENSE must satisfy for OSI certification. MIT meets OSD because it PERMITS source distribution. Individual distributors can still ship compiled-only. The license doesn't PROHIBIT source sharing; it just doesn't REQUIRE it.

### Finding: "MIT compiled-only" is legally valid but reputationally gray
**Confidence:** CONFIRMED

Recipients get all LEGAL rights (use, modify, redistribute) but not PRACTICAL ability to exercise modification rights. Community may perceive as "permissively-licensed freeware" rather than "open source in spirit."
