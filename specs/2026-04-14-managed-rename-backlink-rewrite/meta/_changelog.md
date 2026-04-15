## 2026-04-14

### Changes
- **SPEC created:** initial draft for managed rename + atomic backlink rewrite
  - Affected sections: `SPEC.md` §1-§15
- **evidence/current-state-rename-and-links.md:** Created
  - Captures current rename-path behavior, backlink index behavior, and internal Markdown-link support
- **Q2 created:** whether `V0-5` should include internal inline Markdown-link rewrite alongside wiki-links
- **Q3 created:** if Markdown links are included, which Markdown forms are actually in scope
- **D2 decided:** `V0-5` includes wiki-links plus the currently-supported internal inline Markdown-link surface
  - Evidence: `evidence/current-state-rename-and-links.md`
  - Affected sections: `SPEC.md` §6, §9, §10, §11, §12, §13
- **D1 decided:** managed rename is a first-class server-orchestrated operation, not raw filesystem rename
  - Evidence: `evidence/current-state-rename-and-links.md`
  - Affected sections: `SPEC.md` §9, §10
- **D3 decided:** public file/page rename uses a managed page-rename contract; raw path rename is not a public file/page operation
  - Evidence: `evidence/current-state-rename-and-links.md`
  - Affected sections: `SPEC.md` §9, §10, §11, §13, §14, §15
- **D4 decided:** `V0-5` stays page-scoped; folder/path-tree graph-safe rename semantics are out of scope here
  - Evidence: `evidence/current-state-rename-and-links.md`
  - Affected sections: `SPEC.md` §10, §11
- **Q6 created:** public naming split identified between `rename_document` (launch plan) and `rename_page` (story)
  - Affected sections: `SPEC.md` §11
- **D5 decided:** public naming uses MCP `rename_document` and HTTP `POST /api/rename`
  - Evidence: `projects/v0-launch/PROJECT.md`, existing MCP tool naming
  - Affected sections: `SPEC.md` §10, §11
- **F9 added:** folder/path-tree rename is broader than page rename for internal Markdown links because resolution depends on source doc path
  - Evidence: `evidence/current-state-rename-and-links.md`
- **F10 added:** current runtime has per-doc atomicity and recovery primitives but no vault-wide transaction
  - Evidence: `evidence/current-state-rename-and-links.md`
- **D6 decided:** atomicity model is per-doc transactions plus persisted recovery journal with startup rollback
  - Evidence: `evidence/current-state-rename-and-links.md`
  - Affected sections: `SPEC.md` §9, §10, §11, §13

### Pending (carried forward)
