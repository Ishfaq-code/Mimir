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
| Textboxes | Select Text (T), tap to place or edit. Done/Enter saves, Shift+Enter adds a line, Escape/Cancel discards. Uses ink color; undo/redo and eraser apply. Text remains visual canvas content, separate from question confirmation and stroke recognition. Selecting a textbox and choosing Visualize immediately requests a Physics word-problem visualization. |
| Handwriting | Existing custom Canvas 2D engine. Pen stays selected; no stroke selection handles. Eight colors including white, widths 1/2/4, undo/redo. |
| Navigation | Wheel pan, modifier-wheel zoom, Space/middle-button drag, finger pan, zoom controls. |
| MyScript | Optional Typeset math switch recognizes freehand strokes via backend `/ws/latex`. Separate from screenshot OCR. |
| Typeset math | Completed strokes are grouped after a configurable pause (2 seconds by default); normalized KaTeX overlays preserve source bounds/color and are exposed to the tutor context. |
| Live voice | `MimirOrb` (press-to-talk orb, `motion` animations, screen aura) obtains a token, joins LiveKit, publishes microphone audio, plays remote audio, and registers canvas RPCs. |
| Tutor annotations | Checked visual plans can recolor exact source strokes and place a single equivalent scaffold with a handwriting blank; revision gates reject stale plans. |
| Error states | Recognition failures preserve ink and expose retry. Voice failures show a recoverable error. |
| Persistence | In-memory visit only. Reload clears image, reviewed question, and ink. |
| Visualization | Selected textbox or question-chip text is sent with `kinematics` topic to `POST /visualize` (legacy `physics` still accepted). OpenRouter extracts inputs for a single object moving in one direction with constant acceleration. Visualize requires a selected textbox or selected screenshot with OCR text; no selection shows paste/select guidance. Plain-text native paste creates a wrapped, undoable textbox. Every submitted problem calls OpenRouter, including demo paragraphs. `backend/kinematics_prompt.py` supplies interpretation rules and examples; extracted object labels and quantities drive validated rendering. `GET /visualize/question?kind=speed_up\|braking\|constant_speed\|free_fall` returns question text and nine matching frames without a provider call. Timeline and variable controls render the result. |
| Absent | Accounts, teacher reports, durable storage, other import methods, generated visualizations beyond the Physics keyframe flow, animated demonstrations, reliable proactive error detection. |

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
| `frontend/components/InfiniteCanvas.tsx` | Existing stroke capture/history/recognition, camera, reference image placement, canvas tools, and selected-text visualization requests. |
| `frontend/components/VisualizationResult.tsx` | Safe SVG renderer for validated visualization keyframes, timeline slider, and Previous/Next controls. |
| `frontend/lib/canvas/renderer.ts` | World-space image followed by ink painting. Existing smoothing is unchanged. |
| `frontend/components/IslandToolbar.tsx` | Pen/Eraser/Text, colors/width, undo/redo. |
| `frontend/components/CanvasTextEditor.tsx` | Positioned textbox editor, multiline input, outside-click save, cancellation and focus handling. |
| `frontend/components/MimirOrb.tsx` | Press-to-talk orb, LiveKit token/room/microphone/audio and RPC lifecycle, state-reactive screen aura, reduced-motion support. |
| `frontend/components/QuestionChip.tsx` | Floating pasted-question chip: reading status, text preview, live-edit popover, retry/dismiss. |
| `frontend/lib/tutor/store.ts`, `types.ts` | Separate chip question, recognized equations, tutor annotations, revisions/subscriptions. |
| `frontend/components/TutorOverlay.tsx` | KaTeX annotations aligned with camera. |
| `frontend/app/globals.css` | Warm neutral / green tokens, dark theme, controls, orb/aura/chip styles, responsive and reduced-motion rules. |
| `backend/main.py` | Health, token minting with unique room names, MyScript WebSocket recognition, OpenRouter visualization generation and CORS. |
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
- The agent supports board status/capture, atomic teaching-plan application, highlights and LaTeX annotations through student-scoped RPC. See the later checked-teaching and prepared-hint sections for the current turn flow.

Screenshot OCR works without provider keys. Its lazy-loaded assets come from `/ocr/` on this app, generated before build/dev and excluded from Git, lint, and Docker input context. Docker's builder regenerates them and its runner serves them from public.

