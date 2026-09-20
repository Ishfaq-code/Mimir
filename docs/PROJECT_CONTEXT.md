# Mimir project context

Updated **2026-09-20** after the Mimir orb/aura voice revamp and the passive question chip. Read [PRODUCT.md](../PRODUCT.md) for intent and [DESIGN.md](../DESIGN.md) for current UI conventions.

## Current experience

Mimir is an iPad-oriented math workspace. The student pastes a screenshot directly into the whiteboard using the native paste command or Paste screenshot button. The image is placed in world coordinates behind the ink. Browser-based OCR reads the question and a floating chip near the Mimir orb shows the text with tap-to-edit; edits update tutor context live. Pressing the orb starts live voice with or without a pasted question; a screen-edge aura shows while the tutor is live. The old Tutor sidebar and its confirm step were removed on 2026-09-20. Preset questions, prepared guides, and decorative copy have been removed.

Repository: `Ishfaq-code/Mimir`. Local root: `/Users/stevin/Documents/Projects/Mimir`. The thread's default `stevin-port` directory is a separate project. Work on `main`, pull before implementation, preserve collaborators, and never force-push.

## Capability inventory

| Feature | Current behavior |
| --- | --- |
| Screenshot input | Native image paste or Clipboard API button. PNG, JPEG, WebP, GIF; 12 MB / 32 million pixel limits. Input errors preserve the existing question. |
| Screenshot on board | One current reference image behind student ink. Moves with pan/zoom; Show question returns the camera to it. New screenshots replace the reference and preserve ink/history. The reference is not an erasable stroke. |
| Screenshot OCR | Tesseract.js 7, English LSTM data, browser worker, same-origin assets. No credentials, upload, or provider charge for OCR. Maximum OCR dimension 2400 px; 90 second timeout. |
| Review | Passive question chip: read text with tap-to-edit, live tutor-context updates, retry/manual fallback, cancellation and stale-result guards. Normal text paste remains available inside the chip editor. |
| Voice context | `CanvasState.question` holds the chip text, separate from recognized student equations. Chip edits and screenshot replacement keep the voice session alive; the agent pulls context live via RPC. |
| Canvas selection | Select (V/1) supports click/Shift-click, marquee selection, multi-element movement, and corner resizing. Pasted screenshots can also be selected, moved, and resized. |
| Textboxes | Select Text (T), tap to place or edit. Done/Enter saves, Shift+Enter adds a line, Escape/Cancel discards. Uses ink color; undo/redo and eraser apply. Text remains visual canvas content, separate from question confirmation and stroke recognition. |
| Handwriting | Existing custom Canvas 2D engine. Pen stays selected; no stroke selection handles. Eight colors including white, widths 1/2/4, undo/redo. |
| Navigation | Wheel pan, modifier-wheel zoom, Space/middle-button drag, finger pan, zoom controls. |
| MyScript | Optional Typeset math switch recognizes freehand strokes via backend `/ws/latex`. Separate from screenshot OCR. |
| Typeset math | Completed strokes are grouped after a configurable pause (2 seconds by default); normalized KaTeX overlays preserve source bounds/color and are exposed to the tutor context. |
| Live voice | `MimirOrb` (press-to-talk orb, `motion` animations, screen aura) obtains a token, joins LiveKit, publishes microphone audio, plays remote audio, and registers canvas RPCs. |
| Tutor annotations | Configured LiveKit/OpenAI agent can read canvas context and write LaTeX through RPC. |
| Error states | Recognition failures preserve ink and expose retry. Voice failures show a recoverable error. |
| Persistence | In-memory visit only. Reload clears image, reviewed question, and ink. |
| Absent | Accounts, teacher reports, durable storage, other import methods, generated visualizations, precise highlighting, animated demonstrations, reliable proactive error detection. |

## Ownership and data flow

```mermaid
flowchart td
  Workspace[PracticeWorkspace: paste UI, orb, chip] --> Import[useScreenshotQuestion: import / OCR / chip text]
  Import --> OCR[screenshot.ts: local Tesseract worker]
  Import --> Store[tutor/store: chip text]
  Workspace --> Canvas[InfiniteCanvas: ink / camera / screenshot placement]
  Canvas --> Renderer[canvas/renderer: reference image then ink]
  Canvas --> MyScript[FastAPI /ws/latex]
  MyScript --> Store
  Workspace --> Orb[MimirOrb: LiveKit microphone and audio]
  Orb --> Agent[Python worker + OpenAI Realtime]
  Agent --> RPC[get_canvas_state / write_latex]
  RPC --> Store
  Store --> Overlay[TutorOverlay: world-positioned LaTeX]
```

