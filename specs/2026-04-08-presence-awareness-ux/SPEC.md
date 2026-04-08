# Presence & Awareness UX (S5 v0) — Spec

**Status:** Approved
**Owner(s):** Nick Gomez
**Last updated:** 2026-04-08
**Baseline commit:** 5597eb7 (feat/init-spike)
**Links:**
- Prior spec: `specs/2026-04-07-bidirectional-observer-sync/SPEC.md`
- Evidence: `./evidence/` (spec-local findings)
- PROJECT.md: PQ1 (presence is P0), TQ1 (Yjs CRDT), TQ16 (agent batch edits), PQ11 (no suggest mode)

---

## 1) Problem statement

**Situation:** Open Knowledge's editor has bidirectional CRDT sync between WYSIWYG and source modes, a server-side agent write path via Hocuspocus DirectConnection, and a disk bridge for external editors. The Yjs awareness protocol is connected — packets flow between clients. `@tiptap/extension-collaboration-cursor` is installed. `yCollab` in CodeMirror already accepts `provider.awareness`. The infrastructure for multi-participant collaboration exists at the transport layer. Per-origin undo via `trackedOrigins` isolates human edits from observer sync. The product's core differentiator — agent-native co-editing — is architecturally wired but visually invisible.

**Complication:** The editor looks and feels like a single-user tool despite being a collaborative system. When an AI agent writes to the document via MCP (or the agent-sim), the user sees text silently appear — no attribution, no cursor, no indication of who or what is editing. There is no way to demo "the AI is editing alongside you" because nothing visual represents the agent's presence. This is compounded by a fundamental UX mismatch: agents don't type character-by-character — they apply batch diffs (TQ16: "exactly two operations — full file write and string replacement, both section-level"). Traditional cursor presence (Google Docs model) is meaningless for batch edits. And the Yjs transaction origin is discarded by both y-tiptap and y-codemirror.next before reaching the editor layer, so there's no built-in way to attribute changes to their source. No production editor has shipped "AI as visible real-time collaborator" — Liveblocks uses diff overlays, Cursor uses separate panes, Copilot uses ghost text. We're building a novel pattern.

**Resolution:** Build a v0 Presence & Awareness UX that makes human and agent collaboration visible in real-time. Four pillars: (1) human cursor presence in both WYSIWYG and source modes, (2) agent activity visualization via region flash + activity indicator when batch writes land, (3) per-origin undo UX — a dedicated "Undo Agent Edit" action that only reverses agent changes, (4) presence bar showing all connected participants (humans + agents) with identity and mode. Agent presence uses DirectConnection's `document.awareness` API (verified: broadcasts to all WebSocket clients, auto-renews, separate clientID). Agent write attribution uses a Y.Map side-channel (Y.Map('activity')) because Yjs transaction origins are lost in the editor binding layer. Per-origin undo uses a third UndoManager tracking only `'agent-write'` origin (verified: multiple UndoManagers on same Y.Type don't conflict).

## 2) Goals
- G1: Human editors see each other's cursors and selections in both WYSIWYG and source modes
- G2: When an agent writes, the user sees what changed (region flash), that something happened (activity indicator), and who did it (attribution)
- G3: Users can undo agent edits independently of their own edits via a dedicated action
- G4: A presence bar shows all connected participants with name, color, type (human/agent), and current mode
- G5: Demo-able to the team — visually compelling, makes the co-editing story tangible

## 3) Non-goals

- **[NEVER]** NG1: Fake cursor animation for agents — agents don't type; faking it is dishonest and technically unsound
- **[NEVER]** NG2: Google Docs-style inline suggest/accept/reject — PQ11 (Locked): agents produce batch rewrites, suggest mode is a UX mismatch
- **[NOT NOW]** NG3: Multi-human remote collaboration (cloud Hocuspocus, auth, avatars) — Revisit if: product moves to hosted deployment
- **[NOT NOW]** NG4: External editor presence (VS Code/Cursor users appearing in presence bar) — Revisit if: disk bridge gains WebSocket awareness channel
- **[NOT NOW]** NG5: Live origin shading on content — Revisit if: history/timeline view (S6) needs a "highlight what changed" mode. Open product question: persistent per-paragraph attribution likely goes stale as content evolves across authors. A history view with diff highlighting (click through changes, see who wrote what at each point in time) is probably the right product surface for attribution — not shading on the live document.
- **[NOT UNLESS]** NG6: Agent conflict prevention (awareness-based soft locks to prevent clobbering) — Only if: real-world usage shows concurrent human+agent edits on the same paragraph are frequent enough to warrant it

## 4) Personas / consumers

- **P1: Human editor** — Writes documentation in WYSIWYG or source mode. Needs to see who else is editing, what just changed, and undo AI changes.
- **P2: AI agent** — Writes via MCP/DirectConnection in batch diffs. Must be visible as a recognized collaborator without faking character-level behavior.
- **P3: Team viewer (demo audience)** — Observes the co-editing experience. Needs to see the human↔agent collaboration story in action.

## 5) User journeys

### P1: Human editor — co-editing with an agent

**Happy path:**
1. Opens editor in browser. Presence bar shows `[👤 Nick]`
2. Agent connects via DirectConnection (e.g., triggered by MCP tool call). Presence bar updates to `[👤 Nick] [🤖 Agent]`
3. Agent writes a new section. User sees: (a) region flash highlighting the new content, (b) activity indicator: "Agent added content", (c) presence bar shows agent status "editing"
4. User reads the new content. Decides to keep some, undo some.
5. User clicks "Undo Agent Edit" — only the agent's last write is reversed. User's own edits are untouched.
6. Agent disconnects. Presence bar shows `[👤 Nick]`. Agent entry fades out.

**Failure/recovery:**
- Agent write fails (malformed markdown): Observer B logs error, XmlFragment keeps last valid state. Activity indicator shows "Agent write failed" with error context.
- Agent awareness expires (30s timeout, but auto-renews — so only if DirectConnection crashes): presence bar removes agent after timeout.

**Aha moment:** "I can see the AI editing my doc in real-time and undo just its changes."

### P1: Human editor — multi-tab / multi-mode

