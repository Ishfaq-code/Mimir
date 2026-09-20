// Canvas data model for the voice tutor (spec.md section 5).

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Machine-readable interpretation of the student's handwriting. */
export interface RecognizedEquation {
  id: string;
  latex: string;
  boundingBox?: BoundingBox;
  sourceStrokeIds?: string[];
  confidence?: number;
}

/** Anything the tutor draws. `owner: "tutor"` lets us clear it without
 * ever touching student work. More variants arrive with the visual
 * teaching tools milestone (text, arrow, circle, highlight). */
export interface TutorLatexAnnotation {
  id: string;
  owner: "tutor";
  type: "latex";
  createdAt: number;
  latex: string;
  x: number;
  y: number;
}

export type TutorAnnotation = TutorLatexAnnotation;

export interface CanvasState {
  revision: number;
  question: { text: string; source: "screenshot"; confirmed: true } | null;
  equations: RecognizedEquation[];
  tutorAnnotations: TutorAnnotation[];
  /** Lifecycle of the recognition pipeline (spec.md section 16):
   * "idle" nothing recognized yet, "recognizing" in flight,
   * "ok" fresh result available, "uncertain" last attempt failed. */
  recognitionStatus: "idle" | "recognizing" | "ok" | "uncertain";
}

export interface CanvasResult {
  success: boolean;
  elementId?: string;
  error?: string;
}

export interface WriteLatexArgs {
  latex: string;
  x: number;
  y: number;
}