`backend/.env` is ignored. Configure MyScript, LiveKit, and the OpenRouter visualization key there; configure OpenAI/LiveKit separately in `agent/.env` for voice. The agent runs separately. Defaults use the browser hostname on backend port 8000. Backend CORS defaults to `http://localhost:3000`; set comma-separated `CORS_ORIGINS` for another preview or deployment. iPad Clipboard API and microphone access need a secure supported origin; localhost on desktop does not verify iPad HTTPS readiness.

## Verification

Frontend overrides: `NEXT_PUBLIC_TOKEN_URL`, `NEXT_PUBLIC_RECOGNIZER_WS_URL`, and `NEXT_PUBLIC_RECOGNITION_PAUSE_MS`. Network defaults use the browser hostname and backend port 8000; the recognition pause defaults to 2000 ms. Production/tunnel URLs and CORS need deliberate configuration. The current backend CORS list is only `http://localhost:3000`. iPad microphone access requires an appropriate secure browser origin; desktop localhost does not establish iPad HTTPS readiness.

The frontend revamp covered pen/eraser, history, colors, themes, recognition/voice failure states, responsive layouts, screenshot OCR review, and the Text tool. Browser checks exercised a clipboard PNG (`Solve for x. 2(x + 3) = 14`), correction/confirmation, empty submission blocking, cancellation, repeat paste, blank-image fallback, ink preservation, and multiline text editing. A store contract check verified only confirmed text becomes question context and clearing it removes stale work/annotations.

ESLint, TypeScript, and the Docker production build passed. Production OCR was also verified through the Paste screenshot button against real PNG clipboard data, with no browser runtime errors. Screenshot import passed desktop browser checks. The browser viewport override did not change the measured viewport during this run, so mobile layout and physical iPad clipboard/Pencil behavior still need a device check. Do not claim a hardware pass. No real LiveKit/OpenAI/MyScript/OpenRouter provider roundtrip was completed.

The Text tool was checked by creating multiline text, reopening it, saving corrections, canceling, undoing/redoing edits, clicking outside to create another box, switching to Pen, and erasing a textbox. Lint, TypeScript, and the production build passed. Physical iPad keyboard behavior remains unverified.

### Kinematics implementation, 2026-09-20

Generated practice uses randomized numeric templates and the same deterministic solver as custom problems. Questions cover speeding up, braking to rest, constant speed, and downward free fall with explicit gravity. Text and frames are returned together, so generation does not depend on extraction accuracy. The solver now handles initial/final speed plus duration and constant speed plus distance, rejects inconsistent or unreachable states, and rejects direction reversal. Horizontal motion has correctly directed velocity/acceleration arrows; downward free fall uses a ball. Multiple moving bodies, collision/optimization constraints, and unknown initial speed remain unsupported, with a scope-specific recovery message and generated questions available in the dialog. Generated practice stays separate from voice/screenshot context.

The existing `visualize-tool` checkout was merged with `origin/main` to retain the collaborator's graph tool. Merge verification passed TypeScript; full ESLint reports four pre-existing errors in the incoming `GraphOverlay.tsx` (state updates in effects and ref writes during render).

Verification: seven backend regression tests passed, including 200 seeded question/animation pairs, the initial/final-speed solver regression, invalid motion rejection, the original two-ball rejection, and all generated endpoints with provider configuration disabled. TypeScript, ESLint on changed frontend components, and an isolated Docker production build passed. Disposable Chromium exercised all four question types through their final frames, mobile width 390 px, light/dark themes, focus restoration, and request cancellation, with no page runtime errors. Physical iPad/Pencil behavior was not tested. Generated practice made no provider calls; the revised custom-extraction prompt was not revalidated with a live model during this implementation.

## Next work

Validate native screenshot paste and review on the actual iPad; configure and exercise live tutoring. Consider math-specialized OCR for notation beyond simple printed algebra. Later inputs should feed the existing import/review/confirm boundary. Preserve cancellation, confirmation gating, and normal text editing. Add region-based handwriting context, precise annotations, generated visualizations, and persistence after the core demo works.

### Paste-to-visualize update, 2026-09-20

