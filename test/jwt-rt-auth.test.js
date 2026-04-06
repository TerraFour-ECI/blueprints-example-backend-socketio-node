import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { io as createClient } from 'socket.io-client';
import { createRealtimeServer } from '../server.js';

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64url')
    .replace(/=+$/g, '');

const createJwt = (subject, expiresInSeconds = 300) => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { sub: subject, iat: now, exp: now + expiresInSeconds };
  return `${b64url(header)}.${b64url(payload)}.sig`;
};

const startSecurityStub = async (acceptedTokens) => {
  const server = createHttpServer((req, res) => {
    if (req.url !== '/api/blueprints') {
      res.writeHead(404).end();
      return;
    }

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!acceptedTokens.has(token)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return {
    port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

const connectClient = (url, token) =>
  createClient(url, {
    transports: ['websocket'],
    auth: token ? { token: `Bearer ${token}` } : {},
    forceNew: true,
    timeout: 2000,
  });

test('allows valid JWT and broadcasts blueprint updates inside authorized room', async () => {
  const token = createJwt('juan');
  const security = await startSecurityStub(new Set([token]));
  const rt = createRealtimeServer({
    port: 0,
    jwtRequired: true,
    jwtEnforceRoomOwner: true,
    securityApiBase: `http://localhost:${security.port}`,
  });
  await new Promise((resolve) => rt.server.listen(0, resolve));
  const rtPort = rt.server.address().port;

  const sender = connectClient(`http://localhost:${rtPort}`, token);
  const receiver = connectClient(`http://localhost:${rtPort}`, token);

  await Promise.all([
    new Promise((resolve, reject) => {
      sender.on('connect', resolve);
      sender.on('connect_error', reject);
    }),
    new Promise((resolve, reject) => {
      receiver.on('connect', resolve);
      receiver.on('connect_error', reject);
    }),
  ]);

  const room = 'blueprints.juan.demo';
  sender.emit('join-room', room);
  receiver.emit('join-room', room);
  await new Promise((resolve) => setTimeout(resolve, 80));

  const updatePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No blueprint-update received')), 2000);
    receiver.on('blueprint-update', (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });

  sender.emit('draw-event', {
    room,
    author: 'juan',
    name: 'demo',
    point: { x: 13, y: 21 },
  });

  const update = await updatePromise;
  assert.equal(update.author, 'juan');
  assert.equal(update.name, 'demo');
  assert.deepEqual(update.points, [{ x: 13, y: 21 }]);

  sender.disconnect();
  receiver.disconnect();
  await new Promise((resolve) => rt.server.close(resolve));
  await security.close();
});

test('rejects invalid JWT during socket handshake', async () => {
  const validToken = createJwt('juan');
  const invalidToken = createJwt('mallory');

  const security = await startSecurityStub(new Set([validToken]));
  const rt = createRealtimeServer({
    port: 0,
    jwtRequired: true,
    jwtEnforceRoomOwner: true,
    securityApiBase: `http://localhost:${security.port}`,
  });
  await new Promise((resolve) => rt.server.listen(0, resolve));
  const rtPort = rt.server.address().port;

  const client = connectClient(`http://localhost:${rtPort}`, invalidToken);

  const error = await new Promise((resolve) => {
    client.on('connect_error', resolve);
  });

  assert.match(String(error?.message || ''), /JWT authorization failed/i);
  client.disconnect();
  await new Promise((resolve) => rt.server.close(resolve));
  await security.close();
});

test('rejects user trying to join foreign author room', async () => {
  const token = createJwt('juan');
  const security = await startSecurityStub(new Set([token]));
  const rt = createRealtimeServer({
    port: 0,
    jwtRequired: true,
    jwtEnforceRoomOwner: true,
    securityApiBase: `http://localhost:${security.port}`,
  });
  await new Promise((resolve) => rt.server.listen(0, resolve));
  const rtPort = rt.server.address().port;

  const client = connectClient(`http://localhost:${rtPort}`, token);
  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('connect_error', reject);
  });

  const rtError = await new Promise((resolve) => {
    client.on('rt-error', resolve);
    client.emit('join-room', 'blueprints.maria.demo');
  });

  assert.equal(rtError.message, 'Not authorized to join this room');

  client.disconnect();
  await new Promise((resolve) => rt.server.close(resolve));
  await security.close();
});
