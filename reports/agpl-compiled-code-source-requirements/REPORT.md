---
title: "Can Compiled Code Be Distributed Under AGPL Without Readable Source?"
description: "Whether compiled/minified JavaScript can be distributed under AGPL while keeping source private. Covers GPLv3 'Corresponding Source' requirements, what counts as 'object code' for interpreted languages, the written offer provision, obfuscation strategies, and enforcement precedents. Short answer: no."
createdAt: 2026-04-11
updatedAt: 2026-04-11
subjects:
  - AGPL-3.0
  - GPLv3
  - JavaScript
  - npm
topics:
  - GPL source requirements
  - compiled code licensing
  - open source compliance
---

# Can Compiled Code Be Distributed Under AGPL Without Readable Source?

**Purpose:** Determine whether it's legally viable to distribute compiled/minified npm packages under AGPL while keeping the human-readable source private — getting AGPL's anti-commercialization benefits without source visibility.

---

## Executive Summary

**No.** The answer is unambiguous across every source examined.

AGPL (via GPLv3) defines source code as "the preferred form of the work for making modifications." Minified/bundled JavaScript is explicitly "object code" — "any non-source form of a work." When you distribute object code under AGPL, you **must** make the Corresponding Source available: the original TypeScript files, build scripts, `tsconfig.json`, and everything needed to reproduce the build.

