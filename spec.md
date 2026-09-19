# LiveKit + OpenAI Realtime Math Tutor --- Prototype Specification

## 1. Goal

Build a real-time, voice-based AI math tutor that shares a whiteboard
with the student.

The tutor should be able to:

-   Hold a natural spoken conversation with low latency.
-   Understand the current mathematical content on the canvas.
-   Refer to specific equations or regions of the student's work.
-   Add its own visual annotations without modifying the student's
    original handwriting.
-   Write clean LaTeX equations onto the canvas.
-   Draw simple teaching annotations such as arrows, circles,
    highlights, underlines, and labels.
-   Clear or modify only its own annotations.
-   Continue speaking while interacting with the canvas.

This prototype extends the existing handwritten-math architecture rather
than replacing it. The existing handwriting recognizer remains
responsible for converting student strokes into LaTeX.

------------------------------------------------------------------------

## 2. Prototype Scope

### In scope

1.  Student connects to a LiveKit room from the web app.
2.  Student can speak naturally to the tutor.
3.  OpenAI provides the realtime conversational model.
4.  Tutor receives the current recognized equation as context.
5.  Tutor can call a small set of canvas tools.
6.  Canvas tools execute in the browser.
7.  Tutor can:
    -   write LaTeX,
    -   write text,
    -   draw arrows,
    -   circle/highlight content,
    -   clear its annotations.
8.  User handwriting remains untouched.
9.  Tutor annotations are stored separately from user strokes.

### Explicitly out of scope for V0

-   Full page semantic parsing.
-   Symbol-level or term-level recognition.
-   Persistent tutoring sessions.
-   Multiple students.
-   Collaborative whiteboards.
-   RAG/course-material integration.
-   Automatic grading.
-   Complex geometric drawing.
-   Tutor-generated arbitrary raw stroke sequences.
-   Production authentication/authorization.
-   Long-term student memory.

The first goal is to prove the interaction:

> student talks → tutor understands equation → tutor responds verbally →
> tutor modifies whiteboard

------------------------------------------------------------------------

## 3. High-Level Architecture

``` text
                         ┌──────────────────────────┐
                         │      OpenAI Realtime     │
                         │                          │
                         │ speech + reasoning       │
                         └────────────▲─────────────┘
                                      │
                                      │
                              LiveKit Agent
                                      │
                    function tools / frontend RPC
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────┐
│                       React Frontend                       │
│                                                            │
│  Microphone ──────► LiveKit WebRTC                         │
│                                                            │
│  Canvas                                                    │
│  ├── User Ink                                             │
│  ├── Recognized Math State                                │
│  └── Tutor Annotations                                    │
│                                                            │
│  Client RPC methods                                        │
│  ├── get_canvas_state                                     │
│  ├── write_latex                                          │
│  ├── write_text                                           │
│  ├── draw_arrow                                           │
│  ├── highlight_region                                     │
│  ├── circle_region                                        │
│  └── clear_tutor_annotations                              │
└──────────────────────────┬─────────────────────────────────┘
                           │
                           │ existing recognition path
                           ▼
                  Local Math Backend
                           │
                           ▼
                    Math Recognizer
                           │
                           ▼
                         LaTeX
```

LiveKit is the realtime transport/orchestration layer. The browser
communicates with the agent over WebRTC. The LiveKit agent connects to
OpenAI and can execute function tools or forward actions to the frontend
using RPC.

------------------------------------------------------------------------

## 4. Recommended Stack

### Frontend

-   React or Next.js
-   TypeScript
-   LiveKit React SDK
-   Excalidraw initially
-   KaTeX for rendering tutor-generated math
-   Existing stroke-capture implementation

### Agent

Use Python for the first prototype.

Suggested packages:

``` text
livekit-agents
livekit-agents[openai]
python-dotenv
```

### AI

Initial configuration:

``` text
LiveKit AgentSession
        │
        ▼
OpenAI Realtime Model
```

