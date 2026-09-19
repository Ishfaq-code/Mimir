import type { CanvasState, RecognizedEquation, TutorAnnotation } from "./types";

// Seeded recognized equation for the vertical slice (spec.md section 20):
// the student "has written" x² + 4x = 12. Real recognition replaces this
// in a later milestone.
const SEED_EQUATIONS: RecognizedEquation[] = [
  {
    id: "equation_1",
    latex: "x^2 + 4x = 12",
    boundingBox: { x: 120, y: 180, width: 310, height: 70 },
    confidence: 1,
  },
];

let revision = 1;
const equations = SEED_EQUATIONS;
let tutorAnnotations: TutorAnnotation[] = [];

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
  return { revision, equations, tutorAnnotations };
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
