"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Camera } from "@/lib/canvas/types";
import {
  latexToExpr,
  extractVariables,
  computeCurve,
} from "@/lib/graph/evaluate";
import Icon from "./Icon";

export interface GraphInstance {
  id: string;
  latex: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sourceOverlayId: string;
}

interface GraphOverlayProps {
  graph: GraphInstance;
  camera: Camera;
  dark: boolean;
  onClose: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
}

// ── math viewport ─────────────────────────────────────────────────

interface MathViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

const DEFAULT_VIEWPORT: MathViewport = {
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
};

const TRACE_DURATION = 1500;
const CURVE_STEPS = 300;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

// ── nice tick interval ────────────────────────────────────────────

function niceStep(range: number, maxTicks: number): number {
  const rough = range / maxTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  if (norm <= 1) return mag;
  if (norm <= 2) return 2 * mag;
  if (norm <= 5) return 5 * mag;
  return 10 * mag;
}

// ── canvas drawing ────────────────────────────────────────────────

function drawGraph(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  vp: MathViewport,
  points: ([number, number] | null)[],
  progress: number,
  dark: boolean,
) {
  const padX = 24;
  const padTop = 16;
  const padBot = 32;
  const plotW = w - padX * 2;
  const plotH = h - padTop - padBot;
  const xRange = vp.xMax - vp.xMin;
  const yRange = vp.yMax - vp.yMin;

  const toScreenX = (x: number) => padX + ((x - vp.xMin) / xRange) * plotW;
  const toScreenY = (y: number) => padTop + ((vp.yMax - y) / yRange) * plotH;

  // Background
  ctx.clearRect(0, 0, w, h);

  // Grid
  const gridColor = dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
  const axisColor = dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)";
  const labelColor = dark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)";

  const xStep = niceStep(xRange, Math.max(4, Math.floor(plotW / 60)));
  const yStep = niceStep(yRange, Math.max(4, Math.floor(plotH / 60)));

  ctx.lineWidth = 1;
  ctx.strokeStyle = gridColor;
  ctx.beginPath();

  const xStart = Math.ceil(vp.xMin / xStep) * xStep;
  for (let x = xStart; x <= vp.xMax; x += xStep) {
    const sx = Math.round(toScreenX(x)) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
  }
  const yStart = Math.ceil(vp.yMin / yStep) * yStep;
  for (let y = yStart; y <= vp.yMax; y += yStep) {
    const sy = Math.round(toScreenY(y)) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
  }
  ctx.stroke();

  // Axes
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (vp.xMin <= 0 && vp.xMax >= 0) {
    const sx = Math.round(toScreenX(0)) + 0.5;
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
  }
  if (vp.yMin <= 0 && vp.yMax >= 0) {
    const sy = Math.round(toScreenY(0)) + 0.5;
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
  }
  ctx.stroke();

  // Tick labels
  ctx.fillStyle = labelColor;
  ctx.font = `${Math.max(9, Math.min(11, w / 40))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const zeroY = toScreenY(0);
  const labelY = Math.min(Math.max(zeroY + 4, 2), h - 12);
  for (let x = xStart; x <= vp.xMax; x += xStep) {
    if (Math.abs(x) < xStep * 0.01) continue;
    const label = Number.isInteger(x) ? String(x) : x.toFixed(1);
    ctx.fillText(label, toScreenX(x), labelY);
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  const zeroX = toScreenX(0);
  const labelX = Math.min(Math.max(zeroX - 4, 24), w - 4);
  for (let y = yStart; y <= vp.yMax; y += yStep) {
    if (Math.abs(y) < yStep * 0.01) continue;
    const label = Number.isInteger(y) ? String(y) : y.toFixed(1);
    ctx.fillText(label, labelX, toScreenY(y));
  }

  // Curve
  const curveColor = dark ? "#5eead4" : "#0d9488";
  ctx.strokeStyle = curveColor;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Determine how many points to draw based on animation progress
  const drawCount = Math.ceil(points.length * progress);

  ctx.beginPath();
  let drawing = false;
  for (let i = 0; i < drawCount; i++) {
    const p = points[i];
    if (!p) {
      drawing = false;
      continue;
    }
    const sx = toScreenX(p[0]);
    const sy = toScreenY(p[1]);
    // Clip to visible area (with some margin)
    if (sy < -100 || sy > h + 100) {
      drawing = false;
      continue;
    }
    if (!drawing) {
      ctx.moveTo(sx, sy);
      drawing = true;
    } else {
      ctx.lineTo(sx, sy);
    }
  }
  ctx.stroke();
}

// ══════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════

export default function GraphOverlay({
  graph,
  camera,
  dark,
  onClose,
  onMove,
  onResize,
}: GraphOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<MathViewport>(() => {
    try {
      const expression = latexToExpr(graph.latex);
      const variables = Object.fromEntries(extractVariables(expression).map(name => [name, 1]));
       const initialPoints = computeCurve(expression, variables, DEFAULT_VIEWPORT.xMin, DEFAULT_VIEWPORT.xMax, CURVE_STEPS);
       const values = initialPoints
         .filter((point): point is [number, number] => point !== null && Math.abs(point[1]) < 10000)
         .map(point => point[1]);
      if (!values.length) return DEFAULT_VIEWPORT;
      const min = Math.min(...values), max = Math.max(...values);
      const padding = Math.max(1, (max - min) * 0.15);
      return { ...DEFAULT_VIEWPORT, yMin: min - padding, yMax: max + padding };
    } catch {
      return DEFAULT_VIEWPORT;
    }
  });
  const [ready, setReady] = useState(false);
  const progressRef = useRef(0);
  const animIdRef = useRef<number | undefined>(undefined);

  // Parse expression and extract slider variables once
  const parsed = useMemo(() => {
    try {
      const e = latexToExpr(graph.latex);
      return { expr: e, error: false };
    } catch {
      return { expr: "", error: true };
    }
  }, [graph.latex]);
  const expr = parsed.expr;
  const sliderVars = useMemo(() => (parsed.error ? [] : extractVariables(expr)), [expr, parsed.error]);
  const [sliderValues, setSliderValues] = useState<Record<string, number>>(
    () => Object.fromEntries(sliderVars.map((v) => [v, 1])),
  );
  const effectiveSliderValues = useMemo(
    () => Object.fromEntries(sliderVars.map((name) => [name, sliderValues[name] ?? 1])),
    [sliderVars, sliderValues],
  );

  // Screen-space position and size
  const left = (graph.x - camera.x) * camera.zoom;
  const top = (graph.y - camera.y) * camera.zoom;
  const width = graph.w * camera.zoom;
  const height = graph.h * camera.zoom;

  const sliderBarHeight = sliderVars.length > 0 ? 40 : 0;
  const headerHeight = 34;
  const canvasH = Math.max(40, height - headerHeight - sliderBarHeight);

  // Compute curve points
  const points = useMemo(() => {
    if (parsed.error || !expr) return [];
    try {
      return computeCurve(expr, effectiveSliderValues, viewport.xMin, viewport.xMax, CURVE_STEPS, {
        yMin: viewport.yMin,
        yMax: viewport.yMax,
      });
    } catch {
      return [];
    }
  }, [expr, parsed.error, effectiveSliderValues, viewport.xMin, viewport.xMax, viewport.yMin, viewport.yMax]);

  // Store latest draw inputs in refs so the animation loop and redraw
  // always read current values without restarting the animation.
  const drawStateRef = useRef({ viewport, points, dark });
  useEffect(() => { drawStateRef.current = { viewport, points, dark }; }, [viewport, points, dark]);

  const redraw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cvs.clientWidth;
    const h = cvs.clientHeight;
    if (w === 0 || h === 0) return;
    cvs.width = Math.round(w * dpr);
    cvs.height = Math.round(h * dpr);
    const ctx = cvs.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const st = drawStateRef.current;
    drawGraph(ctx, w, h, st.viewport, st.points, progressRef.current, st.dark);
  }, []);

  // Trace-in animation — runs once on mount, never restarts
  useEffect(() => {
    progressRef.current = 0;
    const start = performance.now();

    const animate = (now: number) => {
      if (progressRef.current === 0) setReady(true);
      const elapsed = now - start;
      progressRef.current = Math.min(1, easeOutCubic(Math.min(1, elapsed / TRACE_DURATION)));
      redraw();
      if (progressRef.current < 1) {
        animIdRef.current = requestAnimationFrame(animate);
      }
    };
    animIdRef.current = requestAnimationFrame(animate);
    return () => {
      if (animIdRef.current !== undefined) cancelAnimationFrame(animIdRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw when data changes (viewport, points, dark, size) without restarting animation
  useEffect(() => {
    if (progressRef.current >= 1) redraw();
  }, [viewport, points, dark, width, height, redraw]);

  // Scroll to zoom, Shift+scroll to pan — native listener so preventDefault works
  const containerRef = useRef<HTMLDivElement>(null);
  const wheelStateRef = useRef({ graphW: graph.w, graphH: graph.h, cameraZoom: camera.zoom });
  useEffect(() => {
    wheelStateRef.current = { graphW: graph.w, graphH: graph.h, cameraZoom: camera.zoom };
  }, [graph.w, graph.h, camera.zoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const { graphW, graphH, cameraZoom } = wheelStateRef.current;
      setViewport((v) => {
        if (e.shiftKey) {
          const xRange = v.xMax - v.xMin;
          const yRange = v.yMax - v.yMin;
          const dx = (e.deltaY / (graphW * cameraZoom)) * xRange;
          const dy = (e.deltaX / (graphH * cameraZoom)) * yRange;
          return { xMin: v.xMin + dx, xMax: v.xMax + dx, yMin: v.yMin + dy, yMax: v.yMax + dy };
        }
        const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
        const cx = (v.xMin + v.xMax) / 2;
        const cy = (v.yMin + v.yMax) / 2;
        const hw = ((v.xMax - v.xMin) / 2) * factor;
        const hh = ((v.yMax - v.yMin) / 2) * factor;
        return { xMin: cx - hw, xMax: cx + hw, yMin: cy - hh, yMax: cy + hh };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Drag to move
  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = graph.x;
      const origY = graph.y;
      const onPointerMove = (ev: PointerEvent) => {
        onMove(graph.id, origX + (ev.clientX - startX) / camera.zoom, origY + (ev.clientY - startY) / camera.zoom);
      };
      const onPointerUp = () => {
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", onPointerUp);
      };
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
    },
    [graph.id, graph.x, graph.y, camera.zoom, onMove],
  );

  // Drag to resize
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const origW = graph.w;
      const origH = graph.h;
      const onPointerMove = (ev: PointerEvent) => {
        onResize(graph.id, Math.max(200, origW + (ev.clientX - startX) / camera.zoom), Math.max(150, origH + (ev.clientY - startY) / camera.zoom));
      };
      const onPointerUp = () => {
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", onPointerUp);
      };
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
    },
    [graph.id, graph.w, graph.h, camera.zoom, onResize],
  );

  const updateSlider = useCallback((varName: string, value: number) => {
    setSliderValues((prev) => ({ ...prev, [varName]: value }));
  }, []);

  return (
    <div
      ref={containerRef}
      className={`graph-overlay ${ready ? "graph-overlay-visible" : ""}`}
      style={{ left, top, width, height }}
    >
      <div className="graph-overlay-header" onPointerDown={handleDragStart}>
        <span className="graph-overlay-title">Graph</span>
        <button
          className="icon-button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Close graph"
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="graph-canvas"
        style={{ width: "100%", height: canvasH }}
      />

      {sliderVars.length > 0 && (
        <div className="graph-slider-bar">
          {sliderVars.map((v) => (
            <label key={v} className="graph-slider">
              <span>{v} = {(sliderValues[v] ?? 1).toFixed(1)}</span>
              <input
                type="range"
                min={-10}
                max={10}
                step={0.1}
                value={sliderValues[v] ?? 1}
                onChange={(e) => updateSlider(v, parseFloat(e.target.value))}
              />
            </label>
          ))}
        </div>
      )}

      <div className="graph-resize-handle" onPointerDown={handleResizeStart} />
    </div>
  );
}
