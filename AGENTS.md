# Mimir working context

## Read first

This is the Mimir AI math tutor project. Before changing it, read:

1. [PRODUCT.md](PRODUCT.md): the user's requirements, demo scope, and teaching behavior.
2. [DESIGN.md](DESIGN.md): the current visual system and interaction constraints.
3. [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md): implementation map, data flow, known gaps, and recommended next steps.
4. [README.md](README.md): run commands and verification.

Read `frontend/AGENTS.md` for frontend work. Preserve its generated Next.js instruction block. Read the relevant installed Next.js documentation before changing framework code; this project uses Next.js 16.3.5.

These references were established on 2026-09-19 and refreshed after pulling `37d940f` and implementing the frontend revamp. They are a starting point, not a substitute for checking the current code and `git status`. Update the affected reference when product decisions or implementation change.

## Working preferences

- Begin each conversation with “Alright,”.
- Carry out clear requests directly. Use the existing conversation and these references instead of asking the user to repeat decisions.
- Ask only for essential missing information, unresolved consequential choices, or genuinely required authorization. Respect requests for explanation or planning without editing.
- Keep changes focused, preserve other people's work, and report what changed and how it was checked.
- Pull the latest `main` before starting new implementation work, preserving uncommitted edits and resolving integration conflicts without discarding collaborators’ changes.
- The user's hackathon workflow is direct work on `main`. Do not create a feature branch unless asked. Check for collaborators' changes before pushing; never force-push shared work.
- For requested commits, retain the user's configured Git identity. Do not add an AI coauthor trailer. Do not change global Git settings or invent author identity.

## Product constraints to preserve

- iPad and Apple Pencil are the primary intended input. Students solve by handwriting on an infinite canvas.
- Expose Pen, Eraser, and Text as the student tools. Keep white ink available.
- Finishing a pen stroke must leave Pen active and must not select the stroke or show resize handles.
- The user's previous complaint was the automatic selection box, not the handwriting renderer. Do not replace smoothing or stroke capture without a relevant request or demonstrated problem.
- The tutor should respond to a question or a clearly wrong completed step. It should guide first and demonstrate step by step when needed.
- Teacher reports are a stretch goal. The API budget is approximately $20 for the hackathon; this is a constraint, not permission to purchase services.

## Important implementation facts

- Despite earlier references to “Excalidraw,” the active editor is custom Canvas 2D. No Excalidraw SDK is installed.
- The active page is `frontend/app/page.tsx` → `components/PracticeWorkspace.tsx` → `components/InfiniteCanvas.tsx`.
- `components/Canvas.tsx`, `components/LatexPreview.tsx`, and `lib/recognizer.ts` are disconnected scaffolding. Do not mistake their comments for an active recognition pipeline.
- The student pastes a screenshot. Local Tesseract OCR runs in a worker, then a floating question chip shows the read text with tap-to-edit; edits update tutor context immediately (implicit confirm, decided 2026-09-20 — the old confirm step is gone). Never populate student equations from problem text. LiveKit/OpenAI voice, MyScript conversion, and tutor LaTeX annotations require separate provider configuration plus the Python agent worker. Preserve these integrations when changing UI.
- Drawings, screenshots, and chip text are in memory. Replacing a screenshot preserves ink and reopens the chip for the new image; chip edits and replacement keep the voice session alive because the agent pulls context live via RPC. The Mimir orb (press to talk, press to end) replaces the old Tutor sidebar; a screen-edge aura shows while voice is live. Reloading loses the visit. Preserve user drawings when inspecting the browser; use a separate disposable tab for destructive checks.
- Docker hot-reloads both services: the backend mounts `./backend` with Uvicorn reload, and the frontend mounts `./frontend` running `next dev` (Turbopack) with a named volume for `node_modules`. After frontend dependency changes, run `docker compose exec frontend npm install` (or `docker compose down -v && docker compose up --build`); after backend dependency changes, rebuild the backend image. The frontend Dockerfile still produces the standalone production image as its default target; Compose builds its `dev` stage.
- Keep provider secrets on the server. The existing `NEXT_PUBLIC_RECOGNIZER_WS_URL` is a public endpoint setting, not an API-key slot.

## Design context loading

Run Impeccable's `scripts/load-context.mjs` with the repository root as the working directory. Its loader does not search parent directories from `frontend/`. `PRODUCT.md` and `DESIGN.md` are the canonical references; `.impeccable/design.json` contains preview extensions, not a second source of primitive tokens.

## Verification scope

For documentation changes, validate links and structured context. For app changes, run the checks appropriate to the touched behavior and inspect the relevant UI. The verification results and device limitations are recorded in `docs/PROJECT_CONTEXT.md`; report them accurately rather than claiming a clean baseline. A desktop pointer check does not verify Apple Pencil or iPad Safari behavior.
