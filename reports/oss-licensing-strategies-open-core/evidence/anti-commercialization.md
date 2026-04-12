# Evidence: Anti-Commercialization via True OSS Licenses

**Dimension:** Anti-Commercialization via True OSS
**Date:** 2026-04-11
**Sources:** AGPL text, legal analyses, company enforcement records, OSI, FSF

---

## Key sources referenced
- [AGPL full text - FSF](https://www.gnu.org/licenses/agpl-3.0.en.html)
- [Google AGPL Policy](https://opensource.google/documentation/reference/using/agpl-policy)
- [Heather Meeker on AGPL - FOSSA](https://fossa.com/blog/oss-license-compliance-expert-heather-meeker-agpl/)
- [ParadeDB: Why We Picked AGPL](https://www.paradedb.com/blog/agpl)
- [MinIO dual license](https://www.min.io/commercial-license)
- [BSL requirements - FOSSA](https://fossa.com/blog/business-source-license-requirements-provisions-history/)
- [MPL 2.0 FAQ - Mozilla](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
- [Drew DeVault: Anti-AGPL propaganda](https://drewdevault.com/2020/07/27/Anti-AGPL-propaganda.html)

---

## Findings

### Finding: AGPL Section 13 is the strongest OSI-approved anti-commercialization tool
**Confidence:** CONFIRMED
**Evidence:** AGPL text, legal analyses

AGPL Section 13: if you run modified AGPL software and let users interact over a network, you must provide complete corresponding source code. This closes the SaaS loophole in GPL. However, actual enforcement litigation is exceedingly rare. Most prominent cases: Neo4j v. PureThink (2018-2025, about Commons Clause layered on AGPL), Truth Social's Mastodon AGPL violation (resolved via public pressure, not litigation). No court has ruled on Section 13 scope in contested SaaS scenario.

### Finding: AGPL's commercial value comes from being avoided, not enforced
**Confidence:** CONFIRMED
**Evidence:** Google ban, enterprise policies, MinIO/Lago business models

Google explicitly bans AGPL. Many enterprises follow. This corporate avoidance IS the dual-licensing revenue engine: companies that want your software but cannot comply with AGPL must purchase commercial license. MinIO, Lago, Cal.com, Formbricks all exploit this dynamic.

### Finding: MPL 2.0 is inadequate for anti-commercialization
**Confidence:** CONFIRMED
**Evidence:** MPL 2.0 FAQ, HashiCorp trajectory

File-level copyleft only — competitor can add proprietary features in new files and ship closed product. No network interaction clause. HashiCorp used MPL for 9 years, then switched to BSL specifically because MPL didn't prevent competitors from building commercial products on Terraform.

### Finding: The AGPL→BSL gap is about scope, not strength
**Confidence:** CONFIRMED
**Evidence:** [ParadeDB AGPL blog](https://www.paradedb.com/blog/agpl), BSL analysis

AGPL = "compete if you open-source too" (requires source disclosure). BSL = "don't compete at all" (prohibits production use). The gap: a well-resourced competitor could theoretically comply with AGPL and still compete. AWS could offer AGPL service by publishing their infrastructure code. BSL prevents this outright. In practice, this hasn't happened — no hyperscaler has offered a fully AGPL-compliant competing service, because open-sourcing their stack is unacceptable to them.

### Finding: AGPL + commercial dual licensing requires CLA from all contributors
**Confidence:** CONFIRMED
**Evidence:** MinIO, MySQL, Qt licensing models

Only the copyright holder can offer alternative license terms. Dual licensing requires consolidated copyright ownership. This means CLAs from all contributors. Some communities resist CLAs (see HashiCorp CLA → BSL → OpenTofu fork). Middle path: DCO (Developer Certificate of Origin) provides legal clarity without granting relicensing rights, but does NOT enable dual licensing.

---

## Gaps / follow-ups
* No comprehensive survey of AGPL enforcement actions exists
* CAL (Cryptographic Autonomy License) extends AGPL with data portability requirements — minimal adoption so far