The current UI supersedes the generated-question selector described above. Paste plain text, select its textbox, and click Visualize. The modal never silently substitutes generated practice. Four copyable demo questions use whitespace-normalized exact matching before provider extraction; edits to their content use normal extraction. Screenshot confirmation and voice context remain separate.

Verification for this update: TypeScript and targeted frontend ESLint passed; all eight backend regression tests passed. Disposable Chromium exercised all four pasted demo paragraphs through selection and modal rendering, empty-selection guidance, Escape, and a 390 px dark layout with no runtime errors. Physical iPad/Pencil and live custom-provider extraction were not tested. The existing graph lint failures remain outside this change.

### API-driven interpretation, 2026-09-20

This supersedes the exact demo matching above: `POST /visualize` always calls the configured OpenRouter model. `backend/kinematics_prompt.py` separates system rules, example exchanges, and the incoming problem. The model supplies the object label and known quantities, or an actionable unsupported reason. The backend converts units, rejects inconsistent/unsupported motion, and calculates nine frames. No model-generated code or SVG is executed. Requests use one call, a 45-second timeout, and an 800-token output cap. The existing `GET /visualize/question` remains a legacy randomized practice endpoint, unused by the current UI; it is not a fallback for pasted problems. Provider configuration is required even for demo paragraphs.

Verification: all ten backend tests passed, including HTTP-boundary extraction, mandatory provider use for demo text, malformed provider responses, unsupported reasons, and existing physics regressions. Live OpenRouter returned correct final values for a train using km/h and minutes and four novel browser problems (scooter acceleration, cyclist braking, constant-speed train, falling stone). Disposable Chromium verified paste/select/modal, empty-selection guidance, Escape, and a 390 px dark layout with no runtime errors. Physical iPad/Pencil remains untested. No frontend source changed in this update.

### Visualization playback, 2026-09-20

Results autoplay over eight seconds using requestAnimationFrame and linear interpolation between the nine validated keyframes. The displayed timeline retains simulated time. Backward/Forward step to adjacent keyframes; stepping and scrubbing pause, and Play from the end restarts. Closing/unmounting cancels animation. The visible Kinematics heading and scope paragraph are removed; the dialog retains an accessible name.

Playback verification: TypeScript and targeted ESLint passed. Disposable Chromium with a local backend-generated fixture verified autoplay progress, pause stability, forward/backward stepping, seeking, stopping at the final frame, replay, controls above the timeline, heading removal, and a 390 px dark layout with no runtime errors. No provider calls were needed for playback checks. Physical iPad/Pencil remains untested.

### Visualization playback redesign, 2026-09-20

The component-only redesign gives the modal a compact full-question header and Close action, an unboxed readout labeled Time, Distance, Speed, and Acceleration, a tighter horizontal animation viewport, and a separate viewport for free fall. Grouped SVG transport controls sit above the slider; elapsed/total simulated time replaces percentage progress. Long questions remain scrollable, and the existing colors, Geist typography, light/dark themes, playback behavior, and request lifecycle are preserved. No global design tokens or sidecar were regenerated.

Verification: TypeScript and targeted frontend ESLint passed. Disposable browser playback checks passed, and the rendered modal was inspected at 1100 × 900 in light mode and 390 × 844 in dark mode. These desktop browser checks do not verify physical iPad, Apple Pencil, or iPad Safari behavior; those were not tested. Existing unrelated full-lint failures remain outside this change.

**2026-09-20 orb/chip revamp:** `MimirOrb` (press-to-talk orb, state-reactive aura, `motion` animations), `QuestionChip`, the sidebar removal, and the implicit-confirm chip model passed ESLint and the Docker production build (type check included). `motion` was installed into the dev container's `node_modules` volume, and the running dev server serves the new markup. The pasted-question chip, orb connect/disconnect, mic-permission failure, both themes, reduced-motion, and iPad Safari/Pencil behavior were **not** exercised in this session — a desktop HTTP check only confirms the page compiles and serves. No LiveKit/OpenAI provider roundtrip was run during this change.

