// Core data model for handwriting capture.
//
// Strokes are kept as structured coordinate data (NOT canvas pixels) so the
// recognizer receives geometry, the original ink can be re-recognized later,
// and features like undo can operate on whole strokes.

/** A single sampled point along a stroke. `t` is ms since the stroke pipeline
 *  started, which stroke-based recognizers (e.g. Mathpix) can use. */
export interface Point {
  x: number;
  y: number;
  t: number;
}

/** One continuous pen-down -> pen-up gesture. */
export type Stroke = Point[];

/** The full set of strokes currently on the canvas = one expression (v1). */
export type Strokes = Stroke[];

/** Result of a recognition pass. */
export interface RecognitionResult {
  latex: string;
  /** Optional confidence in [0,1] if the recognizer reports it. */
  confidence?: number;
}
