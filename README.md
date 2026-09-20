# Mimir

Mimir is an iPad-oriented AI math tutor project: students write on an infinite canvas and the planned tutor guides them through live conversation, annotations, and interactive word-problem visualizations.

**Current state:** paste a screenshot onto the canvas with ⌘V / Ctrl+V or the Paste screenshot button. The app reads it locally, asks “Is this right?”, and lets the student edit and confirm the question. Only confirmed text becomes tutor context. The original image stays on the canvas with Pen/Eraser/Text, undo/redo, and light/dark themes. There are no preset questions or prepared hints.

Screenshot OCR uses Tesseract.js in a browser worker and needs no API key. It is intended for printed English and simple algebra. Fractions, exponents, diagrams, and handwriting can need manual correction. Nothing is uploaded for OCR. Confirmed text is shared with the voice tutor only when a voice session is started. MyScript handwriting conversion and LiveKit/OpenAI voice still require their own provider configuration. Selecting a canvas textbox and choosing Visualize uses OpenRouter Ling 3.0 Flash VL to extract physics inputs, then the backend deterministically calculates and renders the discrete animation. Reload clears the visit.

Visualize is limited to **single-object kinematics**: speeding up, braking to rest, constant speed, and downward free fall. Paste a problem as plain text onto the canvas, select the resulting textbox, then click **Visualize** to see the modal. Every pasted problem, including the [demo examples](docs/DEMO_PROBLEMS.md), uses OpenRouter extraction. The examples guide the model; there is no preset matching or offline fallback. The API identifies the object and known quantities, and the backend validates units and motion before calculating frames. Configure `OPENROUTER_API_KEY` in `backend/.env`; `OPENROUTER_VISUALIZATION_MODEL` selects the model. Each click makes one bounded API call. Multiple-object collisions, direction changes, and unknown launch-speed constraints are unsupported.

## Project references

- [Product requirements](PRODUCT.md): audience, teaching behavior, demo scope, and decisions already made.
- [Design reference](DESIGN.md): current colors, typography, components, and interaction rules.
- [Implementation context](docs/PROJECT_CONTEXT.md): code map, active versus unused modules, data flow, known gaps, and next steps.
- [Agent instructions](AGENTS.md): read-first context and working preferences for future sessions.

The design preview extensions live in [.impeccable/design.json](.impeccable/design.json). Application source remains authoritative for current behavior; keep these references updated as features land.

## Run With Docker

Create `backend/.env` from the documented settings in `backend/.env.example` before starting Compose. An empty local file is sufficient for the canvas and screenshot OCR. MyScript credentials enable recognition; LiveKit credentials enable token minting. Keep real credentials out of Git.

Start both services from the repository root:

```bash
docker compose up --build
```

Both Compose services hot-reload: the backend runs Uvicorn with `--reload`
and mounts `./backend`, and the frontend runs `next dev` (Turbopack) and
mounts `./frontend`, so source edits appear without rebuilding. Rebuild the
image after changing backend dependencies. After changing frontend
dependencies, refresh the container's installed modules:

```bash
docker compose exec frontend npm install
```

or start clean with `docker compose down -v && docker compose up --build`.

The services are available at:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API documentation: http://localhost:8000/docs
- Backend health check: http://localhost:8000/health

Stop the services with:

```bash
docker compose down
```

The frontend Dockerfile still produces the standalone production image as
its default target for deployment; Compose builds its `dev` stage instead.

## Frontend development with hot reload

Docker already provides hot reload as described above. To run the dev server
outside Docker instead, use Node.js 22 to match the Docker image. If Docker
currently occupies port 3000, stop its frontend first:

```bash
docker compose stop frontend
cd frontend
npm ci
npm run dev
```

The backend may keep running in Docker. The frontend uses `/token` for voice, `/visualize` for word-problem visualizations, and `/ws/latex` for the optional Typeset math switch. `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_TOKEN_URL`, and `NEXT_PUBLIC_RECOGNIZER_WS_URL` override their endpoints. Defaults target the current browser hostname on port 8000. `NEXT_PUBLIC_RECOGNITION_PAUSE_MS` controls how long completed strokes are grouped before recognition and defaults to 2000 ms. The backend currently allows HTTP CORS from `localhost:3000`; configure the origin when serving the frontend on another address.

For voice, also install `agent/requirements.txt`, configure `agent/.env` using `agent/.env.example`, and run `python main.py dev` from `agent/`. The Python LiveKit worker is a separate process, not a Compose service. Open the floating Tutor island to start a voice session with or without a pasted question; confirmed screenshot text is added to the tutor context when available. Editing or replacing a question ends the old voice session; closing the panel retains the session.

## OCR assets

`npm run dev` and `npm run build` copy the installed OCR worker, WASM cores, and English data into `frontend/public/ocr/`. These generated files are ignored by Git and ESLint. The browser loads them from the app itself. Docker copies the generated assets into the production image. No CDN request is needed at runtime.

Clipboard reading requires a browser-supported secure context, such as localhost or HTTPS. If the Paste button is blocked, use the browser’s native paste command. Other input methods are not implemented yet.

## Checks

From `frontend/`:

```bash
npm run build
npm run lint
```

Lint and TypeScript checks passed during the frontend revamp; see the dated [verification record](docs/PROJECT_CONTEXT.md#verification) for current results and known graph lint failures. No frontend automated test script is configured. For app changes, also inspect the affected behavior in the browser, and test Pencil/touch/audio changes on the actual iPad.

Backend health:

```bash
curl -fsS http://localhost:8000/health
```

Kinematics regression checks (including 200 generated question/animation pairs):

```bash
docker compose exec -T backend python -m unittest test_kinematics -v
```
