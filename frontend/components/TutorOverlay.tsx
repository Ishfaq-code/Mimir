"use client";

import { useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import katex from "katex";
import type { Camera } from "@/lib/canvas/types";
import { getTutorAnnotations, subscribe } from "@/lib/tutor/store";

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

/** Tutor-owned layer above the canvas: annotations written by the agent,
 * positioned in world coordinates via the camera. Recognized student math
 * is rendered by the canvas's own LaTeX overlay; the student's ink and the
 * tutor's marks never mix. */
export default function TutorOverlay({ camera }: { camera: Camera }) {
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
      {annotations.map((a) => (
        <div key={a.id} style={place(a.x, a.y)}>
          <Katex latex={a.latex} color={TUTOR_COLOR} />
        </div>
      ))}
    </div>
  );
}
