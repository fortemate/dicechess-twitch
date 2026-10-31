import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { isOperatorCommand } from '../shared/protocol.ts';
import { Session } from './session.ts';
import { pieceAssetFiles } from '../shared/artwork.ts';

interface HostOptions {
  operatorPort: number;
  obsPort: number;
  clientDirectory: string;
  operatorNote?: string;
  session?: Session;
}

const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    ...securityHeaders,
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(value));
}

function listen(server: Server, port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string')
        return reject(new Error('No local listener'));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function close(server: Server) {
  server.closeAllConnections();
  if (server.listening)
    await new Promise<void>((resolve) => server.close(() => resolve()));
}

/**
 * Start loopback operator and read-only OBS listeners for one authoritative session.
 * Only allowlisted assets/public snapshots reach OBS; operator commands require
 * the local capability, exact origin and current session revision. Closing the
 * returned host stops both listeners and disposes the session.
 */
export async function startHost(options: HostOptions) {
  const session = options.session ?? new Session();
  // Fresh process-local authority; never placed in URLs, OBS assets or logs.
  const capability = randomBytes(32).toString('hex');
  const streams = new Set<ServerResponse>();
  const assets = new Map<string, Buffer>();
  try {
    for (const name of [
      'operator.html',
      'obs.html',
      'operator.js',
      'obs.js',
      'styles.css',
      'brand/fortemate-mark-white.svg',
      'brand/NOTICE.txt',
      ...pieceAssetFiles.map((file) => `pieces/cburnett/${file}`),
      'pieces/cburnett/NOTICE.txt',
      'pieces/cburnett/LICENSE.txt',
    ]) {
      assets.set(name, await readFile(join(options.clientDirectory, name)));
    }
  } catch (error: unknown) {
    session.dispose();
    throw error;
  }
  const broadcast = () => {
    const event = `data: ${JSON.stringify(session.snapshot())}\n\n`;
    for (const response of streams) {
      // A stalled capture cannot retain an unbounded backlog or block the host.
      if (!response.write(event)) response.destroy();
    }
  };
  session.onChange(broadcast);

  function handler(surface: 'operator' | 'obs') {
    return async (request: IncomingMessage, response: ServerResponse) => {
      const address = request.socket.localPort;
      const authority = `127.0.0.1:${address}`;
      const origin = `http://${authority}`;
      if (request.headers.host !== authority)
        return json(response, 403, { error: 'Invalid host' });
      // No CORS: cross-origin script requests may neither read nor mutate operator state.
      if (request.headers.origin && request.headers.origin !== origin) {
        return json(response, 403, { error: 'Invalid origin' });
      }
      const path = request.url;
      if (
        surface === 'operator' &&
        path === '/api/operator' &&
        request.method === 'GET'
      ) {
        if (request.headers['x-operator-request'] !== '1')
          return json(response, 403, { error: 'Operator request required' });
        return json(response, 200, {
          capability,
          operatorNote: options.operatorNote ?? 'Local session controls',
        });
      }
      if (
        surface === 'operator' &&
        path === '/api/operator/state' &&
        request.method === 'GET'
      ) {
        if (request.headers['x-operator-request'] !== '1')
          return json(response, 403, { error: 'Operator request required' });
        return json(response, 200, session.operatorState());
      }
      if (
        surface === 'operator' &&
        path === '/api/operator/twitch' &&
        request.method === 'GET'
      ) {
        if (request.headers['x-operator-request'] !== '1')
          return json(response, 403, { error: 'Operator request required' });
        return json(response, 200, session.operatorTwitchState());
      }
      if (
        surface === 'operator' &&
        path === '/api/command' &&
        request.method === 'POST'
      ) {
        const supplied = Buffer.from(request.headers.authorization ?? '');
        const expected = Buffer.from(`Bearer ${capability}`);
        if (
          request.headers.origin !== origin ||
          supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected)
        )
          return json(response, 403, {
            error: 'Operator authorization required',
          });
        if (request.headers['content-type'] !== 'application/json')
          return json(response, 415, { error: 'JSON required' });
        const chunks: Buffer[] = [];
        let bytes = 0;
        try {
          for await (const chunk of request) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            bytes += buffer.length;
            if (bytes > 4096) {
              json(response, 413, { error: 'Command too large' });
              return;
            }
            chunks.push(buffer);
          }
          const command: unknown = JSON.parse(
            Buffer.concat(chunks).toString('utf8'),
          );
          if (!isOperatorCommand(command))
            return json(response, 400, { error: 'Invalid command' });
          const snapshot = session.apply(command);
          if (!snapshot)
            return json(response, 409, {
              error: 'Session changed; retry from the latest snapshot',
            });
          return json(response, 200, snapshot);
        } catch {
          if (!response.headersSent)
            json(response, 400, { error: 'Invalid command' });
          return;
        }
      }
      // OBS exposes only GET resources, including when called outside the browser UI.
      if (request.method !== 'GET')
        return json(response, 405, { error: 'Read-only resource' });
      if (path === '/api/snapshot')
        return json(response, 200, session.snapshot());
      if (path === '/api/events') {
        response.writeHead(200, {
          ...securityHeaders,
          'Content-Type': 'text/event-stream',
          Connection: 'keep-alive',
        });
        response.write(
          `retry: 1000\ndata: ${JSON.stringify(session.snapshot())}\n\n`,
        );
        streams.add(response);
        response.on('close', () => streams.delete(response));
        return;
      }
      const name = path === '/' ? `${surface}.html` : path?.slice(1);
      if (
        name &&
        (name.startsWith('pieces/cburnett/') || name.startsWith('brand/')) &&
        assets.has(name)
      ) {
        response.writeHead(200, {
          ...securityHeaders,
          'Content-Type': name.endsWith('.svg')
            ? 'image/svg+xml'
            : 'text/plain; charset=utf-8',
        });
        response.end(assets.get(name));
        return;
      }
      if (
        name &&
        [`${surface}.html`, `${surface}.js`, 'styles.css'].includes(name)
      ) {
        const type = name.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : name.endsWith('.css')
            ? 'text/css'
            : 'text/javascript';
        response.writeHead(200, { ...securityHeaders, 'Content-Type': type });
        response.end(assets.get(name));
        return;
      }
      json(response, 404, { error: 'Not found' });
    };
  }

  const operator = createServer((request, response) => {
    void handler('operator')(request, response);
  });
  const obs = createServer((request, response) => {
    void handler('obs')(request, response);
  });
  let operatorUrl: string;
  let obsUrl: string;
  try {
    operatorUrl = await listen(operator, options.operatorPort);
    obsUrl = await listen(obs, options.obsPort);
  } catch (error) {
    session.dispose();
    await Promise.all([close(operator), close(obs)]);
    throw error;
  }
  const heartbeat = setInterval(() => {
    for (const response of streams) {
      if (!response.write(': heartbeat\n\n')) response.destroy();
    }
  }, 15_000);
  heartbeat.unref();
  return {
    operatorUrl,
    obsUrl,
    async close() {
      session.dispose();
      clearInterval(heartbeat);
      for (const response of streams) response.end();
      await Promise.all([close(operator), close(obs)]);
    },
  };
}
