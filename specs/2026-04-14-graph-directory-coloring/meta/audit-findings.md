# Audit Findings

**Artifact:** specs/2026-04-14-graph-directory-coloring/SPEC.md
**Audit date:** 2026-04-14
**Total findings:** 5 (2 high, 2 medium, 1 low)

---

## High Severity

### [H1] Finding 1: Fallback colors have wrong theme assignment AND lose blue-gray hue

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §6.2 (Palette), evidence/graph-view-surface.md
**Issue:** Two compounding errors in the fallback color definitions:

1. **Theme swap.** The spec assigns `DIRECTORY_FALLBACK_LIGHT` to match the current *dark-mode* default color and vice versa. Current code (`GraphView.tsx:117`):
   ```ts
   const defaultNodeColor = isDark ? '#6b7280' : '#9ca3af';
   ```
   So light-mode default = `#9ca3af` and dark-mode default = `#6b7280`. The spec reverses this.

2. **Hue loss.** The proposed HSL values are pure grays that strip the blue undertone from the current Tailwind gray-400/gray-500 colors:
   - `hsl(0 0% 42%)` = `#6b6b6b` (pure gray) — claimed to match `#6b7280` which is actually `hsl(220, 9%, 46%)` (blue-gray)
   - `hsl(0 0% 64%)` = `#a3a3a3` (pure gray) — claimed to match `#9ca3af` which is actually `hsl(218, 11%, 65%)` (blue-gray)

**Current text:** "DIRECTORY_FALLBACK_LIGHT = 'hsl(0 0% 42%)'; // matches current `#6b7280`" and "DIRECTORY_FALLBACK_DARK = 'hsl(0 0% 64%)'; // matches current `#9ca3af`"
**Evidence:** `GraphView.tsx:117` shows light = `#9ca3af`, dark = `#6b7280`. Python HSL conversion confirms `hsl(0,0%,42%)` = `#6b6b6b`, not `#6b7280`.
**Status:** CONTRADICTED
**Suggested resolution:** Correct the fallback definitions to:
```ts
export const DIRECTORY_FALLBACK_LIGHT = '#9ca3af';  // current light-mode default (Tailwind gray-400)
export const DIRECTORY_FALLBACK_DARK  = '#6b7280';  // current dark-mode default (Tailwind gray-500)
```
Use the hex values directly rather than approximate HSL. This preserves the blue-gray hue and correct theme assignment, satisfying G6 (graceful degradation to current behavior).

---

### [H2] Finding 2: `safeLocalStorageGet/Set` not exported — spec claims reuse but functions are private, and Agent Constraints prevent fixing

**Category:** FACTUAL + COHERENCE
**Source:** T1 (own codebase) + L1 (cross-finding contradiction)
**Location:** SPEC.md §6.6 (Depth state), §6.2, §14 (Agent Constraints), evidence/sidebar-and-color-primitives.md
**Issue:** The spec says the depth-state provider will use `safeLocalStorageSet` from `identity.ts` (§6.6: "persists on change via safeLocalStorageSet (from identity.ts)"). The evidence file reinforces this: "Persistence: `safeLocalStorageGet/Set()` (lines 107-143)." However, `safeLocalStorageGet` and `safeLocalStorageSet` are **not exported** from `identity.ts` — they are module-private functions.

This creates a three-way contradiction:
1. §6.6 says "reuse `safeLocalStorageSet` from identity.ts" — requires import
2. `identity.ts` does not export these functions — import is impossible
3. §14 Agent Constraints says `identity.ts` is "reuse only — do not modify API" — exporting them would violate the constraint

The implementer must either (a) modify `identity.ts` exports (violates §14), (b) duplicate the functions (violates §6.2 "does not re-implement"), or (c) use raw `localStorage` directly (deviates from the stated pattern).

**Current text:** "persists on change via safeLocalStorageSet (from identity.ts)"
**Evidence:** `grep 'export function safeLocalStorage' identity.ts` returns no matches. Only `deriveIconColor`, `generateRandomName`, `generateRandomColor`, `getIdentity`, and `HUMAN_COLORS` are exported.
**Status:** INCOHERENT
**Suggested resolution:** Either (a) update §14 Agent Constraints to allow exporting `safeLocalStorageGet/Set` from `identity.ts`, or (b) extract these two functions to a shared `packages/core/src/utils/local-storage.ts` module (added to SCOPE) and update both `identity.ts` and the new depth-state provider to import from there.

---

## Medium Severity

### [M1] Finding 3: `hexToHsl`/`hslToHex` claimed as reusable but are private functions

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** SPEC.md §6.2 (Palette)
**Issue:** §6.2 states: "Reuses identity-module utilities: `hexToHsl`, `hslToHex`, `deriveIconColor` from `packages/core/src/utils/identity.ts`." Of these three, only `deriveIconColor` is exported. `hexToHsl` and `hslToHex` are module-private.

Lower impact than H2 because the palette module defines pre-baked hex arrays (no HSL conversion needed at runtime), and `deriveIconColor` (which IS exported) handles the only HSL operation the sidebar needs. The claim of dependency on `hexToHsl`/`hslToHex` appears to be inaccurate — the directory-color module likely does not need them.

**Current text:** "Reuses identity-module utilities: `hexToHsl`, `hslToHex`, `deriveIconColor` from `packages/core/src/utils/identity.ts`."
**Evidence:** `grep 'export function hexToHsl' identity.ts` and `grep 'export function hslToHex' identity.ts` both return no matches.
**Status:** CONTRADICTED
**Suggested resolution:** Remove `hexToHsl` and `hslToHex` from the stated dependency list. The palette module uses pre-baked hex arrays and `deriveIconColor` (which is exported) for sidebar stroke computation. If HSL conversion is needed in future, the export question applies.

