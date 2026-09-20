import { getPaused } from "./support";
import * as store from "./store";
import type { CanvasResult, CanvasState, WriteLatexArgs } from "./types";

// The TutorCanvas abstraction (spec.md section 6): the agent talks to this
// interface and never knows how the board is rendered underneath.
export interface TutorCanvas {
  getCanvasState(): CanvasState;
  writeLatex(args: WriteLatexArgs): Promise<CanvasResult>;
  clearTutorAnnotations(): Promise<CanvasResult>;
}

let _n = 0;

class OverlayTutorCanvas implements TutorCanvas {
  getCanvasState(): CanvasState {
    return store.getCanvasState();
  }

  async writeLatex({ latex, x, y }: WriteLatexArgs): Promise<CanvasResult> {
    if (getPaused()) return { success: false, error: "conversation_paused" };
    if (!latex?.trim() || !Number.isFinite(x) || !Number.isFinite(y)) {
      return { success: false, error: "invalid_args" };
    }
    const id = `tutor_latex_${++_n}_${Date.now().toString(36)}`;
    store.addTutorAnnotation({
      id,
      owner: "tutor",
      type: "latex",
      createdAt: Date.now(),
      latex,
      x,
      y,
    });
    return { success: true, elementId: id };
  }

  async clearTutorAnnotations(): Promise<CanvasResult> {
    store.clearTutorAnnotations();
    return { success: true };
  }
}

/** Process-wide singleton: one whiteboard per browser tab. */
export const tutorCanvas = new OverlayTutorCanvas();
