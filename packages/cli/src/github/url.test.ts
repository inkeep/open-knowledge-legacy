import { describe, expect, test } from 'bun:test';
import { parseGitUrl } from './url.ts';

describe('parseGitUrl', () => {
  describe('https:// URLs', () => {
    test('basic https URL', () => {
      const result = parseGitUrl('https://github.com/owner/repo');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('https URL with .git suffix', () => {
      const result = parseGitUrl('https://github.com/owner/repo.git');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('https URL with trailing slash', () => {
      const result = parseGitUrl('https://github.com/owner/repo/');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('https URL with port number', () => {
      const result = parseGitUrl('https://github.example.com:8443/owner/repo');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'github.example.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('http URL (treated as https)', () => {
      const result = parseGitUrl('http://github.com/owner/repo');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('GHES https URL', () => {
      const result = parseGitUrl('https://company.ghe.com/owner/repo');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'company.ghe.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('hyphenated owner and repo', () => {
      const result = parseGitUrl('https://github.com/my-org/my-repo');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'github.com',
        owner: 'my-org',
        name: 'my-repo',
      });
    });

    test('repo with dots', () => {
      const result = parseGitUrl('https://github.com/owner/repo.name');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo.name',
      });
    });
  });

  describe('SCP-style SSH (git@host:owner/repo)', () => {
    test('standard git@ SSH', () => {
      const result = parseGitUrl('git@github.com:owner/repo');
      expect(result).toEqual({
        protocol: 'ssh',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('git@ SSH with .git suffix', () => {
      const result = parseGitUrl('git@github.com:owner/repo.git');
      expect(result).toEqual({
        protocol: 'ssh',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('GHES SCP-style SSH (*.ghe.com)', () => {
      const result = parseGitUrl('git@company.ghe.com:owner/repo');
      expect(result).toEqual({
        protocol: 'ssh',
        hostname: 'company.ghe.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('GHES SCP-style with .git', () => {
      const result = parseGitUrl('git@acme.ghe.com:acme-org/my-docs.git');
      expect(result).toEqual({
        protocol: 'ssh',
        hostname: 'acme.ghe.com',
        owner: 'acme-org',
        name: 'my-docs',
      });
    });
  });

  describe('ssh:// URLs', () => {
    test('ssh URL with git@ user', () => {
      const result = parseGitUrl('ssh://git@github.com/owner/repo');
      expect(result).toEqual({
        protocol: 'ssh',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('ssh URL without user', () => {
      const result = parseGitUrl('ssh://github.com/owner/repo');
      expect(result).toEqual({
        protocol: 'ssh',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('ssh URL with .git suffix', () => {
      const result = parseGitUrl('ssh://git@github.com/owner/repo.git');
      expect(result).toEqual({
        protocol: 'ssh',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('ssh URL with port', () => {
      const result = parseGitUrl('ssh://git@github.example.com:22/owner/repo');
      expect(result).toEqual({
        protocol: 'ssh',
        hostname: 'github.example.com',
        owner: 'owner',
        name: 'repo',
      });
    });
  });

  describe('git:// URLs', () => {
    test('git:// URL', () => {
      const result = parseGitUrl('git://github.com/owner/repo');
      expect(result).toEqual({
        protocol: 'git',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('git:// URL with .git suffix', () => {
      const result = parseGitUrl('git://github.com/owner/repo.git');
      expect(result).toEqual({
        protocol: 'git',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });
  });

  describe('git: bare protocol (without //)', () => {
    test('git: bare protocol', () => {
      const result = parseGitUrl('git:github.com/owner/repo');
      expect(result).toEqual({
        protocol: 'git',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('git: bare protocol with .git', () => {
      const result = parseGitUrl('git:github.com/owner/repo.git');
      expect(result).toEqual({
        protocol: 'git',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });
  });

  describe('owner/repo shorthand', () => {
    test('owner/repo shorthand defaults to github.com', () => {
      const result = parseGitUrl('owner/repo');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('org with hyphens', () => {
      const result = parseGitUrl('my-company/my-repo');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'github.com',
        owner: 'my-company',
        name: 'my-repo',
      });
    });

    test('shorthand with .git suffix strips .git', () => {
      const result = parseGitUrl('owner/repo.git');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'github.com',
        owner: 'owner',
        name: 'repo',
      });
    });

    test('inkeep/open-knowledge shorthand', () => {
      const result = parseGitUrl('inkeep/open-knowledge');
      expect(result).toEqual({
        protocol: 'https',
        hostname: 'github.com',
        owner: 'inkeep',
        name: 'open-knowledge',
      });
    });
  });

  describe('invalid inputs', () => {
    test('empty string returns null', () => {
      expect(parseGitUrl('')).toBeNull();
    });

    test('whitespace-only string returns null', () => {
      expect(parseGitUrl('   ')).toBeNull();
    });

    test('bare hostname returns null', () => {
      expect(parseGitUrl('github.com')).toBeNull();
    });

    test('https URL without owner/repo returns null', () => {
      expect(parseGitUrl('https://github.com')).toBeNull();
    });

    test('https URL with only owner returns null', () => {
      expect(parseGitUrl('https://github.com/owner')).toBeNull();
    });

    test('invalid URL returns null', () => {
      expect(parseGitUrl('not-a-url')).toBeNull();
    });

    test('url with spaces returns null', () => {
      expect(parseGitUrl('https://github.com/owner/re po')).toBeNull();
    });

    test('ftp:// protocol returns null', () => {
      expect(parseGitUrl('ftp://github.com/owner/repo')).toBeNull();
    });
  });
});
