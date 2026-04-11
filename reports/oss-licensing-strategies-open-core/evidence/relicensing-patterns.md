# Evidence: The Relicensing Pattern

**Dimension:** Relicensing Pattern & Fork Dynamics
**Date:** 2026-04-11
**Sources:** Company announcements, HN threads, academic research, TechCrunch, InfoQ

---

## Key sources referenced
- [HashiCorp licensing FAQ](https://www.hashicorp.com/en/license-faq)
- [IBM closes $6.4B HashiCorp acquisition](https://techcrunch.com/2025/02/27/ibm-closes-6-4b-hashicorp-acquisition/)
- [OpenTofu growth analysis](https://www.dramafund.ing/blog/hashicorp-terraform-opentofu-ibm)
- [Redis AGPL announcement](https://redis.io/blog/agplv3/)
- [Redis returns to OSS - The Register](https://www.theregister.com/2025/05/01/redis_returns_to_open_source/)
- [Redis AGPL analysis - InfoQ](https://www.infoq.com/news/2025/05/redis-agpl-license/)
- [Elastic AGPL announcement](https://ir.elastic.co/news/news-details/2024/Elastic-Announces-Open-Source-License-for-Elasticsearch-and-Kibana-Source-Code/default.aspx)
- [Developers not going back - Socket.dev](https://socket.dev/blog/developers-burned-by-elasticsearch-license-change-arent-going-back)
- [MongoDB SSPL announcement](https://www.mongodb.com/company/newsroom/press-releases/mongodb-issues-new-server-side-public-license-for-mongodb-community-server)
- [Dark side of SSPL - ScyllaDB](https://www.scylladb.com/2018/10/22/the-dark-side-of-mongodbs-new-license/)
- [Relicensing dynamics paper - arXiv](https://arxiv.org/abs/2411.04739)
- [CHAOSS fork analysis](https://chaoss.community/what-happens-to-relicensed-open-source-projects-and-their-forks/)

---

## Major Relicensing Events Timeline

| Company | From | To | Date | Fork? | Fork Outcome |
|---------|------|-----|------|-------|-------------|
| MongoDB | AGPL-3.0 | SSPL | Oct 2018 | No major fork | No fork — mostly internal dev |
| Sentry | BSD-3 | BSL 1.1 | Nov 2019 | No | — |
| CockroachDB | Apache-2.0 | BSL 1.1 | Jun 2019 | No major fork | Minor fork of last open version |
| MinIO | Apache-2.0 | AGPL-3.0 | 2019-2021 | No | — |
| Elastic | Apache-2.0 | SSPL/ELv2 | Jan 2021 | Yes → OpenSearch | OpenSearch: 496 contributors, 100M+ downloads Y1 |
| Airbyte | MIT | ELv2 | Sep 2021 | No | — |
| n8n | Apache+CC | SUL | Mar 2022 | No | — |
| Directus | GPL-3.0 | BSL 1.1 | Apr 2023 | No | — |
| HashiCorp | MPL-2.0 | BSL 1.1 | Aug 2023 | Yes → OpenTofu | OpenTofu: 9.8M downloads, 300% annual growth |
| Sentry | BSL 1.1 | FSL | Nov 2023 | No | — |
| Redis | BSD-3 | SSPL/RSALv2 | Mar 2024 | Yes → Valkey | Valkey: 50 companies, Linux Foundation |
| Elastic | SSPL/ELv2 | +AGPL option | Aug 2024 | — | OpenSearch still thriving |
| CockroachDB | BSL | Proprietary | Aug 2024 | Minor fork | Customer forked last open version |
| Redis | SSPL/RSALv2 | +AGPL option | May 2025 | — | Valkey still growing |
| NocoDB | AGPL-3.0 | SUL | Jan 2026 | TBD | Community backlash ongoing |

---

## Findings

### Finding: HashiCorp BSL triggered successful fork and likely accelerated IBM acquisition
**Confidence:** CONFIRMED
**Evidence:** HashiCorp FAQ, TechCrunch, DramaFund analysis

HashiCorp switched from MPL 2.0 to BSL on August 10, 2023. OpenTofu announced within weeks. OpenTofu reached 9.8M downloads with 300% annual growth. IBM acquired HashiCorp for $6.4B (announced April 2024, closed February 2025). BSL arguably made HashiCorp more acquirable but weakened community moat.

### Finding: Redis's full journey validates AGPL as the correct equilibrium
**Confidence:** CONFIRMED
**Evidence:** Redis blog, The Register, InfoQ

Redis was BSD. March 2024: switched to dual SSPL/RSALv2. Within days, Valkey forked under Linux Foundation with AWS, Google, Oracle backing. By September 2024, 83% of large enterprises had adopted or were exploring Valkey. May 2025: Redis 8 added AGPLv3 as third option. Despite AGPL return, Valkey reached v9 by 2026 with its own roadmap. Starting with AGPL would have avoided the entire crisis.

### Finding: Elastic shows the same pattern with 3-year delay
**Confidence:** CONFIRMED
**Evidence:** Elastic IR, InfoQ, Socket.dev

Elastic: Apache 2.0 → SSPL/ELv2 (Jan 2021). AWS forked as OpenSearch (496 contributors, 100M+ downloads Y1). August 2024: Elastic added AGPL option. Socket.dev: "Developers burned by Elasticsearch's license change aren't going back." Triple-licensed now (SSPL, AGPL, ELv2).

### Finding: MongoDB's SSPL worked because it lacked external contributor base to fork
**Confidence:** CONFIRMED
**Evidence:** MongoDB announcement, ScyllaDB analysis, arXiv paper

MongoDB was first to argue AGPL wasn't enough (cloud providers in Asia offering MongoDB-as-a-service). Created SSPL requiring entire service stack source release. OSI rejected. Debian, RHEL, Fedora dropped MongoDB. BUT: no credible fork emerged because MongoDB had relatively few external contributors — most development was internal. This is the key difference from Redis/Elastic/HashiCorp.

### Finding: Fork success formula is predictable
**Confidence:** CONFIRMED
**Evidence:** [arXiv paper](https://arxiv.org/abs/2411.04739), [CHAOSS analysis](https://chaoss.community/what-happens-to-relicensed-open-source-projects-and-their-forks/)

Fork success requires: (1) neutral foundation governance from day one, (2) organizational diversity (Valkey: 29 contributors from 10 companies in 6 months), (3) hyperscaler sponsorship (AWS/Google/Oracle for Valkey), (4) pre-existing external contributor base. MongoDB fork failed because development was mostly internal. The single best predictor of catastrophic relicensing: having a large, diverse external contributor base that can walk to a foundation-backed fork.

---

## Gaps / follow-ups
* Long-term revenue impact of relicensing (beyond stock price) is hard to isolate
* Whether OpenTofu's momentum will sustain without Terraform's enterprise install base is unclear
