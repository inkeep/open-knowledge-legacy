/**
 * MCP tool registry.
 *
 * Aggregates workflow tools (init-content, ingest, research) and document tools
 * (write_document, edit_document, undo_agent_edit, redo_agent_edit, list_documents)
 * into a single `registerAllTools` function that `server.ts` calls during startup.
 *
 * Workflow tools return instructional text and don't need a server connection.
 * Document tools make HTTP calls to Hocuspocus and require `serverUrl`.
 *
 * To add a new tool: create `packages/cli/src/mcp/tools/<name>.ts` with a
 * `register(server)` export, then import and call it from here.
 */
import {
  DESCRIPTION as EDIT_DOCUMENT_DESCRIPTION,
  register as registerEditDocument,
} from './edit-document.ts';
import {
  DESCRIPTION as GET_BACKLINKS_DESCRIPTION,
  register as registerGetBacklinks,
} from './get-backlinks.ts';
import {
  DESCRIPTION as GET_FORWARD_LINKS_DESCRIPTION,
  register as registerGetForwardLinks,
} from './get-forward-links.ts';
import { DESCRIPTION as GET_HUBS_DESCRIPTION, register as registerGetHubs } from './get-hubs.ts';
import {
  DESCRIPTION as GET_ORPHANS_DESCRIPTION,
  register as registerGetOrphans,
} from './get-orphans.ts';
import { DESCRIPTION as INGEST_DESCRIPTION, register as registerIngest } from './ingest.ts';
import {
  DESCRIPTION as INIT_CONTENT_DESCRIPTION,
  register as registerInitContent,
} from './init-content.ts';
import {
  DESCRIPTION as LIST_DOCUMENTS_DESCRIPTION,
  register as registerListDocuments,
} from './list-documents.ts';
import {
  DESCRIPTION as REDO_AGENT_EDIT_DESCRIPTION,
  register as registerRedoAgentEdit,
} from './redo-agent-edit.ts';
import { DESCRIPTION as RESEARCH_DESCRIPTION, register as registerResearch } from './research.ts';
import type { ServerInstance } from './shared.ts';
import {
  register as registerUndoAgentEdit,
  DESCRIPTION as UNDO_AGENT_EDIT_DESCRIPTION,
} from './undo-agent-edit.ts';
import {
  register as registerWriteDocument,
  DESCRIPTION as WRITE_DOCUMENT_DESCRIPTION,
} from './write-document.ts';

export type { ServerInstance } from './shared.ts';
export { textResult } from './shared.ts';

/** Tool descriptions keyed by name — used by INSTRUCTIONS in server.ts to avoid duplication. */
export const TOOL_DESCRIPTIONS = {
  'init-content': INIT_CONTENT_DESCRIPTION,
  ingest: INGEST_DESCRIPTION,
  research: RESEARCH_DESCRIPTION,
  write_document: WRITE_DOCUMENT_DESCRIPTION,
  edit_document: EDIT_DOCUMENT_DESCRIPTION,
  undo_agent_edit: UNDO_AGENT_EDIT_DESCRIPTION,
  redo_agent_edit: REDO_AGENT_EDIT_DESCRIPTION,
  list_documents: LIST_DOCUMENTS_DESCRIPTION,
  get_backlinks: GET_BACKLINKS_DESCRIPTION,
  get_forward_links: GET_FORWARD_LINKS_DESCRIPTION,
  get_orphans: GET_ORPHANS_DESCRIPTION,
  get_hubs: GET_HUBS_DESCRIPTION,
} as const;

export function registerAllTools(server: ServerInstance, serverUrl?: string): void {
  // Workflow tools — return instructional text, no server connection needed
  registerInitContent(server);
  registerIngest(server);
  registerResearch(server);

  // Document tools — make HTTP calls to Hocuspocus
  registerWriteDocument(server, serverUrl);
  registerEditDocument(server, serverUrl);
  registerUndoAgentEdit(server, serverUrl);
  registerRedoAgentEdit(server, serverUrl);
  registerListDocuments(server, serverUrl);
  registerGetBacklinks(server, serverUrl);
  registerGetForwardLinks(server, serverUrl);
  registerGetOrphans(server, serverUrl);
  registerGetHubs(server, serverUrl);
}