The realtime model should handle both user speech input and tutor speech
output.

A cascaded STT → LLM → TTS architecture can be evaluated later if
greater control is needed.

------------------------------------------------------------------------

## 5. Canvas Data Model

The whiteboard should visually appear to be one canvas but internally
contain separate ownership/state.

### 5.1 User Ink

Raw student handwriting.

``` ts
type UserStroke = {
  id: string;
  owner: "user";
  type: "stroke";
  points: Array<[number, number]>;
};
```

The tutor must never modify these objects.

------------------------------------------------------------------------

### 5.2 Recognized Math State

Machine-readable interpretation of the user's handwriting.

V0 only needs equation-level recognition.

``` ts
type RecognizedEquation = {
  id: string;
  latex: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  sourceStrokeIds?: string[];
  confidence?: number;
};
```

Example:

``` json
{
  "id": "equation_1",
  "latex": "x^2 + 4x = 12",
  "boundingBox": {
    "x": 120,
    "y": 180,
    "width": 310,
    "height": 70
  }
}
```

V0 does **not** require breaking the equation into individual terms.

Future versions can add:

``` text
equation
  ├── left_side
  ├── right_side
  └── terms
```

------------------------------------------------------------------------

### 5.3 Tutor Annotations

Everything created by the tutor must have tutor ownership.

``` ts
type TutorAnnotation = {
  id: string;
  owner: "tutor";
  type:
    | "latex"
    | "text"
    | "arrow"
    | "circle"
    | "highlight"
    | "line";
  createdAt: number;
};
```

This enables:

``` ts
clearTutorAnnotations();
```

without affecting student work.

------------------------------------------------------------------------

## 6. Canvas Abstraction

Do not expose raw Excalidraw scene mutation to the LLM.

Create a `TutorCanvas` abstraction.

``` ts
interface TutorCanvas {
  getCanvasState(): CanvasState;

  writeLatex(args: WriteLatexArgs): Promise<CanvasResult>;

  writeText(args: WriteTextArgs): Promise<CanvasResult>;

  drawArrow(args: DrawArrowArgs): Promise<CanvasResult>;

  circleRegion(args: RegionArgs): Promise<CanvasResult>;

  highlightRegion(args: RegionArgs): Promise<CanvasResult>;

  clearTutorAnnotations(): Promise<CanvasResult>;
}
```

The implementation may use Excalidraw internally:

``` text
AI Tutor
   │
   │ write_latex(...)
   ▼
TutorCanvas
   │
   │ convert command
   ▼
Excalidraw elements
```

The agent should not know or care that Excalidraw is being used.

------------------------------------------------------------------------

## 7. Agent Canvas Tools

Keep the first tool set intentionally small.

### `get_canvas_state`

Purpose:

Allow the tutor to inspect the current mathematical state.

Input:

``` json
{}
```

Output:

``` json
{
  "equations": [
    {
      "id": "equation_1",
      "latex": "x^2 + 4x = 12",
      "boundingBox": {
        "x": 120,
        "y": 180,
        "width": 310,
        "height": 70
      }
    }
  ],
  "tutorAnnotations": []
}
```

This should return semantic state rather than thousands of raw stroke
coordinates.

------------------------------------------------------------------------

### `write_latex`

Purpose:

Write clean mathematical notation on the board.

Input:

``` json
{
  "latex": "x^2 + 4x - 12 = 0",
  "x": 150,
  "y": 320
}
```

Result:

``` json
{
  "success": true,
  "elementId": "tutor_latex_14"
}
```

The browser should render the LaTeX using KaTeX and place it on/over the
canvas.

------------------------------------------------------------------------

### `write_text`

Purpose:

Add a short explanation or label.

Input:

``` json
{
  "text": "subtract 12 from both sides",
  "x": 420,
  "y": 330
}
```

------------------------------------------------------------------------

### `draw_arrow`

Purpose:

