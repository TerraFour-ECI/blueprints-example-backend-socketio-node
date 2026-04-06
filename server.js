import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

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

io.on('connection', (socket) => {
  console.log(`[socketio] connected socketId=${socket.id}`);

  socket.on('join-room', (room) => {
    if (typeof room !== 'string' || !room.startsWith('blueprints.')) {
      socket.emit('rt-error', { message: 'Invalid room format' });
      return;
    }
    socket.join(room);
    console.log(`[socketio] join-room socketId=${socket.id} room=${room}`);
  });

  socket.on('draw-event', (payload) => {
    if (!isValidDrawEvent(payload)) {
      socket.emit('rt-error', { message: 'Invalid draw-event payload' });
      return;
    }

    const point = { x: Number(payload.point.x), y: Number(payload.point.y) };
    socket.to(payload.room).emit('blueprint-update', {
      author: payload.author,
      name: payload.name,
      points: [point],
    });

    console.log(
      `[socketio] draw-event room=${payload.room} author=${payload.author} name=${payload.name} x=${point.x} y=${point.y}`,
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