You cannot satisfy this by:
- Distributing only compiled `.js` files (that's distributing object code without source)
- Providing obfuscated/mangled source (rejected since GPLv2 — "preferred form" means your actual development files)
- Pointing to a private authenticated repo (source must be as accessible as the object code)
- Providing a written offer while keeping source semi-private (the offer must extend to ANY third party for 3 years)

**The only legitimate path to compiled distribution without source is a proprietary license** — not AGPL. You can dual-license (AGPL for source-available distribution + proprietary for compiled-only commercial distribution), but the AGPL copy must include readable source.

---

## Detailed Findings

### 1. Minified JavaScript IS "Object Code" Under GPLv3

**Finding:** GPLv3 explicitly classifies minified/obfuscated JS as object code, not source code.

**Evidence:** [evidence/gpl-source-definition.md](evidence/gpl-source-definition.md)

GPLv3 Section 1:
> **"Source code"** means the preferred form of the work for making modifications to it.
> **"Object code"** means any non-source form of a work.

The [Copyleft Guide](https://copyleft.org/guide/comprehensive-gpl-guidech10.html) is explicit: "object code includes not only binaries or executables, but also **obfuscated, minimized, compressed or otherwise non-preferred forms** for modification."

Nobody prefers to edit `var a=function(b,c){return b.split("\n").map(d=>d.trim())}`. The original TypeScript with meaningful names and comments is the "preferred form." The compiled output is object code.

### 2. Corresponding Source = Your Actual Development Files

**Finding:** You must provide the exact files used for development — not reformatted, not concatenated, not stripped of comments.

**Evidence:** [evidence/gpl-source-definition.md](evidence/gpl-source-definition.md)

The [SFLC Compliance Guide](https://softwarefreedom.org/resources/2014/SFLC-Guide_to_GPL_Compliance_2d_ed.html) states source must be "complete and suitable for practical modification." The [gpl-violations.org FAQ](https://gpl-violations.org/faq/sourcecode-faq/) clarifies that source "unsuitable for modification and rebuilding because too heavily obfuscated to be practicably modifiable, would not be 'complete.'"

For a TypeScript npm package, Corresponding Source includes:
- Original `.ts` source files (with comments, formatting, meaningful names)
- `tsconfig.json` and build configuration
- Build scripts (`package.json` scripts, bundler config)
- Any code generation tools or scripts

### 3. Source Must Be As Accessible As the Object Code

**Finding:** You cannot gate source behind authentication if the compiled package is freely downloadable.

**Evidence:** [evidence/gpl-source-definition.md](evidence/gpl-source-definition.md)

GPLv3 Section 6d requires "equivalent access" to Corresponding Source "in the same way through the same place at no further charge." A private GitHub repo requiring account creation does NOT provide "equivalent access" to a freely downloadable npm package.

The practical implication: if you publish an AGPL package to the public npm registry, the source must be on a public git repository or bundled in the npm tarball itself.

### 4. The "Written Offer" Is Not a Privacy Shield

**Finding:** GPLv3 Section 6b allows distributing object code with a written offer to provide source, but the offer extends to ANY third party for 3+ years.

**Evidence:** [evidence/gpl-source-definition.md](evidence/gpl-source-definition.md)

The written offer is not "source on request from our customers" — it's "source on request from anyone." Any competitor, any random person, anyone on the internet can request the source and you must provide it within 3 years of your last distribution.

SFLC recommendation: "Including Corresponding Source with every binary distribution is the easiest option and invariably minimizes potential compliance problems."

### 5. Enforcement Is Real and Getting Stronger

**Finding:** SFC v. Vizio established that GPL source requirements are individually enforceable as contract claims, not just copyright claims.

**Evidence:** [evidence/gpl-source-definition.md](evidence/gpl-source-definition.md)

The [Software Freedom Conservancy v. Vizio](https://sfconservancy.org/copyleft-compliance/vizio.html) case (surviving summary judgment as of 2025) means any individual user who receives your AGPL package could potentially sue for Complete Corresponding Source. This is not theoretical — it's actively being litigated.

### 6. No Creative Workarounds Exist

**Finding:** Every strategy to distribute compiled AGPL code without readable source fails on the license text.

| Strategy | Why it fails |
|----------|-------------|
| Distribute compiled `.js` only | Distributing object code without source = violation |
| Provide minified source as "the source" | Not the "preferred form" = not source = violation |
| Auto-generate ugly-but-functional source | If your repo has clean TS, the clean TS is the "preferred form" |
| Private repo with authentication | Not "equivalent access" per Section 6d |
| Written offer, provide on request only | Must be open to ANY third party, not just customers |
| Compile to WASM | WASM is object code; Corresponding Source still required |
| Ship via npm, source via different URL | Allowed IF the source URL is publicly accessible at no charge |

---

## What This Means for Your Licensing Decision

The research definitively closes the "AGPL with hidden source" path. Your realistic options:

1. **AGPL everything, source fully visible** — Simplest. Source is public. AGPL prevents incorporation. Moat is velocity.

2. **AGPL framework + proprietary engine files (source visible, legally restricted)** — The Twenty/Cal.com model. Source is in the public repo but specific files have proprietary license headers. Competitors can read but cannot legally copy or derive from those files.

3. **AGPL framework + proprietary compiled engine (separate package, proprietary license)** — The three-tier model. Source for the proprietary package is NOT published (legal under proprietary license). Requires linking exception for the AGPL framework.

Option 3 is the only one where source is actually hidden — but the proprietary parts are NOT AGPL. They're proprietary (free to use). You cannot call them AGPL if you don't provide source.

---

## References

### Evidence Files
- [evidence/gpl-source-definition.md](evidence/gpl-source-definition.md) — GPLv3 text analysis, SFLC guide, enforcement precedents

### External Sources
- [GPLv3 full text](https://www.gnu.org/licenses/gpl-3.0.en.html)
- [AGPL-3.0 full text](https://www.gnu.org/licenses/agpl-3.0.html)
- [SFLC GPL Compliance Guide 2nd Ed.](https://softwarefreedom.org/resources/2014/SFLC-Guide_to_GPL_Compliance_2d_ed.html)
- [Copyleft Guide](https://copyleft.org/guide/comprehensive-gpl-guidech10.html)
- [SFC v. Vizio](https://sfconservancy.org/copyleft-compliance/vizio.html)
- [gpl-violations.org FAQ](https://gpl-violations.org/faq/sourcecode-faq/)
- [Kyle Mitchell: Reading AGPL](https://writing.kemitchell.com/2021/01/24/Reading-AGPL)
- [GNU LibreJS guidance](https://www.gnu.org/software/librejs/free-your-javascript.html)

### Related Research
- [../oss-licensing-strategies-open-core/](../oss-licensing-strategies-open-core/) — License selection strategy, 22 company case studies
- [../open-core-split-licensing-engineering/](../open-core-split-licensing-engineering/) — ee/ directory patterns, linking exceptions, npm obfuscation
