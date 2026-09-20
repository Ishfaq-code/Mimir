import type { CanvasState, RecognizedEquation, TutorAnnotation } from "./types";

// The workspace supplies a confirmed screenshot question. No synthetic
// student handwriting is rendered or reported to the tutor.
let revision = 0;
let equations: RecognizedEquation[] = [];
let tutorAnnotations: TutorAnnotation[] = [];
let question: CanvasState["question"] = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

// Getters return stable references between mutations so they can serve
// directly as useSyncExternalStore snapshots.
export function getEquations(): RecognizedEquation[] {
  return equations;
}

export function getTutorAnnotations(): TutorAnnotation[] {
  return tutorAnnotations;
}

export function getCanvasState(): CanvasState {
  return { revision, question, equations, tutorAnnotations };
}

export function addTutorAnnotation(annotation: TutorAnnotation): void {
  tutorAnnotations = [...tutorAnnotations, annotation];
  revision += 1;
  emit();
}

export function clearTutorAnnotations(): void {
  tutorAnnotations = [];
  revision += 1;
  emit();
}

/** Draft OCR is never tutor context. Only the student's confirmed text is used. */
export function setConfirmedQuestion(text: string | null): void {
  question = text ? { text, source: "screenshot", confirmed: true } : null;
  equations = [];
  tutorAnnotations = [];
  revision += 1;
  emit();
}

/** Publish only current recognition results to the voice tutor's canvas view. */
export function setRecognizedWork(equation: RecognizedEquation | null): void {
  equations = equations.filter(item => item.id !== "student-work");
  if (equation) equations = [...equations, equation];
  revision += 1;
  emit();
}
