# Evidence: GPL/AGPL Source Code Requirements for Compiled JavaScript

**Dimension:** GPL Source Definition + JavaScript Specifics
**Date:** 2026-04-11
**Sources:** GPLv3 text, FSF FAQ, SFLC Compliance Guide, legal analyses

---

## Key sources
- [GPLv3 full text](https://www.gnu.org/licenses/gpl-3.0.en.html)
- [AGPL-3.0 full text](https://www.gnu.org/licenses/agpl-3.0.html)
- [SFLC Compliance Guide 2nd Ed.](https://softwarefreedom.org/resources/2014/SFLC-Guide_to_GPL_Compliance_2d_ed.html)
- [Copyleft Guide Ch. 9](https://copyleft.org/guide/comprehensive-gpl-guidech10.html)
- [Dan Q: Minification vs GPL](https://danq.me/2021/11/03/minificiation-vs-gpl/)
- [GNU LibreJS guidance](https://www.gnu.org/software/librejs/free-your-javascript.html)
- [Kyle Mitchell: Reading AGPL](https://writing.kemitchell.com/2021/01/24/Reading-AGPL)
- [gpl-violations.org FAQ](https://gpl-violations.org/faq/sourcecode-faq/)
- [SFC v. Vizio](https://sfconservancy.org/copyleft-compliance/vizio.html)

---

## Findings

### Finding: Minified/bundled JavaScript IS "object code" under GPLv3 — not source
**Confidence:** CONFIRMED

GPLv3 Section 1: "source code" = "the preferred form of the work for making modifications." "Object code" = "any non-source form of a work."

Copyleft Guide explicitly: "object code includes not only binaries or executables, but also **obfuscated, minimized, compressed or otherwise non-preferred forms** for modification."

SFLC: "Attention should be paid to compression, minimization, obfuscation, and other modifications to interpreted code that may result in the creation of a 'non-source form.'"

RMS in "The JavaScript Trap": "The source code of a program means the preferred form for programmers to modify — including helpful spacing, explanatory remarks, and meaningful names."

### Finding: You CANNOT provide obfuscated/mangled code as "source"
**Confidence:** CONFIRMED

gpl-violations.org FAQ: source code "unsuitable for modification and rebuilding because too heavily obfuscated to be practicably modifiable, would not be 'complete.'"

GPLv1 had a loophole where obfuscated source was debatable. GPLv2 closed this with "preferred form" language. GPLv3/AGPL inherit this.

If your git repo has readable `.ts` files and you publish mangled versions, you are distributing object code disguised as source.

### Finding: Corresponding Source includes ALL build tooling
**Confidence:** CONFIRMED

GPLv3 Section 1: Corresponding Source includes "scripts to control compilation and installation." For a TS→JS npm package: original `.ts` files, `tsconfig.json`, build scripts, `package.json`, and any tooling configuration needed to reproduce the build output.

### Finding: Source must be as accessible as the object code — no private repos
**Confidence:** CONFIRMED

GPLv3 Section 6d: offer "equivalent access" to Corresponding Source "in the same way through the same place at no further charge." Source on a different server is OK but "clear directions" must exist. An authenticated private repo does NOT satisfy "equivalent access" if the npm package itself is freely downloadable.

### Finding: The "written offer" (Section 6b) is valid but extends to ANY third party for 3 years
**Confidence:** CONFIRMED

You can distribute object code with a written offer to provide source upon request. But: (1) the offer is to ANY third party, not just your users; (2) valid for 3+ years; (3) must provide for no more than cost of physical distribution. SFLC: "Including Corresponding Source with every binary distribution is the easiest option and invariably minimizes potential compliance problems."

### Finding: AGPL Section 13 requires source for network interaction but only for modified versions
**Confidence:** CONFIRMED

Section 13 triggers only if you (1) modified the program AND (2) users interact via network. Running unmodified AGPL code as SaaS does not trigger Section 13. But Section 6 still applies when you distribute copies (e.g., npm publish).

### Finding: SFC v. Vizio makes GPL source requirements individually enforceable
**Confidence:** CONFIRMED

SFC v. Vizio (ongoing as of 2025) established that GPL obligations can be enforced as third-party beneficiary contract claims, not just copyright claims. Any individual user could potentially sue for source.
