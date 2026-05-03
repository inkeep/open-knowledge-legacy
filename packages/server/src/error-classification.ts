type NetworkSubclass = 'dns' | 'timeout' | '5xx' | '429' | 'connection-refused' | 'unknown-network';
type AuthSubclass = '401' | '403' | 'expired-token' | 'scope-mismatch' | 'unknown-auth';
type SemanticSubclass =
  | 'non-fast-forward'
  | 'protected-branch'
  | 'merge-conflict'
  | 'unknown-semantic';
type StructuralSubclass =
  | 'lfs-quota'
  | 'large-file'
  | 'pre-receive-hook'
  | 'secret-detected'
  | 'unknown-structural';
type LocalSubclass = 'index-lock' | 'dirty-tree' | 'disk-full' | 'unknown-local';

export type ClassifiedError =
  | {
      class: 'network';
      subclass: NetworkSubclass;
      retryable: true;
      message: string;
      rawStderr?: string;
    }
  | { class: 'auth'; subclass: AuthSubclass; retryable: false; message: string; rawStderr?: string }
  | {
      class: 'semantic';
      subclass: SemanticSubclass;
      retryable: false;
      message: string;
      rawStderr?: string;
    }
  | {
      class: 'structural';
      subclass: StructuralSubclass;
      retryable: false;
      message: string;
      rawStderr?: string;
    }
  | {
      class: 'local';
      subclass: LocalSubclass;
      retryable: true;
      message: string;
      rawStderr?: string;
    };

function extractStderr(error: Error): string {
  const raw = (error as unknown as Record<string, unknown>).git?.toString() ?? error.message ?? '';
  return raw;
}

function matchesAny(haystack: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(haystack));
}

const AUTH_PATTERNS: RegExp[] = [
  /\b(401|403)\b/,
  /authentication failed/i,
  /authorization failed/i,
  /invalid credentials/i,
  /credential helper/i,
  /bad credentials/i,
  /token.*expired/i,
  /expired.*token/i,
  /permission denied.*\(publickey\)/i,
  /host key verification failed/i,
  /fatal:.*repository.*not found/i, // often auth-related on private repos
];

const SCOPE_MISMATCH_PATTERNS: RegExp[] = [
  /insufficient scopes/i,
  /missing.*scope/i,
  /required scope/i,
];

const NON_FAST_FORWARD_PATTERNS: RegExp[] = [
  /non-fast-forward/i,
  /rejected.*non-fast-forward/i,
  /would overwrite.*commits/i,
  /\[rejected\]/,
  /fetch first/i,
  /updates were rejected/i,
];

const PROTECTED_BRANCH_PATTERNS: RegExp[] = [
  /protected branch/i,
  /refusing to allow/i,
  /at least \d+ approving review/i,
  /required status check/i,
  /branch policy/i,
  /GH001/i,
  /GH002/i,
  /GH003/i,
  /GH004/i,
  /push declined due to repository rule/i,
  /cannot push to a protected branch/i,
];

