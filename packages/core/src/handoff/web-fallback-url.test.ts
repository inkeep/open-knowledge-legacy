import { expect, test } from 'bun:test';
import { buildClaudeAiWebUrl } from './web-fallback-url.ts';

test('buildClaudeAiWebUrl emits https://claude.ai/new?q=<encoded>', () => {
  expect(buildClaudeAiWebUrl('hello')).toBe('https://claude.ai/new?q=hello');
});

test('buildClaudeAiWebUrl single-encodes edge-case chars: %, em-dash, space, unicode', () => {
  expect(buildClaudeAiWebUrl('My %Project — notes café')).toBe(
    'https://claude.ai/new?q=My%20%25Project%20%E2%80%94%20notes%20caf%C3%A9',
  );
});
