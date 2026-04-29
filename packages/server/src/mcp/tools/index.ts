/**
 * MCP tool registry.
 *
 * Aggregates workflow tools (ingest, research, consolidate),
 * document tools (write_document, edit_document, rename_document,
 * undo_agent_edit, redo_agent_edit, list_documents), link-graph tools
 * (get_backlinks, get_forward_links, get_orphans, get_hubs, get_dead_links),
 * and enriched tools
 * (read_document, search) into a single `registerAllTools` function that
 * `server.ts` calls during startup.
 *
 * - Workflow tools return instructional text and don't need a server connection.
 * - Document tools make HTTP calls to Hocuspocus and require `serverUrl`.
 * - Enriched tools (read_document, search) need filesystem + catalog access
 *   plus (optionally) Hocuspocus for backlinks.
 *
 * Project-level scaffolding (folders + config.yml entries) is handled by
 * the `ok seed` CLI, not via an MCP tool. The former `init-content` tool
 * was removed per SPEC 2026-04-23-ok-seed-scaffold.
 *
 * To add a new tool: create `packages/cli/src/mcp/tools/<name>.ts` with a
 * `register(...)` export, then import and call it from here.
 */

import type { AgentIdentity } from '../agent-identity.ts';
import { getCurrentMcpLogger, type McpLogger } from '../logger.ts';
import { createLoggedServer } from '../tool-logging.ts';
import {
  DESCRIPTION as CONSOLIDATE_DESCRIPTION,
  register as registerConsolidate,
} from './consolidate.ts';
import {
  DESCRIPTION as EDIT_DOCUMENT_DESCRIPTION,
  register as registerEditDocument,
} from './edit-document.ts';
import { DESCRIPTION as EXEC_DESCRIPTION, register as registerExec } from './exec.ts';
import {
  DESCRIPTION as GET_BACKLINKS_DESCRIPTION,
  register as registerGetBacklinks,
} from './get-backlinks.ts';
import {
  DESCRIPTION as GET_DEAD_LINKS_DESCRIPTION,
  register as registerGetDeadLinks,
} from './get-dead-links.ts';
import {
  DESCRIPTION as GET_FORWARD_LINKS_DESCRIPTION,
  register as registerGetForwardLinks,
} from './get-forward-links.ts';
import {
  DESCRIPTION as GET_HISTORY_DESCRIPTION,
  register as registerGetHistory,
} from './get-history.ts';
import { DESCRIPTION as GET_HUBS_DESCRIPTION, register as registerGetHubs } from './get-hubs.ts';
import {
  DESCRIPTION as GET_ORPHANS_DESCRIPTION,
  register as registerGetOrphans,
} from './get-orphans.ts';
import { DESCRIPTION as INGEST_DESCRIPTION, register as registerIngest } from './ingest.ts';
import {
  DESCRIPTION as LIST_DOCUMENTS_DESCRIPTION,
  register as registerListDocuments,
} from './list-documents.ts';
import {
  DESCRIPTION as READ_DOCUMENT_DESCRIPTION,
  register as registerReadDocument,
} from './read-document.ts';
import {
  DESCRIPTION as RENAME_DOCUMENT_DESCRIPTION,
  register as registerRenameDocument,
} from './rename-document.ts';
import { DESCRIPTION as RESEARCH_DESCRIPTION, register as registerResearch } from './research.ts';
import {
  DESCRIPTION as ROLLBACK_DESCRIPTION,
  register as registerRollbackToVersion,
} from './rollback-to-version.ts';
import {
  register as registerSaveVersion,
  DESCRIPTION as SAVE_VERSION_DESCRIPTION,
} from './save-version.ts';
import { register as registerSearch, DESCRIPTION as SEARCH_DESCRIPTION } from './search.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  register as registerSuggestLinks,
  DESCRIPTION as SUGGEST_LINKS_DESCRIPTION,
} from './suggest-links.ts';
import {
  register as registerWriteDocument,
  DESCRIPTION as WRITE_DOCUMENT_DESCRIPTION,
} from './write-document.ts';

