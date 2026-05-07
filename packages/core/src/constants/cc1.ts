export const SYSTEM_DOC_NAME = '__system__';
export const CC1_CONTRACT_VERSION = 1;

export const CONFIG_DOC_NAME_PROJECT = '__config__/project';

export const CONFIG_DOC_NAME_USER = '__user__/config.yml';

export const CONFIG_DOC_NAME_PROJECT_LOCAL = '__local__/project';

export const CONFIG_DOC_NAME_OKIGNORE = '__config__/okignore';

export const CONFIG_DOC_NAMES = Object.freeze([
  CONFIG_DOC_NAME_PROJECT,
  CONFIG_DOC_NAME_PROJECT_LOCAL,
  CONFIG_DOC_NAME_USER,
  CONFIG_DOC_NAME_OKIGNORE,
] as const);
export type ConfigDocName = (typeof CONFIG_DOC_NAMES)[number];
