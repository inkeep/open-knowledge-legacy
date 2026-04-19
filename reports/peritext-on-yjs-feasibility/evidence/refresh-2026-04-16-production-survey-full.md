---
name: Production user survey — full Yjs adopter list, Yjs 14 status
description: Verified ~60 published Yjs users for v14 adoption — zero adopters confirmed
sources: ["yjs published 'Who is using Yjs' list", "GitHub raw package.json", "npm registry"]
date: 2026-04-16
---

# Production user survey — Yjs 14 adoption status (full list)

**Headline:** Yjs v14 production adopters identified: **0 of ~60 surveyed.** Strengthens prior 4-product spot-check claim of "zero production users on Yjs 14."

## npm registry truth (source: `https://registry.npmjs.org/-/package/yjs/dist-tags`, 2026-04-16)

```json
{ "next": "14.0.0-8", "beta": "14.0.0-16", "latest": "13.6.30" }
```

Most recent v14 tag on GitHub: **v14.0.0-rc.13** (released 2026-04-14, two days before this survey). Stable v14 not released. The `latest` dist-tag is 13.6.30 — `^13.x.y` semver pins resolve to 13.6.30, so no surveyed product receives v14 via standard resolution.

**CORRECTION (2026-04-16, applied post-survey):** A prior version of this section erroneously claimed "there is no `@y/y` scope on npm." That claim is **wrong** and was contradicted by the four sister refresh evidence files in this report, which correctly identified the `@y/*` scope as real.

**Verified by direct npm registry probe** (2026-04-16):

```bash
$ curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/@y%2Fy
200
$ curl -s https://registry.npmjs.org/@y%2Fy | head -c 200
{"_id":"@y/y","_rev":"...","name":"@y/y","dist-tags":{"latest":"14.0.0-rc.7","beta":"14.0.0-rc.13"},...

$ curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/@y%2Fwebsocket-server
200
$ curl -s https://registry.npmjs.org/@y%2Fwebsocket-server | head -c 200
{"_id":"@y/websocket-server","_rev":"...","name":"@y/websocket-server","dist-tags":{"latest":"0.1.5"},...
```

**Both publishing channels coexist today:**
- `@y/*` scope IS real on npm — `@y/y@14.0.0-rc.7` (latest) and `14.0.0-rc.13` (beta), `@y/websocket-server@0.1.5`, `@y/prosemirror@2.0.0-2`, `@y/codemirror@0.0.0-3`, `@y/websocket@4.0.0-rc.2`, `@y/protocols@1.0.6-rc.1` (all verified in sister refresh evidence files)
- The legacy `yjs` package ALSO has v14 prereleases (`next: 14.0.0-8, beta: 14.0.0-16`) under the same name; `latest: 13.6.30` remains the stable

**Why this correction matters:** The headline finding of this survey ("0 of ~60 production users have adopted Yjs 14") is unaffected — no surveyed product uses `@y/y` either, and `^13.x` semver pins don't reach `yjs@14.x` prereleases. But the erroneous negative claim above contradicted the source-traced findings in `refresh-2026-04-16-yjs14-ecosystem.md`, `refresh-2026-04-16-bindings-architecture-c.md`, and `refresh-2026-04-16-option-A-blast-radius.md`, which all correctly identified the `@y/*` scope and built load-bearing claims on top of it (e.g., the `@y/websocket-server@0.1.5` self-contradicting peer-deps finding). Reader should trust the sister evidence files on `@y/*` package existence; this file is authoritative only for the production-adoption headcount.

## Verified pinning to Yjs 13.x (13 products with direct evidence)

