#!/usr/bin/env node
/**
 * Local show server: serves the built app on the LAN and relays control
 * messages between the laptop (display) and any phones (controllers).
 *
 *   npm run build && npm run remote
 *
 * Then open the printed URL on the laptop, and the /?remote=1 URL on the
 * phone. Both must be on the same network.
 *
 * Why local rather than a cloud relay: a control surface wants its slider to
 * move the visuals immediately, and a LAN round-trip is a couple of
 * milliseconds against a hundred or more through a datacentre. It also means
 * the show keeps working when the internet doesn't. The tradeoff is that this
 * serves the app over plain http on the LAN — a page loaded from
 * https://chromaglass.web.app cannot open a ws:// socket to your laptop
 * (mixed content), so for remote control you run the show from here.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const PORT = Number(process.env.PORT ?? 3000);
const WS_PATH = '/remote-ws';
const INFO_PATH = '/remote-info.json';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

if (!existsSync(DIST)) {
  console.error(`No build found at ${DIST}\nRun "npm run build" first.`);
  process.exit(1);
}

const lanAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);

// ── Static files, with SPA fallback ────────────────────────────────────
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // The display asks for this before opening a socket, so a page served from
  // anywhere else knows not to try. Static hosts answer with index.html.
  if (url.pathname === INFO_PATH) {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    // The LAN addresses let the show print the URL a network display opens.
    res.end(JSON.stringify({ chromaglass: 'relay', path: WS_PATH, port: PORT, hosts: lanAddresses() }));
    return;
  }
  // normalize() collapses any ../ before it can escape dist
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(DIST, requested);

  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST, 'index.html');   // SPA fallback, same as Firebase
  }

  res.writeHead(200, {
    'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(filePath).pipe(res);
});

// ── Control relay ──────────────────────────────────────────────────────
// Displays and controllers each broadcast to the other side. There is no
// state here at all: the display is authoritative and re-sends a snapshot
// whenever a controller joins, which keeps this process restartable
// mid-show without anything getting out of sync.
const wss = new WebSocketServer({ server, path: WS_PATH });
const roles = new WeakMap();

const broadcastTo = (role, raw, except) => {
  for (const client of wss.clients) {
    if (client !== except && client.readyState === 1 && roles.get(client) === role) {
      client.send(raw);
    }
  }
};

wss.on('connection', (socket) => {
  roles.set(socket, 'unknown');

  socket.on('message', (data) => {
    const raw = data.toString();
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.type === 'hello') {
      const role = message.role === 'display' ? 'display' : message.role === 'mirror' ? 'mirror' : 'controller';
      roles.set(socket, role);
      const count = [...wss.clients].filter(c => roles.get(c) === role).length;
      console.log(`  ${role} connected (${count} now)`);
      // A joining phone needs the current state before it can show anything;
      // a joining network display needs the show itself.
      if (role === 'controller') broadcastTo('display', JSON.stringify({ type: 'request-state' }));
      if (role === 'mirror') {
        broadcastTo('display', JSON.stringify({ type: 'request-cast' }));
        broadcastTo('display', JSON.stringify({ type: 'mirrors', count }));
      }
      return;
    }

    const from = roles.get(socket);
    // The show itself — settings and audio bands, thirty times a second —
    // goes only to the network displays; phones never see it.
    if (from === 'display' && message.type === 'cast') {
      broadcastTo('mirror', raw, socket);
      return;
    }
    if (from === 'mirror') return;   // a display only listens
    // Displays talk to phones; phones talk to displays.
    broadcastTo(from === 'display' ? 'controller' : 'display', raw, socket);
  });

  socket.on('close', () => {
    const role = roles.get(socket);
    if (role && role !== 'unknown') console.log(`  ${role} disconnected`);
    if (role === 'mirror') {
      const count = [...wss.clients].filter(c => c !== socket && roles.get(c) === 'mirror').length;
      broadcastTo('display', JSON.stringify({ type: 'mirrors', count }));
    }
  });
});

// ── Startup banner ─────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  const hosts = lanAddresses();
  console.log('\n  ChromaGlass show server\n');
  console.log(`  Laptop (the show):  http://localhost:${PORT}/`);
  if (hosts.length === 0) {
    console.log('  No LAN address found — is this machine on a network?');
  } else {
    for (const host of hosts) {
      console.log(`  Phone (the remote): http://${host}:${PORT}/?remote=1`);
      console.log(`  Network display:    http://${host}:${PORT}/?cast=true`);
    }
  }
  console.log('\n  Both devices must be on the same network.\n');
});
