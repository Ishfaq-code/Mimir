"use client";

import { useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import katex from "katex";
import type { Camera } from "@/lib/canvas/types";
import { clearHighlight, getHighlight, subscribeHighlight } from "@/lib/tutor/boardView";
import { useLearningPreferences } from "@/lib/tutor/support";
import { getTutorAnnotations, subscribe, removeTutorAnnotation } from "@/lib/tutor/store";
import { layoutHandwriting } from "@/lib/tutor/handwriting";
import HandwrittenStep from "./HandwrittenStep";

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
  const highlight = useSyncExternalStore(subscribeHighlight, getHighlight, () => null);
  const preferences = useLearningPreferences();
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
      {highlight && preferences.highlights && (
        <div key={highlight.id} className="tutor-focus" style={{ ...place(highlight.bounds.x - 5, highlight.bounds.y - 3), width: Math.max(12, highlight.bounds.width + 10), height: Math.max(12, highlight.bounds.height + 9) }}>
          <span className="tutor-focus-line" />
          <button className="tutor-focus-dismiss" onClick={clearHighlight} aria-label={`Dismiss highlight on ${highlight.label}`} title={highlight.label}>×</button>
        </div>
      )}
      {annotations.map((a) => {
        const drawing = a.template ? layoutHandwriting(a.template) : null;
        return <div key={a.id} className="tutor-scaffold" style={{ ...place(a.x, a.y), color: TUTOR_COLOR }}>
          {drawing ? <HandwrittenStep drawing={drawing} createdAt={a.createdAt} calm={preferences.calm}/> : <Katex latex={a.latex} color={TUTOR_COLOR} />}
          <button className="tutor-scaffold-dismiss" aria-label="Remove tutor step" onClick={() => removeTutorAnnotation(a.id)}>×</button>
        </div>;
      })}
    </div>
  );
}
