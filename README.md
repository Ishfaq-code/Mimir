# Mimir

Mimir is an iPad-oriented AI math tutor project: students write on an infinite canvas and the planned tutor guides them through live conversation, annotations, and interactive word-problem visualizations.

**Current state:** paste a screenshot onto the canvas with ⌘V / Ctrl+V. Right-click the board for copy, paste, cut, and delete. The app reads it locally and shows the recognized text in a floating chip with tap-to-edit; edits update the tutor's context immediately. The original image stays on the canvas with Pen/Eraser/Text, undo/redo, and light/dark themes. A floating Mimir orb starts and ends the voice tutor; a screen-edge aura shows while it is live. There are no preset questions or canned hints.

Screenshot OCR uses Tesseract.js in a browser worker and needs no API key. It is intended for printed English and simple algebra. Fractions, exponents, diagrams, and handwriting can need manual correction. Nothing is uploaded for OCR. While a tutor session is active, canvas snapshots (pasted image, text and original pen strokes) travel through LiveKit to the configured voice/vision provider: Gemini by default, or the optional OpenAI path. No desktop screen sharing is used. MyScript handwriting conversion and live voice require their own provider configuration. Reload clears the visit.

Visualize is limited to **single-object kinematics**: speeding up, braking to rest, constant speed, and downward free fall. Paste a problem as plain text onto the canvas or into a textbox, then click **Visualize** on the box. The [demo examples](docs/DEMO_PROBLEMS.md) return cached frames without an API call. Other problems use OpenRouter extraction; a matching problem is reused from a small in-memory cache instead of regenerating. The API identifies the object and known quantities, and the backend validates units and motion before calculating frames. Configure `OPENROUTER_API_KEY` in `backend/.env`; `OPENROUTER_VISUALIZATION_MODEL` selects the model. Multiple-object collisions, direction changes, and unknown launch-speed constraints are unsupported.

## Project references

- [Product requirements](PRODUCT.md): audience, teaching behavior, demo scope, and decisions already made.
- [Design reference](DESIGN.md): current colors, typography, components, and interaction rules.
- [Implementation context](docs/PROJECT_CONTEXT.md): code map, active versus unused modules, data flow, known gaps, and next steps.
- [Agent instructions](AGENTS.md): read-first context and working preferences for future sessions.

The design preview extensions live in [.impeccable/design.json](.impeccable/design.json). Application source remains authoritative for current behavior; keep these references updated as features land.

## Run With Docker

With Docker running, set up a fresh checkout from the repository root:

1. Create the two local configuration files (keep existing files if already configured):

   ```bash
   cp backend/.env.example backend/.env
   cp agent/.env.example agent/.env
   ```

2. In **both files**, fill in `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` for the same LiveKit project. Set the **same `LIVEKIT_AGENT_NAME` in both files**, unique to your developer setup, for example `mimir-alex`. Teammates sharing a LiveKit project must use different names so their tutors receive the correct rooms. In `agent/.env`, also set `GOOGLE_API_KEY` for the default Gemini tutor. MyScript and OpenRouter keys in `backend/.env` are optional for handwriting conversion and custom physics visualizations. Both real `.env` files are ignored by Git; never commit credentials.

3. Start frontend, backend, and the tutor worker together:

   ```bash
   docker compose up --build
   ```

Open http://localhost:3000 and press the Mimir orb. The `agent` service connects outward to LiveKit Cloud and needs no published port or separate Python installation. Stop any manually started worker using the same agent name before switching to Compose. To use only the canvas and screenshot OCR without voice credentials, run `docker compose up --build frontend backend` instead (the two local env files must still exist).

All three Compose services hot-reload: the backend runs Uvicorn with `--reload`
and mounts `./backend`, the frontend runs `next dev` (Turbopack) and
mounts `./frontend`, and the agent runs `python main.py dev` with `./agent`
mounted. Rebuild after changing Python dependencies with
`docker compose up --build`. After changing frontend
dependencies, refresh the container's installed modules:

```bash
docker compose exec frontend npm install
```

or start clean with `docker compose down -v && docker compose up --build`.

After changing either local env file, recreate the Python services so Compose
loads the updated values:

```bash
docker compose up -d --force-recreate backend agent
```

If voice does not connect, check `docker compose logs --tail=100 agent backend`
and verify the matching agent names and credentials. `docker compose config --quiet`
validates the Compose setup without printing resolved credentials.

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

For voice, leave the Compose `agent` service running. To run the worker outside Docker instead, first use `docker compose stop agent`, then install `agent/requirements.txt` in a Python 3.12 virtual environment, configure `agent/.env` using `agent/.env.example`, and run `python main.py dev` from `agent/`. Press the Mimir orb to start a voice session with or without a pasted question; the chip's text is added to the tutor context when available and edits update it live. Replacing a screenshot keeps the session alive.

The backend and worker must use the same `LIVEKIT_AGENT_NAME` (default `mimir-tutor`). Each voice token explicitly requests that worker. When teammates share a LiveKit project, use a different name for each developer's backend/worker pair so requests reach the intended checkout. Recreate both Compose services after changing this setting (or restart both processes when running outside Docker); restarting only Next.js does not restart the Python worker. One agent process stays warm between connections. Startup waits for the tutor to be ready, retries once in a fresh room after failure, and can be cancelled by pressing the orb again.

