# Product: Mimir

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Students practicing math after class, primarily on an iPad with an Apple Pencil. They have already been introduced to a topic and need help applying it independently. The current demo covers basic algebra tutoring and API-driven single-object kinematics visualizations.

The student writes freely, makes mistakes, asks questions aloud, and continues solving. Teachers are a possible later audience for a report about where students struggle; that report is outside the first working demo.

## Product Purpose

A live AI tutor that follows handwritten work on an infinite canvas, talks with the student, and points to the exact part of the work it is discussing. The student should feel able to keep thinking and writing while help is available beside them.

Success for the demo means the student can work through a pasted algebra question, ask for help, receive a useful spoken hint tied to their handwriting, correct a mistake, and reach the answer. For kinematics, success means pasting a problem, clicking Visualize on the textbox, and exploring a matching visualization with playback and timeline controls. Real recognition and tutor responses are required before describing the complete live tutoring experience as implemented.

## Positioning

Mimir combines a handwriting-first workspace with conversational tutoring and problem-linked motion visualizations. Students bring their own problems; the tutor should connect guidance to their work, while the visualization API interprets the given quantities and validated physics calculates motion. No competitive superiority or uniqueness claim has been established.

## Operating Context

The primary setting is independent practice after class on an iPad with Apple Pencil, delivered through a web app. A student can paste a screenshot with ⌘V / Ctrl+V, review and correct its OCR text, and confirm it as tutor context. Right-click on the canvas offers copy, paste, cut, and delete. They can also paste a plain-text problem onto the canvas or into a textbox; a Visualize chip appears at the top-right of that textbox.

Visualizations open in a modal and start playing automatically. Play/Pause, Forward, Backward, and the timeline support inspection. Closing the modal returns to the canvas. Keep the interface focused on the problem and controls, without the removed Kinematics heading or scope paragraph.

The current hackathon visit is held in memory: reload loses drawings and questions. Replacing a screenshot preserves ink but clears question confirmation and ends voice. Closing the tutor panel retains its state and voice session. Provider secrets stay on the server; local screenshot OCR requires no provider key. The four copyable demo problems return cached frames. Other visualization problems use the configured API, and identical text is reused from cache instead of regenerating.

## Capabilities and Constraints

| Area | User's direction |
| --- | --- |
| Student work | Freehand math is primary. An optional Text tool supports typed boxes on the canvas. |
| Workspace | Infinite/free canvas. One finger pans, two fingers pinch to zoom; Apple Pencil uses the selected drawing tool. |
| Controls | Pen, Eraser, and Text, with white ink available. No automatic selection box after each stroke. |
| Conversation | Natural live voice conversation, with the tutor able to follow the student's work. Standard Gemini 3.8 Live is the default single-model tutor over LiveKit; the checked OpenAI path is optional. |
| Intervention | When the student asks a question or their work is clearly going in the wrong direction. |
| Guidance | A short question or hint connected to the relevant handwritten expression. |
| Annotation | Circle/highlight the relevant ink; the user suggested a glow lasting about three seconds while the tutor speaks. |
| Demonstration | Explain step by step when needed; tutor-written math should appear to draw itself. |
| Problem source | Paste a screenshot onto the canvas. OCR it and show the read text in a small dismissible chip near the Mimir orb; edits update tutor context live. Explicit confirmation was replaced by this passive chip on 2026-09-20. Other input methods come later. |
| Completion | Help the student reach a correct answer. |
| Constraints | Fast hackathon iteration, reuse existing tools/APIs when useful, approximately $20 total API budget. |
| Kinematics visualization | Interpret pasted single-object problems through an API and calculate matching, validated visualizations: speeding up, braking to rest, constant speed, and downward free fall. Multiple bodies, collisions, direction reversals, and unknown launch-speed constraints are outside this visualization scope. |

Students may also paste a plain-text problem onto the canvas or into a textbox, then click the Visualize chip on that box. Kinematics visualization uses an API to interpret each pasted problem, including the copyable demo examples. Examples guide interpretation rather than trigger pre-programmed answers; validated physics calculates the frames. Premade kinematics questions are copyable demo material, not a question selector.

The screenshot flow supersedes the earlier preset algebra questions. Keep interface copy limited to necessary controls, chip status, and actionable errors. Typing is allowed for chip corrections and optional canvas textboxes. Freehand math remains the main solving interaction. The tutor is invoked as **Mimir**: a single orb starts and ends the voice session, with a screen-edge aura while it is live.

The original time budget was 24 hours. That was a historical constraint, not a live countdown. No sponsor requirements were specified.

## Teaching Examples

- For `2(x + 3) = 14`, if the student writes `2x + 3 = 14`, point to `2(x + 3)` and ask “What does that 2 multiply?”
- If the student treats `2 × 3` as `7`, prompt them to check that multiplication.
- If the student asks “I'm confused, where do I go from here?”, use the actual current work to give the next useful hint.
- If hints are insufficient, demonstrate a step with visible drawing. The user explicitly permits step-by-step demonstrations; do not impose an absolute ban on showing an answer.

## Brand Commitments

The name in the current repository is **Mimir**. An earlier separate prototype was called Margin; its name and behavior do not automatically carry into this app.

The user's examples establish a conversational, guiding tutor voice: brief questions, specific help, and patience with mistakes. A formal three-word brand identity, logo direction, and named visual references have not been selected. Preserve that uncertainty instead of presenting an invented brand as approved.

## Anti-references

