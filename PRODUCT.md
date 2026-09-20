# Product: Mimir

## Register

product

## Users

Students practicing math after class, primarily on an iPad with an Apple Pencil. They have already been introduced to a topic and need help applying it independently. The immediate demo focuses on basic algebra.

The student writes freely, makes mistakes, asks questions aloud, and continues solving. Teachers are a possible later audience for a report about where students struggle; that report is outside the first working demo.

## Product Purpose

A live AI tutor that follows handwritten work on an infinite canvas, talks with the student, and points to the exact part of the work it is discussing. The student should feel able to keep thinking and writing while help is available beside them.

Success for the demo means the student can work through a pasted algebra question, ask for help, receive a useful spoken hint tied to their handwriting, correct a mistake, and reach the answer. Real recognition and tutor responses are required before describing that complete experience as implemented.

## Confirmed Requirements

| Area | User's direction |
| --- | --- |
| Student work | Freehand math is primary. An optional Text tool supports typed boxes on the canvas. |
| Workspace | Infinite/free canvas; this supersedes the earlier single-notebook-page idea. |
| Controls | Pen, Eraser, and Text, with white ink available. No automatic selection box after each stroke. |
| Conversation | Natural live voice conversation, with the tutor able to follow the student's work. |
| Intervention | When the student asks a question or their work is clearly going in the wrong direction. |
| Guidance | A short question or hint connected to the relevant handwritten expression. |
| Annotation | Circle/highlight the relevant ink; the user suggested a glow lasting about three seconds while the tutor speaks. |
| Demonstration | Explain step by step when needed; tutor-written math should appear to draw itself. |
| Problem source | Paste a screenshot onto the canvas. OCR it and show the read text in a small dismissible chip near the Mimir orb; edits update tutor context live. Explicit confirmation was replaced by this passive chip on 2026-09-20. Other input methods come later. |
| Completion | Help the student reach a correct answer. |
| Constraints | Fast hackathon iteration, reuse existing tools/APIs when useful, approximately $20 total API budget. |

The screenshot flow supersedes the earlier preset algebra questions. Keep interface copy limited to necessary controls, chip status, and actionable errors. Typing is allowed for chip corrections and optional canvas textboxes. Freehand math remains the main solving interaction. The tutor is invoked as **Mimir**: a single orb starts and ends the voice session, with a screen-edge aura while it is live.

The original time budget was 24 hours. That was a historical constraint, not a live countdown. No sponsor requirements were specified.

## Teaching Examples

- For `2(x + 3) = 14`, if the student writes `2x + 3 = 14`, point to `2(x + 3)` and ask “What does that 2 multiply?”
- If the student treats `2 × 3` as `7`, prompt them to check that multiplication.
- If the student asks “I'm confused, where do I go from here?”, use the actual current work to give the next useful hint.
- If hints are insufficient, demonstrate a step with visible drawing. The user explicitly permits step-by-step demonstrations; do not impose an absolute ban on showing an answer.

## Brand Personality

The name in the current repository is **Mimir**. An earlier separate prototype was called Margin; its name and behavior do not automatically carry into this app.

The user's examples establish a conversational, guiding tutor voice: brief questions, specific help, and patience with mistakes. A formal three-word brand identity, logo direction, and named visual references have not been selected. Preserve that uncertainty instead of presenting an invented brand as approved.

## Anti-references

- **Selection boxes after every stroke.** Writing should not feel like resizing diagram objects.
- **Typed math as the primary student input.** A text field must not replace the handwritten working surface.
- **Unrequested full solutions.** Guide the student first; use demonstrations when they need them.
- **Teacher dashboards before the core tutor works.** Reporting must not displace the demo's main learning loop.
- **Filler text and preset problem menus.** The student brings their question. Remove slogans and redundant instructions.

These are product constraints from the conversation, not a newly imposed aesthetic brief.

## Design Principles

1. **Protect the writing flow.** Keep ink responsive, retain the selected pen, and let the canvas remain the main workspace.
2. **Connect speech to visible work.** A hint should identify the expression it refers to instead of making the student search for context.
3. **Intervene with evidence.** A partial expression or uncertain recognition is not proof of a mathematical error. Distinguishing those cases is a requirement for the future tutor integration.
4. **Teach through the next step.** Ask a useful question, then increase support when the student remains stuck.
5. **Make the demo's core loop work first.** Favor a small reliable algebra experience before reports, broad subject coverage, or extensive editor features.

## Accessibility & Inclusion

Confirmed interaction needs are handwriting with an Apple Pencil, spoken help, and a visible indication of the expression being discussed. Preserve readable ink and controls in both currently supported system themes.

No formal accessibility standard or additional individual accommodation was specified. Visible transcripts, non-color annotation cues, accessible control names, comfortable touch targets, and reduced-motion alternatives are recommended future requirements, not verified features. Do not claim the current interface meets an accessibility conformance level.

## Decisions Still Open

- Production suitability and configuration of the current MyScript and LiveKit/OpenAI integrations. These arrived from collaborators on `main`; they are implemented code, not a newly purchased service.
- Exact end-of-step detection, confidence thresholds, and intervention timing.
- How the student navigates an infinite canvas with touch while the Pencil draws.
- Durable persistence, full voice/recognition validation on iPad, and general visual explanations. Screenshot OCR currently targets printed English questions and basic algebra; complex mathematical layout may need correction.

Implementation facts and a suggested build order live in [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md). Visual values extracted from the current app live in [DESIGN.md](DESIGN.md).
