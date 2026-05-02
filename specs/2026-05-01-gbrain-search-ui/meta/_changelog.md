## 2026-05-01

### Changes
- **Spec initialized:** Created the first draft for exposing gbrain search when the current Open Knowledge project folder is registered in gbrain.
  - Evidence: `evidence/open-knowledge-current-surfaces.md`, `evidence/gbrain-integration-surfaces.md`
  - Affected sections: `SPEC.md` all sections
- **Current-state evidence captured:** Traced Open Knowledge command palette, desktop bridge, workspace API, and server route patterns.
- **gbrain integration evidence captured:** Traced source-path detection, legacy path fallback, import caveat, and JSON search invocation.

### Pending
- Decide whether v1 is desktop-only or also supports browser/server mode.
- Decide whether v1 uses the gbrain CLI only or adds a direct library integration.
- Decide the first UI surface: command palette only, sidebar entry, or both.

## 2026-05-01 Update

### Changes
- **D2 accepted:** v1 must support browser mode through local Open Knowledge server proxy routes, not desktop-only bridge methods.
  - Evidence: `evidence/open-knowledge-current-surfaces.md`, `evidence/gbrain-integration-surfaces.md`
  - Affected sections: `SPEC.md` §§4-6, §§8-13
- **D3 accepted:** gbrain UI remains gated on registered source-path matches.
  - Affected sections: `SPEC.md` §§6, 10, 11
- **D4 accepted:** v1 renders gbrain result rows only; local file opening is not in scope.
  - Affected sections: `SPEC.md` §§5, 6, 9-13
- **A1 refuted:** Desktop-only initial product assumption replaced by browser + desktop via server proxy.
  - Cascade: runtime boundary, API transport, In Scope, and Open Questions updated.
- **evidence/open-knowledge-current-surfaces.md:** Added finding that the current command palette opens with Cmd/Ctrl+K but is desktop-only today.

### Pending
- Q6: Decide whether to make the existing command palette browser-compatible or ship gbrain search through a smaller browser-compatible modal first.
- Q4: Decide whether strict source-scoped search is required in v1.

## 2026-05-01 Sidebar Correction

### Changes
- **D1 accepted/revised:** v1 gbrain search UI belongs in the sidebar, not the command palette.
  - Rationale: User clarified that porting the desktop command palette to browser is out of scope.
  - Affected sections: `SPEC.md` §§2, 5, 6, 8, 9, 10, 11, 13
- **Q6 resolved:** No command-palette port and no browser-compatible command modal in v1.

### Pending
- Q4: Decide whether strict source-scoped search is required in v1.
- Q5: Decide exact sidebar diagnostics shape.

## 2026-05-01 Implementation Handoff

### Changes
- **Status updated:** Marked `SPEC.md` ready for implementation after validating the remaining open questions.
- **D5 accepted:** Keep the server-proxied CLI boundary, but filter returned `gbrain call query` rows to the matched `source_id` before returning them to the renderer.
  - Rationale: Current gbrain CLI query params do not expose query-time source scoping, while result rows include `source_id`.
  - Affected sections: `SPEC.md` §§5, 6, 9-14
- **D6 accepted:** Use compact inline sidebar diagnostics for configured-but-unmatched states, while keeping `not-installed` quiet by default.
  - Affected sections: `SPEC.md` §§5, 9, 10, 11, 13
- **Q4/Q5 resolved:** Implementation no longer needs to infer source-scoping or diagnostics behavior.
- **A3 superseded:** Returned rows must be source-filtered even though query-time source scoping is unavailable through the CLI.

### Pending
- None blocking implementation.
