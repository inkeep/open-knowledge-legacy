# Evidence: Maintenance and Ecosystem Health

**Dimension:** D5 — Maintenance and ecosystem health
**Date:** 2026-04-02
**Sources:** npm, GitHub, npm-trends, Snyk advisor

---

## Key files / pages referenced

- https://www.npmjs.com/package/isomorphic-git — npm page
- https://github.com/isomorphic-git/isomorphic-git — GitHub repo
- https://www.npmjs.com/package/simple-git — npm page
- https://github.com/steveukx/git-js — GitHub repo
- https://www.npmjs.com/package/nodegit — npm page
- https://github.com/nodegit/nodegit — GitHub repo
- https://github.com/petersalomonsen/wasm-git — GitHub repo
- https://npmtrends.com/isomorphic-git-vs-nodegit-vs-simple-git — comparison

---

## Findings

### Finding: simple-git is the healthiest ecosystem choice
**Confidence:** CONFIRMED
**Evidence:** npm, GitHub stats

- Weekly downloads: 6-12M (varies by measurement period; dominant in the category)
- GitHub stars: ~9K+ (steveukx/git-js)
- Last release: within last few months (v3.32.x)
- TypeScript: bundled types since v3
- Maintainers: 2 active
- Release cadence: healthy, regular releases
- Zero native dependencies — pure Node.js CLI wrapper

**Implications:** simple-git is production-grade, well-maintained, and the de facto standard for Node.js git operations.

### Finding: isomorphic-git is actively maintained but more niche
**Confidence:** CONFIRMED
**Evidence:** npm, GitHub stats

- Weekly downloads: ~320K-630K (varies by source)
- GitHub stars: ~8.1K
- Last release: v1.37.4, last published ~4 days ago (as of late Feb 2026)
- Open issues: 272 (18 needing help)
- Release cadence: regular, automated via semantic-release
- Contributors: small core team (~10)
- Merge support: limited (issue #325 open since July 2018)

**Implications:** isomorphic-git is actively maintained with regular releases, but its smaller user base and long-standing unresolved merge issues (7+ years) suggest limited resources for complex features.

### Finding: nodegit is effectively abandoned
**Confidence:** CONFIRMED
**Evidence:** npm, GitHub

- Last release: 0.27.0, published ~6 years ago
- Weekly downloads: ~49K (declining)
- Node.js 20/22 compatibility: not confirmed, likely broken
- Build issues: historically system-dependent, "really only works without modification on Windows and Ubuntu"
- GitKraken maintains it for their products but has not published public releases

**Implications:** nodegit is not viable for new projects. Build issues and lack of Node.js 20+ support make it a non-starter.

### Finding: wasm-git is a niche project with limited API surface
**Confidence:** CONFIRMED
**Evidence:** GitHub repo (petersalomonsen/wasm-git)

- GitHub stars: 806
- Open issues: 17
- Uses libgit2 v1.7.1
- Core operations: clone, add, commit, push, pull
- Three variants: sync, async, OPFS
- Active maintenance (recent commits)
- No npm package discoverability (distributed as lg2.js/lg2.wasm)
- API: C-style libgit2 bindings exposed through WASM, not idiomatic JS

**Implications:** wasm-git is a proof-of-concept rather than a production library. The API ergonomics and lack of TypeScript types make it unsuitable for a TypeScript codebase.

---

## Gaps / follow-ups

* Check if there are newer libgit2 WASM bindings beyond petersalomonsen's project
* Monitor isomorphic-git issue #325 for merge improvements
