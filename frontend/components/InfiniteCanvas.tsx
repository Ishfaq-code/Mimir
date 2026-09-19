"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Camera,
  CanvasElement,
  ElementStyle,
  FreedrawElement,
  LinearElement,
  ShapeElement,
  TextElement,
  Tool,
} from "@/lib/canvas/types";
import { DEFAULT_STYLE } from "@/lib/canvas/types";
import { renderScene } from "@/lib/canvas/renderer";
import IslandToolbar from "./IslandToolbar";
import ChatPanel from "./ChatPanel";

// ── helpers (module‑level, no closures) ─────────────────────────────

let _id = 0;
const genId = () => `el_${++_id}_${Date.now().toString(36)}`;

function screenToWorld(sx: number, sy: number, cam: Camera) {
  return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y };
}

function elementBounds(el: CanvasElement) {
  if (el.type === "freedraw" || el.type === "line" || el.type === "arrow") {
    const pts = (el as LinearElement | FreedrawElement).points;
    if (!pts.length) return { x: el.x, y: el.y, w: 0, h: 0 };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [px, py] of pts) {
      if (px < x0) x0 = px;
      if (py < y0) y0 = py;
      if (px > x1) x1 = px;
      if (py > y1) y1 = py;
    }
    return { x: el.x + x0, y: el.y + y0, w: x1 - x0, h: y1 - y0 };
  }
  let { x, y, width: w, height: h } = el;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { x, y, w, h };
}

function hitTest(elements: CanvasElement[], wx: number, wy: number) {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.isDeleted) continue;
    const b = elementBounds(el);
    const pad = Math.max(el.style.strokeWidth * 2, 8);
    if (wx >= b.x - pad && wx <= b.x + b.w + pad && wy >= b.y - pad && wy <= b.y + b.h + pad) {
      return el;
    }
  }
  return null;
}

function cloneElements(els: CanvasElement[]): CanvasElement[] {
  return els.map((el) => {
    const copy = { ...el, style: { ...el.style } };
    if ("points" in el) {
      (copy as any).points = (el as any).points.map((p: [number, number]) => [p[0], p[1]] as [number, number]);
    }
    return copy;
  });
}

// ── interaction action ──────────────────────────────────────────────

type Action =
  | { type: "none" }
  | { type: "drawing" }
  | { type: "panning"; startCam: { x: number; y: number }; startPtr: { x: number; y: number } }
  | { type: "moving"; elementId: string; offset: { x: number; y: number } }
  | { type: "erasing" };

// ── colour / width presets ──────────────────────────────────────────

const STROKE_COLORS = [
  { name: "Black", color: "#1e1e1e" },
  { name: "White", color: "#ffffff" },
  { name: "Red", color: "#e03131" },
  { name: "Orange", color: "#e8590c" },
  { name: "Yellow", color: "#fcc419" },
  { name: "Green", color: "#2f9e44" },
  { name: "Blue", color: "#1971c2" },
  { name: "Purple", color: "#7048e8" },
];
const STROKE_WIDTHS = [1, 2, 4];

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

