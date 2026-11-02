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

async function loadAssets(directory: string): Promise<Map<string, Buffer>> {
  const names = [
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
  ];
  const loaded = await Promise.allSettled(
    names.map((name) => readFile(join(directory, name))),
  );
  // Keep allowlist order and deterministic failure reporting after every read settles.
  return new Map(
    loaded.map((result, index): [string, Buffer] => {
      if (result.status === 'rejected') throw result.reason;
      return [names[index]!, result.value];
    }),
  );
}

function clientContentType(name: string): string {
  if (name.endsWith('.html')) return 'text/html; charset=utf-8';
  if (name.endsWith('.css')) return 'text/css';
  return 'text/javascript';
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
  const assets = await loadAssets(options.clientDirectory).catch(
    (error: unknown) => {
      session.dispose();
      throw error;
    },
  );
  const broadcast = () => {
    const event = `data: ${JSON.stringify(session.snapshot())}\n\n`;
    for (const response of streams) {
      // A stalled capture cannot retain an unbounded backlog or block the host.
      if (!response.write(event)) response.destroy();
    }
  };
  session.onChange(broadcast);

  const operatorPaths = new Set([
    '/api/operator',
    '/api/operator/state',
    '/api/operator/twitch',
  ]);

  async function applyCommand(
    request: IncomingMessage,
    response: ServerResponse,
    origin: string,
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

  function serveResource(
    surface: 'operator' | 'obs',
    path: string | undefined,
    response: ServerResponse,
  ) {
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
      const type = clientContentType(name);
      response.writeHead(200, { ...securityHeaders, 'Content-Type': type });
      response.end(assets.get(name));
      return;
    }
    json(response, 404, { error: 'Not found' });
  }

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
        request.method === 'GET' &&
        operatorPaths.has(path ?? '')
      ) {
        if (request.headers['x-operator-request'] !== '1')
          return json(response, 403, { error: 'Operator request required' });
        switch (path) {
          case '/api/operator':
            return json(response, 200, {
              capability,
              operatorNote: options.operatorNote ?? 'Local session controls',
            });
          case '/api/operator/state':
            return json(response, 200, session.operatorState());
          case '/api/operator/twitch':
            return json(response, 200, session.operatorTwitchState());
        }
      }
      if (
        surface === 'operator' &&
        path === '/api/command' &&
        request.method === 'POST'
      )
        return applyCommand(request, response, origin);
      // OBS exposes only GET resources, including when called outside the browser UI.
      if (request.method !== 'GET')
        return json(response, 405, { error: 'Read-only resource' });
      return serveResource(surface, path, response);
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
