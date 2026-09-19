"use client";

// Handwriting capture surface.
//
// Responsibilities (frontend "capture side" of the architecture):
//  - capture strokes via Pointer Events (mouse + touch + stylus in one API)
//  - store strokes as {x,y,t} arrays, kept separate from the drawn pixels
//  - render ink live as the user draws
//  - undo (pop last stroke) and clear
//  - retina/high-DPI scaling and smooth rounded line rendering
//  - emit an onStrokesChange event so the parent can debounce + recognize

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Point, Stroke, Strokes } from "@/lib/types";

export interface CanvasHandle {
  undo: () => void;
  clear: () => void;
}

interface CanvasProps {
  /** Fired whenever the stroke set changes (stroke finished, undo, clear). */
  onStrokesChange?: (strokes: Strokes) => void;
  ref?: React.Ref<CanvasHandle>;
  className?: string;
}

const LINE_WIDTH = 2.5;
const STROKE_COLOR = "#171717";
const STROKE_COLOR_DARK = "#ededed";

export default function Canvas({
  onStrokesChange,
  ref,
  className,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const strokesRef = useRef<Strokes>([]);
  const currentRef = useRef<Stroke | null>(null);
  const startTimeRef = useRef<number>(0);
  const [isEmpty, setIsEmpty] = useState(true);

  const strokeColor = useCallback(() => {
    if (typeof window === "undefined") return STROKE_COLOR;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? STROKE_COLOR_DARK
      : STROKE_COLOR;
  }, []);

  // Redraw everything from the stored stroke data (source of truth).
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = strokeColor();
    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke);
    }
  }, [strokeColor]);

  // Size the canvas backing store for the device pixel ratio so ink is crisp.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
    ctxRef.current = ctx;
    redraw();
  }, [redraw]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", redraw);
    return () => {
      window.removeEventListener("resize", resize);
      mq.removeEventListener("change", redraw);
    };
  }, [resize, redraw]);

  const emit = useCallback(() => {
    setIsEmpty(strokesRef.current.length === 0);
    // Emit a shallow copy so consumers can't mutate our source of truth.
    onStrokesChange?.(strokesRef.current.map((s) => [...s]));
  }, [onStrokesChange]);

  const pointFromEvent = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: performance.now() - startTimeRef.current,
    };
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    if (strokesRef.current.length === 0 && !currentRef.current) {
      startTimeRef.current = performance.now();
    }
    const p = pointFromEvent(e);
    currentRef.current = [p];
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = currentRef.current;
    const ctx = ctxRef.current;
    if (!current || !ctx) return;
    e.preventDefault();
    const p = pointFromEvent(e);
    current.push(p);
    // Draw just the latest segment for responsiveness.
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = strokeColor();
    drawStroke(ctx, current);
  };

  const finishStroke = () => {
    const current = currentRef.current;
    if (!current) return;
    currentRef.current = null;
    if (current.length > 0) {
      strokesRef.current.push(current);
      emit(); // stroke finished -> triggers debounced recognition upstream
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      undo() {
        if (strokesRef.current.length === 0) return;
        strokesRef.current.pop();
        redraw();
        emit();
      },
      clear() {
        if (strokesRef.current.length === 0) return;
        strokesRef.current = [];
        currentRef.current = null;
        redraw();
        emit();
      },
    }),
    [redraw, emit],
  );

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        // touch-action:none stops touch-drag from scrolling the page.
        className="h-full w-full touch-none rounded-lg bg-white dark:bg-zinc-900"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        onPointerLeave={finishStroke}
      />
      {isEmpty && (
        <p className="pointer-events-none -mt-[52%] select-none text-center text-sm text-zinc-400 dark:text-zinc-600">
          Write a math expression here
        </p>
      )}
    </div>
  );
}

// Stroke rendering with light quadratic smoothing between sampled points.
function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.length === 0) return;
  ctx.beginPath();
  if (stroke.length === 1) {
    const p = stroke[0];
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
    return;
  }
  ctx.moveTo(stroke[0].x, stroke[0].y);
  for (let i = 1; i < stroke.length - 1; i++) {
    const midX = (stroke[i].x + stroke[i + 1].x) / 2;
    const midY = (stroke[i].y + stroke[i + 1].y) / 2;
    ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, midX, midY);
  }
  const last = stroke[stroke.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}
