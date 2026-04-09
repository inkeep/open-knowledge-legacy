export interface AwarenessUser {
  name: string;
  color: string;
  type: 'human' | 'agent';
  icon?: string;
  coeditor?: string;
  tabId: string;
}

export interface AwarenessState {
  user: AwarenessUser;
  mode: 'wysiwyg' | 'source' | 'idle' | 'editing';
  cursor?: {
    anchor: unknown;
    head: unknown;
  };
}

/** Entry in Y.Map('activity') side-channel for agent write attribution. */
export interface ActivityEntry {
  agentId: string;
  timestamp: number;
  type: 'insert' | 'replace' | 'delete';
  description?: string;
}
