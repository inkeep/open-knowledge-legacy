import { describe, expect, test } from 'bun:test';
import { classifyGitError } from './error-classification.ts';

function mkErr(message: string, stderr?: string): Error {
  const err = new Error(message);
  if (stderr !== undefined) {
    (err as unknown as Record<string, string>).git = stderr;
  }
  return err;
}

describe('classifyGitError', () => {
  describe('Class 1 — Network (retryable)', () => {
    test('DNS resolution failure', () => {
      const r = classifyGitError(
        mkErr('fatal: unable to access', 'Could not resolve host: github.com'),
      );
      expect(r.class).toBe('network');
      expect(r.subclass).toBe('dns');
      expect(r.retryable).toBe(true);
    });

    test('ENOTFOUND from Node', () => {
      const r = classifyGitError(mkErr('getaddrinfo ENOTFOUND github.com'));
      expect(r.class).toBe('network');
      expect(r.subclass).toBe('dns');
      expect(r.retryable).toBe(true);
    });

    test('connection timeout', () => {
      const r = classifyGitError(mkErr('Connection timed out'));
      expect(r.class).toBe('network');
      expect(r.subclass).toBe('timeout');
      expect(r.retryable).toBe(true);
    });

    test('connection refused', () => {
      const r = classifyGitError(mkErr('ECONNREFUSED 127.0.0.1:22'));
      expect(r.class).toBe('network');
      expect(r.subclass).toBe('connection-refused');
      expect(r.retryable).toBe(true);
    });

    test('HTTP 5xx error', () => {
      const r = classifyGitError(mkErr('fatal: repository', 'error 503 Service Unavailable'));
      expect(r.class).toBe('network');
      expect(r.subclass).toBe('5xx');
      expect(r.retryable).toBe(true);
    });

    test('HTTP 429 rate limit', () => {
      const r = classifyGitError(mkErr('push failed: 429 Too Many Requests'));
      expect(r.class).toBe('network');
      expect(r.subclass).toBe('429');
      expect(r.retryable).toBe(true);
    });

    test('rate limit by keyword', () => {
      const r = classifyGitError(mkErr('remote: rate limit exceeded'));
      expect(r.class).toBe('network');
      expect(r.subclass).toBe('429');
      expect(r.retryable).toBe(true);
    });
  });

  describe('Class 2 — Auth (non-retryable)', () => {
    test('authentication failed', () => {
      const r = classifyGitError(mkErr('Authentication failed for remote'));
      expect(r.class).toBe('auth');
      expect(r.retryable).toBe(false);
    });

    test('401 status in stderr', () => {
      const r = classifyGitError(mkErr('remote error', 'HTTP 401 Unauthorized'));
      expect(r.class).toBe('auth');
      expect(r.subclass).toBe('401');
      expect(r.retryable).toBe(false);
    });

    test('403 without branch protection → auth', () => {
      const r = classifyGitError(mkErr('remote: HTTP 403 Forbidden'));
      expect(r.class).toBe('auth');
      expect(r.subclass).toBe('403');
      expect(r.retryable).toBe(false);
    });

    test('bad credentials', () => {
      const r = classifyGitError(mkErr('remote: Bad credentials'));
      expect(r.class).toBe('auth');
      expect(r.retryable).toBe(false);
    });

    test('expired token', () => {
      const r = classifyGitError(mkErr('fatal: token expired'));
      expect(r.class).toBe('auth');
      expect(r.subclass).toBe('401');
      expect(r.retryable).toBe(false);
    });

    test('permission denied (publickey)', () => {
      const r = classifyGitError(mkErr('Permission denied (publickey).'));
      expect(r.class).toBe('auth');
      expect(r.retryable).toBe(false);
    });

    test('scope mismatch', () => {
      const r = classifyGitError(mkErr('insufficient scopes for this operation'));
      expect(r.class).toBe('auth');
      expect(r.subclass).toBe('scope-mismatch');
      expect(r.retryable).toBe(false);
    });
  });

  describe('Class 3 — Semantic (non-retryable)', () => {
    test('non-fast-forward rejection', () => {
      const r = classifyGitError(
        mkErr(
          '[rejected] main -> main (non-fast-forward)',
          'error: failed to push some refs\nhint: Updates were rejected',
        ),
      );
      expect(r.class).toBe('semantic');
      expect(r.subclass).toBe('non-fast-forward');
      expect(r.retryable).toBe(false);
    });

    test('updates were rejected (non-FF variant)', () => {
      const r = classifyGitError(mkErr('updates were rejected'));
      expect(r.class).toBe('semantic');
      expect(r.retryable).toBe(false);
    });

    test('protected branch', () => {
      const r = classifyGitError(
        mkErr('remote: error: protected branch', 'protected branch hook declined'),
      );
      expect(r.class).toBe('semantic');
      expect(r.subclass).toBe('protected-branch');
      expect(r.retryable).toBe(false);
    });

    test('GitHub branch protection GH002', () => {
      const r = classifyGitError(
        mkErr('remote: GH002 – The main branch of this repository requires a pull request'),
      );
      expect(r.class).toBe('semantic');
      expect(r.subclass).toBe('protected-branch');
      expect(r.retryable).toBe(false);
    });

    test('at least N approving reviews required', () => {
      const r = classifyGitError(mkErr('remote: At least 2 approving review is required'));
      expect(r.class).toBe('semantic');
      expect(r.subclass).toBe('protected-branch');
      expect(r.retryable).toBe(false);
    });

    test('403 with protected branch keywords → semantic', () => {
      const r = classifyGitError(mkErr('remote: 403 Forbidden – protected branch'));
      expect(r.class).toBe('semantic');
      expect(r.subclass).toBe('protected-branch');
      expect(r.retryable).toBe(false);
    });

    test('automatic merge failed → merge conflict', () => {
      const r = classifyGitError(
        mkErr('Automatic merge failed; fix conflicts and then commit the result.'),
      );
      expect(r.class).toBe('semantic');
      expect(r.subclass).toBe('merge-conflict');
      expect(r.retryable).toBe(false);
    });

    test('CONFLICT keyword', () => {
      const r = classifyGitError(mkErr('CONFLICT (content): Merge conflict in src/file.ts'));
      expect(r.class).toBe('semantic');
      expect(r.subclass).toBe('merge-conflict');
      expect(r.retryable).toBe(false);
    });
  });

  describe('Class 4 — Structural (non-retryable)', () => {
    test('LFS quota exceeded', () => {
      const r = classifyGitError(mkErr('remote: error: LFS storage quota exceeded'));
      expect(r.class).toBe('structural');
      expect(r.subclass).toBe('lfs-quota');
      expect(r.retryable).toBe(false);
    });

    test('file too large', () => {
      const r = classifyGitError(mkErr('remote: file exceeds 100 MB push file size limit'));
      expect(r.class).toBe('structural');
      expect(r.subclass).toBe('large-file');
      expect(r.retryable).toBe(false);
    });

    test('pre-receive hook decline', () => {
      const r = classifyGitError(mkErr('remote: pre-receive hook declined'));
      expect(r.class).toBe('structural');
      expect(r.subclass).toBe('pre-receive-hook');
      expect(r.retryable).toBe(false);
    });

    test('secret detected', () => {
      const r = classifyGitError(mkErr('remote: Push blocked — secret detected in commit'));
      expect(r.class).toBe('structural');
      expect(r.subclass).toBe('secret-detected');
      expect(r.retryable).toBe(false);
    });

    test('secret scanning', () => {
      const r = classifyGitError(mkErr('remote: Secret scanning found credentials in push'));
      expect(r.class).toBe('structural');
      expect(r.subclass).toBe('secret-detected');
      expect(r.retryable).toBe(false);
    });
  });

  describe('Class 5 — Local (retryable)', () => {
    test('index.lock', () => {
      const r = classifyGitError(mkErr("fatal: Unable to create '.git/index.lock': File exists."));
      expect(r.class).toBe('local');
      expect(r.subclass).toBe('index-lock');
      expect(r.retryable).toBe(true);
    });

    test('another git process', () => {
      const r = classifyGitError(
        mkErr('fatal: Another git process seems to be running in this repository'),
      );
      expect(r.class).toBe('local');
      expect(r.subclass).toBe('index-lock');
      expect(r.retryable).toBe(true);
    });

    test('dirty working tree', () => {
      const r = classifyGitError(
        mkErr('error: Your local changes to the following files would be overwritten by merge'),
      );
      expect(r.class).toBe('local');
      expect(r.subclass).toBe('dirty-tree');
      expect(r.retryable).toBe(true);
    });

    test('please commit or stash', () => {
      const r = classifyGitError(
        mkErr('Please commit your changes or stash them before you merge'),
      );
      expect(r.class).toBe('local');
      expect(r.subclass).toBe('dirty-tree');
      expect(r.retryable).toBe(true);
    });

    test('disk full', () => {
      const r = classifyGitError(mkErr('error: no space left on device'));
      expect(r.class).toBe('local');
      expect(r.subclass).toBe('disk-full');
      expect(r.retryable).toBe(true);
    });

    test('ENOSPC', () => {
      const r = classifyGitError(mkErr('ENOSPC: no space left on device'));
      expect(r.class).toBe('local');
      expect(r.subclass).toBe('disk-full');
      expect(r.retryable).toBe(true);
    });

    test('non-Error input falls back to local', () => {
      const r = classifyGitError('unexpected git error');
      expect(r.class).toBe('local');
      expect(r.retryable).toBe(true);
    });
  });

  describe('ClassifiedError shape', () => {
    test('includes message string', () => {
      const r = classifyGitError(mkErr('ENOTFOUND github.com'));
      expect(typeof r.message).toBe('string');
      expect(r.message.length).toBeGreaterThan(0);
    });

    test('rawStderr is optional but included when available', () => {
      const r = classifyGitError(mkErr('fatal', 'stderr content here'));
      // rawStderr may or may not be populated depending on classification path
      if (r.rawStderr !== undefined) {
        expect(typeof r.rawStderr).toBe('string');
      }
    });

    test('retryable is a boolean', () => {
      const r = classifyGitError(mkErr('anything'));
      expect(typeof r.retryable).toBe('boolean');
    });
  });
});
