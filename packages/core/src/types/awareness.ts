export interface AwarenessUser {
  name: string;
  color: string;
  type: 'human';
  icon?: string;
  coeditor?: string;
  tabId: string;
  principalId?: string;
}

export interface AwarenessState {
  user: AwarenessUser;
  mode: 'wysiwyg' | 'source' | 'idle' | 'editing';
  cursor?: {
    anchor: unknown;
    head: unknown;
  };
  agentFocus?: Record<string, AgentFocusEntry>;
  agentPresence?: Record<string, AgentPresenceEntry>;
}

export interface AgentFocusEntry {
  agentName: string;
  currentDoc: string | null;
  writeKind: 'write' | 'edit' | 'undo' | 'rollback-apply' | null;
  ts: number;
}

export interface AgentPresenceEntry {
  displayName: string;
  icon: string;
  color: string;
  currentDoc: string | null;
  mode: 'idle' | 'writing';
  ts: number;
}

export interface AgentFlashEntry {
  agentId: string;
  timestamp: number;
  type: 'insert' | 'replace' | 'delete';
  description?: string;
}
