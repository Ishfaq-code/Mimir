# Mimir

Mimir is an iPad-oriented AI math tutor project: students write on an infinite canvas and the planned tutor guides them through live conversation, annotations, and interactive word-problem visualizations.

**Current state:** paste a screenshot onto the canvas with ⌘V / Ctrl+V or the Paste screenshot button. The app reads it locally and shows the recognized text in a floating chip with tap-to-edit; edits update the tutor's context immediately. The original image stays on the canvas with Pen/Eraser/Text, undo/redo, and light/dark themes. A floating Mimir orb starts and ends the voice tutor; a screen-edge aura shows while it is live. There are no preset questions or canned hints.

Screenshot OCR uses Tesseract.js in a browser worker and needs no API key. It is intended for printed English and simple algebra. Fractions, exponents, diagrams, and handwriting can need manual correction. Nothing is uploaded for OCR. While a tutor session is active, the tutor can request an image of the visible whiteboard (pasted image, text and original pen strokes) through LiveKit and send it to OpenAI for visual understanding. No desktop screen sharing is used. MyScript handwriting conversion and LiveKit/OpenAI voice still require their own provider configuration. Reload clears the visit.

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

For voice, also install `agent/requirements.txt`, configure `agent/.env` using `agent/.env.example`, and run `python main.py dev` from `agent/`. The Python LiveKit worker is a separate process, not a Compose service. Press the Mimir orb to start a voice session with or without a pasted question; the chip's text is added to the tutor context when available and edits update it live. Replacing a screenshot keeps the session alive.

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

## Inline voice and learning support

Learning tools in the header adjusts captions, reading size/spacing, motion and teaching pace. The orb starts a conversation; Use keyboard starts without requesting microphone access. The compact voice dock has Next hint, Read question, another explanation, typed messages, microphone mute and pause/resume.

During an active tutor session, the agent prepares one checked hint after the visible board settles. A cheap revision check lets ordinary hint requests reuse it; edits, focus, viewport changes and pause invalidate preparation. Unchanged images and their region IDs are cached. Preparation uses the Responses API (`TUTOR_REASONING_MODEL`, default `gpt-5.4-mini`; `TUTOR_REASONING_EFFORT`, default `low`). Specific or ambiguous questions still use the full planner, while unambiguous short answers to a grounded numeric subexpression can be checked locally. A bounded AST/Fraction checker verifies basic arithmetic, polynomial identities and linear equation transformations without executing generated code. This reduces errors; it is not a guarantee of mathematical or visual accuracy.

Checked lines use streaming speech synthesis (`TUTOR_TTS_MODEL`, default `gpt-4o-mini-tts`; `TUTOR_VOICE`, default `marin`) instead of asking Realtime to generate another answer. Hint audio and eligible confirmation lines are prepared in advance and kept in a bounded in-memory cache. Realtime still handles live audio input and the initial greeting. No new credentials are needed.

The worker logs the response route, board/preparation wait, model check, annotation, final-transcript delay and speech startup without student content in those measurements. Pen input retains coalesced samples and paints once per animation frame. Handwriting regions are grouped by actual stroke proximity, and highlights recolor selected stroke IDs rather than every stroke inside an overlapping rectangle. See `docs/PROJECT_CONTEXT.md` for measured handwriting checks and device limits.

Use **Focus a problem** to drag around the problem and working area when several questions share the board. The tutor receives a crop of that area. Without focus it sees the current viewport and asks which problem when ambiguous. Temporary emphasis recolors visible ink/text/image symbols purple; source content stays unchanged. After a correct answer it can place one equivalent equation with a blank for handwriting in unoccupied space. Tutor steps have a remove button.

Replies are interruptible and microphone audio stays live while the tutor speaks. A speech-start event lasting 150ms cancels pending math and stops speech without waiting for the final transcript. Server VAD retains its .75 activation threshold, noise reduction and 350ms end-of-turn silence. Very brief speech-detection blips are ignored; sustained background speech can still interrupt. Exact stop/repeat/greeting/thanks controls bypass vision. Automatic Realtime math answers remain disabled. Actual room noise and iPad microphone behavior still require device testing. Background preparation is silent, only runs in an active session, waits for settled ink, and starts at most once per four seconds. It does not automatically speak corrections while the student writes.

Checks: `cd agent && .venv/bin/python -m unittest discover -s tests -v`; `cd frontend && node scripts/test-board-support.mjs`; frontend lint, TypeScript and production build.

## Combined preview branch

`stevin/integrate-main-tutor` combines the latest fetched main (`dce64e8`) with the preserved tutor work (`3c2fe05`). The original working checkout is separate. For the local integration checkout, use `cd frontend && npm run dev -- --port 3001` and `cd backend && .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001`. The local ignored frontend environment targets backend port 8001; backend `CORS_ORIGINS` includes `http://localhost:3001`. The regular Docker commands above still use ports 3000/8000.

Physics generation needs `OPENROUTER_API_KEY` in `backend/.env`; the local preview currently has no OpenRouter key. Voice and MyScript use the existing local provider configuration. See [integration notes](docs/PROJECT_CONTEXT.md#maintutor-integration-2026-09-20) for merge decisions and verification.
