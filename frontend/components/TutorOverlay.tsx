"use client";

import { useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import katex from "katex";
import type { Camera } from "@/lib/canvas/types";
import { getEquations, getTutorAnnotations, subscribe } from "@/lib/tutor/store";

const EQUATION_COLOR = "var(--ink)"; // renders as if it were student ink
const TUTOR_COLOR = "var(--accent)"; // tutor annotations are visually distinct
const BASE_FONT_SIZE = 34; // px at zoom = 1

function Katex({ latex, color }: { latex: string; color: string }) {
  const html = katex.renderToString(latex, {
    displayMode: false,
    throwOnError: false,
  });
  return (
    <div
      style={{ fontSize: BASE_FONT_SIZE, color, lineHeight: 1.2 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Tutor-owned layer above the canvas: recognized equations + tutor
 * annotations, positioned in world coordinates via the camera. */
export default function TutorOverlay({ camera }: { camera: Camera }) {
  const equations = useSyncExternalStore(subscribe, getEquations, getEquations);
  const annotations = useSyncExternalStore(subscribe, getTutorAnnotations, getTutorAnnotations);

  const place = (wx: number, wy: number): CSSProperties => ({
    position: "absolute",
    left: (wx - camera.x) * camera.zoom,
    top: (wy - camera.y) * camera.zoom,
    transform: `scale(${camera.zoom})`,
    transformOrigin: "top left",
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {equations.map((eq) =>
        eq.boundingBox && eq.id !== "student-work" ? (
          <div key={eq.id} style={place(eq.boundingBox.x, eq.boundingBox.y)}>
            <Katex latex={eq.latex} color={EQUATION_COLOR} />
          </div>
        ) : null,
      )}
      {annotations.map((a) => (
        <div key={a.id} style={place(a.x, a.y)}>
          <Katex latex={a.latex} color={TUTOR_COLOR} />
        </div>
      ))}
    </div>
  );
}