You can ask Mimir to check while still writing. The request waits until the pen has been up for one second; more writing resets that pause. Changes during checking trigger a fresh snapshot automatically. Stop, Pause, a new question, or ending the conversation cancels the pending check. Tutor steps animate as handwritten SVG strokes below the working column, avoiding existing content. Calm motion skips the drawing animation. Pen inactivity is a timing signal, not proof that a solution is complete.

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

## Gemini Live tutoring (default)

Mimir uses one standard **Gemini 3.8 Live** session for listening, canvas vision, tutoring and speech. It does not call a separate OpenAI planner or text-to-speech service. Use the existing LiveKit transport and configure the ignored `agent/.env`:

```dotenv
TUTOR_PROVIDER=gemini
GOOGLE_API_KEY=your-local-key
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_VOICE=Puck
```

Compose installs `agent/requirements.txt` when building the agent image. Keep the existing LiveKit credentials and matching `LIVEKIT_AGENT_NAME`, recreate the `agent` service after configuration changes, and start a fresh orb conversation. For a manual worker, install the requirements and restart its process instead. Google credentials stay on the server. Standard Gemini Live does not accept a thinking configuration; Extended Thinking is a different integration and is not selected here.

Changed, settled canvas frames reach the session silently, at most once per second. The existing one-second pen-up gate prevents partial strokes from being reviewed. An unchanged frame is reused, and a new frame's state and image are fetched concurrently and checked against the same board revision. The confirmed question and last interpreted problem remain available when panning below the question.

Gemini can call `review_step` directly from the current frame. It does not need a separate model-requested inspection first. The tool waits for settled ink, validates arithmetic/algebra locally, and applies a teaching plan atomically against the current snapshot. A cached review uses one freshness RPC and the annotation RPC. New writing rejects stale plans. The model must reread changed work before approving it. These checks reduce errors but cannot guarantee correct handwriting interpretation or every spoken claim.

Explicit typed board requests wait before generation. Voice requests acknowledged without an inspection receive one queued completion after the native response and pen settling. New input, Pause and disconnect cancel pending checks. Native interruptions use LiveKit's cancellable tools and speech handles; synthetic speech-start events for tool continuations are not treated as new student input. Physical microphone/noise and iPad testing remain necessary.

## Inline voice and learning support

Learning tools in the header adjusts captions, reading size/spacing, motion and teaching pace. The orb starts a conversation; Use keyboard starts without requesting microphone access. The compact voice dock has Next hint, Read question, another explanation, typed messages, microphone mute and pause/resume.

Use **Focus a problem** to drag around the problem and working area when several questions share the board. The tutor receives a crop of that area. Without focus it sees the current viewport and asks which problem when ambiguous. Temporary emphasis recolors selected ink/text/image symbols; source content stays unchanged. After a correct answer it can place one equivalent equation with an animated handwritten blank below existing work. Tutor steps have a remove button. Calm motion skips animation. Drawing failures preserve checked spoken feedback and never imply that vision failed.

The worker logs image updates, inspection time and checked-tool duration without student content in those measurements. Pen input retains coalesced samples and paints once per animation frame. Handwriting regions are grouped by actual stroke proximity; highlights use source stroke IDs rather than guessed rectangles.

Checks: `cd agent && .venv/bin/python -m unittest discover -s tests -v`; `cd backend && .venv/bin/python -m unittest test_voice_token test_kinematics -v`; `cd frontend && node scripts/test-board-support.mjs && node scripts/test-voice-startup.mjs`; frontend lint, TypeScript and production build.

## Optional legacy OpenAI tutoring

`TUTOR_PROVIDER=openai` selects the earlier checked planner/TTS path and requires `OPENAI_API_KEY`. It uses Realtime for input, `TUTOR_REASONING_MODEL` (default `gpt-5.4-mini`, low effort) for visual planning, and `TUTOR_TTS_MODEL` (default `gpt-4o-mini-tts`) for checked speech. It prepares hints on settled revisions, at most once per four seconds, and caches eligible speech. The mode remains available for existing setups; none of these OpenAI calls are made by the default Gemini tutor. Both modes share the bounded AST/Fraction math checker and the same canvas tools.

## Combined preview branch

`stevin/integrate-main-tutor` combines the latest fetched main (`dce64e8`) with the preserved tutor work (`3c2fe05`). The original working checkout is separate. For the local integration checkout, use `cd frontend && npm run dev -- --port 3001` and `cd backend && .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8001`. The local ignored frontend environment targets backend port 8001; backend `CORS_ORIGINS` includes `http://localhost:3001`. The regular Docker commands above still use ports 3000/8000.

Physics generation needs `OPENROUTER_API_KEY` in `backend/.env`; it is configured only in the local integration preview’s ignored environment file. Voice and MyScript use the existing local provider configuration. See [integration notes](docs/PROJECT_CONTEXT.md#maintutor-integration-2026-09-20) for merge decisions and verification.