Connect or point to regions.

Input:

``` json
{
  "from": {
    "x": 420,
    "y": 350
  },
  "to": {
    "x": 370,
    "y": 225
  }
}
```

Future version:

``` json
{
  "fromElementId": "tutor_text_4",
  "toElementId": "term_2"
}
```

------------------------------------------------------------------------

### `highlight_region`

Input:

``` json
{
  "x": 120,
  "y": 180,
  "width": 100,
  "height": 70
}
```

------------------------------------------------------------------------

### `circle_region`

Input:

``` json
{
  "x": 330,
  "y": 180,
  "width": 55,
  "height": 70
}
```

------------------------------------------------------------------------

### `clear_tutor_annotations`

Input:

``` json
{}
```

Behavior:

Delete every canvas element where:

``` ts
owner === "tutor"
```

Never delete student strokes.

------------------------------------------------------------------------

## 8. RPC Flow

Canvas actions should execute in the frontend because the browser owns
the canvas.

Example:

``` text
Student:
"Can you show me what I should do next?"

        │
        ▼

OpenAI:
"I'd start by moving 12 to the left."

        │
        ▼

tool call:
write_latex({
  latex: "x^2 + 4x - 12 = 0",
  x: 150,
  y: 320
})

        │
        ▼

LiveKit Agent

        │ frontend RPC
        ▼

React Client

        │
        ▼

TutorCanvas.writeLatex(...)

        │
        ▼

Excalidraw / KaTeX

        │
        ▼

Tutor annotation appears
```

Tool execution should return success/failure so the agent knows whether
the visual action actually occurred.

------------------------------------------------------------------------

## 9. Tutor Context

The tutor should not receive the entire raw canvas on every
conversational turn.

Preferred context:

``` json
{
  "canvas": {
    "equations": [
      {
        "id": "equation_1",
        "latex": "x^2 + 4x = 12"
      }
    ]
  }
}
```

Raw strokes should only be retrieved when a future interaction actually
requires them.

Examples:

-   "What equation did I write?" → semantic state is enough.
-   "How do I solve this?" → semantic state is enough.
-   "Why does my 4 look weird?" → stroke/image data may be useful.
-   "What did I circle?" → selection/geometry information is needed.

------------------------------------------------------------------------

## 10. Agent Instructions

Initial system behavior:

``` text
You are a conversational math tutor working with a student on a shared
whiteboard.

Teach rather than simply giving answers.

Keep spoken responses concise because the student is interacting with you
in real time.

You have tools for reading and annotating the student's canvas.

When a visual explanation would make the concept clearer, use the canvas
tools while explaining.

Never modify or erase student handwriting.

Your annotations are temporary and belong only to you.

Prefer write_latex for mathematical notation.

Use arrows, highlights, circles, and short labels for visual emphasis.

Do not attempt to reproduce mathematical expressions using freehand
drawing when LaTeX is available.

Before referring to something on the student's canvas that is not already
present in your current context, inspect the canvas state.

Do not claim that you drew, highlighted, circled, or wrote something
unless the corresponding tool succeeds.

Ask guiding questions when appropriate instead of immediately completing
the entire problem for the student.
```

------------------------------------------------------------------------

## 11. Example Interaction

Canvas currently contains:

``` text
x² + 4x = 12
```

Student says:

> How do I start this?

Tutor:

> Let's first put everything on one side.

Tool call:

``` json
{
  "tool": "write_latex",
  "arguments": {
    "latex": "x^2 + 4x - 12 = 0",
    "x": 150,
    "y": 320
  }
}
```

Tutor continues:

> I subtracted 12 from both sides. Now, can you think of two numbers
> that multiply to negative 12 and add to 4?

Resulting board:

``` text
STUDENT

x² + 4x = 12


TUTOR

x² + 4x - 12 = 0
```

The tutor did not overwrite or transform the student's equation.

------------------------------------------------------------------------

## 12. Frontend Responsibilities

