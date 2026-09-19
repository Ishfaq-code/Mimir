// Recognizer abstraction: strokes in, LaTeX out.
//
// The rest of the app talks to this interface only, so the actual engine
// (mock / backend WebSocket / a future local model) can be swapped without
// touching the canvas or preview. Frontend-only for now: the default is a
// mock so the pipeline runs end-to-end with no backend. Set
// NEXT_PUBLIC_RECOGNIZER_WS_URL to route to a real backend later.

import type { RecognitionResult, Strokes } from "./types";

export interface Recognizer {
  /** Convert the current strokes into LaTeX. */
  recognize(strokes: Strokes): Promise<RecognitionResult>;
  /** Human-readable name for UI/status. */
  readonly name: string;
}

/**
 * Placeholder recognizer. Does NOT actually read handwriting — it returns a
 * sample equation chosen from stroke count so the live-preview loop is visibly
 * working before a real engine is wired in. Swap for the WebSocket recognizer
 * (backend) or a local model without changing any UI code.
 */
export class MockRecognizer implements Recognizer {
  readonly name = "mock";

  private readonly samples = [
    "x^2 + 1",
    "\\frac{a}{b}",
    "\\sqrt{x + y}",
    "\\sum_{i=1}^{n} i",
    "\\int_0^1 x^2\\,dx",
    "e^{i\\pi} + 1 = 0",
    "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
  ];

  async recognize(strokes: Strokes): Promise<RecognitionResult> {
    // Simulate a little async latency so loading states are exercised.
    await new Promise((r) => setTimeout(r, 120));
    if (strokes.length === 0) return { latex: "" };
    const latex = this.samples[(strokes.length - 1) % this.samples.length];
    return { latex, confidence: 0.5 };
  }
}

/**
 * Talks to a backend recognizer over a WebSocket. Sends `{ strokes }` as JSON
 * and expects `{ latex, confidence? }` back. One request in flight at a time,
 * which matches the debounced send pattern. Reconnects lazily on demand.
 *
 * NOTE: no backend endpoint exists yet — this is ready for when one does.
 */
export class WebSocketRecognizer implements Recognizer {
  readonly name = "websocket";

  private ws: WebSocket | null = null;
  private pending: {
    resolve: (r: RecognitionResult) => void;
    reject: (e: Error) => void;
  } | null = null;

  constructor(private readonly url: string) {}

  private connect(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(this.ws);
    }
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.onopen = () => {
        this.ws = ws;
        resolve(ws);
      };
      ws.onerror = () => reject(new Error("WebSocket connection failed"));
      ws.onclose = () => {
        this.ws = null;
        if (this.pending) {
          this.pending.reject(new Error("WebSocket closed"));
          this.pending = null;
        }
      };
      ws.onmessage = (event) => {
        if (!this.pending) return;
        const { resolve: res, reject: rej } = this.pending;
        this.pending = null;
        try {
          const data = JSON.parse(event.data as string) as RecognitionResult;
          res({ latex: data.latex ?? "", confidence: data.confidence });
        } catch {
          rej(new Error("Malformed recognizer response"));
        }
      };
    });
  }

  async recognize(strokes: Strokes): Promise<RecognitionResult> {
    if (strokes.length === 0) return { latex: "" };
    const ws = await this.connect();
    return new Promise<RecognitionResult>((resolve, reject) => {
      // Drop any earlier in-flight request; only the latest matters.
      if (this.pending) this.pending.reject(new Error("Superseded"));
      this.pending = { resolve, reject };
      ws.send(JSON.stringify({ strokes }));
    });
  }
}

let cached: Recognizer | null = null;

/** Returns the configured recognizer (WebSocket if a URL is set, else mock). */
export function getRecognizer(): Recognizer {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_RECOGNIZER_WS_URL;
  cached = url ? new WebSocketRecognizer(url) : new MockRecognizer();
  return cached;
}