**2026-09-20 Siri-reference orb refinement:** Replaced the solid green sphere with CSS cyan/violet/pink light ribbons, a bright center, and a glass rim. Existing voice lifecycle and outer state animations are preserved; interior motion follows voice state and stops for reduced motion. ESLint and TypeScript passed. Disposable Chromium checks covered desktop light/dark themes, a 390 px viewport (52 px orb), and reduced motion, with no page runtime errors. Physical iPad/Safari and live provider audio remain unverified. Impeccable’s context loader was not installed in this environment; canonical design references were read directly.

**2026-09-20 aura palette:** Screen-edge glow now matches the orb: cyan left, pink right, violet top/bottom, with a pale violet rim. Existing state-driven opacity and reduced-motion behavior remain unchanged. Inspected the simulated speaking aura in disposable Chromium pages in both themes; no runtime errors, and the aura remains pointer-transparent. This visual check did not connect to a voice provider.

## Next work

Validate native screenshot paste and the chip on the actual iPad; configure and exercise live tutoring through the orb. Consider math-specialized OCR for notation beyond simple printed algebra. Later inputs should feed the existing import/chip boundary. Preserve cancellation, live context updates, and normal text editing. Add region-based handwriting context, precise annotations, generated visualizations, and persistence after the core demo works.


## 2026-09-20 inline support and board vision

This section supersedes earlier statements that the agent can only see OCR/typeset equations. Work is on `tutor/refinements`; the earlier learning-support stash has not been applied.

- `components/LearningControls.tsx` / `lib/tutor/support.ts`: persisted, versioned boolean learning preferences. No diagnoses or student work are stored in localStorage. Browser reads happen after mount.
- `lib/livekit/useTutorSession.ts`: room lifecycle, real streamed captions, keyboard-only start, typed turns, mic controls, audio-unlock recovery, pause handshake, agent-join timeout and disconnect cleanup. JavaScript RPC timeouts are milliseconds; Python RPC timeouts are seconds.
- `components/VoiceFeed.tsx`: latest spoken caption beside inline actions; history and text input expand in the same dock. `MimirOrb` retains the teammate's sphere/aura.
- `lib/canvas/capture.ts`: render the visible board's screenshot, typed content and original ink into a max-1400-pixel JPEG. Labels are added only to the tutor image. Nearby touching strokes are grouped geometrically. Text tokens use measured font widths. Screenshot OCR retains local symbol bounds in a WeakMap via `lib/screenshot.ts`.
- `lib/tutor/boardView.ts`: snapshot registration, coordinate transforms, region-ID validation, stale-scene rejection, pause/preferences guards and temporary highlight state. `renderer.ts` applies temporary purple emphasis to existing ink/text/image symbols. `TutorOverlay` retains an underline cue and renders/removes tutor scaffolds.
- `lib/livekit/rpc.ts`: agent-only board reads, bounded RPC metadata, scoped `mimir.board` byte streams and highlight/write calls. Images do not go through the size-limited RPC payload.
- `agent/tools/canvas.py`: authenticated sender, request-correlated image futures, bounded transfer/timeouts and cleanup. `agent/tutor.py` enforces capture → `planner.py` → independent math checks → atomic `apply_teaching_plan` → spoken line. The voice model no longer chooses whether to look or solve independently.
- `agent/main.py` / `prompts.py`: server VAD (threshold .75, 350ms silence), far-field noise reduction, automatic generation disabled, application-owned speech-start interruptions, final-transcript gated teaching turns, and a student-only pause RPC that cancels pending plans. Voice/model remain configurable; defaults are unchanged (`marin`, `gpt-realtime`).

Limitations: geometric ink groups can merge nearby symbols or split disconnected ones. When Typeset math is enabled, vision uses the preserved original ink; exact subexpression alignment against reflowed KaTeX is not guaranteed. OCR edits correct the question text but do not rewrite image/symbol geometry. No continuous automatic mistake detector was added; each requested hint reads a fresh view. Snapshot capture rejects an active stroke or open text editor. Ask again after finishing the stroke. Region metadata is capped for the algebra demo; zoom into the relevant work on a busy board.