| File | Responsibility |
| --- | --- |
| `frontend/components/PracticeWorkspace.tsx` | Native paste listener, Clipboard API button, theme, Mimir orb and question chip hosting. |
| `frontend/lib/useScreenshotQuestion.ts` | Screenshot lifecycle, asynchronous import versions, abortable OCR, chip text with live tutor-context updates. |
| `frontend/lib/screenshot.ts` | File validation/decode, Tesseract lazy import, OCR progress/timeout/cancellation, worker cleanup. |
| `frontend/scripts/prepare-ocr.mjs` | Copies installed worker, core variants, language data, and licenses to ignored `public/ocr/` before dev/build. Resolves under npm and pnpm layouts. |
| `frontend/components/InfiniteCanvas.tsx` | Existing stroke capture/history/recognition, camera, reference image placement, canvas tools. |
| `frontend/lib/canvas/renderer.ts` | World-space image followed by ink painting. Existing smoothing is unchanged. |
| `frontend/components/IslandToolbar.tsx` | Pen/Eraser/Text, colors/width, undo/redo. |
| `frontend/components/CanvasTextEditor.tsx` | Positioned textbox editor, multiline input, outside-click save, cancellation and focus handling. |
| `frontend/components/MimirOrb.tsx` | Press-to-talk orb, LiveKit token/room/microphone/audio and RPC lifecycle, state-reactive screen aura, reduced-motion support. |
| `frontend/components/QuestionChip.tsx` | Floating pasted-question chip: reading status, text preview, live-edit popover, retry/dismiss. |
| `frontend/lib/tutor/store.ts`, `types.ts` | Separate chip question, recognized equations, tutor annotations, revisions/subscriptions. |
| `frontend/components/TutorOverlay.tsx` | KaTeX annotations aligned with camera. |
| `frontend/app/globals.css` | Warm neutral / green tokens, dark theme, controls, orb/aura/chip styles, responsive and reduced-motion rules. |
| `backend/main.py` | Health, token minting with unique room names, MyScript WebSocket recognition and CORS. |
| `agent/prompts.py` | Tutor reads the chip question as problem data, distinct from student work and role instructions. |

`components/Canvas.tsx`, `LatexPreview.tsx`, and `lib/recognizer.ts` are disconnected scaffolding. There is no Excalidraw SDK. `ChatPanel.tsx` and `lib/problems.ts` were removed with the preset flow. `spec.md` includes planned agent tools that do not all exist yet.

## Contracts and limitations

Student work remains `CanvasElement[]`, with relative freehand points and timestamps. World-to-screen coordinates are `(point - camera position) * zoom`; DPR affects backing bitmap only. The reference image is a separate read-only layer, so erasing/undo touches ink rather than accidentally deleting the question. A new paste anchors the reference in the current viewport. A screenshot is never sent to MyScript, which requires stroke geometry.

OCR targets clear printed English and basic algebra. It produces text, not structural math or diagram understanding. Fractions, powers, handwriting, and diagrams can need corrections. Every OCR result surfaces in the chip for correction, regardless of confidence. Only the chip text reaches the voice RPC context; OCR itself sends no image off-device. Voice and MyScript remain external services when explicitly activated.

`setConfirmedQuestion(null)` clears previous question, recognized work, and annotations. New handwriting recognition remains independent and can later repopulate student equations. The image/text/ink have no durable storage. Opening a fresh question keeps existing ink intentionally; it does not silently erase the student's page.

The handwritten expression recognizer still treats the entire freehand scene as one expression. Success temporarily replaces visible ink with KaTeX; new strokes or disabling conversion restore ink. Exact region matching and proactive tutoring remain future work.

## Runtime

See [README.md](../README.md). Next.js 16.3.5 / React 19 / TypeScript, Tesseract.js 7, KaTeX, LiveKit client, and the `motion` animation library. FastAPI backend and separate Python LiveKit agent. Docker uses Node 22 / Python 3.12. Frontend dev is on port 3000, backend on 8000. Both Compose services hot-reload from source mounts: the backend with Uvicorn `--reload`, the frontend with `next dev` (Turbopack) plus a named `node_modules` volume. After dependency changes, run `docker compose exec frontend npm install` or `docker compose down -v && docker compose up --build`; the production image remains the Dockerfile's default target.

- Recognition is opt-in. `/ws/latex` round-trips request and stroke IDs with structured strokes so each response maps back to its source ink.
- The current pipeline groups unrecognized strokes completed within the configured pause into one expression. It can retain multiple recognized overlays, but does not semantically segment lines, regions, or individual symbols.
- Successful recognition hides only its source ink and overlays normalized KaTeX without deleting geometry. Disabling conversion restores all original ink.
- Only chip text enters `CanvasState.question`; recognized student equations remain separate context. The store starts without fabricated student ink.
- Replacing a question clears stale recognized context and tutor annotations and reopens the chip for the new screenshot, but no longer ends the voice session — the agent pulls context live via RPC, and `MimirOrb` never unmounts.
- The agent currently has `get_canvas_state` and `write_latex`; other tools mentioned in its broader prompt/spec are not implemented yet.