const MERGE_CONFLICT_PATTERNS: RegExp[] = [
  /\bmerge conflict\b/i,
  /automatic merge failed/i,
  /CONFLICT \(/,
  /\bconflict\b.*\bmerge\b/i,
  /(?:^|\n)CONFLICTS:\s/i,
];

const LFS_PATTERNS: RegExp[] = [/lfs.*quota/i, /exceeded.*bandwidth/i, /lfs storage/i];

const LARGE_FILE_PATTERNS: RegExp[] = [
  /file.*too large/i,
  /exceeded.*file size/i,
  /push file size limit/i,
];

const PRE_RECEIVE_PATTERNS: RegExp[] = [
  /pre-receive hook/i,
  /remote:.*rejected/i,
  /hook declined/i,
];

const SECRET_DETECTED_PATTERNS: RegExp[] = [
  /secret.*detected/i,
  /push.*secret/i,
  /secret scanning/i,
  /leaking.*credentials/i,
  /token.*detected/i,
];

const INDEX_LOCK_PATTERNS: RegExp[] = [
  /\.git\/index\.lock/i,
  /another git process/i,
  /unable to create.*\.lock/i,
];

const DIRTY_TREE_PATTERNS: RegExp[] = [
  /dirty.*working tree/i,
  /working tree.*not clean/i,
  /untracked.*files.*would be overwritten/i,
  /local changes.*would be overwritten/i,
  /uncommitted changes/i,
  /changes.*not staged/i,
  /please.*commit.*changes/i,
  /please.*stash/i,
  /commit your changes or stash/i,
];

const DISK_FULL_PATTERNS: RegExp[] = [/no space left on device/i, /disk quota exceeded/i, /ENOSPC/];

const NETWORK_PATTERNS: RegExp[] = [
  /could not resolve host/i,
  /name.*resolution/i,
  /connection.*timed out/i,
  /operation timed out/i,
  /connection refused/i,
  /network.*unreachable/i,
  /ssl.*handshake/i,
  /unable to connect/i,
  /getaddrinfo/i,
  /econnrefused/i,
  /enotfound/i,
  /etimedout/i,
  /ehostunreach/i,
];

const HTTP_5XX_PATTERNS: RegExp[] = [
  /\bHTTP[\s/]*5[0-9]{2}\b/i,
  /\bstatus:?\s*5[0-9]{2}\b/i,
  /\berror\s*5[0-9]{2}\b/i,
  /\bresponse.*?\b5[0-9]{2}\b/i,
];
const HTTP_429_PATTERNS: RegExp[] = [
  /\bHTTP[\s/]*429\b/i,
  /\bstatus:?\s*429\b/i,
  /\berror\s*429\b/i,
  /rate.?limit/i,
  /too many requests/i,
];

export function classifyGitError(error: Error | unknown): ClassifiedError {
  const err = error instanceof Error ? error : new Error(String(error));
  const raw = extractStderr(err);
  const combined = `${err.message}\n${raw}`.toLowerCase();

  if (matchesAny(combined, INDEX_LOCK_PATTERNS)) {
    return {
      class: 'local',
      subclass: 'index-lock',
      retryable: true,
      message: 'Git index locked by another process',
      rawStderr: raw,
    };
  }
  if (matchesAny(combined, DIRTY_TREE_PATTERNS)) {
    return {
      class: 'local',
      subclass: 'dirty-tree',
      retryable: true,
      message: 'Working tree has uncommitted changes',
      rawStderr: raw,
    };
  }
  if (matchesAny(combined, DISK_FULL_PATTERNS)) {
    return {
      class: 'local',
      subclass: 'disk-full',
      retryable: true,
      message: 'Disk full or quota exceeded',
      rawStderr: raw,
    };
  }

  if (matchesAny(combined, SCOPE_MISMATCH_PATTERNS)) {
    return {
      class: 'auth',
      subclass: 'scope-mismatch',
      retryable: false,
      message: 'GitHub token missing required scopes',
      rawStderr: raw,
    };
  }
  if (matchesAny(combined, AUTH_PATTERNS)) {
    if (/\b401\b/.test(combined) || /token.*expired/i.test(combined)) {
      return {
        class: 'auth',
        subclass: '401',
        retryable: false,
        message: 'Authentication failed — token may be expired',
        rawStderr: raw,
      };
    }
    if (/\b403\b/.test(combined)) {
      if (matchesAny(combined, PROTECTED_BRANCH_PATTERNS)) {
        return {
          class: 'semantic',
          subclass: 'protected-branch',
          retryable: false,
          message: 'Push rejected — branch is protected',
          rawStderr: raw,
        };
      }
      return {
        class: 'auth',
        subclass: '403',
        retryable: false,
        message: 'Access denied (403)',
        rawStderr: raw,
      };
    }
    return {
      class: 'auth',
      subclass: 'unknown-auth',
      retryable: false,
      message: 'Authentication failed',
      rawStderr: raw,
    };
  }

  if (matchesAny(combined, PROTECTED_BRANCH_PATTERNS)) {
    return {
      class: 'semantic',
      subclass: 'protected-branch',
      retryable: false,
      message: 'Push rejected — branch is protected',
      rawStderr: raw,
    };
  }
  if (matchesAny(combined, NON_FAST_FORWARD_PATTERNS)) {
    return {
      class: 'semantic',
      subclass: 'non-fast-forward',
      retryable: false,
      message: 'Push rejected — remote has diverged (non-fast-forward)',
      rawStderr: raw,
    };
  }
  if (matchesAny(combined, MERGE_CONFLICT_PATTERNS)) {
    return {
      class: 'semantic',
      subclass: 'merge-conflict',
      retryable: false,
      message: 'Merge conflict — manual resolution required',
      rawStderr: raw,
    };
  }

  if (matchesAny(combined, LFS_PATTERNS)) {
    return {
      class: 'structural',
      subclass: 'lfs-quota',
      retryable: false,
      message: 'Git LFS quota exceeded',
      rawStderr: raw,
    };
  }
  if (matchesAny(combined, LARGE_FILE_PATTERNS)) {
    return {
      class: 'structural',
      subclass: 'large-file',
      retryable: false,
      message: 'File exceeds size limit',
      rawStderr: raw,
    };
  }
  if (matchesAny(combined, SECRET_DETECTED_PATTERNS)) {
    return {
      class: 'structural',
      subclass: 'secret-detected',
      retryable: false,
      message: 'Push blocked — secret or credential detected in content',
      rawStderr: raw,
    };
  }
  if (matchesAny(combined, PRE_RECEIVE_PATTERNS)) {
    return {
      class: 'structural',
      subclass: 'pre-receive-hook',
      retryable: false,
      message: 'Push rejected by server pre-receive hook',
      rawStderr: raw,
    };
  }

  if (matchesAny(combined, HTTP_429_PATTERNS)) {
    return {
      class: 'network',
      subclass: '429',
      retryable: true,
      message: 'Rate limited — too many requests',
      rawStderr: raw,
    };
  }
  if (matchesAny(combined, HTTP_5XX_PATTERNS)) {
    return {
      class: 'network',
      subclass: '5xx',
      retryable: true,
      message: 'Server error (5xx)',
      rawStderr: raw,
    };
  }
  if (matchesAny(combined, NETWORK_PATTERNS)) {
    if (/timed? out/i.test(combined)) {
      return {
        class: 'network',
        subclass: 'timeout',
        retryable: true,
        message: 'Connection timed out',
        rawStderr: raw,
      };
    }
    if (/refused/i.test(combined) || /econnrefused/i.test(combined)) {
      return {
        class: 'network',
        subclass: 'connection-refused',
        retryable: true,
        message: 'Connection refused',
        rawStderr: raw,
      };
    }
    if (
      /resolve.*host/i.test(combined) ||
      /enotfound/i.test(combined) ||
      /getaddrinfo/i.test(combined)
    ) {
      return {
        class: 'network',
        subclass: 'dns',
        retryable: true,
        message: 'DNS resolution failed',
        rawStderr: raw,
      };
    }
    return {
      class: 'network',
      subclass: 'unknown-network',
      retryable: true,
      message: 'Network error',
      rawStderr: raw,
    };
  }

  return {
    class: 'local',
    subclass: 'unknown-local',
    retryable: true,
    message: err.message || 'Unknown git error',
    rawStderr: raw,
  };
}