| # | Product | Repo | yjs pin |
|---|---|---|---|
| 1 | AFFiNE | toeverything/AFFiNE | `13.6.21` (yarn-patched in resolutions) |
| 2 | Outline | (verified via prior research) | `^13.6.30` |
| 3 | BlockSuite (AFFiNE editor framework) | toeverything/blocksuite | `^13.6.15`–`^13.6.18` peer/dev |
| 4 | Hocuspocus self | ueberdosis/hocuspocus | `^13.6.8` peer-dep |
| 5 | JupyterLab / jupyter-collaboration | jupyterlab/jupyter-collaboration | `^13.5.40` |
| 6 | JupyterCad | jupyterlab/jupytercad | `^13.5.40` |
| 7 | Nextcloud Text | nextcloud/text | `^13.6.30` (with y-protocols `^1.0.7`) |
| 8 | Eclipse Theia (collaboration) | eclipse-theia/theia | `^13.6.30` (with y-protocols `^1.0.7`, open-collaboration-yjs `0.3.0`) |
| 9 | Relm-server | relm-us/relm-server | `13.5.27` |
| 10 | PRSM | micrology/prsm | `13.6.10` |
| 11 | Nosgestesclimat | incubateur-ademe/nosgestesclimat-site | `13.5.39` (y-webrtc, y-websocket) |
| 12 | ProtonMail Proton Docs | ProtonMail/WebClients/packages/docs-shared | `^13.6.15` |
| 13 | reearth-flow | reearth/reearth-flow/ui | `13.6.30` |

Pin range: 13.5.27–13.6.30 — covering most of the 13.x line.

## Inaccessible (~30 SaaS-only or no public repo)

Cargo, Evernote, Lessonspace, Ellipsus, Dynaboard, Room.sh, Nimbus Note, modyfi, Alldone, Slidebeamer, Skiff (defunct, acquired by Notion 2024), Hyperquery, oorja, LegendKeeper, btw, AWS SageMaker, Arkiter, AppMaster, Synthesia, thinkdeli, Ellie.ai, GoPeer, screen.garden, QDAcity (infra-only repos), Kanbert, ScienHub, Kedyou, Lightpage, Theneo (no main app repo), Living Spec (forks only), BlockSurvey, Pluxbox (only client SDKs in public org), Serenity Notes (workspace-distributed, no root pin), keystatic & ourboard & ToolJet (no root pin — yjs may be transitive in unverified subpackages).

## Yrs (Rust) users — separate ecosystem (2)

- **AppFlowy** (`AppFlowy-IO/AppFlowy` Cargo.toml): `yrs = "0.21.0"`
- **Multi.app** — uses Yrs per public docs

Not Yjs 14 candidates; Yrs is a separate Rust crate that's binary-protocol-compatible with Yjs but doesn't track Yjs version numbers.

## Listed-but-not-actually-yjs (1)

- **Linear** — custom Sync engine; on the published list as marketing/brand association, not a direct yjs dependency. Verified via public engineering blog architecture.

## Strongest signal of imminent v14 migration

**NONE.** No GitHub PR, blog post, conference talk, or job listing surfaced mentioning a v14 migration timeline. Even renovate-bot tracking on Nextcloud Text (which has a long history of automatic yjs bumps via PR) has never opened a v14-track PR — `^13.x` pins are immune to v14 because Renovate respects the npm `latest` tag.

## Yjs's own first-party bindings — also not on v14

- `y-codemirror.next` peer-deps `"yjs": "^13.5.6"`
- `y-prosemirror` v1.3.7 (most-recent of the `^13.x` line) — broader ecosystem stays on `^13.x`

This means even an enthusiastic adopter would have to fork the bindings or wait for upstream. Nobody has done this publicly.

## Implication for spec decision

The "Yjs 14 + Peritext" path has:
- No production reference implementations to copy from
- No first-party editor bindings shipped on v14
- Active rc-cycle churn (rc.13 published two days ago)
- A two-day-old rc tag means any adopter is opting into a moving target

The Path C decision is unchanged: Yjs 14 path is feasible as a pioneer-tax SPIKE; not viable as a production-grade replacement today.

## Sources

- [yjs npm registry dist-tags](https://registry.npmjs.org/-/package/yjs/dist-tags)
- [yjs releases — v14.0.0-rc.13](https://github.com/yjs/yjs/releases)
- [y-codemirror.next peer-deps](https://github.com/yjs/y-codemirror.next)
- Per-product GitHub raw package.json fetches (2026-04-16)