export default function InfiniteCanvas() {
  // ── refs ────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const elementsRef = useRef<CanvasElement[]>([]);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const selectedRef = useRef<Set<string>>(new Set());
  const toolRef = useRef<Tool>("freedraw");
  const styleRef = useRef<ElementStyle>({ ...DEFAULT_STYLE });
  const darkRef = useRef(false);

  const actionRef = useRef<Action>({ type: "none" });
  const curElRef = useRef<CanvasElement | null>(null);
  const spaceRef = useRef(false);

  const historyRef = useRef<CanvasElement[][]>([[]]);
  const histIdxRef = useRef(0);

  // ── react state (synced for toolbar / overlays) ─────────────────
  const [tool, _setTool] = useState<Tool>("freedraw");
  const [style, _setStyle] = useState<ElementStyle>({ ...DEFAULT_STYLE });
  const [zoom, setZoomUI] = useState(100);
  const [chatOpen, setChatOpen] = useState(false);
  const [editingText, setEditingText] = useState<{ worldX: number; worldY: number; screenX: number; screenY: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const setTool = useCallback((t: Tool) => { toolRef.current = t; _setTool(t); }, []);

  const updateStyle = useCallback((u: Partial<ElementStyle>) => {
    const next = { ...styleRef.current, ...u };
    styleRef.current = next;
    _setStyle(next);
    for (const el of elementsRef.current) {
      if (selectedRef.current.has(el.id) && !el.isDeleted) Object.assign(el.style, u);
    }
    render();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── render ──────────────────────────────────────────────────────
  const render = useCallback(() => {
    const ctx = ctxRef.current;
    const cvs = canvasRef.current;
    if (!ctx || !cvs) return;
    const dpr = window.devicePixelRatio || 1;
    renderScene(ctx, cvs.width / dpr, cvs.height / dpr, elementsRef.current, selectedRef.current, cameraRef.current, darkRef.current);
  }, []);

  // ── history ─────────────────────────────────────────────────────
  const pushHistory = useCallback(() => {
    const h = historyRef.current;
    h.length = histIdxRef.current + 1;
    h.push(cloneElements(elementsRef.current));
    histIdxRef.current = h.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current--;
    elementsRef.current = cloneElements(historyRef.current[histIdxRef.current]);
    selectedRef.current.clear();
    render();
  }, [render]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (histIdxRef.current >= h.length - 1) return;
    histIdxRef.current++;
    elementsRef.current = cloneElements(h[histIdxRef.current]);
    selectedRef.current.clear();
    render();
  }, [render]);

  // ── coordinate helper ───────────────────────────────────────────
  const screenPos = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // ── pointer handlers ────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    selectedRef.current.clear();
    const sp = screenPos(e);
    const cam = cameraRef.current;
    const wp = screenToWorld(sp.x, sp.y, cam);
    const activeTool: Tool = spaceRef.current ? "hand" : toolRef.current;

    if (e.button === 1 || activeTool === "hand") {
      actionRef.current = { type: "panning", startCam: { x: cam.x, y: cam.y }, startPtr: sp };
      return;
    }

    switch (activeTool) {
      case "select": {
        const hit = hitTest(elementsRef.current, wp.x, wp.y);
        if (hit) {
          selectedRef.current = new Set([hit.id]);
          actionRef.current = { type: "moving", elementId: hit.id, offset: { x: hit.x - wp.x, y: hit.y - wp.y } };
        } else {
          selectedRef.current.clear();
          actionRef.current = { type: "none" };
        }
        render();
        break;
      }
      case "rectangle":
      case "ellipse":
      case "diamond": {
        const el: ShapeElement = { id: genId(), type: activeTool, x: wp.x, y: wp.y, width: 0, height: 0, style: { ...styleRef.current }, isDeleted: false };
        elementsRef.current.push(el);
        curElRef.current = el;
        actionRef.current = { type: "drawing" };
        break;
      }
      case "line":
      case "arrow": {
        const el: LinearElement = { id: genId(), type: activeTool, x: wp.x, y: wp.y, width: 0, height: 0, points: [[0, 0], [0, 0]], style: { ...styleRef.current }, isDeleted: false };
        elementsRef.current.push(el);
        curElRef.current = el;
        actionRef.current = { type: "drawing" };
        break;
      }
      case "freedraw": {
        const el: FreedrawElement = { id: genId(), type: "freedraw", x: wp.x, y: wp.y, width: 0, height: 0, points: [[0, 0]], style: { ...styleRef.current }, isDeleted: false };
        elementsRef.current.push(el);
        curElRef.current = el;
        actionRef.current = { type: "drawing" };
        break;
      }
      case "text": {
        setEditingText({ worldX: wp.x, worldY: wp.y, screenX: sp.x, screenY: sp.y });
        break;
      }
      case "eraser": {
        actionRef.current = { type: "erasing" };
        const hit = hitTest(elementsRef.current, wp.x, wp.y);
        if (hit) { hit.isDeleted = true; render(); }
        break;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const act = actionRef.current;
    if (act.type === "none") return;
    const sp = screenPos(e);
    const cam = cameraRef.current;

    if (act.type === "panning") {
      cameraRef.current = {
        ...cam,
        x: act.startCam.x - (sp.x - act.startPtr.x) / cam.zoom,
        y: act.startCam.y - (sp.y - act.startPtr.y) / cam.zoom,
      };
      render();
      return;
    }

    const wp = screenToWorld(sp.x, sp.y, cam);

    if (act.type === "drawing") {
      const el = curElRef.current;
      if (!el) return;
      if (el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond") {
        el.width = wp.x - el.x;
        el.height = wp.y - el.y;
      } else if (el.type === "line" || el.type === "arrow") {
        const pts = (el as LinearElement).points;
        pts[pts.length - 1] = [wp.x - el.x, wp.y - el.y];
      } else if (el.type === "freedraw") {
        (el as FreedrawElement).points.push([wp.x - el.x, wp.y - el.y]);
      }
      render();
    } else if (act.type === "moving") {
      const el = elementsRef.current.find((e) => e.id === act.elementId);
      if (el) { el.x = wp.x + act.offset.x; el.y = wp.y + act.offset.y; render(); }
    } else if (act.type === "erasing") {
      const hit = hitTest(elementsRef.current, wp.x, wp.y);
      if (hit && !hit.isDeleted) { hit.isDeleted = true; render(); }
    }
  };

  const handlePointerUp = () => {
    const act = actionRef.current;

    if (act.type === "drawing") {
      const el = curElRef.current;
      if (el) {
        if (el.type === "rectangle" || el.type === "ellipse" || el.type === "diamond") {
          if (el.width < 0) { el.x += el.width; el.width = -el.width; }
          if (el.height < 0) { el.y += el.height; el.height = -el.height; }
          if (el.width < 2 && el.height < 2) el.isDeleted = true;
        }
        if (el.type === "freedraw") {
          const pts = (el as FreedrawElement).points;
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const [px, py] of pts) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
          el.width = x1 - x0;
          el.height = y1 - y0;
        }
        if (el.type === "line" || el.type === "arrow") {
          const pts = (el as LinearElement).points;
          const dx = pts[1][0] - pts[0][0], dy = pts[1][1] - pts[0][1];
          if (Math.abs(dx) < 2 && Math.abs(dy) < 2) el.isDeleted = true;
        }
        selectedRef.current.clear();
        pushHistory();
        if (el.type !== "freedraw") setTool("freedraw");
      }
      curElRef.current = null;
    }

    if (act.type === "moving" || act.type === "erasing") pushHistory();
    actionRef.current = { type: "none" };
    render();
  };

  // ── text editing ────────────────────────────────────────────────

  const finalizeText = () => {
    const val = textareaRef.current?.value.trim();
    if (!val || !editingText) { setEditingText(null); return; }
    const ctx = ctxRef.current;
    const fontSize = 20;
    let w = 100, h = fontSize * 1.2;
    if (ctx) {
      ctx.save();
      ctx.font = `${fontSize}px sans-serif`;
      const lines = val.split("\n");
      w = Math.max(...lines.map((l) => ctx.measureText(l).width), 10);
      h = lines.length * fontSize * 1.2;
      ctx.restore();
    }
    const el: TextElement = { id: genId(), type: "text", x: editingText.worldX, y: editingText.worldY, width: w, height: h, text: val, fontSize, style: { ...styleRef.current }, isDeleted: false };
    elementsRef.current.push(el);
    pushHistory();
    setEditingText(null);
    setTool("select");
    render();
  };

  // ── effects ─────────────────────────────────────────────────────

  // resize & DPR
  useEffect(() => {
    const resize = () => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const dpr = window.devicePixelRatio || 1;
      const r = cvs.getBoundingClientRect();
      cvs.width = Math.round(r.width * dpr);
      cvs.height = Math.round(r.height * dpr);
      const ctx = cvs.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.current = ctx;
      render();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [render]);

  // wheel (needs { passive: false } for preventDefault)
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      const rect = cvs.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        const wb = screenToWorld(sx, sy, cam);
        const nz = Math.min(10, Math.max(0.1, cam.zoom * Math.max(0.5, Math.min(2, 1 - e.deltaY * 0.002))));
        cameraRef.current = { x: wb.x - sx / nz, y: wb.y - sy / nz, zoom: nz };
        setZoomUI(Math.round(nz * 100));
      } else {
        cameraRef.current = { ...cam, x: cam.x + e.deltaX / cam.zoom, y: cam.y + e.deltaY / cam.zoom };
      }
      render();
    };
    cvs.addEventListener("wheel", onWheel, { passive: false });
    return () => cvs.removeEventListener("wheel", onWheel);
  }, [render]);

  // keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // skip while editing text
      if (editingText) return;
      const k = e.key.toLowerCase();

      if (k === " ") { spaceRef.current = true; e.preventDefault(); return; }

      if (!e.ctrlKey && !e.metaKey) {
        const map: Record<string, Tool> = { p: "freedraw", "1": "freedraw", e: "eraser", "2": "eraser" };
        if (map[k]) { setTool(map[k]); return; }
      }

      if ((k === "delete" || k === "backspace") && selectedRef.current.size) {
        for (const el of elementsRef.current) if (selectedRef.current.has(el.id)) el.isDeleted = true;
        selectedRef.current.clear();
        pushHistory();
        render();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && k === "z" && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); redo(); }
    };
    const up = (e: KeyboardEvent) => { if (e.key === " ") spaceRef.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [editingText, setTool, pushHistory, render, undo, redo]);

  // dark mode
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    darkRef.current = mq.matches;
    updateStyle({ strokeColor: mq.matches ? "#ffffff" : DEFAULT_STYLE.strokeColor });
    const h = (e: MediaQueryListEvent) => { darkRef.current = e.matches; render(); };
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [render, updateStyle]);

  // ── zoom helpers for UI buttons ─────────────────────────────────

  const zoomTo = useCallback((nz: number) => {
    const cam = cameraRef.current;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const r = cvs.getBoundingClientRect();
    const wc = screenToWorld(r.width / 2, r.height / 2, cam);
    cameraRef.current = { x: wc.x - r.width / 2 / nz, y: wc.y - r.height / 2 / nz, zoom: nz };
    setZoomUI(Math.round(nz * 100));
    render();
  }, [render]);

  // ── cursor ──────────────────────────────────────────────────────

  const cursor = (() => {
    if (spaceRef.current) return "grab";
    switch (tool) {
      case "hand": return "grab";
      case "select": return "default";
      case "text": return "text";
      default: return "crosshair";
    }
  })();

  // ── JSX ─────────────────────────────────────────────────────────

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="Drawing canvas"
      />

      {/* ── island toolbar (top centre) ─── */}
      <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
        <IslandToolbar tool={tool} onToolChange={setTool} />
      </div>

      {/* ── style panel (left) ──────────── */}
      <div className="pointer-events-auto absolute left-4 top-20 flex flex-col gap-3 rounded-xl bg-white p-3 shadow-lg ring-1 ring-black/[.06] dark:bg-zinc-800 dark:ring-white/10">
        <div>
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">Stroke</span>
          <div className="flex gap-1">
            {STROKE_COLORS.map(({ name, color: c }) => (
              <button key={c} type="button" title={`${name} ink`} aria-label={`${name} ink`} aria-pressed={style.strokeColor === c} onClick={() => updateStyle({ strokeColor: c })} className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${style.strokeColor === c ? "border-blue-500 scale-110" : "border-zinc-200 dark:border-zinc-600"}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">Width</span>
          <div className="flex gap-1">
            {STROKE_WIDTHS.map((w) => (
              <button key={w} type="button" onClick={() => updateStyle({ strokeWidth: w })} className={`flex h-7 w-9 items-center justify-center rounded-md border text-xs font-medium transition-colors ${style.strokeWidth === w ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"}`}>
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── side buttons (left) ─────── */}
      {!chatOpen && (
        <div className="pointer-events-auto absolute left-4 top-1/2 flex -translate-y-1/2 flex-col gap-2">
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            title="Chat"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg ring-1 ring-black/[.06] transition-colors hover:bg-zinc-50 dark:bg-zinc-800 dark:ring-white/10 dark:hover:bg-zinc-700"
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 dark:text-zinc-300">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            title="AI Assistant"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg ring-1 ring-black/[.06] transition-colors hover:bg-zinc-50 dark:bg-zinc-800 dark:ring-white/10 dark:hover:bg-zinc-700"
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="text-violet-500">
              <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74z" />
            </svg>
          </button>
        </div>
      )}

      {/* ── chat panel (left drawer) ──── */}
      {chatOpen && (
        <div className="pointer-events-auto absolute bottom-0 left-0 top-0">
          <ChatPanel onClose={() => setChatOpen(false)} />
        </div>
      )}

      {/* ── zoom controls (bottom‑left) ── */}
      <div className="pointer-events-auto absolute bottom-4 left-4 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-zinc-600 shadow ring-1 ring-black/5 backdrop-blur dark:bg-zinc-800/90 dark:text-zinc-300 dark:ring-white/10">
        <button type="button" onClick={() => zoomTo(Math.max(0.1, cameraRef.current.zoom / 1.25))} className="px-1 hover:text-black dark:hover:text-white">−</button>
        <button type="button" onClick={() => zoomTo(1)} className="w-12 text-center hover:text-black dark:hover:text-white">{zoom}%</button>
        <button type="button" onClick={() => zoomTo(Math.min(10, cameraRef.current.zoom * 1.25))} className="px-1 hover:text-black dark:hover:text-white">+</button>
      </div>

      {/* ── text input overlay ──────────── */}
      {editingText && (
        <textarea
          ref={textareaRef}
          className="absolute resize-none border-2 border-blue-500 bg-transparent p-1 outline-none"
          style={{
            left: editingText.screenX,
            top: editingText.screenY,
            fontSize: `${20 * cameraRef.current.zoom}px`,
            lineHeight: "1.2",
            color: styleRef.current.strokeColor,
            minWidth: 40,
            minHeight: 28,
          }}
          autoFocus
          onBlur={finalizeText}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditingText(null);
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); finalizeText(); }
          }}
        />
      )}
    </div>
  );
}