The frontend owns:

-   microphone access,
-   LiveKit room connection,
-   user canvas,
-   user strokes,
-   recognized math state,
-   tutor annotations,
-   execution of canvas RPC commands,
-   rendering KaTeX,
-   rendering Excalidraw objects,
-   selection state,
-   viewport information.

Suggested structure:

``` text
src/
├── components/
│   ├── Whiteboard.tsx
│   ├── VoiceTutor.tsx
│   └── TutorStatus.tsx
│
├── canvas/
│   ├── TutorCanvas.ts
│   ├── ExcalidrawTutorCanvas.ts
│   ├── types.ts
│   └── rpc.ts
│
├── livekit/
│   ├── session.ts
│   └── clientTools.ts
│
└── recognition/
    ├── websocket.ts
    └── state.ts
```

------------------------------------------------------------------------

## 13. Agent Responsibilities

The LiveKit agent owns:

-   connection to OpenAI,
-   conversational instructions,
-   voice session,
-   tool definitions,
-   forwarding canvas operations to the frontend,
-   deciding when canvas actions improve an explanation,
-   handling tool failures.

Suggested structure:

``` text
agent/
├── main.py
├── tutor.py
├── prompts.py
├── tools/
│   ├── canvas.py
│   └── types.py
└── config.py
```

------------------------------------------------------------------------

## 14. Session State

Maintain lightweight state per tutoring session.

``` python
class TutorSessionState:
    current_equations: list
    active_equation_id: str | None
    last_canvas_revision: int
```

The frontend should increment a canvas revision whenever meaningful
state changes.

Example:

``` json
{
  "revision": 17,
  "equations": [
    {
      "id": "equation_1",
      "latex": "x^2 + 4x = 12"
    }
  ]
}
```

This lets the agent know whether cached canvas context may be stale.

------------------------------------------------------------------------

## 15. Canvas Synchronization Strategy

Do not stream every pointer movement to the agent.

Use event-based synchronization.

``` text
Student draws
      │
      ▼
Local strokes update immediately
      │
      ▼
student pauses / stroke completes
      │
      ▼
recognition runs
      │
      ▼
recognized math state updates
      │
      ▼
canvas revision increments
```

The voice tutor can then retrieve the latest semantic state when needed.

This keeps the voice loop independent from the handwriting-recognition
loop.

------------------------------------------------------------------------

## 16. Failure Handling

### Recognition failure

If no reliable equation is available:

``` json
{
  "equations": [],
  "recognitionStatus": "uncertain"
}
```

Tutor should ask the student to clarify or rewrite rather than inventing
an equation.

### Canvas RPC failure

Example:

``` json
{
  "success": false,
  "error": "canvas_not_ready"
}
```

Tutor should continue verbally and must not claim the visual action
occurred.

### LiveKit disconnect

Frontend should display:

``` text
Tutor disconnected
```

User handwriting must remain functional.

Voice functionality should be treated as an enhancement rather than a
dependency of the canvas.

------------------------------------------------------------------------

## 17. Latency Goals

Prototype targets:

``` text
User stops speaking
        ↓
Tutor begins responding
        ≤ ~1 second target

Tutor requests simple canvas action
        ↓
Annotation appears
        ≤ ~300 ms target
```

These are design targets rather than hard guarantees.

Canvas actions should feel synchronized with the tutor's explanation.

------------------------------------------------------------------------

## 18. Security Rules

Never expose the OpenAI API key in the browser.

Never expose LiveKit server secrets in the browser.

Expected separation:

``` text
Browser
   │
   │ temporary LiveKit credentials
   ▼
LiveKit

Agent server
   │
   ├── LIVEKIT_API_KEY
   ├── LIVEKIT_API_SECRET
   └── OPENAI_API_KEY
```

Use environment variables:

``` text
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
OPENAI_API_KEY=
```

------------------------------------------------------------------------

## 19. V0 Implementation Plan

