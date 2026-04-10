---
title: "Obsidian Collaboration & Multiplayer - Evidence"
type: evidence
dimension: "D4 - Collaboration & Multiplayer"
collected: 2026-04-02
sources:
  - https://obsidian.md/sync
  - https://help.obsidian.md/Collaborate+on+a+shared+vault
  - https://help.obsidian.md/teams/sync
  - https://forum.obsidian.md/t/obsidian-sync-live-team-collaborative-editing/6058
  - https://relay.md/
  - https://relay.md/relay
  - https://github.com/no-instructions/relay
  - https://docs.relay.md/introduction/
  - https://screen.garden/
  - https://www.peerdraft.app/
  - https://costbench.com/software/note-taking/obsidian/
---

# D4: Collaboration & Multiplayer - Evidence

## Obsidian Sync (Official, Paid)

Obsidian Sync is the official sync service. Key characteristics:

- **Not real-time collaboration.** Sync propagates changes between devices but does not show live cursors, presence, or concurrent edits.
- **End-to-end encrypted.** Obsidian cannot read your data on their servers.
- **No file locking.** Multiple users editing the same file simultaneously creates conflicts resolved by creating conflict files or auto-merging.
- **Shared vaults supported.** You can share a vault with other Obsidian users via Sync, but it's async-first.
- **Storage limits:** Standard plan: 1 GB, 5 MB max file size, 1 vault. Plus plan: 10 GB, up to 10 vaults.
- **Version history:** Available with Sync, stores previous versions of files.

**The oldest open feature request on the Obsidian forum is for live team collaborative editing** (opened 2020, 2,200+ votes). Obsidian has not committed to building this.

## Third-Party Collaboration Solutions

### Relay (relay.md)

- CRDT-based real-time collaboration plugin using Yjs
- Live cursors — see other users' cursor positions in real time
- Share folders between Obsidian users
- Offline-first — edits tracked locally, server relays to collaborators
- Canvas multiplayer (beta)
- Self-hosted option (beta) — but auth still goes through Relay's servers
- **Limitation:** Both parties must have Obsidian desktop installed with the Relay plugin. No web access.

### screen.garden

- First sync solution with real-time multiplayer AND web editing
- Edit vault notes from a web browser without Obsidian installed
- Live cursors in both Obsidian and web interface
- Comments on markdown notes (online or offline, reply, resolve)
- Canvas multiplayer
- Pricing: $5/team member/month after 1-week free trial
- **Most complete collaboration solution for Obsidian as of April 2026**

### Peerdraft (peerdraft.app)

- Real-time and asynchronous editing
- End-to-end encrypted ad-hoc sessions
- Persistent shares for long-term collaboration
- Simpler feature set than Relay or screen.garden

## Analysis: Collaboration as Obsidian's Biggest Gap

**The core product is fundamentally single-player.** All multiplayer features come from:
1. A proprietary sync service that is NOT real-time collaborative
2. Third-party plugins that add CRDT-based real-time editing
3. Third-party services (screen.garden) that add web access

**No official roadmap item for native real-time collaboration.** The team has acknowledged the demand (oldest feature request on the forum) but has not signaled any plans to build it.

**For a competitor positioning as "Obsidian but collaborative":**
- This is the single most validated unmet need in the Obsidian ecosystem
- The 2,200+ votes on the forum feature request prove demand
- Third-party solutions (Relay, screen.garden) prove technical feasibility
- But Obsidian's philosophy of local-first, privacy-first makes centralized real-time collab architecturally difficult for them
- A competitor building collaboration as a core primitive (not a bolt-on) has a structural advantage

**Agent collaboration gap:** There is no mechanism for an agent and a human to work on the same note simultaneously with conflict resolution. Agent writes via filesystem can collide with Obsidian's in-memory state, causing data loss. This is a fundamental architectural limitation of the "app reads files from disk" model.