/** Tool descriptions keyed by name — used by INSTRUCTIONS in server.ts to avoid duplication. */
const _TOOL_DESCRIPTIONS = {
  exec: EXEC_DESCRIPTION,
  ingest: INGEST_DESCRIPTION,
  research: RESEARCH_DESCRIPTION,
  consolidate: CONSOLIDATE_DESCRIPTION,
  read_document: READ_DOCUMENT_DESCRIPTION,
  rename_document: RENAME_DOCUMENT_DESCRIPTION,
  search: SEARCH_DESCRIPTION,
  suggest_links: SUGGEST_LINKS_DESCRIPTION,
  write_document: WRITE_DOCUMENT_DESCRIPTION,
  edit_document: EDIT_DOCUMENT_DESCRIPTION,
  get_history: GET_HISTORY_DESCRIPTION,
  save_version: SAVE_VERSION_DESCRIPTION,
  rollback_to_version: ROLLBACK_DESCRIPTION,
  list_documents: LIST_DOCUMENTS_DESCRIPTION,
  get_backlinks: GET_BACKLINKS_DESCRIPTION,
  get_forward_links: GET_FORWARD_LINKS_DESCRIPTION,
  get_orphans: GET_ORPHANS_DESCRIPTION,
  get_hubs: GET_HUBS_DESCRIPTION,
  get_dead_links: GET_DEAD_LINKS_DESCRIPTION,
} as const;

/**
 * Per-call cwd resolver. Returns the absolute host directory that the
 * current tool call should operate against. Priority:
 *   1. explicit `cwd` arg from the tool call
 *   2. the client's only advertised MCP root
 *   3. otherwise error
 */
type ResolveCwd = (explicit?: string) => Promise<string>;

interface RegisterAllToolsOptions {
  /**
   * Hocuspocus URL. Accept a string (explicit override, e.g. `--port`), or a
   * lazy resolver that re-discovers per-call from the effective project cwd.
   * The resolver variant is what lets one MCP stdio process route different
   * tool calls to different Open Knowledge projects.
   */
  serverUrl?: ServerUrlOrResolver;
  /** Resolves the cwd for a given tool call (see `ResolveCwd` docs). */
  resolveCwd: ResolveCwd;
  config: ConfigOrResolver;
  identityRef?: { current: AgentIdentity };
  logger?: McpLogger;
}

export function registerAllTools(server: ServerInstance, opts: RegisterAllToolsOptions): void {
  const log = opts.logger;
  const registrationServer = createLoggedServer(server, {
    logger: opts.logger,
    identityRef: opts.identityRef,
  });
  const named =
    (tool: string): ResolveCwd =>
    async (explicit?: string) => {
      try {
        const cwd = await opts.resolveCwd(explicit);
        const activeLog = getCurrentMcpLogger() ?? log;
        activeLog?.debug('tool cwd resolved', { tool, cwd, ...(explicit ? { explicit } : {}) });
        return cwd;
      } catch (err) {
        const activeLog = getCurrentMcpLogger() ?? log;
        activeLog?.warn('tool call failed', {
          tool,
          error: err instanceof Error ? err.message : String(err),
          ...(explicit ? { explicit } : {}),
        });
        throw err;
      }
    };

  // exec — the primary surface (V0-24 / L2-aggressive per D2).
  registerExec(registrationServer, {
    resolveCwd: named('exec'),
    serverUrl: opts.serverUrl,
    config: opts.config,
  });

  // Workflow tools — return instructional text, no server connection needed
  registerIngest(registrationServer, { config: opts.config, resolveCwd: named('ingest') });
  registerResearch(registrationServer, { config: opts.config, resolveCwd: named('research') });
  registerConsolidate(registrationServer, {
    config: opts.config,
    resolveCwd: named('consolidate'),
  });

  // Enriched read/search — kept as typed call sites (advanced); exec is primary.
  registerReadDocument(registrationServer, {
    resolveCwd: named('read_document'),
    config: opts.config,
    serverUrl: opts.serverUrl,
  });
  registerSearch(registrationServer, {
    resolveCwd: named('search'),
    config: opts.config,
    serverUrl: opts.serverUrl,
  });
  registerSuggestLinks(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('suggest_links'),
  });

  // Document tools — make HTTP calls to Hocuspocus
  registerWriteDocument(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('write_document'),
    identityRef: opts.identityRef,
  });
  registerEditDocument(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('edit_document'),
    identityRef: opts.identityRef,
  });
  registerRenameDocument(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('rename_document'),
    identityRef: opts.identityRef,
  });
  registerGetHistory(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('get_history'),
  });
  registerSaveVersion(
    registrationServer,
    opts.config,
    opts.serverUrl,
    named('save_version'),
    opts.identityRef,
  );
  registerRollbackToVersion(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('rollback_to_version'),
    identityRef: opts.identityRef,
  });
  registerListDocuments(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('list_documents'),
  });
  registerGetBacklinks(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('get_backlinks'),
  });
  registerGetForwardLinks(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('get_forward_links'),
  });
  registerGetOrphans(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('get_orphans'),
  });
  registerGetHubs(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('get_hubs'),
  });
  registerGetDeadLinks(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('get_dead_links'),
  });
}
