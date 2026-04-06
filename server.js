import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const JWT_REQUIRED = process.env.JWT_REQUIRED !== 'false';
const JWT_ENFORCE_ROOM_OWNER = process.env.JWT_ENFORCE_ROOM_OWNER !== 'false';
const SECURITY_API_BASE = (process.env.SECURITY_API_BASE || 'http://localhost:8080').replace(/\/$/, '');
const JWT_ADMIN_USERS = new Set(
  (process.env.JWT_ADMIN_USERS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

const parseAllowedOrigins = () => {
  const raw = process.env.CORS_ORIGINS;
  if (!raw || raw.trim() === '*') return '*';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const isValidPoint = (point) => {
  if (!point || typeof point !== 'object') return false;
  const x = Number(point.x);
  const y = Number(point.y);
  return Number.isFinite(x) && Number.isFinite(y);
};

const isValidDrawEvent = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.room !== 'string' || !payload.room.startsWith('blueprints.')) return false;
  if (typeof payload.author !== 'string' || !payload.author.trim()) return false;
  if (typeof payload.name !== 'string' || !payload.name.trim()) return false;
  return isValidPoint(payload.point);
};

const parseBlueprintRoom = (room) => {
  if (typeof room !== 'string') return null;
  const parts = room.split('.');
  if (parts.length < 3 || parts[0] !== 'blueprints') return null;
  return {
    author: parts[1],
    name: parts.slice(2).join('.'),
  };
};

const decodeJwtPayload = (token) => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const extractBearer = (raw) => {
  if (!raw || typeof raw !== 'string') return null;
  const [scheme, value] = raw.split(' ');
  if (!scheme || !value) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return value.trim();
};

const validateTokenAgainstSecurityApi = async (token) => {
  const response = await fetch(`${SECURITY_API_BASE}/api/blueprints`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Security API rejected token with status ${response.status}`);
  }
};

const isAuthorizedForAuthor = (user, author) => {
  if (!JWT_ENFORCE_ROOM_OWNER) return true;
  if (!user) return false;
  if (JWT_ADMIN_USERS.has(user)) return true;
  return user === author;
};

const app = express();
const allowedOrigins = parseAllowedOrigins();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'UP', service: 'socketio-backend', timestamp: new Date().toISOString() });
});

app.get('/api/blueprints/:author/:name', (req, res) => {
  res.json({
    author: req.params.author,
    name: req.params.name,
    points: [{ x: 10, y: 10 }, { x: 40, y: 50 }],
  });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: allowedOrigins } });

io.use(async (socket, next) => {
  if (!JWT_REQUIRED) {
    socket.data.user = 'anonymous';
    return next();
  }

  try {
    const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
    const token = extractBearer(authHeader);
    if (!token) {
      return next(new Error('Missing Bearer token in socket handshake'));
    }

    await validateTokenAgainstSecurityApi(token);
    const payload = decodeJwtPayload(token);
    const user = String(payload?.sub || '').trim();
    if (!user) {
      return next(new Error('JWT subject is missing'));
    }

    socket.data.user = user;
    socket.data.token = token;
    return next();
  } catch (error) {
    return next(new Error(`JWT authorization failed: ${error.message}`));
  }
});

io.on('connection', (socket) => {
  console.log(`[socketio] connected socketId=${socket.id} user=${socket.data.user || 'n/a'}`);

  socket.on('join-room', (room) => {
    if (typeof room !== 'string' || !room.startsWith('blueprints.')) {
      socket.emit('rt-error', { message: 'Invalid room format' });
      return;
    }

    const parsed = parseBlueprintRoom(room);
    if (!parsed || !isAuthorizedForAuthor(socket.data.user, parsed.author)) {
      socket.emit('rt-error', { message: 'Not authorized to join this room' });
      return;
    }

    socket.join(room);
    console.log(`[socketio] join-room socketId=${socket.id} user=${socket.data.user} room=${room}`);
  });

  socket.on('draw-event', (payload) => {
    if (!isValidDrawEvent(payload)) {
      socket.emit('rt-error', { message: 'Invalid draw-event payload' });
      return;
    }

    const point = { x: Number(payload.point.x), y: Number(payload.point.y) };
    if (!isAuthorizedForAuthor(socket.data.user, payload.author)) {
      socket.emit('rt-error', { message: 'Not authorized to publish in this room' });
      return;
    }

    socket.to(payload.room).emit('blueprint-update', {
      author: payload.author,
      name: payload.name,
      points: [point],
    });

    console.log(
      `[socketio] draw-event user=${socket.data.user} room=${payload.room} author=${payload.author} name=${payload.name} x=${point.x} y=${point.y}`,
    );
  });

  socket.on('ping-check', (clientTs) => {
    socket.emit('pong-check', { clientTs, serverTs: Date.now() });
  });

  socket.on('disconnect', (reason) => {
    console.log(`[socketio] disconnected socketId=${socket.id} reason=${reason}`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Socket.IO up on :${PORT}`));
