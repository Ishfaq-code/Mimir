# Mimir

Mimir is an iPad-oriented AI math tutor project: students write on an infinite canvas and the planned tutor guides them through live conversation and annotations.

**Current state:** a canvas-first practice workspace with three algebra problems, Pen/Eraser, visible undo/redo, light/dark themes, and a responsive tutor sidebar. Prepared hints, visual explanations, and worked examples run locally. MyScript handwriting conversion and LiveKit/OpenAI voice tutoring are integrated and require provider configuration. Work is retained when switching problems during a visit, but a reload clears it.

## Project references

- [Product requirements](PRODUCT.md): audience, teaching behavior, demo scope, and decisions already made.
- [Design reference](DESIGN.md): current colors, typography, components, and interaction rules.
- [Implementation context](docs/PROJECT_CONTEXT.md): code map, active versus unused modules, data flow, known gaps, and next steps.
- [Agent instructions](AGENTS.md): read-first context and working preferences for future sessions.

The design preview extensions live in [.impeccable/design.json](.impeccable/design.json). Application source remains authoritative for current behavior; keep these references updated as features land.

## Run With Docker

Create `backend/.env` from the documented settings in `backend/.env.example` before starting Compose. An empty local file is sufficient for the canvas and prepared guides. MyScript credentials enable recognition; LiveKit credentials enable token minting. Keep real credentials out of Git.

Start both services from the repository root:

```bash
docker compose up --build
```

The Compose backend runs Uvicorn with `--reload` and mounts `./backend`, so
Python changes are picked up without rebuilding the image. Use `docker compose
up -d --build backend` when changing backend dependencies; restarting alone does not install them.

The services are available at:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API documentation: http://localhost:8000/docs
- Backend health check: http://localhost:8000/health

Stop the services with:

```bash
docker compose down
```

The frontend container runs a production build without a source mount. To show frontend changes in Docker:

```bash
docker compose up -d --build --no-deps frontend
```

Reload a disposable test tab after rebuilding. Preserve any user drawing before reloading its tab.

## Frontend development with hot reload

Use Node.js 22 to match the Docker image. If Docker currently occupies port 3000, stop its frontend first:

```bash
docker compose stop frontend
cd frontend
npm ci
npm run dev
```

The backend may keep running in Docker. The frontend uses `/token` for voice and `/ws/latex` for the optional Typeset math switch. `NEXT_PUBLIC_TOKEN_URL` and `NEXT_PUBLIC_RECOGNIZER_WS_URL` override their endpoints. Defaults target the current browser hostname on port 8000. `NEXT_PUBLIC_RECOGNITION_PAUSE_MS` controls how long completed strokes are grouped before recognition and defaults to 2000 ms. The backend currently allows HTTP CORS from `localhost:3000`; configure the origin when serving the frontend on another address.

For voice, also install `agent/requirements.txt`, configure `agent/.env` using `agent/.env.example`, and run `python main.py dev` from `agent/`. The Python LiveKit worker is a separate process, not a Compose service. The local prepared hints are separate from the live tutor and never claim to analyze handwriting.

## Checks

From `frontend/`:

```bash
npm run build
npm run lint
```

Lint and TypeScript checks passed during the frontend revamp; see the dated [verification record](docs/PROJECT_CONTEXT.md#verification-record). No automated test script is configured. For app changes, also inspect the affected behavior in the browser, and test Pencil/touch/audio changes on the actual iPad.

Backend health:

```bash
curl -fsS http://localhost:8000/health
```