Validation: ESLint, TypeScript, an isolated Docker production build, and `scripts/test-board-support.mjs` passed during implementation. The deterministic checks exercise transforms, invalid/stale regions, pause, preferences, exact known-region unions, ink clustering and cleanup. A real LiveKit/OpenAI session received raw pen strokes with Typeset math disabled and selected R3/R4/R5 (`3 × 2`) from `2 + 3 × 2`; the browser rendered the matching highlight and streamed the spoken hint. Pause was checked through its real RPC acknowledgment. Tests used synthetic math and keyboard turns; physical iPad/Pencil, microphone input, audible voice quality and interruption timing still need a device check. Provider credentials remain local and ignored.

The real pasted-screenshot check also selected the OCR symbol regions for `3 × 2`, displayed the underline in place and asked “What’s three times two?”. A tiny screenshot initially misread the plus sign; editing the chip corrected the spoken question while preserving the image's symbol positions. A second typed turn after pause/resume successfully refreshed the image context and read the question without solving it. Browser checks exercised larger/spaced captions, calm mode, both themes, inline typing and history controls. All live test sessions were disconnected afterward.

## Checked teaching flow (2026-09-20)

- `agent/planner.py`: bounded Responses request using `gpt-5.4-mini` with low reasoning (both configurable), current JPEG, region IDs, focus, preferences, tutor scaffold metadata and last eight conversation entries. Structured one-turn plan; unclear/multiple problems require clarification. Hidden reasoning is not returned to the UI.
- `agent/math_check.py`: safe AST interpreter with exact fractions, limited polynomial degree and one variable; no eval/sympy parsing. Verifies reported equalities and completed scaffold equivalence. Unsupported math fails closed. Visual transcription and semantic relevance are still model-dependent.
- `agent/tutor.py`: cancels superseded turns; no planner call without current capture; stale revision blocks speech/advice. Checked speech is delivered by Realtime with tools disabled. There is no continuously running pen monitor.
- `ProblemFocus.tsx`: drag area, clear/change controls; `captureScene` crops to its visible intersection. `boardView` invalidates cached snapshots on focus change. Camera and tutor annotations also participate in revision checks.
- `teachingPlan.ts`: validates region ownership and snapshot, measures KaTeX, finds unoccupied visible space, renders exactly one blank with no answer exposed to frontend. Source ink stays editable. Large/dense boards may require a tighter focus; RPC metadata and images are bounded.
- `renderer.ts`: clipped render-time ink/text tint plus cached foreground-image tint. It never rewrites the original elements/image. Typeset handwriting still renders a separate KaTeX overlay, so precise tint is best with raw handwriting (Typeset off).
- Interruptions use speech-start events with a 150ms sustained-speech guard, without waiting for final recognized words. The microphone stays live during interruptible replies. Short answers including '6' are valid; empty/noise transcripts do not request a new plan. Physical microphone and ambient-noise checks remain necessary.
- Tests: Python math/turn-gate tests and frontend board-support tests cover failed math, unsupported expressions, correct/incorrect blanks, failed captures, stale plans, focus invalidation and collision-free placement. Browser smoke tests use synthetic content.

Latest live regression: two separated problems prompted a choice; focusing the left expression produced a multiplication hint, purple tint on `3 × 2`, rejection of `7`, acceptance of `6`, and a `2 + 6 = ____` scaffold. A hand-drawn `8` in that blank was recognized and completion stopped the lesson. A regression guard prevents a scaffold from switching to a different problem and prevents a verified final answer from starting an unsolicited new exercise. Pause acknowledged successfully. Temporary test sessions were ended. Some LiveKit reconnects timed out with transport/data-channel closure; a later connection succeeded. Physical microphone/noise testing remains outstanding. Python (8 tests), frontend board tests, lint, TypeScript and the isolated production build passed.

## Handwriting latency follow-up (2026-09-20)

The serial medium-reasoning check was the main response delay. A bounded comparison on the same browser-drawn `2 + 3 × 2` image took 6.11s with `gpt-5-mini`/medium and 1.30s with `gpt-5.4-mini`/low; both read the expression correctly. These are individual model-call measurements, not a latency guarantee. The latter is now the default, retaining exact math validation and the fresh-snapshot gate. The full board live test measured 2.67s to first speech for a hint and 3.11s for detecting handwritten `3 × 2 = 7`; capture was 0.15–0.17s, model checking 2.04–2.30s, annotation 0.08–0.17s, voice startup 0.37–0.48s. The correct handwritten subexpression changed color in place.

