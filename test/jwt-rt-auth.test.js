import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { spawn } from 'node:child_process';
import { io as createClient } from 'socket.io-client';
import { createRealtimeServer } from '../server.js';

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString('base64url');

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

const getJson = async (url) => {
  const response = await fetch(url);
  return response.json();
};

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

test('rejects handshake when bearer token is missing', async () => {
  const security = await startSecurityStub(new Set());
  const rt = createRealtimeServer({
    port: 0,
    jwtRequired: true,
    securityApiBase: `http://localhost:${security.port}`,
  });
  await new Promise((resolve) => rt.server.listen(0, resolve));
  const rtPort = rt.server.address().port;

  const client = connectClient(`http://localhost:${rtPort}`);
  const error = await new Promise((resolve) => client.on('connect_error', resolve));

  assert.match(String(error?.message || ''), /missing bearer token/i);

  client.disconnect();
  await new Promise((resolve) => rt.server.close(resolve));
  await security.close();
});

test('rejects JWT without subject claim', async () => {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'RS256', typ: 'JWT' });
  const payload = b64url({ iat: now, exp: now + 300 });
  const token = `${header}.${payload}.sig`;

  const security = await startSecurityStub(new Set([token]));
  const rt = createRealtimeServer({
    port: 0,
    jwtRequired: true,
    securityApiBase: `http://localhost:${security.port}`,
  });
  await new Promise((resolve) => rt.server.listen(0, resolve));
  const rtPort = rt.server.address().port;

  const client = connectClient(`http://localhost:${rtPort}`, token);
  const error = await new Promise((resolve) => client.on('connect_error', resolve));

  assert.match(String(error?.message || ''), /jwt subject is missing/i);

  client.disconnect();
  await new Promise((resolve) => rt.server.close(resolve));
  await security.close();
});

test('handles malformed JWT payload safely', async () => {
  const token = 'eyJhbGciOiJSUzI1NiJ9.invalid_payload.sig';
  const security = await startSecurityStub(new Set([token]));
  const rt = createRealtimeServer({
    port: 0,
    jwtRequired: true,
    securityApiBase: `http://localhost:${security.port}`,
  });
  await new Promise((resolve) => rt.server.listen(0, resolve));
  const rtPort = rt.server.address().port;

  const client = connectClient(`http://localhost:${rtPort}`, token);
  const error = await new Promise((resolve) => client.on('connect_error', resolve));

  assert.match(String(error?.message || ''), /jwt subject is missing/i);

  client.disconnect();
  await new Promise((resolve) => rt.server.close(resolve));
  await security.close();
});

test('rejects JWT token with missing payload segment', async () => {
  const token = 'headerOnly';
  const security = await startSecurityStub(new Set([token]));
  const rt = createRealtimeServer({
    port: 0,
    jwtRequired: true,
    securityApiBase: `http://localhost:${security.port}`,
  });
  await new Promise((resolve) => rt.server.listen(0, resolve));
  const rtPort = rt.server.address().port;

  const client = connectClient(`http://localhost:${rtPort}`, token);
  const error = await new Promise((resolve) => client.on('connect_error', resolve));

  assert.match(String(error?.message || ''), /jwt subject is missing/i);

  client.disconnect();
  await new Promise((resolve) => rt.server.close(resolve));
  await security.close();
});

test('allows anonymous mode and validates room and draw payloads', async () => {
  const rt = createRealtimeServer({
    port: 0,
    jwtRequired: false,
    jwtEnforceRoomOwner: true,
    corsOrigins: 'http://localhost:5174,http://localhost:5173',
  });
  await new Promise((resolve) => rt.server.listen(0, resolve));
  const rtPort = rt.server.address().port;

  const client = connectClient(`http://localhost:${rtPort}`);
  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('connect_error', reject);
  });

  const invalidRoom = await new Promise((resolve) => {
    client.once('rt-error', resolve);
    client.emit('join-room', 'bad.room.format');
  });
  assert.equal(invalidRoom.message, 'Invalid room format');

  const invalidPayload = await new Promise((resolve) => {
    client.once('rt-error', resolve);
    client.emit('draw-event', { room: 'blueprints.juan.demo', author: 'juan', name: 'demo', point: { x: 'x' } });
  });
  assert.equal(invalidPayload.message, 'Invalid draw-event payload');

  client.disconnect();
  await new Promise((resolve) => rt.server.close(resolve));
});

test('rejects unauthorized draw publish and supports ping-pong plus REST endpoints', async () => {
  const token = createJwt('juan');
  const security = await startSecurityStub(new Set([token]));
  const rt = createRealtimeServer({
    port: 0,
    jwtRequired: true,
    jwtEnforceRoomOwner: true,
    securityApiBase: `http://localhost:${security.port}`,
    jwtAdminUsers: 'admin',
  });
  await new Promise((resolve) => rt.server.listen(0, resolve));
  const rtPort = rt.server.address().port;

  const health = await getJson(`http://localhost:${rtPort}/health`);
  assert.equal(health.status, 'UP');

  const bp = await getJson(`http://localhost:${rtPort}/api/blueprints/juan/demo`);
  assert.equal(bp.author, 'juan');
  assert.equal(bp.name, 'demo');

  const client = connectClient(`http://localhost:${rtPort}`, token);
  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('connect_error', reject);
  });

  const unauthorizedPublish = await new Promise((resolve) => {
    client.once('rt-error', resolve);
    client.emit('draw-event', {
      room: 'blueprints.maria.demo',
      author: 'maria',
      name: 'demo',
      point: { x: 10, y: 20 },
    });
  });
  assert.equal(unauthorizedPublish.message, 'Not authorized to publish in this room');

  const pong = await new Promise((resolve) => {
    client.once('pong-check', resolve);
    client.emit('ping-check', 12345);
  });
  assert.equal(pong.clientTs, 12345);
  assert.equal(typeof pong.serverTs, 'number');

  client.disconnect();
  await new Promise((resolve) => rt.server.close(resolve));
  await security.close();
});

test('starts when executed as main module', async () => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: '0', JWT_REQUIRED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const started = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start in time')), 4000);

    child.stdout.on('data', (data) => {
      const text = String(data);
      if (text.includes('Socket.IO up on')) {
        clearTimeout(timeout);
        resolve(true);
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  assert.equal(started, true);

  child.kill('SIGTERM');
  await new Promise((resolve) => child.on('exit', resolve));
});
