import pkgJson from '../package.json' with { type: 'json' };

/** Root directory name for open-knowledge inside a project. */
export const OK_DIR = '.open-knowledge';

/** Conventions file for agent navigation without MCP. */
export const AGENTS_FILENAME = 'AGENTS.md';

/** Workspace-level config file inside the open-knowledge directory. */
export const CONFIG_FILENAME = 'config.yml';

/** Gitignored directory for derived/cached data. */
export const CACHE_DIR = 'cache';

export const PACKAGE_VERSION = pkgJson.version;

export const MCP_SERVER_NAME = 'open-knowledge';