Board capture, context retrieval and stopping old speech now run concurrently with cancellation cleanup. Status updates no longer delay starting verified speech. Planner logs expose timing/token counts; turn logs separate capture, checking, annotation and first speech without including student content in those measurements. The model receives region geometry but no placement-obstacle duplication. The request has a 2,000-token ceiling and no automatic retry loop.

Handwriting exposed an overly strict gate: a whole written `3*2=6` was rejected when its witness compared `3*2` against `6`. The gate now accepts both formats by checking both sides, still rejecting wrong answers. Final written arithmetic equations can finish the problem. Scaffolds are validated directly against the original problem, removing a redundant model-written source field; the blank's answer schema excludes whole equations. Regression tests cover these cases and cancellation during capture.

Canvas rendering batches refreshes with requestAnimationFrame, retains coalesced pointer samples (with a fallback where unavailable), batches grid dots into one fill, and avoids recoloring unrelated elements. Capture reuses its ink groups. These preserve the existing stroke smoothing. Physical Apple Pencil/iPad Safari performance still needs a device check; the browser tests use pointer-drawn strokes with Typeset off and keyboard questions. Frontend lint, TypeScript, board checks and an isolated production build passed; Python has 10 passing tests.

Final live retest after the format fixes: the actual handwritten `3 × 2 = 6` was accepted, `2 + 6 = ____` appeared below the work in 3.77s and speech began in 4.05s. A pointer-drawn `8` inside that blank was recognized as completion; speech began in 2.47s, with no extra exercise. Combined observed first-speech timings for the tested flow were 2.47–4.05s. The temporary session was disconnected and its tab closed; the updated worker remains running. One connection attempt made around a worker restart timed out; reconnecting after registration succeeded. No physical microphone test or broad latency percentile study was performed.

## Conversational response and interruption follow-up (2026-09-20)

The previous noise fix made speech uninterruptible. LiveKit also substituted silence for microphone frames during those replies, so waiting for a transcript to interrupt could never work reliably. Replies and greetings now allow interruptions, and `discard_audio_if_uninterruptible` is false. With manual turn ownership, Mimir explicitly handles `user_state_changed`: 150ms of detected speech cancels the pending planner task and forces speech interruption, before transcription completes. Returning to listening cancels a brief detection blip. The .75 VAD activation threshold and far-field noise reduction remain; end-of-turn silence is 350ms instead of 800ms. Automatic unchecked Realtime generation remains off.

Exact stop/repeat/greeting/thanks phrases bypass the capture/planner. Stop stays silent; repeat uses the previously delivered line. Mixed questions and math are not routed through this shortcut. The next math request still captures the current board. A no-reasoning model experiment failed validation and was not adopted; the checked low-reasoning model remains in use.

Validation: 14 Python tests pass, including speech-start cancellation, short-blip filtering, controls that skip vision, and the prior math/handwriting tests. A separate real LiveKit room published synthesized “Wait, stop” audio as a microphone track while the tutor was speaking: the agent changed from speaking to listening 0.440s after audio input began, and the stop transcript was received. A greeting began speaking after 0.472s with zero board captures. A second interruption during a deliberately delayed capture produced zero annotations; a subsequent greeting began after 0.536s. The test room was disconnected. This is an injected-audio integration test, not a physical microphone/iPad noise test; it does not establish subsecond math replies. Frontend was unchanged in this follow-up, so its existing build/lint checks were not repeated.

