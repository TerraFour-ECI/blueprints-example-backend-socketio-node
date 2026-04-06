# ⚡ Socket.IO Backend - Final Evidence README

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.19-111827?style=for-the-badge&logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-0f172a?style=for-the-badge&logo=socket.io&logoColor=white)
![Realtime](https://img.shields.io/badge/Realtime-Room_Broadcast-f97316?style=for-the-badge)

Realtime room-based backend used by the central P4 frontend.

</div>

---

## 🎯 Purpose

This backend is responsible for Socket.IO collaborative behavior:

- join blueprint-specific rooms
- receive draw events
- broadcast updates to room peers

---

## 🧩 Core contracts

- `join-room` → `blueprints.{author}.{name}`
- `draw-event` → `{ room, author, name, point }`
- `blueprint-update` → `{ author, name, points: [...] }`
- REST bootstrap endpoint: `GET /api/blueprints/:author/:name`

---

## 🏗️ Architecture

```mermaid
flowchart LR
  FE["Realtime Frontend :5174"] -->|"GET initial blueprint"| API["Express REST"]
  FE -->|"join-room / draw-event"| IO["Socket.IO Server"]
  IO -->|"blueprint-update"| FE
```

---

## ▶️ Run

```bash
npm install
npm run dev
```

Service URL: `http://localhost:3001`

Quick check:

```bash
curl http://localhost:3001/api/blueprints/juan/blueprint-1
```

---

## 📸 Evidence gallery

### 01 - Server started
Backend runtime confirmed on expected port.

![socketio-01-server-start](images/socketio-01-server-start.png)

### 02 - Room join log
Client enters expected collaboration room.

![socketio-02-room-join-log](images/socketio-02-room-join-log.png)

### 03 - Draw-event payload
Outgoing realtime event from frontend to Socket.IO server.

![socketio-03-draw-event-log](images/socketio-03-draw-event-log.png)

### 04 - Broadcast update payload
Server emits update to all peers in the same room.

![socketio-04-broadcast-update-log](images/socketio-04-broadcast-update-log.png)

### 05 - Two-tab replication
Visual proof of synchronized drawing between tabs.

![socketio-05-two-tabs-replication](images/socketio-05-two-tabs-replication.png)

### 06 - CI/quality evidence
Lint and Sonar pipeline passing.

![socketio-06-sonar-and-lint-pass](images/socketio-06-sonar-and-lint-pass.png)

---

## 🔗 Integration note

Set this in realtime frontend `.env.local`:

```bash
VITE_IO_BASE=http://localhost:3001
```

---

## 📄 License

MIT [LICENSE](LICENSE)
