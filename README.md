# example-backend-socketio-node - Socket.IO Backend for BluePrints P4

**Objective:** understand, explain, and run a **Node.js + Socket.IO backend** that enables real-time collaboration (blueprint drawing) and integrates with the **React front-end (Blueprints - Part 4)**.

---

## 🧩 What does this backend provide?
- A minimal REST API to deliver the blueprint **initial state**.
- **Real-time** support with **Socket.IO**:
  - Join rooms by **author/blueprint**.
  - Send drawing points and **broadcast** to other clients.
- Direct integration with the **React P4 front-end** (Canvas + CRUD + RT selector).

---

## 🏗️ Architecture (summary)
```
React (Vite) ──(HTTP GET initial state)──> Express
React (Socket.IO) ──(join-room / draw-event)──> Socket.IO Server
                                      └──(blueprint-update broadcast to room)
```

**Conventions**
- **Room:** `blueprints.{author}.{name}`
- **Events client → server:**
  - `join-room` → `room`
  - `draw-event` → `{ room, author, name, point:{x,y} }`
- **Event server → clients:** `blueprint-update` → `{ author, name, points:[{x,y}] }`

---

## 📦 Requirements
- Node.js **v18+** (recommended **v20 LTS**)
- npm or pnpm

---

## 🚀 Getting started
```bash
# 1) Install dependencies
npm i

# 2) Run in development
npm run dev
# It serves HTTP at http://localhost:3001 and Socket.IO on the same host/port.
```

> **Port:** defaults to **3001**. You can define `PORT` as an environment variable.

---

## 🔌 REST endpoints (minimum)
These are used to load the blueprint **initial state** before starting to draw.

- **GET** `/api/blueprints/:author/:name`  
  **200 OK**
  ```json
  {
    "author": "juan",
    "name": "blueprint-1",
    "points": [{ "x":10, "y":10 }, { "x":40, "y":50 }]
  }
  ```

**Test curl**
```bash
curl http://localhost:3001/api/blueprints/juan/blueprint-1
```

> This example focuses on **real-time** behavior. The **full CRUD** (POST/PUT/DELETE/list) is implemented in your course API.

---

## 🔴 Socket.IO events

### 1) Join a room
**Client → Server**
```js
socket.emit('join-room', `blueprints.${author}.${name}`);
```

### 2) Send a point (incremental drawing)
**Client → Server**
```js
socket.emit('draw-event', {
  room: `blueprints.${author}.${name}`,
  author, name,
  point: { x, y }
});
```

**Server → Clients (broadcast to the room)**
**Event:** `blueprint-update`
```json
{
  "author": "juan",
  "name": "blueprint-1",
  "points": [ { "x": 123, "y": 45 } ]
}
```

---

## 🧪 How to test with the React P4 front-end
In the **front-end (Blueprints P4)**:

1. Create `.env.local`:
   ```
  VITE_API_BASE=http://localhost:8080   # if you use STOMP backend for REST
  VITE_IO_BASE=http://localhost:3001    # this Socket.IO backend
   ```
2. Start the front-end:
   ```bash
   npm i
   npm run dev
   ```
3. In the UI, select **Socket.IO** as RT technology, choose `author` and `blueprint`, open **two tabs**, and click on the canvas: you will see the stroke replicated.

---

## ⚙️ Configuration
**Environment variables**
- `PORT` (optional): server port (default `3001`).

**Scripts (package.json)**
```json
{
  "scripts": {
    "dev": "node server.js",
    "lint": "eslint ."
  }
}
```

---

## 🔐 CORS and security
- In development: `cors({ origin: '*' })` to simplify setup.
- In production: **restrict origins**.
  ```js
  const allowed = ['https://your-frontend.com'];
  const io = new Server(server, { cors: { origin: allowed }});
  ```
- Validate payloads (zod/joi) and add authentication/authorization (for example JWT per room).

---

## 🩺 Troubleshooting
- **Blank screen (front-end):** check browser console; verify import paths, `@vitejs/plugin-react` presence, and that `AppP4.jsx` is in `src/`.
- **No broadcast:** make sure both tabs `join-room` to the **same** room and the server uses `socket.to(room).emit(...)`.
- **Blocked CORS:** allow `http://localhost:5173` or your front-end domain.
- **Socket.IO does not connect:** force WebSocket in the client: `{ transports: ['websocket'] }`.

---

## 📚 Suggested extensions
- **Persistence**: store points (memory/Redis/Postgres).
- **Scaling**: Redis adapter for multiple instances.
- **Metrics**: join/leave logs, latency ping-pong.
- **Security**: JWT + room-based authorization.

---

## ✅ Delivery checklist
- [ ] `GET /api/blueprints/:author/:name` returns initial points.  
- [ ] Clients join `room = blueprints.{author}.{name}`.  
- [ ] `draw-event` → broadcast `blueprint-update` to the room.  
- [ ] Front-end reflects strokes in **< 1s** across 2+ tabs.  
- [ ] Lab document explaining **setup** and **integration** with the front-end.

---