---

### [M2] Finding 4: Evidence file incorrectly describes link-graph endpoint response shape

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** evidence/graph-view-surface.md (lines 21-24)
**Issue:** The evidence file describes the `/api/link-graph` payload as:
```ts
{ nodes: string[], links: Array<{ source: string, target: string }> }
```
The actual endpoint (`api-extension.ts:849-853`) returns enriched node objects:
```ts
{ ok: true, nodes: Array<{ id: string, label: string }>, links: Array<{ source: string, target: string }> }
```
Nodes are objects with `id` and `label`, not plain strings. The response also includes an `ok: true` field.

The spec's proposed integration code in §6.3 uses `node.id` (correct for objects), so the implementation would work despite the evidence error. But the evidence file is factually wrong and could mislead an implementer reading it for context.

**Current text:** "Payload shape: `{ nodes: string[], links: Array<{ source: string, target: string }> }`"
**Evidence:** `api-extension.ts:849-853` shows `enrichedNodes = nodes.map((id) => ({ id, label: readPageTitleForDocName(id) }))` and response includes `{ ok: true, nodes: enrichedNodes, links }`.
**Status:** CONTRADICTED
**Suggested resolution:** Update evidence/graph-view-surface.md payload shape to:
```ts
{ ok: true, nodes: Array<{ id: string, label: string }>, links: Array<{ source: string, target: string }> }
```

---

## Low Severity

### [L1] Finding 5: Evidence file has default node colors swapped by theme

**Category:** FACTUAL
**Source:** T1 (own codebase)
**Location:** evidence/graph-view-surface.md (line 36-37)
**Issue:** The evidence file lists:
```
- Default (light): `#6b7280` | (dark): `#9ca3af`
```
The actual code (`GraphView.tsx:117`):
```ts
const defaultNodeColor = isDark ? '#6b7280' : '#9ca3af';
```
Meaning light = `#9ca3af` (lighter gray), dark = `#6b7280` (darker gray). The evidence has these swapped. This is the root cause of the H1 fallback color error — the spec inherited the swapped assignment from the evidence.

Active colors are correctly listed (verified: light = `#3784ff`, dark = `#69a3ff`).

**Current text:** "Default (light): `#6b7280` | (dark): `#9ca3af`"
**Evidence:** `GraphView.tsx:117` — `const defaultNodeColor = isDark ? '#6b7280' : '#9ca3af';`
**Status:** CONTRADICTED
**Suggested resolution:** Correct to "Default (light): `#9ca3af` | (dark): `#6b7280`"

---

## Confirmed Claims (summary)

**T1 (Own codebase) — verified:**
- GraphView.tsx uses react-force-graph-2d with canvas-based rendering (line 3 import confirmed)
- `nodeColor` prop exists at lines 147-149 with binary active/default logic
- `useTheme()` import and `resolvedTheme` destructuring confirmed (lines 1, 50)
- GraphPanel.tsx container with fullscreen toggle (Maximize2/Minimize2) + PanelCount stats confirmed
- Panel/PanelHeader/PanelTitle/PanelCount components exist in `ui/panel.tsx` as described
- `Button variant="ghost" size="icon-sm"` pattern confirmed in GraphPanel.tsx
- FileTree.tsx uses lucide `Folder`/`FolderOpen` with `stroke="var(--color-muted-foreground)"` (lines 103, 134)
- FileTree.tsx `buildTree(documents)` at line 418, flat `DocEntry[]` input from `/api/documents` at line 275
- `userExpanded`/`userCollapsed` are session-only useState Sets (lines 253-254, not persisted)
- `identity.ts` exports `deriveIconColor` (L=32%, S=45% hue-preserving darker) — confirmed exported
- `HUMAN_COLORS`: 7 pastel hex strings (lines 5-13) — confirmed
- `generateRandomColor()` at line 96 — confirmed
- main.tsx `ThemeProvider` with `attribute="class"`, `defaultTheme="system"`, `storageKey="ok-theme-v1"` — confirmed
- globals.css uses Tailwind v4 `@theme` directive with semantic tokens as listed — confirmed
- No d3-scale-chromatic/colorbrewer dependency in any package.json — confirmed
- react-force-graph-2d version `^1.29.1` — confirmed
- No existing directory-hash-to-color logic in the repo — confirmed

**Coherence (L1-L7) — no additional findings beyond those reported above:**
- L1: Cross-section logic is consistent (scope, non-goals, future work, decisions all align)
- L2: Confidence labels on assumptions A1-A4 are appropriately calibrated
- L3: No unconditional claims that should be conditional (beyond deriveIconColor theme caveat — covered by R1 risk)
- L5: §1 Resolution, §2 Goals, §6 Solution, and §7 Scope are mutually coherent
- L6: Consistently prescriptive stance throughout
- L7: Not applicable (spec, not stats-heavy report)

## Unverifiable Claims

- **A2 (react-force-graph-2d re-render behavior):** "Library uses canvas; color function is called per-frame." Could not verify from local source whether nodeColor is called per-frame or only on prop change. Rated MEDIUM confidence in the spec, which is appropriate. The perf claim in D18 (~20ns/hash, 1000 nodes = ~20us/frame) depends on this assumption.
- **Palette visual quality claims** (§6.2 "reasonable categorical separation," "matches existing visual language"): Not verifiable without actual color values, which the spec defers to implementation. The R1 risk entry appropriately covers this.
