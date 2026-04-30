---
title: Incident Shape — .changeset/README Duplication
description: Captures the user-provided server log shape for the .changeset/README.md duplication incident and maps it to current persistence behavior.
created: 2026-04-29
last-updated: 2026-04-29
---

# Incident Shape

## Source

User-provided server log from UI navigation in `.changeset/` folder. The user reported that `.changeset/README.md` received duplicated content without intentional editing.

## Observed log sequence

**Confidence:** CONFIRMED from user-provided log

1. Several `.changeset/*` documents loaded shortly before the incident:
   - `.changeset/cb-v2-prop-file-upload`
   - `.changeset/cb-v2-lowercase-media-pivot`
2. `.changeset/README` then loaded:
   - `onLoadDocument .changeset/README: fragment.length=0 before update`
   - `Loaded .../.changeset/README.md into Y.Doc (6 children)`
3. Immediately after load, a mutation was observed:
   - `MUTATION on .changeset/README: fragment.length=12`
4. Persistence warning fired:
   - `serialized content is 1913 bytes vs base 956 bytes ... possible duplication`
   - `Fragment children: 12`
5. Persistence still wrote the file:
   - `Wrote .../.changeset/README.md (1913 bytes)`

## Interpretation

**Confidence:** INFERRED

The log has a clear doubling shape:

- Children doubled from 6 to 12.
- Serialized byte length roughly doubled from 956 to 1913.
- The server loaded from disk into an empty server fragment first, then the mutation arrived after load.

This is consistent with stale client-side Yjs/IndexedDB content merging into a server Y.Doc that was freshly reconstructed from Markdown.

## What the log does not prove by itself

**Confidence:** CONFIRMED negative boundary

The log does not identify the client-side auth token claim, the browser IndexedDB database contents, or which client/provider sent the mutation. It supports the stale-cache hypothesis but does not prove the exact cross-doc global-marker masking sequence. That requires a targeted repro/test.

## Spec implication

A warning-only detector is insufficient. The incident passed through the existing duplication warning and still mutated the real Markdown file. The spec should require a server-side block/rescue tripwire as defense-in-depth, even if the primary fix is client-side cache epoch keying.
