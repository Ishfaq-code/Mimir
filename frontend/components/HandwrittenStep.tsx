"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { Handwriting } from "@/lib/tutor/handwriting";

export default function HandwrittenStep({ drawing, createdAt, calm, scale = 1, strokeWidth }: { drawing: Handwriting; createdAt: number; calm: boolean; scale?: number; strokeWidth?: number }) {
  const [age] = useState(() => Math.max(0, Date.now() - createdAt));
  const strokeTime = Math.min(110, 2400 / Math.max(1, drawing.paths.length));
  return <svg className="tutor-handwriting" data-calm={calm} width={drawing.width * scale} height={drawing.height * scale}
    viewBox={`0 0 ${drawing.width} ${drawing.height}`} role="img" aria-label={`Tutor step: ${drawing.label}`}>
    <title>{drawing.label}</title>
    <g fill="none" stroke="currentColor" strokeWidth={strokeWidth ? strokeWidth / scale : 2.1} strokeLinecap="round" strokeLinejoin="round">
      {drawing.paths.map((path, i) => <path key={i} d={path.d} transform={`translate(${path.x} ${path.y}) scale(${path.scale})`}
        pathLength="1" className="tutor-pen-stroke" style={{ "--pen-delay": `${i * strokeTime - age}ms`, "--pen-duration": `${strokeTime}ms` } as CSSProperties}/>) }
    </g>
  </svg>;
}