- **Selection boxes after every stroke.** Writing should not feel like resizing diagram objects.
- **Typed math as the primary student input.** A text field must not replace the handwritten working surface.
- **Unrequested full solutions.** Guide the student first; use demonstrations when they need them.
- **Teacher dashboards before the core tutor works.** Reporting must not displace the demo's main learning loop.
- **Filler text and preset problem menus.** The student normally brings their question; copyable kinematics demo questions are the requested exception. Remove slogans and redundant instructions.

These are product constraints from the conversation, not a newly imposed aesthetic brief.

## Product Principles

1. **Protect the writing flow.** Keep ink responsive, retain the selected pen, and let the canvas remain the main workspace.
2. **Connect speech to visible work.** A hint should identify the expression it refers to instead of making the student search for context.
3. **Intervene with evidence.** A partial expression or uncertain recognition is not proof of a mathematical error. Distinguishing those cases is a requirement for the future tutor integration.
4. **Teach through the next step.** Ask a useful question, then increase support when the student remains stuck.
5. **Make the demo's core loop work first.** Prioritize reliable algebra tutoring and the confirmed kinematics visualization flow before reports, broader subject coverage, or extensive editor features.

## Evidence on Hand

- [Demo problems](docs/DEMO_PROBLEMS.md) provide copyable kinematics examples. Those four paragraphs use cached frames; other wording is interpreted through the API.
- [Implementation and verification record](docs/PROJECT_CONTEXT.md) distinguishes shipped behavior, tested integrations, and known gaps. It records successful live visualization API checks and desktop browser playback checks; these do not establish physical iPad/Pencil or complete live tutor validation.
- [Run instructions](README.md) document the working web application and provider configuration.
- The teaching examples above capture the requested tutoring behavior. They are requirements, not proof that proactive tutoring is fully implemented.
- No testimonials, adoption metrics, formal accessibility certification, or comparative benchmarks have been supplied. Do not invent them.

## Accessibility & Inclusion

Confirmed interaction needs are handwriting with an Apple Pencil, spoken help, and a visible indication of the expression being discussed. Preserve readable ink and controls in both currently supported system themes.

The workspace now includes a Learning tools popover with live captions, one-step guidance, short replies, slower speech, larger text, wider text spacing, calm motion and temporary expression color emphasis. A compact caption dock supports typed messages, reading the question aloud, another explanation, microphone control and pause/resume. These are student-selected preferences, not diagnosis-specific modes or claims of clinical benefit. No formal accessibility conformance level or physical iPad verification is claimed.

## Decisions Still Open

- Production suitability and configuration of the current MyScript and LiveKit/OpenAI integrations. These arrived from collaborators on `main`; they are implemented code, not a newly purchased service.
- Semantic end-of-step detection and proactive intervention confidence. Requested checks now wait for a one-second pen-up pause and automatically retry when the work changes during checking.
- Physical iPad validation of finger pan/pinch, Pencil priority, and palm contact behavior. Gesture logic is covered by automated tests.
- Durable persistence, full voice/recognition validation on iPad, and general visual explanations. Screenshot OCR currently targets printed English questions and basic algebra; complex mathematical layout may need correction.

Implementation facts and a suggested build order live in [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md). Visual values extracted from the current app live in [DESIGN.md](DESIGN.md).

Legacy OpenAI reliability and latency refinement (2026-09-20): math teaching uses versioned visual evidence and a checked plan. During an active session the tutor silently prepares a hint after handwriting settles, reusing it only while the board remains unchanged. Hints and eligible numeric answers can respond without another model call; specific or ambiguous requests still require fresh planning. Checked words are delivered directly through speech synthesis, with prepared audio cached in memory. Multiple problems can be isolated with a drag-to-focus area. Correct answers can advance to a single equivalent equation with a handwriting blank; incorrect or ambiguous work stays at the current step. Basic arithmetic/algebra checks are deterministic, while visual interpretation and teaching judgments remain model-dependent. Speech-start detection stops audio and cancels a pending turn; brief blips are ignored. No continuous proactive error correction or device-level noise guarantee is claimed.

Writing flow (2026-09-20): a requested review stays pending while the student draws, erases, moves content, or edits a textbox, and continues after a one-second pause. A new question, Stop, Pause, or disconnect cancels the pending turn. If new ink invalidates a check, the tutor captures the settled work again without asking the student to repeat the request. Tutor scaffolds use animated SVG pen paths, aligned below the current working column with a wide blank for the student. Placement avoids existing content and reveals more canvas below when needed. A pause in pen input does not prove the student has finished solving the problem; the tutor should check the latest completed step.

Writing modes decision (2026-09-20): the student chooses **I write** (default) or **AI writes** in the header. In I write, Mimir guides the student; each explicit request for AI writing permits one step. In AI writes, Mimir handles handwriting while the student answers aloud or in chat. It writes one checked step per turn, records correct answers, fills tutor blanks, and asks the next small question. It does not dump the full solution or advance on wrong/uncertain answers. Switching back stops automatic writing without erasing work; a spoken request not to write is respected for that turn. This supersedes the earlier globally opt-in writing decision. Steps match the current full line's symbol size and thickness and stay centered in a vertical sequence below the work. Keep the full expression, parentheses and unchanged terms visible; simplify only the current operation. An answer inside a blank is part of its existing line, not a new column. This matches scale rather than the student's individual letter shapes. Repeated calls reuse steps and student ink is never replaced.

Default tutor decision (2026-09-20): use standard Gemini 3.8 Live for voice, canvas understanding and teaching in one session. Local code retains pen-pause timing, arithmetic/algebra validation and stroke-based highlights/SVG placement. Changed settled frames arrive silently at most once per second; the current frame goes directly to checked review, without a mandatory separate inspection tool call. The earlier OpenAI planner/TTS mode remains optional. This choice prioritizes implementation simplicity and responsiveness; no universal fastest-model or accuracy claim is established.