Reference: [LiveKit turn handling](https://docs.livekit.io/reference/agents/turn-handling-options/), [OpenAI VAD](https://developers.openai.com/api/docs/guides/realtime-vad). The installed LiveKit 1.8.2 source was checked for manual-turn interruption and microphone discard behavior.

## Prepared hints and exact speech (2026-09-20)

This supersedes the mandatory fresh-model-per-turn and Realtime speech-delivery descriptions above. Work remains on `tutor/refinements`; the remote had no new commits at the start of the change.

- `agent/preparation.py`: in active sessions only, poll lightweight board status every 450ms; wait 900ms of observed stability and at least four seconds between preparation starts. Prepare one generic checked hint per source revision. No automatic spoken intervention. Changed/busy/empty boards and pause invalidate the preparation; exit cancels pending work. A question can await shared preparation without cancelling it when the question is interrupted. Current browser revision validation remains authoritative before annotations or speech.
- `boardView.ts` / `InfiniteCanvas.tsx` / `rpc.ts`: `get_board_status` reports readiness, content, preferences and revision. Revisions cover ink, screenshot, corrected question, tutor annotations, focus, camera and viewport dimensions. A still-current capture reuses its JPEG and snapshot/region IDs. Busy writing rejects capture and stale-plan application. Stroke membership stays local and is stripped from RPC metadata to respect its size limit.
- `agent/fast_turn.py`: bounded generic hint intents (including the Next hint button) use preparation; specific requests retain full planning. Short numeric answers can use the last question's explicit numeric AST subtree, source revision and exact arithmetic checker. Correct answers produce a verified equivalent blank; wrong answers retain the same question. Unsupported/ambiguous cases fall back. A trailing unfinished `=` is normalized to an expression by the planner. The fast path deliberately does not guess a different target from spatial proximity or speech keywords.
- `agent/voice_delivery.py`: `gpt-4o-mini-tts`/`marin` reads the checked text directly through `session.say(..., audio=...)`. Realtime no longer generates a second math reply; a live test caught it paraphrasing a checked hint incorrectly. A maximum of four in-memory speech entries share progressive PCM frames across prewarming and playback. Hints and eligible confirmation sentences can be synthesized while the student thinks. Slower speech has a separate cache key. Pause cancels pending synthesis; session exit closes clients and tasks. Realtime retains microphone/VAD/transcription and the initial greeting.
- `inkRegions.ts` uses bounding boxes only to reject distant strokes, then tests segment proximity/intersection. Parentheses no longer merge with neighboring digits merely because their rectangles overlap. Capture retains region stroke IDs; renderer tints exactly those strokes, with separate rectangle clipping for typed text and screenshot OCR. The planner explicitly selects operands plus the operator and provides `focus_expression` for grounded numeric answers.

Verification: 25 Python tests pass (cache reuse/invalidation/cancellation, fast answers, speech streaming reuse, exact speech delivery, plus existing math and interruption tests). Frontend board checks, ESLint, TypeScript and an isolated production Docker build pass. Browser pen strokes forming `5(2+2)=` retained Pen with no handles, highlighted both `2`s and `+` while leaving `5`/parentheses untouched, and accepted `4` to render `5 · 4 = ____` below the work. Final browser hint and correct-answer starts logged 0.24s and 0.22s after the typed turn reached the agent.

Two real LiveKit tests supplied the user's screenshot with separate region labels and injected “What do I do first?” audio. Prepared hints arrived as received non-silent audio **1.55s and 1.49s after the synthetic utterance ended**, versus the earlier baseline's 5.00s. Both selected exactly the three `2 + 2` regions and spoke that calculation. The final run accepted typed `4`, produced `5 * 4 = {{blank}}`, and started speaking in 0.282s from sending the answer. An interruption test stopped TTS playback 0.407s after “Wait, stop” audio began; a cancelled delayed capture applied zero annotations and the next greeting succeeded. All test rooms were disconnected.

Limits: these are bounded warm-preparation tests, not latency percentiles or a physical microphone/iPad/Pencil test. First-time, changed-board or specific questions can still wait for vision/reasoning and uncached synthesis. Preparation spends API credits proactively only while a session is active; unchanged boards do not repeat analysis. Visual interpretation and complete target selection remain model-dependent. Strokes that physically touch can still form one region, and disconnected symbols can span multiple regions. Typeset-overlay alignment remains a separate limitation.

Speech integration was checked against installed LiveKit 1.8.2 and [OpenAI streaming speech documentation](https://developers.openai.com/api/docs/guides/text-to-speech).

## Main/tutor integration (2026-09-20)

`stevin/integrate-main-tutor` starts from fetched `origin/main` at `dce64e8` and merges `stevin/tutor-snapshot-20260920` (`3c2fe05`), a snapshot of the current `tutor/refinements` checkout including uncommitted voice-speed/accessibility work. The original checkout, branch and pre-existing learning-support stash were left intact. No remote branches were changed.

The combined workspace keeps the orb, inline caption dock, learning preferences, focus, checked hints and precise ink tinting. It also retains main's plain-text paste, physics visualization dialog and selectable-typeset Graph tool. Visualization reads the live OCR chip text when a screenshot is selected; there is no stale confirmation/sidebar dependency. The modal sits above the voice controls and makes the background inert. Pasted text starts below the focus control. Renderer arguments preserve both exact stroke highlighting and suppression of duplicate selection boxes around recognized source strokes.

Graph auto-fit now initializes with the expression rather than setting state in an effect; animation/wheel refs synchronize after commit. Both npm and pnpm lockfiles contain `mathjs` and `motion`. `CORS_ORIGINS` makes an isolated preview possible without changing the normal port-3000 setup.

### Graphing coverage, 2026-09-20

The selectable-typeset Graph tool now normalizes common LaTeX forms into safe `mathjs` expressions for any single-input `y=f(x)` curve in the supported numeric function family: polynomial, rational, exponential, logarithmic, square-root, absolute-value, trigonometric, inverse-trigonometric, hyperbolic, rounding, and basic min/max/sign functions. `x` is always the independent variable; every other free symbol becomes a coefficient slider, while `e`, `pi`, `x`, `y`, and function names are excluded. Balanced fractions and roots, implicit multiplication such as `Bx` or `2x`, shorthand calls such as `lnx`/`sinx`, powered calls such as `sin^2x`, domain gaps, and rational asymptotes are handled without executing generated code. Sampling breaks curves across undefined values and abrupt asymptote jumps, and auto-fit ignores extreme outliers. `frontend/scripts/test-graph.mjs` covers representative forms, shorthand functions, powered functions, coefficient extraction, logarithmic domains, and asymptote gaps.

Verification: graph regression tests, ESLint, TypeScript, and the Next.js production build passed. Browser and physical iPad/Pencil graph interaction remain unverified.

Local preview: `/Users/stevin/Documents/Projects/Mimir-integration`, frontend `http://localhost:3001`, backend `http://localhost:8001`. Ignored environment files copy the existing local provider configuration; frontend endpoints point at port 8001. The unchanged tutor agent can use the existing running worker; do not start a second unscoped worker against the same LiveKit project. Live Visualize generation requires `OPENROUTER_API_KEY`; it is now configured locally in the ignored backend environment file. Never commit environment files.

Integration verification: frontend ESLint, TypeScript, production build and board-support regressions passed; 25 tutor tests and 10 backend kinematics tests passed, the latter including 200 generated motion cases. An added renderer check combines tutor tint with typeset-source selection suppression. In the isolated browser preview, plain-text paste/select opened the visualization modal with the intended problem and returned the expected missing-OpenRouter configuration message. Learning controls, raw pen input with Pen retained, real LiveKit keyboard-mode connection, a prepared hint with exact ink recoloring, MyScript conversion, typeset selection and graph parameter changes were exercised. The temporary voice session was disconnected. The graph rendered and moved its constant curve when the recognized capital-X parameter changed. No physical iPad/Pencil or microphone test, live OpenRouter generation, or graph-to-tutor vision support was verified in this integration. Graphs/visualization are separate overlays and are not included in the existing student-ink capture.

The isolated Docker build initially found a missing transitive peer entry after local npm regenerated the lockfile. Regenerating with the Docker Node 22 / npm 10 toolchain restored a clean `npm ci`; the subsequent production build passed. Local npm and pnpm dependency graphs retain both incoming feature dependencies.

## OpenRouter live verification and branch publication (2026-09-20)

Configured the user-supplied OpenRouter/MyScript settings only in the integration backend’s ignored `.env` (mode 0600), with one variable per line. Restarted only the port-8001 preview backend. The user’s existing port-3001 page was preserved; a disposable browser tab pasted a synthetic car-acceleration problem and requested Visualize using `inclusionai/ling-3.0-flash-vl:free`. Live extraction and animation completed with the expected 5 s, 25 m, 10 m/s and 2 m/s² final values. This supersedes the earlier missing-key limitation for this local preview. Other checkouts/deployments still need their own local provider configuration.

Before publishing the integration branch, the unpushed Git objects and tracked working tree were checked against the locally configured credentials. No credential values or real environment files were present. Existing environment example templates contain configuration names/placeholders only. No credentials belong in source, documentation or commits.
