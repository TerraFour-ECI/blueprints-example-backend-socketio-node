# Socket.IO Backend for BluePrints Real-Time Collaboration

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.19-000000?style=for-the-badge&logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![ESLint](https://img.shields.io/badge/Lint-ESLint-4B32C3?style=for-the-badge&logo=eslint&logoColor=white)

Reference real-time backend used by the P4 front-end to support multi-user collaborative drawing.

</div>

---

## What this backend provides

- Minimal REST endpoint for initial blueprint loading.
- Socket.IO room-based collaboration per blueprint.
- Broadcast strategy for incremental drawing (`point` events).

---

## Architecture

```mermaid
flowchart LR
  FE[React Front-end] -->|GET /api/blueprints/:author/:name| API[Express REST]
  FE -->|join-room| IO[Socket.IO Server]
  FE -->|draw-event| IO
  IO -->|blueprint-update| FE
```

### Event lifecycle

```mermaid
stateDiagram-v2
  [*] --> Connected
  Connected --> JoinedRoom: join-room
  JoinedRoom --> Drawing: draw-event
  Drawing --> Broadcasting: socket.to(room).emit(blueprint-update)
  Broadcasting --> JoinedRoom
  JoinedRoom --> Disconnected: disconnect
  Disconnected --> [*]
```

---

## Event contracts

- `join-room`
  - Payload: `blueprints.{author}.{name}`
- `draw-event`
  - Payload:

```json
{
  "room": "blueprints.juan.blueprint-1",
  "author": "juan",
  "name": "blueprint-1",
  "point": { "x": 130, "y": 84 }
}
```

- `blueprint-update`
  - Payload:

```json
{
  "author": "juan",
  "name": "blueprint-1",
  "points": [{ "x": 130, "y": 84 }]
}
```

---

## Run locally

```bash
npm install
npm run dev
```

Server default: `http://localhost:3001`

Test initial state endpoint:

```bash
curl http://localhost:3001/api/blueprints/juan/blueprint-1
```

---

## Quality commands

```bash
npm run lint
```

---

## Screenshot evidence suggestions

Use these captures in your README/report:

1. `socketio-01-server-running.png`
   - Terminal showing `Socket.IO up on :3001`.
2. `socketio-02-room-join-and-broadcast.png`
   - Browser devtools logs with room join + broadcast update.
3. `socketio-03-two-tabs-sync.png`
   - Two tabs drawing same blueprint with replicated points.
4. `socketio-04-sonar-ci-pass.png`
   - GitHub Actions/SonarCloud successful pipeline.

---

## Integration with P4 front-end

Set in front-end `.env.local`:

```bash
VITE_IO_BASE=http://localhost:3001
```

Then in the UI select `Socket.IO (Node)` transport.

---

## License

MIT [LICENSE](LICENSE)
