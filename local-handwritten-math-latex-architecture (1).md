# Local Real-Time Handwritten Math to LaTeX Architecture

## Overview

The goal is to build a simple local prototype where a user writes math on an online canvas and sees a LaTeX version update in near real time.

At a high level, the system has three parts:

```text
React Frontend
     |
     | WebSocket
     v
Local Backend
     |
     v
Math Recognition Service
     |
     v
LaTeX Result
     |
     +----> Sent back to frontend
```

## Frontend

The frontend is responsible for:

- Displaying the drawing canvas.
- Capturing handwriting as strokes.
- Storing stroke points such as `(x, y)` coordinates.
- Detecting when the user finishes writing a stroke or briefly stops writing.
- Sending the current strokes to the backend through a WebSocket.
- Receiving LaTeX from the backend.
- Rendering the LaTeX using KaTeX or MathJax.

For the first prototype, the entire canvas can be treated as one mathematical expression.

## Backend

The backend runs locally and acts as the coordinator between the frontend and the math recognition system.

Its responsibilities are:

- Maintain the WebSocket connection with the frontend.
- Receive handwriting stroke data.
- Pass the stroke data to the selected math recognition service.
- Receive the recognized LaTeX.
- Send the LaTeX result back to the frontend.

A simple local backend can be built using FastAPI, Node.js, or another framework with WebSocket support.

## Recognition Flow

Recognition should happen after meaningful user activity rather than on a fixed timer.

For example:

```text
User writes
    |
    v
Frontend stores strokes
    |
    v
User finishes a stroke
or stops writing for ~300-500 ms
    |
    v
Frontend sends strokes to backend
    |
    v
Backend sends strokes to recognizer
    |
    v
Recognizer returns LaTeX
    |
    v
Backend sends LaTeX to frontend
    |
    v
Frontend renders live preview
```

## Local Development Setup

For the first version, only two local processes are necessary:

```text
localhost:5173
React + Canvas + KaTeX

localhost:8000
FastAPI / Node WebSocket Server
        +
Math Recognition Integration
```

There is no need for Redis, PostgreSQL, message queues, or multiple backend services at this stage.

## Data Separation

The handwritten strokes and recognized LaTeX should remain separate.

```text
Handwriting Strokes
        +
Recognized LaTeX
```

The recognizer should not directly modify or replace the original handwriting.

This makes it easier to:

- Re-run recognition later.
- Correct recognition mistakes.
- Improve the recognition model without losing the original input.
- Add features such as editing or converting handwriting into typeset math later.

## Initial Prototype Scope

The first prototype should focus only on:

1. Drawing math on a canvas.
2. Capturing the strokes.
3. Sending strokes through a WebSocket.
4. Converting strokes to LaTeX.
5. Sending the LaTeX back to the frontend.
6. Rendering the LaTeX live with KaTeX or MathJax.

More advanced features such as multiple equations, automatic stroke grouping, equation regions, persistence, and collaborative editing can be added later.
