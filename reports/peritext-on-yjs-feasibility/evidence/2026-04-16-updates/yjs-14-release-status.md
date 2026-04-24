# Evidence: Yjs 14 Release Status (2026-04-16 Update)

**Dimension:** Pull-in assessment — Q1 (release status, compat)
**Date:** 2026-04-16
**Sources:** npm registry JSON API (`registry.npmjs.org`), GitHub REST API (`api.github.com`), Hocuspocus changelog, local `package.json` + `bun.lock`

---

## Key facts

### Yjs package identity has split into TWO packages

| Channel | Package | Latest | dist-tags |
|---|---|---|---|
| Stable v13 | `yjs` | `13.6.30` (2026-03-14) | `latest=13.6.30, beta=14.0.0-16, next=14.0.0-8` |
| Unstable v14 (new namespace) | `@y/y` | `14.0.0-rc.13` (2026-04-14) | `latest=14.0.0-rc.7, beta=14.0.0-rc.13` |

**Critical implication:** The prior report claimed `yjs@14.0.0-16` is the v14 beta. That claim is now stale-ish — it's still ON the `yjs` package under the `beta` tag, but active v14 development has **moved to a NEW scoped package name `@y/y`** on npm. The `yjs` beta tag is 4+ months stale (2025-12-07 → now). All active RCs publish to `@y/y`. Migration to Yjs 14 means changing package identity, not just a version bump.

Evidence — `curl https://registry.npmjs.org/yjs` and `curl https://registry.npmjs.org/@y/y`:

```
yjs dist-tags: {"next":"14.0.0-8","beta":"14.0.0-16","latest":"13.6.30"}
@y/y dist-tags: {"latest":"14.0.0-rc.7","beta":"14.0.0-rc.13"}
```

### RC-series pattern reveals authoring-in-progress velocity

Yjs 14 pre-releases went through TWO numbering schemes, indicating a reset:

- **Phase 1 (2025-04-30 → 2026-01-19):** 22 numeric pre-releases `14.0.0-0` through `14.0.0-22` under the old `yjs` package on npm.
- **Phase 2 (2026-02-25 → 2026-04-14):** 13 RC pre-releases `14.0.0-rc.0` through `14.0.0-rc.13` under the new `@y/y` package.

From 2026-04-11 to 2026-04-14 alone, three RCs shipped (rc.11, rc.12, rc.13). That's ~1 RC every day — consistent with an author actively iterating against discovered issues. Not consistent with a "we're stabilizing, one more" pre-ship cadence.

Noteworthy oddity: **`14.0.0-rc.7` was briefly marked `prerelease=false` on 2026-03-27**, then the maintainer immediately published `14.0.0-rc.8` marked `prerelease=true`. Interpretation: a stable designation was attempted and reverted within hours.

Evidence — `curl https://api.github.com/repos/yjs/yjs/releases`:

```
  v14.0.0-rc.13        @ 2026-04-14T23:31:15Z prerelease=True
  v14.0.0-rc.12        @ 2026-04-14T14:29:06Z prerelease=True
  v14.0.0-rc.11        @ 2026-04-11T16:38:11Z prerelease=True
  v14.0.0-rc.10        @ 2026-03-29T03:02:29Z prerelease=True
  v14.0.0-rc.9         @ 2026-03-28T15:47:36Z prerelease=True
  v14.0.0-rc.7         @ 2026-03-27T01:51:15Z prerelease=False   # ← briefly False
  v14.0.0-rc.8         @ 2026-03-27T22:29:14Z prerelease=True    # ← republished as True
  v14.0.0-rc.6         @ 2026-03-25T15:27:43Z prerelease=True
  ...
  v13.6.30             @ 2026-03-14T13:06:37Z prerelease=False   # ← current stable
  v14.0.0-rc.1         @ 2026-02-27T00:29:32Z prerelease=True
  v14.0.0-rc.0         @ 2026-02-25T15:27:34Z prerelease=True
  v14.0.0-22           @ 2026-01-19T14:18:12Z prerelease=True    # ← last pre-RC numeric release
```

### Bugs tracked against 14.x pre-releases

- Issue [#751](https://github.com/yjs/yjs/issues/751) (CLOSED): "14.0.0-8 pre-release, likely packaging issue: can't access lexical declaration `_insertIntoIdSet`" — packaging/module-resolution bug.
- Issue [#694](https://github.com/yjs/yjs/issues/694) referenced in search results: "yjs v14: issue with move operation" (pre-v14-rc series).

### No production users found

A pass of web search + Yjs discussion forum did not surface any project shipping Yjs 14 (neither the old `yjs@14.0.0-N` beta nor the new `@y/y` RCs) in production. The [Yjs community "Show" category](https://discuss.yjs.dev/c/show/5) did not surface a single Yjs 14 production deploy post. No blog posts. No Liveblocks/Notion/Tiptap announcements.

### Findings

- **CONFIRMED:** Yjs 14 is in active release-candidate phase, on a NEW npm scope (`@y/y`), with RC velocity consistent with open-to-change maintenance.
- **CONFIRMED:** No stable Yjs 14 release exists on any npm tag.
- **CONFIRMED:** The v14 line has had packaging bugs as recently as late 2025 (#751).
- **NOT FOUND:** Any production deployment of Yjs 14 or `@y/y`.
- **INFERRED:** The package rename from `yjs` → `@y/y` is a deliberate signal that v14 is a breaking change substantial enough to warrant identity separation, not a drop-in upgrade.
