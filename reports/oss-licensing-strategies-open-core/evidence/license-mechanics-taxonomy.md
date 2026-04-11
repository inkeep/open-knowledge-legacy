# Evidence: License Mechanics & Legal Taxonomy

**Dimension:** License Mechanics & Legal Taxonomy
**Date:** 2026-04-11
**Sources:** OSI, FSF, FOSSA, tl;dr legal, Mozilla, Wikipedia, various legal analyses

---

## Key sources referenced
- [MIT License - Wikipedia](https://en.wikipedia.org/wiki/MIT_License)
- [Apache 2.0 full text](https://www.apache.org/licenses/LICENSE-2.0)
- [AGPL full text - FSF](https://www.gnu.org/licenses/agpl-3.0.en.html)
- [MPL 2.0 FAQ - Mozilla](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
- [Open Source Definition - OSI](https://opensource.org/osd)
- [FOSSA AGPL overview](https://fossa.com/blog/open-source-software-licenses-101-agpl-license/)
- [FOSSA MPL 2.0 overview](https://fossa.com/blog/open-source-software-licenses-101-mozilla-public-license-2-0/)
- [The SaaS Loophole in GPL - Mend](https://www.mend.io/blog/the-saas-loophole-in-gpl-open-source-licenses/)

---

## Findings

### Finding: MIT and MIT Expat are the same license
**Confidence:** CONFIRMED
**Evidence:** [MIT License - Wikipedia](https://en.wikipedia.org/wiki/MIT_License), [SPDX MIT entry](https://spdx.org/licenses/MIT.html)

The SPDX identifier `MIT` refers to the Expat License variant specifically. Historical ambiguity exists because "MIT License" was used for both the Expat License (circa 1998) and the older X11 License. The OSI-approved "MIT License" uses the Expat wording. Projects specifying "MIT Expat" do so for disambiguation, not because it is a different license.

**Implications:** No strategic significance. Use SPDX `MIT` and the ambiguity is resolved.

### Finding: Apache 2.0 provides explicit patent grant that MIT lacks
**Confidence:** CONFIRMED
**Evidence:** [Apache 2.0 patent handling](https://opensource.com/article/18/2/apache-2-patent-license), [Apache License 2.0 full text](https://www.apache.org/licenses/LICENSE-2.0)

Section 3 grants a "perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable" patent license from each contributor. A patent retaliation clause terminates all rights if a licensee initiates patent litigation. MIT has no explicit patent grant — implied patent license is legally untested.

**Implications:** Apache 2.0 preferred when patent clarity matters (infrastructure, databases, AI/ML). Retaliation clause deters patent trolling.

### Finding: AGPL Section 13 closes the SaaS loophole but is legally untested
**Confidence:** CONFIRMED
**Evidence:** [AGPL full text - FSF](https://www.gnu.org/licenses/agpl-3.0.en.html), [FOSSA AGPL overview](https://fossa.com/blog/open-source-software-licenses-101-agpl-license/), [Heather Meeker on AGPL](https://fossa.com/blog/oss-license-compliance-expert-heather-meeker-agpl/)

Section 13 adds one clause to GPLv3: if you modify the program and make it available to users over a network, you must offer them the corresponding source code. The trigger is "modification" — merely deploying unmodified AGPL software does not trigger obligations. Zero case law interpreting Section 13. Google, Apple ban AGPL dependencies entirely.

**Implications:** AGPL's deterrent effect operates through corporate risk aversion, not proven enforcement. This is the engine behind dual-licensing business models.

### Finding: MPL 2.0 provides file-level copyleft — too weak for anti-commercialization
**Confidence:** CONFIRMED
**Evidence:** [MPL 2.0 FAQ - Mozilla](https://www.mozilla.org/en-US/MPL/2.0/FAQ/), [FOSSA MPL 2.0 overview](https://fossa.com/blog/open-source-software-licenses-101-mozilla-public-license-2-0/)

Modifications to MPL-licensed files must remain MPL, but new files can be any license (including proprietary). No network interaction clause. SaaS deployment of modified MPL code without source disclosure is permitted. HashiCorp used MPL for 9 years, then switched to BSL because MPL didn't prevent commercial competition.

**Implications:** MPL protects the file but not the product. Insufficient for open-core anti-commercialization.

### Finding: GPL/LGPL occupy a dead zone for SaaS businesses
**Confidence:** CONFIRMED
**Evidence:** [The decline of GPL](https://opensource.com/article/17/2/decline-gpl), [FSF on LGPL](https://www.gnu.org/licenses/why-not-lgpl.en.html)

GPL's copyleft triggers on "distribution" — running software on a server for remote users is not distribution (the ASP loophole). GPL deters customers (copyleft scares enterprises) without deterring cloud competitors (no network clause). LGPL allows proprietary linking, removing the monetization lever.

**Implications:** GPL is too restrictive for broad adoption but not restrictive enough to prevent SaaS competition. AGPL exists specifically to solve this.

### Finding: OSI compliance requires meeting all 10 OSD criteria; source-available licenses intentionally fail criteria 5-6 or 9
**Confidence:** CONFIRMED
**Evidence:** [Open Source Definition - OSI](https://opensource.org/osd), [SSPL - Wikipedia](https://en.wikipedia.org/wiki/Server_Side_Public_License)

SSPL fails because it requires releasing entire service stack source (discriminates against SaaS field). BSL fails because it restricts production use. MongoDB submitted SSPL to OSI and withdrew before rejection (2019). Elastic added AGPL option (2024) to reclaim "open source" status alongside SSPL/ELv2.

**Implications:** Source-available provides stronger protection but sacrifices "open source" brand and ecosystem trust.

---

## Gaps / follow-ups
* No case law on AGPL Section 13 scope in contested SaaS scenarios
* Cryptographic Autonomy License (CAL) goes further than AGPL but has minimal adoption — worth monitoring