1. User has WYSIWYG open. Opens second tab in source mode (or splits view).
2. Both tabs show each other's cursors (awareness state includes mode: 'wysiwyg' | 'source').
3. Typing in source mode → WYSIWYG updates via Observer B, cursor visible in source tab.

### Interaction state matrix

| Feature / Surface | Loading | Empty | Active | Error | Disconnected |
|---|---|---|---|---|---|
| Presence bar | "Connecting..." | Just local user | All participants shown | "Connection lost" | Reduced to local user |
| Human cursors (WYSIWYG) | None (waiting for sync) | No remote users | Colored carets + labels | N/A | Cursors disappear |
| Human cursors (Source) | None | No remote users | Colored carets + labels | N/A | Cursors disappear |
| Agent activity flash | N/A | N/A | Region highlight on write | "Write failed" indicator | N/A |
| Agent undo button | Disabled | Disabled (no agent edits) | Enabled when agent stack non-empty | N/A | Disabled |

## 6) Requirements

### Functional requirements

| Priority | ID | Requirement | Acceptance criteria | Notes |
|---|---|---|---|---|
| Must | FR1 | Human cursors in WYSIWYG | Remote user's caret + name label visible at their cursor position. Selection shown as colored highlight. Updates within 100ms of remote movement. | CollaborationCursor extension (`@tiptap/extension-collaboration-cursor`) |
| Must | FR2 | Human cursors in Source | Remote user's caret + name label visible in CodeMirror. Selection shown as colored highlight. | yCollab already handles via awareness |
| Must | FR3 | Awareness state on connect | On editor mount, call `awareness.setLocalStateField('user', { name, color, type: 'human' })` and `awareness.setLocalStateField('mode', 'wysiwyg')`. Identity from `?coeditor=` param + localStorage. | Generate random name+color if not set. Mode is a top-level awareness field, not nested in user. |
| Must | FR4 | Agent awareness via DirectConnection | Agent writes set `document.awareness.setLocalState({ user: { name, color, type: 'agent' } })` before transacting. Clear on disconnect. | Auto-renews every 15s per awareness protocol |
| Must | FR5 | Agent writes use origin 'agent-write' | All agent write endpoints use `doc.transact(fn, 'agent-write')` instead of `conn.transact()` | Enables per-origin undo |
| Must | FR6 | Y.Map('activity') side-channel | Agent writes append `{ agentId, timestamp, type: 'insert'\|'replace'\|'delete', description? }` to `Y.Map('activity')` INSIDE the same transaction as the content write. No `affectedRange` — flash plugin resolves position via XmlFragment observeDeep (D10). | Decoupled from observer chain. Key = agentId (D11). |
| Must | FR7 | Region flash in WYSIWYG | When Y.Map('activity') updates, highlight affected paragraph nodes with a CSS @keyframes animation (agent-colored tint, 2s fade-out). Use direct DOM approach (A6: decorations don't survive re-renders). | ProseMirror plugin + direct DOM manipulation |
| Must | FR8 | Region flash in Source | When Y.Map('activity') updates, highlight affected line range with a CodeMirror Decoration.line + fade animation | StateEffect + StateField pattern |
| ~~Must~~ | ~~FR9~~ | ~~Activity toast~~ | **Cut.** Flash + presence bar status ("editing"/"idle") are sufficient real-time signals. A toast on top of a flash is redundant. The proper product surface for "what did the agent do" is an activity feed (Future Work — see §15). | — |
| Must | FR10 | Per-origin undo (agent only) | **Server-side** UndoManager tracking 'agent-write' origin on the same Y.Doc where DirectConnection writes occur. Exposed via `POST /api/agent-undo` and `POST /api/agent-redo` HTTP endpoints. Browser "Undo Agent Edit" button calls these. (F5: browser-side UndoManager cannot capture remote origins — HocuspocusProvider overwrites origin to provider instance.) | Wired to UI button only (Q2: no keyboard shortcut for v0) |
| Must | FR11 | Presence bar | Horizontal bar showing all connected participants as colored badges. Human: name + mode indicator. Agent: name + "🤖" + status. | Watches `awareness.on('change')` |
| Should | FR12 | `?coeditor=` query param | `?coeditor=cursor\|claude-cowork\|standalone` sets identity context. Tab UUID for dedup. | localStorage persistence for name/color |
| Must | FR15 | Flash on tab refocus | When tab regains visibility (`document.visibilitychange` → `visible`), check Y.Map('activity') for entries newer than `lastSeenTimestamp`. Flash those regions. Handles "I switched tabs while agent was writing." | Store `lastSeenTimestamp` in flash plugin, update on each flash or visibility change |
| Should | FR13 | Mode indicator in awareness | Each client's awareness state includes `mode: 'wysiwyg' \| 'source'`. Visible in presence bar. | Helps know who's where |
| Could | FR14 | "Follow agent" mode | Click agent in presence bar → editor scrolls to where agent last wrote | Jump to last activity region |

### Non-functional requirements

- **Performance:** Awareness updates < 100ms latency. Region flash decoration applied within 50ms of Y.Map update. No jank on rapid agent writes.
- **Reliability:** Awareness auto-expires stale clients (30s). Activity map entries auto-evict after 30s. Presence bar degrades gracefully on disconnect.
- **Security/privacy:** No sensitive data in awareness state. Names are local-only (no auth). `?coeditor=` param is informational, not a trust boundary.
- **Operability:** Console logs for awareness connect/disconnect. Error logging for failed agent writes with context.

## 7) Success metrics & instrumentation

- **M1: Demo confidence** — Team can see human↔agent collaboration in real-time. Binary: does the demo land?
  - Baseline: No visual presence; ghost edits
  - Target: Human cursors visible, agent writes flash, undo works
- **M2: Awareness round-trip latency** — Time from remote edit to cursor/flash visible
  - Baseline: N/A
  - Target: < 200ms p95
  - Instrumentation: Timestamp in awareness state vs render time
- **M3: Agent undo reliability** — Per-origin undo reverses only agent edits, preserves user edits
  - Baseline: N/A
  - Target: 100% correct in test matrix
  - Instrumentation: E2E tests covering interleaved edit scenarios

## 8) Current state (how it works today)

- **Awareness protocol:** Connected via HocuspocusProvider. Packets flow. `setLocalState()` never called. No presence visible.
- **CollaborationCursor:** npm installed, not imported or configured in TiptapEditor.tsx.
- **yCollab:** Passes `provider.awareness` — remote cursors would render if awareness state existed.
- **Agent writes:** DirectConnection.transact() with default origin object. No awareness state set. Writes are invisible.
- **UndoManager:** TipTap and CodeMirror each have their own. No agent-specific UndoManager.
- **Transaction origin tracking:** Agent write origin lost in y-tiptap binding (only `isChangeOrigin: true` survives to ProseMirror).

## 9) Proposed solution (vertical slice)

### Architecture overview

```
┌─────────────────────────────────────────────────────┐
│                    Browser Client                     │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  TipTap      │  │  CodeMirror   │  │  Presence   │ │
│  │  + Collab    │  │  + yCollab    │  │  Bar (React)│ │
│  │    Cursor    │  │  (awareness   │  │             │ │
│  │  + Flash     │  │   already     │  │  watches    │ │
│  │    Plugin    │  │   wired)      │  │  awareness  │ │
│  │             │  │  + Flash      │  │  .on('change│ │
│  │             │  │    Plugin     │  │  ')         │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                │                  │         │
│         └────────┬───────┘                  │         │
│                  │                          │         │
│    ┌─────────────┴──────────────┐           │         │
│    │     Y.Doc (shared)         │           │         │
│    │  ├─ XmlFragment('default') │           │         │
│    │  ├─ Text('source')         │           │         │
│    │  ├─ Map('metadata')        │           │         │
│    │  ├─ Map('activity') ←NEW   │◄──────────┘         │
│    │  └─ awareness ←─── NOW SET │                     │
│    └────────────────────────────┘                     │
│                  │                                     │
│         HocuspocusProvider (WebSocket)                 │
└─────────────────────┬───────────────────────────────┘
                      │
         ┌────────────┴───────────────┐
         │     Hocuspocus Server       │
         │                             │
         │  DirectConnection           │
         │   .document.awareness       │
         │   .setLocalState({          │
         │     user: { type: 'agent' } │
         │   })                        │
         │                             │
         │  doc.transact(fn,           │
         │    'agent-write')           │
         │                             │
         │  Y.Map('activity').set(     │
         │    agentId, { timestamp,    │
         │    range, type })           │
         └─────────────────────────────┘
```

### Component design

#### 3.1 Awareness state shape

```typescript
interface AwarenessState {
  user: {
    name: string;        // "Nick" or "Claude Agent"
    color: string;       // "#30bced"
    type: 'human' | 'agent';
    coeditor?: string;   // "cursor" | "claude-cowork" | "standalone"
    tabId: string;       // UUID for dedup
  };
  mode: 'wysiwyg' | 'source' | 'idle';
  cursor?: {
    anchor: Y.RelativePosition;
    head: Y.RelativePosition;
  };
}
```

#### 3.2 Human cursor presence (WYSIWYG)

Wire `CollaborationCursor` in TiptapEditor.tsx:
```typescript
CollaborationCursor.configure({
  provider,
  user: { name, color, type: 'human' },
  render: (user) => renderCursor(user),      // Returns HTMLElement (cursor DOM)
  // selectionRender returns DecorationAttrs (object), NOT HTMLElement.
  // Default (defaultSelectionBuilder from y-prosemirror) is fine for v0.
})
```

Custom `renderCursor` returns different DOM for `user.type === 'agent'` vs `'human'`.

#### 3.3 Human cursor presence (Source)

Already wired via `yCollab(ytext, provider.awareness)`. Need to:
1. Call `awareness.setLocalStateField('user', { name, color })` on mount
2. Override CSS: `.cm-ySelectionCaret`, `.cm-ySelectionInfo`, `.cm-ySelection`
3. Update `awareness.setLocalStateField('mode', 'source')` on toggle (audit M6 — mode must update, not just be set once)

#### 3.4 Agent awareness via DirectConnection

**Persistent session model** — DirectConnection stays open for the agent's session lifetime (no timeout, verified from source). Awareness persists between transactions.

Agent write endpoints in `hocuspocus-plugin.ts`:

```typescript
// --- Session lifecycle (open once, reuse across writes) ---
// Store per-document: Map<docName, DirectConnection>
const agentSessions = new Map<string, DirectConnection>();

async function getAgentSession(docName: string): DirectConnection {
  let dc = agentSessions.get(docName);
  if (!dc) {
    dc = await hocuspocus.openDirectConnection(docName);
    // Set agent presence (persists across transactions)
    // Color: Claude brand terracotta (#D97757) — visually distinct from human azure (#3784FF)
    // Icon: ClaudeIcon component (copied from ~/agents/icons/claude.tsx) for presence badge
    dc.document.awareness.setLocalState({
      user: { name: 'Claude', color: '#D97757', type: 'agent', icon: 'claude', tabId: 'agent-' + Date.now() },
      mode: 'idle',
    });
    agentSessions.set(docName, dc);
  }
  return dc;
}

// --- Per-write (reuses existing session) ---
const dc = await getAgentSession('test-doc');

// Use dc.document.transact() directly — NOT conn.transact()
// conn.transact() hardcodes origin to { source: "local" }
// dc.document.transact() with string origin:
//   - Triggers Hocuspocus hooks (persistence runs) ✅
//   - UndoManager tracks 'agent-write' origin ✅
dc.document.transact(() => {
  const ytext = dc.document.getText('source');
  // ... Y.Text mutations ...

  // Activity map write INSIDE the same transaction (F1/C3 fix:
  // separate transactions create race condition in flash correlation)
  const activityMap = dc.document.getMap('activity');
  activityMap.set('agent-1', {
    agentId: 'agent-1',
    timestamp: Date.now(),
    type: 'insert',
    description: 'Added section: Build',
  });
}, 'agent-write');

// --- Cleanup (on agent session end) ---
dc.document.awareness.setLocalState(null);
await dc.disconnect();
agentSessions.delete('test-doc');
```

#### 3.5 Y.Map('activity') side-channel

Agent writes metadata alongside content:
```typescript
interface ActivityEntry {
  agentId: string;
  timestamp: number;
  type: 'insert' | 'replace' | 'delete';
  description?: string;  // "Added section: Build" (optional heading context)
}
```

Browser watches: `doc.getMap('activity').observe((event) => { ... })` → triggers region flash + activity indicator.

Auto-eviction: entries older than 30s are cleaned up on observation.

#### 3.6 Region flash plugin (WYSIWYG)

ProseMirror plugin that detects agent writes via dual observation (Y.Map('activity') + XmlFragment observeDeep):

1. Y.Map('activity') observer fires → records timestamp + agentId
2. XmlFragment observeDeep fires within 100ms window → identifies affected node positions
3. Plugin applies `Decoration.node()` (not inline) on affected paragraph-level nodes with `class: 'agent-flash'`
4. **CSS `@keyframes` animation** (not transition) — decorations are recreated on each ProseMirror transaction, so transitions don't survive. Use `animation: agent-flash 2s ease-out forwards` which fires on element creation.
5. Remove decoration after 2s via `setTimeout` → dispatch transaction that clears the decoration

```css
@keyframes agent-flash {
  0% { background: rgba(16, 185, 129, 0.2); }
  100% { background: transparent; }
}
.agent-flash { animation: agent-flash 2s ease-out forwards; }
```

**Alternative (if keyframes restart on re-render):** Apply flash via direct DOM manipulation — plugin finds affected paragraph DOM nodes via `view.nodeDOM(pos)`, adds a CSS class, removes after 2s. Bypasses ProseMirror decoration lifecycle entirely. Simpler and guaranteed to work.

**Flash on tab refocus (FR15):** The flash plugin maintains a `lastSeenTimestamp` (updated on each flash and on `visibilitychange` → `hidden`). When the tab regains focus (`visibilitychange` → `visible`), the plugin checks Y.Map('activity') for entries with `timestamp > lastSeenTimestamp`. If found, it triggers the standard flash for those entries. This handles the common case where the user switches tabs while the agent is writing — they see what changed when they come back.

```typescript
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const activityMap = doc.getMap('activity');
    for (const [agentId, entry] of activityMap.entries()) {
      if (entry.timestamp > lastSeenTimestamp) {
        triggerFlash(entry);
      }
    }
    lastSeenTimestamp = Date.now();
  } else {
    lastSeenTimestamp = Date.now();
  }
});
```

#### 3.7 Region flash plugin (Source)

CodeMirror StateField + StateEffect:
1. On Y.Map('activity') update, compute affected line range from Y.Text change
2. Dispatch `addFlash` StateEffect with line range
3. Apply `Decoration.line({ class: 'agent-flash' })` for affected lines
4. `setTimeout` → dispatch `removeFlash` effect

#### 3.8 Per-origin undo

**Server-side UndoManager** (F5 fix: browser-side UndoManager cannot capture remote origins)

The agent UndoManager MUST live on the server, on the same Y.Doc where `dc.document.transact(fn, 'agent-write')` executes. Browser-side UndoManager would never see origin `'agent-write'` because HocuspocusProvider overwrites remote transaction origins to the provider instance.

```typescript
// In hocuspocus-plugin.ts — alongside the persistent DC session
const agentUndoManagers = new Map<string, Y.UndoManager>();

function getAgentUndoManager(dc: DirectConnection): Y.UndoManager {
  const docName = dc.document.name;
  let um = agentUndoManagers.get(docName);
  if (!um) {
    const ytext = dc.document.getText('source');
    um = new Y.UndoManager(ytext, {
      trackedOrigins: new Set(['agent-write']),
    });
    agentUndoManagers.set(docName, um);
  }
  return um;
}

// HTTP endpoints
// POST /api/agent-undo → agentUndoManager.undo()
// POST /api/agent-redo → agentUndoManager.redo()
// Returns { ok: boolean, canUndo: boolean, canRedo: boolean }
```

Browser "Undo Agent Edit" button calls `POST /api/agent-undo`. The undo transaction executes server-side with origin = UndoManager instance → Observer B fires (origin ≠ either guard) → propagates to XmlFragment → syncs to all browser clients.

Does NOT conflict with TipTap's browser-side UndoManager (tracks `ySyncPluginKey`) or CodeMirror's (tracks `YSyncConfig`). Observer sync origins are invisible to all three.

**Audit fix (C2/I6):** Agent UndoManager tracks only `[ytext]`, not `[xmlFragment, ytext]`. All agent write endpoints must enter through Y.Text. The raw `/api/agent-write` endpoint must be migrated from XmlFragment direct writes to Y.Text writes (Observer B handles XmlFragment update).

#### 3.9 Presence bar (React component)

```tsx
function PresenceBar({ provider }: { provider: HocuspocusProvider }) {
  const [participants, setParticipants] = useState<AwarenessState[]>([]);
  
  useEffect(() => {
    const handler = () => {
      const entries = Array.from(provider.awareness.getStates().entries());
      setParticipants(entries
        .filter(([, s]) => s.user)
        .map(([clientId, s]) => ({ clientId, ...s }))
      );
    };
    provider.awareness.on('change', handler);
    return () => provider.awareness.off('change', handler);
  }, [provider]);
  
  return (
    <div className="presence-bar">
      {participants.map(p => (
        <PresenceBadge key={p.clientId} user={p.user} mode={p.mode} />
      ))}
    </div>
  );
}
```

#### 3.10 Identity system (`?coeditor=` + localStorage)

```typescript
function getIdentity(): { name: string; color: string; coeditor: string; tabId: string } {
  const params = new URLSearchParams(window.location.search);
  const coeditor = params.get('coeditor') || 'standalone';
  const tabId = crypto.randomUUID();
  
  // Check localStorage for persisted identity
  let name = localStorage.getItem('ok-user-name');
  let color = localStorage.getItem('ok-user-color');
  
  if (!name) {
    name = generateRandomName(); // e.g., "Curious Otter"
    localStorage.setItem('ok-user-name', name);
  }
  if (!color) {
    color = generateRandomColor(); // from a curated palette
    localStorage.setItem('ok-user-color', color);
  }
  
  return { name, color, coeditor, tabId };
}
```

### Affected routes / pages

| Route / Page | Surface | What to verify |
|---|---|---|
| `/` (editor) | TipTap WYSIWYG | Cursors visible, flash on agent write, undo works |
| `/` (editor, source toggle) | CodeMirror | Cursors visible, flash on agent write |
| `/` (presence bar) | Top bar | Shows all participants, updates on connect/disconnect |
| `/api/agent-write-md` | HTTP endpoint | Sets awareness, uses 'agent-write' origin, writes activity |

### Data flow diagram

- **Primary flow (agent write):** HTTP POST → DirectConnection → set awareness → `doc.transact(fn, 'agent-write')` → Y.Text mutation → Observer B propagates to XmlFragment → Y.Map('activity') set → browser flash plugin triggers → presence bar updates → activity toast shows
- **Primary flow (human cursor):** keystroke → ProseMirror/CodeMirror → Yjs binding → awareness cursor update → broadcast to peers → remote cursor decoration renders
- Shadow paths to test:
  - **Agent disconnects mid-write:** Awareness clears after 30s timeout. Activity map entry persists. Flash still shows from the partial write.
  - **Rapid agent writes:** Activity map entries coalesce. Flash extends/restarts animation. Activity toast shows latest.
  - **Two agents write simultaneously:** Each gets distinct awareness clientID. Both appear in presence bar. Flashes show for both.
  - **Agent writes while user is typing same region:** Both edits apply via CRDT merge. User's undo stack unaffected. Agent undo stack has agent's changes.

### Failure modes and handling

| Component | Failure | Detection | Recovery | User Impact |
|---|---|---|---|---|
| Awareness broadcast | WebSocket disconnect | `provider.on('disconnect')` | Auto-reconnect (Hocuspocus) | Cursors disappear temporarily, reappear on reconnect |
| Agent DirectConnection | Crash during transact | try/catch in endpoint | 500 response, awareness state expires after 30s | Ghost agent in presence bar for up to 30s |
| Flash plugin | Activity map out of sync with content | Map entry timestamp vs current doc | Ignore stale entries (> 5s) | Flash on wrong region (rare, transient) |
| Per-origin undo | Interleaved human+agent edits | UndoManager handles correctly (verified from source) | Yjs only undoes agent-originated items | Works correctly — user edits preserved |

### Alternatives considered

- **Option A: Origin propagation through y-tiptap** — Patch y-tiptap to include `transaction.origin` in `setMeta(ySyncPluginKey, ...)`. More precise attribution. Rejected for v0: invasive change to fork, fragile across upgrades. Worth reconsidering for v1.
- **Option B: Liveblocks-style diff overlay** — Show agent writes as a diff with accept/reject. Rejected: PQ11 explicitly rules out suggest mode. Agent writes land live.
- **Option C: Fake cursor animation** — Animate a cursor moving through agent-written content over 500ms. Rejected: dishonest representation of how agents actually edit. Technically fragile for batch operations.
- **Why Y.Map side-channel (chosen):** Decoupled from sync loop. No risk of breaking origin guards. Works identically in both WYSIWYG and source. Simple to implement. Extensible (can add richer metadata later).

## 10) Decision log

| ID | Decision | Type | Resolution | 1-way? | Rationale | Evidence | Implications |
|---|---|---|---|---|---|---|---|
| D1 | No suggest mode — agent writes land live | P | LOCKED | Yes | PQ11 from PROJECT.md. Agents produce batch rewrites; inline suggestions are UX mismatch. | TQ16, PQ11 | Agent changes are immediately visible; undo is the safety net |
| D2 | Y.Map('activity') side-channel for attribution | T | DIRECTED | No | Yjs transaction origin lost in y-tiptap/y-codemirror.next binding layer. Side-channel is decoupled and safe. | Source code trace of y-tiptap `_typeChanged` | Flash plugin watches map, not transaction metadata |
| D3 | Agent writes use `dc.document.transact(fn, 'agent-write')` — bypasses conn.transact() | T | LOCKED | Yes | conn.transact() hardcodes origin to `{ source: "local" }` — can't pass custom origin. dc.document.transact() with string origin still triggers Hocuspocus hooks (verified) AND enables UndoManager tracking. | DirectConnection source + shouldSkipStoreHooks trace | All agent write endpoints must use dc.document.transact() |
| D4 | Three independent UndoManagers — agent one is SERVER-SIDE | T | LOCKED | No | TipTap (browser) tracks ySyncPluginKey, CodeMirror (browser) tracks YSyncConfig, Agent UndoManager (SERVER) tracks 'agent-write'. Browser-side cannot capture remote origins (F5). Verified: no conflict between managers. | Yjs UndoManager.js + HocuspocusProvider MessageReceiver.ts | Agent undo exposed via HTTP endpoints, not browser UndoManager |
| D5 | DirectConnection.document.awareness for agent presence | T | DIRECTED | No | Verified: setLocalState broadcasts to all WebSocket clients, auto-renews every 15s, separate clientID. | Hocuspocus source: Document.ts line 192-216 | Agent appears as real awareness participant |
| D6 | Identity via ?coeditor= param + localStorage | P | DIRECTED | No | No auth system. Random name+color, persisted. Tab UUID for dedup. Param identifies embedding context. | — | Not a trust boundary — informational only |
| D7 | No fake cursor for agents | P | LOCKED | Yes | Agents apply batch diffs, not keystrokes. Fake cursor misrepresents reality. | TQ16: "8/11 agents use string replacement" | Agent UX is flash+indicator, not cursor |
| D8 | Region flash with 2s fade-out | P | DELEGATED | No | Implementer determines exact animation timing, color, and behavior. 2s is starting point. | Liveblocks uses streaming; we use batch flash | Can tune based on user feedback |
| D9 | Persistent DirectConnection session for agents (not per-request) | T | LOCKED | No | DC has no timeout. Awareness persists between transactions. Per-request would make agent presence too ephemeral (milliseconds). Session pooled in Map<docName, DC>. | DirectConnection source: no timeout, no auto-disconnect | Agent endpoints refactored from open-transact-close to session model |
| D10 | Flash detection via XmlFragment observeDeep (not activity map position mapping) | T | DIRECTED | No | Activity map carries metadata (agentId, timestamp, type). Flash plugin detects affected nodes by observing XmlFragment changes within 100ms of activity map update. Avoids brittle Y.Text→ProseMirror position mapping. | Q3 resolution | Flash plugin needs both Y.Map observer + XmlFragment observer |
| D11 | Activity map key = agentId (one entry per agent, latest wins) | T | DIRECTED | No | `activityMap.set(agentId, entry)` — simple, bounded (one key per active agent), no cleanup needed beyond awareness expiry. | Q15 resolution | Multiple concurrent agents get separate keys |
| D12 | Agent UndoManager is server-side, exposed via HTTP | T | LOCKED | Yes | HocuspocusProvider overwrites remote transaction origins to the provider instance (verified: MessageReceiver.ts → Y.applyUpdate with origin=provider). Browser-side UndoManager with trackedOrigins: Set(['agent-write']) never fires. Server-side UndoManager on the same Y.Doc sees the original 'agent-write' origin. | Yjs Transaction.js line 349: `transaction.local = false` for remote; UndoManager.js line 215: checks `trackedOrigins.has(transaction.origin)` | `POST /api/agent-undo`, `POST /api/agent-redo` endpoints. Button in browser calls these. |

## 11) Open questions

| ID | Question | Type | Priority | Blocking? | Plan to resolve | Status |
|---|---|---|---|---|---|---|
| Q1 | Flash granularity: paragraph-level or character-level? | T | P0 | No | Paragraph-level for v0. Batch writes affect whole sections — character precision adds complexity without value for the demo use case. | Decided: paragraph |
| Q2 | Keyboard shortcut for "Undo Agent Edit" | P | P2 | No | Button-only for v0. Keyboard shortcut conflicts with existing redo bindings across platforms. | Decided: button-only |
| Q3 | How to map Y.Map('activity') entries to WYSIWYG node positions when write came through Observer B? | T | P0 | No | **Resolved (D10):** Don't map from activity entry. Observe XmlFragment changes with a separate `observeDeep` that fires alongside Observer B. Detect changes within 100ms of an activity map update → those are the agent-affected nodes. Avoids brittle position mapping. | Decided |
| Q4 | External editor presence (disk bridge) in presence bar? | P | P2 | No | Not for v0 (NG4). Disk bridge has no WebSocket awareness channel. | Deferred |
| Q5 | Activity indicator format: toast vs sidebar? | P | P2 | No | Toast for v0 (auto-dismiss 5s). Sidebar activity feed is Future Work. | Decided: toast |
| Q6 | Agent DirectConnection lifecycle: per-request or persistent? | T | P0 | No | **Resolved:** DC has no timeout, supports multiple transactions, awareness persists. Keep DC open as long-lived agent session. Per-request would make awareness too ephemeral (milliseconds). | Decided: persistent session |
| Q7 | `doc.transact(fn, 'agent-write')` vs `conn.transact()` — does bypassing conn.transact() skip hooks? | T | P0 | No | **Resolved:** `conn.transact()` hardcodes origin to `{ source: "local" }` — cannot pass custom origin. But `dc.document.transact(fn, 'agent-write')` with string origin still triggers hooks (string fails isTransactionOrigin check → shouldSkipStoreHooks returns false → persistence runs). Use `dc.document.transact()` directly. | Decided: dc.document.transact |
| Q8 | Color palette management — how to avoid duplicate colors for multiple users? | T | P2 | No | Curated palette of 8-10 distinct colors. Assign by clientID modulo palette size. Collisions acceptable for v0. | Open |
| Q9 | Multi-tab awareness dedup — user opens 2 tabs, appears twice in presence bar | P | P2 | No | Acceptable for v0. Each tab is a separate awareness client. Could deduplicate by localStorage userId in future. | Decided: accept for v0 |
| Q10 | Flash decoration survival across ProseMirror re-renders — does CSS animation restart on transaction? | T | P0 | No | **Resolved: Animations do NOT survive.** DecorationSet.map() creates new Decoration objects → InlineType.eq() fails → DOM recreated → animation resets. **Mitigation:** Use CSS `@keyframes` animation (not transition) triggered by class addition, and manage flash lifecycle outside decoration system — e.g., plugin applies `data-agent-flash` attribute to affected DOM nodes directly via `view.dom.querySelectorAll()` after decoration is applied, with a separate timer to remove. Or use a node decoration that wraps the paragraph. | Decided: use @keyframes + direct DOM |
| Q11 | UndoManager captureTimeout for agent writes — should rapid agent writes (< 500ms apart) group into one undo step? | T | P2 | No | Default 500ms captureTimeout is fine. Rapid writes group naturally. Can tune later. | Decided: use default |
| Q12 | Raw agent-write endpoint (/api/agent-write) writes to XmlFragment directly, not Y.Text — what origin? | T | P0 | No | **Superseded by C2 audit fix.** Raw endpoint MUST be migrated to Y.Text path. All agent writes enter through Y.Text with origin 'agent-write'. Observer B handles XmlFragment propagation. | Decided (migrated) |
| Q13 | Testing strategy for presence: how to E2E test multi-client awareness? | T | P0 | No | Playwright multi-context: two BrowserContexts connected to same doc, verify cursor visibility and flash. Similar to existing sync.spec.ts pattern. | Open |
| Q14 | Accessibility: cursor labels, flash animations, presence bar screen reader support? | P | P2 | No | aria-live region for activity indicator. Reduced-motion media query for flash. Cursor labels are visual-only (acceptable for v0). | Open |
| Q15 | Y.Map('activity') key structure: single 'last-write' key or per-write unique keys? | T | P0 | No | Single key per agentId: `activityMap.set(agentId, entry)`. Multiple agents get separate keys. Overwrites previous entry from same agent (latest wins). Simple, avoids unbounded growth. | Decided |

## 12) Assumptions

| ID | Assumption | Confidence | Verification plan | Expiry | Status |
|---|---|---|---|---|---|
| A1 | DirectConnection.document.awareness.setLocalState() broadcasts to all WebSocket clients | HIGH | Verified from Hocuspocus source (Document.ts handleAwarenessUpdate) | — | Verified ✅ |
| A2 | Multiple UndoManagers on same Y.Type don't conflict | HIGH | Verified from Yjs source + test suite | — | Verified ✅ |
| A3 | y-tiptap discards Yjs transaction origin (only isChangeOrigin boolean survives) | HIGH | Verified from y-tiptap source (_typeChanged, line 690) | — | Verified ✅ |
| A4 | Observer B propagates agent undo correctly (UndoManager origin won't match either guard) | HIGH | Verified from observers.ts guard logic + UndoManager source (origin = UndoManager instance) | — | Verified ✅ |
| A5 | Y.Map('activity') updates propagate to browser with < 100ms latency | MEDIUM | Test during implementation | Before QA | Active |
| A6 | ProseMirror decorations recreate DOM on each transaction — CSS transitions restart | HIGH | Verified from prosemirror-view source: DecorationSet.map() creates new objects, DOM is recreated. Use @keyframes animation or direct DOM manipulation instead. | — | Verified ✅ (animations do NOT survive) |
| A7 | DirectConnection can be kept open across multiple agent writes (session-based, not per-request) | MEDIUM | Test: open DC, transact, wait, transact again — verify awareness persists between transactions | Before implementation | Active |
| A8 | CollaborationCursor extension is compatible with current TipTap + Collaboration setup | MEDIUM | Integration test: add extension, verify no conflicts with existing collaboration extension | Before implementation | Active |
| A9 | Awareness auto-reconnects after WebSocket disconnect/reconnect | MEDIUM | Verify: HocuspocusProvider reconnection restores awareness state for all clients | Before QA | Active |

## 13) In Scope (implement now)

- **Goals:** G1-G5 (all)
- **Non-goals:** NG1-NG6 (all excluded)
- **Requirements:** FR1-FR13 (Must + Should). FR14 (Could) deferred to v1.
- **Solution:** §9 vertical slice — all 10 components (3.1-3.10)
- **Owner:** Nick Gomez
- **Risks + mitigations:** See §14

### Deployment / rollout considerations

| Concern | Approach | Verify |
|---|---|---|
| Agent write origin change | Migrate all agent endpoints to `dc.document.transact(fn, 'agent-write')` | Existing E2E tests + new presence tests |
| `/api/agent-write` raw endpoint migration | Must migrate from XmlFragment direct write to Y.Text write path (audit C2) | Test undo works for both endpoints |
| Y.Map('activity') added to Y.Doc | New CRDT type in shared document | Persistence handles it (Hocuspocus serializes entire Y.Doc) |
| `@tiptap/extension-collaboration-cursor` not in package.json | Add dependency (worldmodel: TipTap v3 renamed from collaboration-cursor) | `bun add @tiptap/extension-collaboration-cursor` |
| CSS for cursor/flash styling | New stylesheet or Tailwind classes | Visual QA in both modes |
| Agent DC session cleanup on server restart | Clear stale `agentSessions` map entries (audit I3) | Restart test |

## 14) Risks & mitigations

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| Flash decoration interferes with editor performance on rapid agent writes | Low | Medium | Debounce flash to max 1 per 500ms; batch activity map writes | Implementation |
| Agent awareness state persists after crash (ghost in presence bar) | Medium | Low | 30s auto-expiry in awareness protocol | Built-in |
| Y.Map('activity') grows unboundedly | Medium | Low | Auto-evict entries > 30s on observation | Implementation |
| CollaborationCursor extension conflicts with existing TipTap setup | Low | High | Test in isolation first; extension is well-maintained | Implementation |
| Per-origin undo of agent Y.Text write causes Observer B to fire incorrectly | Low | High | Verified: UndoManager origin ≠ either guard origin, so Observer B fires correctly (desired) | Verified ✅ |

## 15) Future Work

### Explored
- **Origin propagation through y-tiptap (D2 alternative)**
  - What we learned: y-tiptap `_typeChanged` at line 690 only passes `{ isChangeOrigin: true }`. Could patch to include `transaction.origin`.
  - Recommended approach: Fork y-tiptap, add origin to setMeta payload, submit upstream PR.
  - Why not in scope now: Invasive fork for v0; Y.Map side-channel is sufficient.
  - Triggers to revisit: If flash precision needs character-level accuracy; if upstream adds origin support.

- **Persistent origin attribution (visual markers on agent content)**
  - What we learned: ProseMirror `prosemirror-changeset` can compute blame maps. Track-changes extensions exist for TipTap.
  - Recommended approach: Maintain a blame map per-document using transaction origins; render as subtle left-border stripe on agent-written paragraphs.
  - Why not in scope now: Flash-then-fade is sufficient for v0 demo. Persistent markers add visual clutter.
  - Triggers to revisit: User testing shows people lose track of what the agent changed.

### Identified
- **Activity feed** (the proper "what did the agent do" surface)
  - What we know: Y.Map('activity') captures ephemeral write events. For a real feed, need persistent storage — git commit log (refs/wip/main already tracks auto-saves), a dedicated activity table, or enriched Y.Map entries that persist across sessions. PROJECT.md S5 describes: "Activity feed showing recent agent actions" and the async review case: "you open the product after Claude ran overnight, see an activity feed of what changed with visual diffs."
  - Why it matters: Flash handles "I saw it happen." The feed handles "I wasn't watching" and "what did the agent do while I was away?" These are different products — real-time presence vs async review.
  - What investigation is needed: Persistent storage model (git log parsing vs dedicated store), feed UX (sidebar panel? dedicated page?), diff rendering for each entry, interaction with per-origin undo ("undo this specific change from the feed"), relationship to S6 (version history timeline).

- **Agent conflict prevention via awareness-based soft locks**
  - What we know: PADLOCK study (CHI 2024): 13/14 users chose isolation over transparent merge. Awareness can broadcast `editingElement` state.
  - Why it matters: If agents and humans frequently edit the same paragraph, silent CRDT merge can surprise users.
  - What investigation is needed: Real-world frequency of concurrent same-paragraph edits.

### Identified
- **Multi-file sidebar presence** ("which files the agent is editing")
  - What we know: PROJECT.md S5 envisions sidebar showing agent activity across multiple files. Requires S3 (sidebar/file tree) which doesn't exist yet. Current spec is single-document.
  - Why it matters: The switching narrative in PROJECT.md includes "sidebar presence showing which files the agent is editing" — this is part of the full S5 vision.
  - What investigation is needed: S3 (sidebar/file tree) must be built first. Then multi-document awareness (one DC per document, presence scoped per doc).

- **Async activity review** ("open after Claude ran overnight, see what changed")
  - What we know: PROJECT.md S5 value narrative includes async review as the third pillar alongside real-time co-editing and per-origin undo. Requires persistent activity log (not ephemeral Y.Map), visual diffs, and a review surface.
  - Why it matters: This is the "trust through transparency" story — human always knows what the agent did.
  - What investigation is needed: Persistent activity storage (git log? dedicated activity table?), diff rendering, review UX design.

### Noted
- **External editor presence** — Disk bridge users (VS Code, Cursor) as "ghost" participants in presence bar. Would need awareness channel over file-watcher.
- **Multi-human presence polish** — Avatars, initials, cursor follow mode, viewport awareness. Deferred to hosted/multi-user deployment.
- **Liveblocks-style REST presence API** — `setPresence()` equivalent for agents without WebSocket. Not needed while DirectConnection works.
- **History view with diff highlighting** — Rather than persistent origin shading on the live document (which goes stale as content evolves), attribution likely belongs in a history/timeline view (S6) where users can click through changes and see who wrote what at each point in time. Open product question — needs design exploration as part of S6 spec.

## 16) Agent constraints

- **SCOPE:** `init_spike/src/editor/`, `init_spike/src/server/hocuspocus-plugin.ts`, `init_spike/src/App.tsx`, `init_spike/src/` (new components)
- **EXCLUDE:** `init_spike/src/server/persistence.ts` (no changes needed), `init_spike/src/editor/extensions/frontmatter.ts`, `init_spike/src/editor/extensions/jsx-component.ts`, git pipeline
- **STOP_IF:** Changes to y-tiptap or y-codemirror.next source (fork/patch), changes to Yjs core, new npm dependencies not in the awareness/collaboration ecosystem
- **ASK_FIRST:** UndoManager scope decisions (which Y.Types to track), keyboard shortcut assignments, activity indicator placement
- **REACT_FIRST:** All new browser-side code MUST follow ~/agents React patterns (React 19). See `evidence/frontend-design-system.md` for full pattern reference.

  **Pattern alignment with ~/agents:**
  - `use()` hook for context (NOT `useContext` — Biome blocks it in ~/agents)
  - `'use memo'` directive on components/hooks that benefit from memoization (React Compiler annotation mode) — instead of manual `useMemo`/`useCallback`
  - `useEffect` with proper cleanup for event subscriptions (awareness listeners, visibility change, Y.Map observers) — this is still the ~/agents pattern for subscriptions
  - Zustand store if presence state needs to be global across components (e.g., `usePresenceStore`)
  - TanStack React Query `useMutation` for agent undo HTTP calls (`POST /api/agent-undo`)

  **Exceptions** (TipTap/ProseMirror API constraints — imperative by design):
  - CollaborationCursor `render()` must return HTMLElement (TipTap API)
  - ProseMirror flash plugin internals are imperative

  **Hooks to create:**
  - `usePresence(provider)` — watches `awareness.on('change')`, returns participants array. Uses `useEffect` for subscription + cleanup.
  - `useAgentFlash(doc)` — watches Y.Map('activity') + XmlFragment observeDeep, triggers flash. `useEffect` for observers.
  - `useVisibilityChange(callback)` — wraps `document.addEventListener('visibilitychange')` in `useEffect` with cleanup.
  - `useIdentity()` — reads `?coeditor=` param + localStorage, returns `{ name, color, coeditor, tabId }`. Pure derivation, no effects needed.
  - `useAgentUndo(docName)` — wraps `useMutation` for `POST /api/agent-undo` and `POST /api/agent-redo`. Returns `{ undo, redo, canUndo, canRedo }`.

  **Components to create:**
  - `<PresenceBar provider={...} />` — uses `usePresence()` hook
  - `<PresenceBadge user={...} mode={...} />` — pure display, uses Badge from ~/agents
  - `<AgentUndoButton docName={...} />` — uses `useAgentUndo()` hook + Button from ~/agents
- **DESIGN_SYSTEM:** All new UI components MUST align with ~/agents design system. Copy source files directly from `~/agents/agents-manage-ui/` — no wrappers, no abstractions. See `evidence/frontend-design-system.md` for full token reference.

  **Direct copies (unmodified):**
  ```
  ~/agents/agents-manage-ui/src/lib/utils.ts              → init_spike/src/lib/utils.ts
  ~/agents/agents-manage-ui/src/components/ui/button.tsx   → init_spike/src/components/ui/button.tsx
  ~/agents/agents-manage-ui/src/components/ui/badge.tsx    → init_spike/src/components/ui/badge.tsx
  ~/agents/agents-manage-ui/src/components/ui/tooltip.tsx  → init_spike/src/components/ui/tooltip.tsx
  ~/agents/agents-manage-ui/src/components/ui/sonner.tsx   → init_spike/src/components/ui/sonner.tsx
  ~/agents/agents-manage-ui/src/components/icons/claude.tsx  → init_spike/src/components/icons/claude.tsx
  ~/agents/agents-manage-ui/src/components/icons/cursor.tsx  → init_spike/src/components/icons/cursor.tsx
  ~/agents/agents-manage-ui/postcss.config.ts              → init_spike/postcss.config.ts
  ```
  
  Also available at `/tmp/claude-logo.svg` (standalone SVG, `#D97757` fill) if needed outside React.

  **Copy + trim:** `globals.css` — copy @theme block (color tokens, radius, fonts, animations), strip sidebar/chart/xyflow tokens, add `agent-flash` keyframe → `init_spike/src/globals.css`

  **Dependencies to add:**
  ```
  bun add tailwindcss@4 @tailwindcss/postcss class-variance-authority clsx tailwind-merge sonner lucide-react radix-ui
  ```
  Note: `radix-ui` (monorepo package), NOT `@radix-ui/react-tooltip` (old individual packages). The ~/agents tooltip.tsx imports from `'radix-ui'`.

  **Patterns:** CVA + cn() for variants. data-slot convention. font-mono uppercase for UI labels. Sonner for toasts. Lucide for icons. Inter (sans) + JetBrains Mono (mono). If additional ui/ components are needed during implementation, copy 1:1 from the same ~/agents source directory.
