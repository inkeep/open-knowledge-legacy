
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
  DESCRIPTION as GET_CONFIG_DESCRIPTION,
  register as registerGetConfig,
} from './get-config.ts';
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
import {
  DESCRIPTION as RENAME_FOLDER_DESCRIPTION,
  register as registerRenameFolder,
} from './rename-folder.ts';
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
import {
  register as registerSetConfig,
  DESCRIPTION as SET_CONFIG_DESCRIPTION,
} from './set-config.ts';
import {
  register as registerSetFolderRule,
  DESCRIPTION as SET_FOLDER_RULE_DESCRIPTION,
} from './set-folder-rule.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  register as registerSuggestLinks,
  DESCRIPTION as SUGGEST_LINKS_DESCRIPTION,
} from './suggest-links.ts';
import {
  register as registerWriteDocument,
  DESCRIPTION as WRITE_DOCUMENT_DESCRIPTION,
} from './write-document.ts';

const _TOOL_DESCRIPTIONS = {
  exec: EXEC_DESCRIPTION,
  ingest: INGEST_DESCRIPTION,
  research: RESEARCH_DESCRIPTION,
  consolidate: CONSOLIDATE_DESCRIPTION,
  read_document: READ_DOCUMENT_DESCRIPTION,
  rename_document: RENAME_DOCUMENT_DESCRIPTION,
  rename_folder: RENAME_FOLDER_DESCRIPTION,
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
  get_config: GET_CONFIG_DESCRIPTION,
  set_config: SET_CONFIG_DESCRIPTION,
  set_folder_rule: SET_FOLDER_RULE_DESCRIPTION,
} as const;

type ResolveCwd = (explicit?: string) => Promise<string>;

interface RegisterAllToolsOptions {
  serverUrl?: ServerUrlOrResolver;
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

  registerExec(registrationServer, {
    resolveCwd: named('exec'),
    serverUrl: opts.serverUrl,
    config: opts.config,
  });

  registerIngest(registrationServer, { config: opts.config, resolveCwd: named('ingest') });
  registerResearch(registrationServer, { config: opts.config, resolveCwd: named('research') });
  registerConsolidate(registrationServer, {
    config: opts.config,
    resolveCwd: named('consolidate'),
  });

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
  registerRenameFolder(registrationServer, {
    serverUrl: opts.serverUrl,
    config: opts.config,
    resolveCwd: named('rename_folder'),
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

  registerGetConfig(registrationServer, {
    config: opts.config,
    resolveCwd: named('get_config'),
  });
  registerSetConfig(registrationServer, {
    config: opts.config,
    resolveCwd: named('set_config'),
  });
  registerSetFolderRule(registrationServer, {
    config: opts.config,
    resolveCwd: named('set_folder_rule'),
  });
}