Screenshot OCR works without provider keys. Its lazy-loaded assets come from `/ocr/` on this app, generated before build/dev and excluded from Git, lint, and Docker input context. Docker's builder regenerates them and its runner serves them from public.

`backend/.env` is an ignored comment-only local file, sufficient to start Compose. Configure MyScript/LiveKit there and OpenAI/LiveKit in `agent/.env`; the agent runs separately. No provider credentials were supplied during these changes. Defaults use the browser hostname on backend port 8000. Backend CORS currently allows only `http://localhost:3000`; configure origins deliberately for a tunnel/deployment. iPad Clipboard API and microphone access need a secure supported origin; localhost on desktop does not verify iPad HTTPS readiness.

## Verification

Frontend overrides: `NEXT_PUBLIC_TOKEN_URL`, `NEXT_PUBLIC_RECOGNIZER_WS_URL`, and `NEXT_PUBLIC_RECOGNITION_PAUSE_MS`. Network defaults use the browser hostname and backend port 8000; the recognition pause defaults to 2000 ms. Production/tunnel URLs and CORS need deliberate configuration. The current backend CORS list is only `http://localhost:3000`. iPad microphone access requires an appropriate secure browser origin; desktop localhost does not establish iPad HTTPS readiness.

The frontend revamp covered pen/eraser, history, colors, themes, recognition/voice failure states, responsive layouts, screenshot OCR review, and the Text tool. Browser checks exercised a clipboard PNG (`Solve for x. 2(x + 3) = 14`), correction/confirmation, empty submission blocking, cancellation, repeat paste, blank-image fallback, ink preservation, and multiline text editing. A store contract check verified only confirmed text becomes question context and clearing it removes stale work/annotations.

ESLint, TypeScript, and the Docker production build passed. Production OCR was also verified through the Paste screenshot button against real PNG clipboard data, with no browser runtime errors. Screenshot import passed desktop browser checks. The browser viewport override did not change the measured viewport during this run, so mobile layout and physical iPad clipboard/Pencil behavior still need a device check. Do not claim a hardware pass. No real LiveKit/OpenAI/MyScript provider roundtrip was completed.

The Text tool was checked by creating multiline text, reopening it, saving corrections, canceling, undoing/redoing edits, clicking outside to create another box, switching to Pen, and erasing a textbox. Lint, TypeScript, and the production build passed. Physical iPad keyboard behavior remains unverified.

**2026-09-20 orb/chip revamp:** `MimirOrb` (press-to-talk orb, state-reactive aura, `motion` animations), `QuestionChip`, the sidebar removal, and the implicit-confirm chip model passed ESLint and the Docker production build (type check included). `motion` was installed into the dev container's `node_modules` volume, and the running dev server serves the new markup. The pasted-question chip, orb connect/disconnect, mic-permission failure, both themes, reduced-motion, and iPad Safari/Pencil behavior were **not** exercised in this session — a desktop HTTP check only confirms the page compiles and serves. No LiveKit/OpenAI provider roundtrip was run during this change.

**2026-09-20 Siri-reference orb refinement:** Replaced the solid green sphere with CSS cyan/violet/pink light ribbons, a bright center, and a glass rim. Existing voice lifecycle and outer state animations are preserved; interior motion follows voice state and stops for reduced motion. ESLint and TypeScript passed. Disposable Chromium checks covered desktop light/dark themes, a 390 px viewport (52 px orb), and reduced motion, with no page runtime errors. Physical iPad/Safari and live provider audio remain unverified. Impeccable’s context loader was not installed in this environment; canonical design references were read directly.

**2026-09-20 aura palette:** Screen-edge glow now matches the orb: cyan left, pink right, violet top/bottom, with a pale violet rim. Existing state-driven opacity and reduced-motion behavior remain unchanged. Inspected the simulated speaking aura in disposable Chromium pages in both themes; no runtime errors, and the aura remains pointer-transparent. This visual check did not connect to a voice provider.

## Next work

Validate native screenshot paste and the chip on the actual iPad; configure and exercise live tutoring through the orb. Consider math-specialized OCR for notation beyond simple printed algebra. Later inputs should feed the existing import/chip boundary. Preserve cancellation, live context updates, and normal text editing. Add region-based handwriting context, precise annotations, generated visualizations, and persistence after the core demo works.
