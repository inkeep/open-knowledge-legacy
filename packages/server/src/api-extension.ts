/**
 * HTTP API extension for Hocuspocus — agent write, undo/redo, and test reset endpoints.
 *
 * Implemented as a Hocuspocus onRequest extension so it works with both
 * the standalone Server and the Vite dev plugin.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Extension, Hocuspocus } from '@hocuspocus/server';
import {
  AGENT_WRITE_ORIGIN,
  type AgentSessionManager,
  DEFAULT_AGENT_ID,
  syncTextToFragment,
} from './agent-sessions.ts';

const MAX_BODY_BYTES = 1_048_576; // 1 MB

export interface ApiExtensionOptions {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  contentDir: string;
  /**
   * When true, register test-only routes (currently `/api/test-reset`).
   * Defaults to `false` — these routes allow any client to destroy document
   * state and must never be exposed in production. Enable only in tests and
   * local dev mode.
   */
  enableTestRoutes?: boolean;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error('Payload too large');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function createApiExtension(options: ApiExtensionOptions): Extension {
  const { hocuspocus, sessionManager, contentDir, enableTestRoutes = false } = options;

  async function handleAgentWrite(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      let body: Record<string, unknown>;
      try {
        body =
          rawBody.length > 0 ? (JSON.parse(rawBody.toString()) as Record<string, unknown>) : {};
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }
      const docName =
        typeof body.docName === 'string' && body.docName.length > 0 ? body.docName : 'test-doc';
      const dc = await sessionManager.getSession(docName);
      const timestamp = new Date().toISOString();
      const content =
        typeof body.content === 'string' ? body.content : `Hello from the agent! ${timestamp}`;

      dc.document.awareness.setLocalStateField('mode', 'editing');
      try {
        dc.document.transact(() => {
          const ytext = dc.document.getText('source');
          const currentText = ytext.toString();
          const insertAt = currentText.length;
          const separator = currentText.trim() ? '\n\n' : '';
          ytext.insert(insertAt, `${separator}${content}\n`);
          syncTextToFragment(dc.document);

          const activityMap = dc.document.getMap('activity');
          activityMap.set(DEFAULT_AGENT_ID, {
            agentId: DEFAULT_AGENT_ID,
            timestamp: Date.now(),
            type: 'insert',
            description: `Added: ${content.slice(0, 50)}`,
          });
        }, AGENT_WRITE_ORIGIN);
      } finally {
        dc.document.awareness.setLocalStateField('mode', 'idle');
      }

      json(res, 200, { ok: true, timestamp });
    } catch (e) {
      console.error('[agent-write]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleAgentWriteMd(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }

      const { markdown, position: pos } = body as Record<string, unknown>;
      if (!markdown || typeof markdown !== 'string') {
        json(res, 400, { ok: false, error: 'markdown field required' });
        return;
      }

      const position = pos === 'prepend' ? 'prepend' : pos === 'replace' ? 'replace' : 'append';
      const docName = (body as Record<string, unknown>).docName;
      const resolvedDocName =
        typeof docName === 'string' && docName.length > 0 ? docName : 'test-doc';
      const dc = await sessionManager.getSession(resolvedDocName);
      const timestamp = new Date().toISOString();

      dc.document.awareness.setLocalStateField('mode', 'editing');
      try {
        dc.document.transact(() => {
          const ytext = dc.document.getText('source');
          const currentText = ytext.toString();

          if (position === 'replace') {
            ytext.delete(0, currentText.length);
            ytext.insert(0, markdown.trim());
          } else if (position === 'prepend') {
            ytext.insert(0, `${markdown.trim()}\n\n`);
          } else {
            const insertAt = currentText.length;
            const separator = currentText.trim() ? '\n\n' : '';
            ytext.insert(insertAt, `${separator}${markdown.trim()}\n`);
          }

          syncTextToFragment(dc.document);

          const activityMap = dc.document.getMap('activity');
          activityMap.set(DEFAULT_AGENT_ID, {
            agentId: DEFAULT_AGENT_ID,
            timestamp: Date.now(),
            type: 'insert',
            description: `Added: ${markdown.trim().slice(0, 50)}`,
          });
        }, AGENT_WRITE_ORIGIN);
      } finally {
        dc.document.awareness.setLocalStateField('mode', 'idle');
      }

      json(res, 200, { ok: true, timestamp });
    } catch (e) {
      console.error('[agent-write-md]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleDocumentRead(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const docName = url.searchParams.get('docName') || 'test-doc';
      const dc = await sessionManager.getSession(docName);
      const content = dc.document.getText('source').toString();
      json(res, 200, { ok: true, docName, content });
    } catch (e) {
      console.error('[document-read]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleAgentPatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }
      const { find, replace, docName: rawDocName } = body as Record<string, unknown>;
      if (typeof find !== 'string' || find.length === 0) {
        json(res, 400, { ok: false, error: 'find field required' });
        return;
      }
      if (typeof replace !== 'string') {
        json(res, 400, { ok: false, error: 'replace field required' });
        return;
      }
      const docName =
        typeof rawDocName === 'string' && rawDocName.length > 0 ? rawDocName : 'test-doc';
      const dc = await sessionManager.getSession(docName);
      const timestamp = new Date().toISOString();

      let notFound = false;
      dc.document.awareness.setLocalStateField('mode', 'editing');
      try {
        dc.document.transact(() => {
          const ytext = dc.document.getText('source');
          const currentText = ytext.toString();
          const pos = currentText.indexOf(find);
          if (pos === -1) {
            notFound = true;
            return;
          }
          ytext.delete(pos, find.length);
          ytext.insert(pos, replace);
          syncTextToFragment(dc.document);
          const activityMap = dc.document.getMap('activity');
          activityMap.set(DEFAULT_AGENT_ID, {
            agentId: DEFAULT_AGENT_ID,
            timestamp: Date.now(),
            type: 'insert',
            description: `Patched: ${find.slice(0, 50)}`,
          });
        }, AGENT_WRITE_ORIGIN);
      } finally {
        dc.document.awareness.setLocalStateField('mode', 'idle');
      }

      if (notFound) {
        json(res, 404, { ok: false, error: 'Text not found in document' });
        return;
      }
      json(res, 200, { ok: true, timestamp });
    } catch (e) {
      console.error('[agent-patch]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleAgentUndoStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const docName = url.searchParams.get('docName') || 'test-doc';
      if (!sessionManager.hasSession(docName)) {
        json(res, 200, { ok: true, canUndo: false, canRedo: false });
        return;
      }
      const um = sessionManager.getExistingUndoManager(docName);
      json(res, 200, {
        ok: true,
        canUndo: um?.canUndo() ?? false,
        canRedo: um?.canRedo() ?? false,
      });
    } catch (e) {
      console.error('[agent-undo-status]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleAgentUndo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      let docName = 'test-doc';
      try {
        const raw = await readBody(req);
        if (raw.length > 0) {
          try {
            const body = JSON.parse(raw.toString()) as Record<string, unknown>;
            if (typeof body.docName === 'string' && body.docName.length > 0) docName = body.docName;
          } catch {
            json(res, 400, { ok: false, error: 'Invalid JSON body' });
            return;
          }
        }
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      const dc = await sessionManager.getSession(docName);
      const um = sessionManager.getUndoManager(dc);
      if (!um.canUndo()) {
        json(res, 200, { ok: false, canUndo: false, canRedo: um.canRedo() });
        return;
      }
      um.undo();
      try {
        syncTextToFragment(dc.document);
      } catch (syncErr) {
        // Compensate: restore pre-undo state so bridge invariant holds.
        try {
          um.redo();
        } catch (compensateErr) {
          console.error('[agent-undo] Compensation also failed:', compensateErr);
        }
        throw syncErr;
      }
      console.log('[agent-undo] Undo performed');
      json(res, 200, { ok: true, canUndo: um.canUndo(), canRedo: um.canRedo() });
    } catch (e) {
      console.error('[agent-undo]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleAgentRedo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      let docName = 'test-doc';
      try {
        const raw = await readBody(req);
        if (raw.length > 0) {
          try {
            const body = JSON.parse(raw.toString()) as Record<string, unknown>;
            if (typeof body.docName === 'string' && body.docName.length > 0) docName = body.docName;
          } catch {
            json(res, 400, { ok: false, error: 'Invalid JSON body' });
            return;
          }
        }
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      const dc = await sessionManager.getSession(docName);
      const um = sessionManager.getUndoManager(dc);
      if (!um.canRedo()) {
        json(res, 200, { ok: false, canUndo: um.canUndo(), canRedo: false });
        return;
      }
      um.redo();
      try {
        syncTextToFragment(dc.document);
      } catch (syncErr) {
        // Compensate: restore pre-redo state so bridge invariant holds.
        try {
          um.undo();
        } catch (compensateErr) {
          console.error('[agent-redo] Compensation also failed:', compensateErr);
        }
        throw syncErr;
      }
      console.log('[agent-redo] Redo performed');
      json(res, 200, { ok: true, canUndo: um.canUndo(), canRedo: um.canRedo() });
    } catch (e) {
      console.error('[agent-redo]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleTestReset(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const docName = url.searchParams.get('docName') ?? 'test-doc';

      // Path traversal guard — reject docNames that escape contentDir
      const filePath = resolve(contentDir, `${docName}.md`);
      if (!filePath.startsWith(`${contentDir}/`) && filePath !== contentDir) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }

      await sessionManager.closeAll(docName);
      hocuspocus.closeConnections(docName);

      // D18: Force-flush any pending onStoreDocument debounced work before unload.
      // Without this, unloadDocument silently no-ops if the debouncer is active
      // (Hocuspocus.shouldUnloadDocument returns false when isDebounced is true).
      const debounceId = `onStoreDocument-${docName}`;
      if (hocuspocus.debouncer.isDebounced(debounceId)) {
        await hocuspocus.debouncer.executeNow(debounceId);
      }

      const doc = hocuspocus.documents.get(docName);
      if (doc) await hocuspocus.unloadDocument(doc);
      const { writeFileSync } = await import('node:fs');
      writeFileSync(filePath, '', 'utf-8');
      json(res, 200, { ok: true });
    } catch (e) {
      console.error('[test-reset]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
    '/api/document': handleDocumentRead,
    '/api/agent-write': handleAgentWrite,
    '/api/agent-write-md': handleAgentWriteMd,
    '/api/agent-patch': handleAgentPatch,
    '/api/agent-undo-status': handleAgentUndoStatus,
    '/api/agent-undo': handleAgentUndo,
    '/api/agent-redo': handleAgentRedo,
  };

  if (enableTestRoutes) {
    routes['/api/test-reset'] = handleTestReset;
  }

  return {
    priority: 100, // Higher priority — API routes run before static file serving
    async onRequest({ request, response }: { request: IncomingMessage; response: ServerResponse }) {
      const url = request.url?.split('?')[0];
      if (!url) return;

      const handler = routes[url];
      if (handler) {
        await handler(request, response);
      }
    },
  };
}