### Milestone 1 --- Voice only

Goal:

``` text
Browser microphone
      ↓
LiveKit
      ↓
OpenAI Realtime
      ↓
Tutor voice
```

Success condition:

Student can naturally interrupt and converse with the tutor.

No canvas integration yet.

------------------------------------------------------------------------

### Milestone 2 --- One canvas tool

Implement only:

``` text
write_latex
```

Hardcode a button or sample equation initially if necessary.

Test:

Student:

> Show me the quadratic formula.

Tutor calls:

``` text
write_latex(
  "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"
)
```

Success condition:

The equation appears on the whiteboard because of a tutor tool call.

This is the first major proof of concept.

------------------------------------------------------------------------

### Milestone 3 --- Canvas reading

Implement:

``` text
get_canvas_state
```

Connect it to the existing recognition result.

Test canvas:

``` text
x² + 4x = 12
```

Student:

> What equation did I write?

Tutor should answer using recognized canvas state.

------------------------------------------------------------------------

### Milestone 4 --- Visual teaching tools

Add:

``` text
draw_arrow
highlight_region
circle_region
write_text
clear_tutor_annotations
```

Success condition:

Tutor can verbally explain a step while visually emphasizing part of the
board.

------------------------------------------------------------------------

### Milestone 5 --- Tutor behavior

Tune instructions so that the tutor:

-   doesn't overuse tools,
-   doesn't solve everything immediately,
-   asks questions,
-   uses short spoken responses,
-   draws only when useful,
-   waits for student work.

------------------------------------------------------------------------

## 20. Recommended First Vertical Slice

Do **not** begin by implementing every tool.

Build this exact path first:

``` text
1. LiveKit voice conversation works
               ↓
2. Hardcoded canvas:
      x² + 4x = 12
               ↓
3. get_canvas_state()
               ↓
4. Tutor understands equation
               ↓
5. write_latex()
               ↓
6. Tutor writes:
      x² + 4x - 12 = 0
               ↓
7. Tutor verbally asks:
   "What two numbers multiply to -12
    and add to 4?"
```

If that works smoothly, the core architecture is validated.

Everything else is iteration.

------------------------------------------------------------------------

## 21. Future Extensions

After the vertical slice works:

### Semantic regions

``` text
equation_1
├── term_1: x²
├── term_2: 4x
├── operator_1: =
└── term_3: 12
```

Then tools become:

``` text
highlight("term_2")
circle("term_3")
```

instead of coordinate-based operations.

### Student selections

Allow the student to circle/select something and ask:

> Why is this here?

Context:

``` json
{
  "selectedElement": {
    "id": "term_2",
    "latex": "4x"
  }
}
```

### Tutor pointer

Give the tutor a temporary pointer/cursor so it can gesture without
permanently annotating.

### Graphing

Add:

``` text
plot_function
draw_axes
mark_point
```

### Rich visual understanding

Provide screenshots or image input when semantic recognition is
insufficient.

### Course context

Eventually add:

``` text
student curriculum
lesson objectives
course notes
practice history
```

without changing the core canvas tool architecture.

------------------------------------------------------------------------

## 22. Core Design Principles

### Student work is immutable to the tutor

The tutor may annotate around student work but should never silently
alter it.

### Semantic context beats raw stroke context

Use recognized LaTeX for ordinary mathematical reasoning. Retrieve
visual/stroke information only when the student's question requires it.

### High-level tools beat raw drawing

Prefer:

``` text
circle_region(...)
write_latex(...)
draw_arrow(...)
```

over asking an LLM to generate hundreds of coordinate points.

### Voice and canvas are one interaction

The tutor should not behave like a voice chatbot with a disconnected
whiteboard.

Its spoken explanations and canvas actions should reinforce one another.

### Keep V0 small

The prototype exists to validate:

``` text
SEE → REASON → SPEAK → DRAW
```

not to build a complete tutoring platform.
