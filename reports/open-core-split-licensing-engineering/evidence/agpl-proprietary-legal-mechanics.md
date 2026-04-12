# Evidence: AGPL + Proprietary Module Legal Mechanics

**Dimension:** AGPL + Proprietary Legal Mechanics
**Date:** 2026-04-11
**Sources:** FSF FAQ, GPLv3 text, Grafana licensing, legal analyses

---

## Key sources
- [FSF GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)
- [FSF: On Selling Exceptions](https://www.fsf.org/blogs/rms/selling-exceptions)
- [GPLv3 Full Text](https://www.gnu.org/licenses/gpl-3.0.html)
- [Grafana Licensing](https://grafana.com/licensing/)
- [Grafana CEO Q&A on relicensing](https://grafana.com/blog/2021/04/20/qa-with-our-ceo-on-relicensing/)
- [Kyle Mitchell: Reading AGPL](https://writing.kemitchell.com/2021/01/24/Reading-AGPL)
- [SFLC Compliance Guide](https://softwarefreedom.org/resources/2014/SFLC-Guide_to_GPL_Compliance_2d_ed.html)

---

## Findings

### Finding: Copyright holder is NOT bound by their own AGPL
**Confidence:** CONFIRMED
**Evidence:** FSF FAQ, FSF "Selling Exceptions" blog

FSF FAQ: "The GPL is a license granted by the developer to others; the developer itself is not bound by it." RMS explicitly endorsed "selling exceptions" since the 1990s. Only the copyright holder can grant such exceptions.

**Implications:** As sole copyright holder of both AGPL framework and proprietary modules, you can combine them freely. This is the legal foundation of dual-licensing (MySQL, Qt, MongoDB, Grafana).

### Finding: Grafana is the strongest precedent for AGPL + proprietary plugins
**Confidence:** CONFIRMED
**Evidence:** Grafana licensing page, CEO Q&A blog

Three-tier model: (1) AGPL core (Grafana, Loki, Tempo), (2) proprietary Enterprise plugins, (3) free proprietary binary identical to AGPL version. Explicitly rejected SSPL in favor of AGPL. Offers paid proprietary relicense for customers who want to modify without AGPL obligations.

### Finding: Framework MUST function without proprietary modules for AGPL coherence
**Confidence:** CONFIRMED
**Evidence:** GPLv3 Section 1 "Corresponding Source" definition, SFLC guide

GPLv3 Section 1: Corresponding Source includes "dynamically linked subprograms that the work is specifically designed to require." If the AGPL framework REQUIRES the proprietary module to function, the module falls within Corresponding Source scope. Design principle: framework must work (possibly degraded) without proprietary modules.

### Finding: Fork of AGPL framework cannot access proprietary modules
**Confidence:** CONFIRMED
**Evidence:** AGPL text, legal analysis

AGPL copyleft covers only the AGPL-licensed code. A forker receives no license to proprietary compiled modules. They can: (a) reimplement functionality, (b) substitute alternatives, (c) build against the defined interface.

### Finding: JS `import` as linking is legally untested after 30+ years
**Confidence:** UNCERTAIN (no case law)
**Evidence:** Legal analyses by Kyle Mitchell, PopData, Greendrake

Bundling = static linking (universally agreed). `import` at runtime = dynamic linking (likely combined work per FSF). No court has ruled. Moot for copyright holder scenario — only matters for third-party contributions.

---

## Gaps / follow-ups
* No case law on GPL/AGPL in JavaScript ecosystem specifically
* Whether CLA from contributors resolves the third-party contribution issue
