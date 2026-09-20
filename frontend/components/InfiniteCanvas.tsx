"use client";

/* This canvas intentionally keeps its hot interaction state in refs. */
/* eslint-disable react-hooks/refs */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
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
import { DEFAULT_STYLE, pointXY } from "@/lib/canvas/types";
import { renderScene } from "@/lib/canvas/renderer";
import IslandToolbar from "./IslandToolbar";
import Icon from "./Icon";
import { setRecognizedWork } from "@/lib/tutor/store";
import TutorOverlay from "./TutorOverlay";


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
    for (const p of pts) {
      const [px, py] = pointXY(p);
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
    if ("points" in el && "points" in copy) {
      copy.points = el.points.map((p) =>
        Array.isArray(p) ? ([p[0], p[1]] as [number, number]) : { ...p },
      ) as typeof copy.points;
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

interface LatexOverlay {
  latex: string;
  bounds: { x: number; y: number; w: number; h: number };
}

interface RecognitionPoint {
  x: number;
  y: number;
  t: number;
  p: number;
  pointerType: string;
}

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

interface InfiniteCanvasProps {
  dark: boolean;
  initialElements: CanvasElement[];
  onSceneChange: (elements: CanvasElement[]) => void;
}

export default function InfiniteCanvas({ dark, initialElements, onSceneChange }: InfiniteCanvasProps) {
  // ── refs ────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const elementsRef = useRef<CanvasElement[]>(cloneElements(initialElements));
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const selectedRef = useRef<Set<string>>(new Set());
  const toolRef = useRef<Tool>("freedraw");
  const styleRef = useRef<ElementStyle>({ ...DEFAULT_STYLE, strokeColor: dark ? "#ffffff" : DEFAULT_STYLE.strokeColor });
  const darkRef = useRef(dark);
  const activePointerRef = useRef<number | null>(null);

  const actionRef = useRef<Action>({ type: "none" });
  const curElRef = useRef<CanvasElement | null>(null);
  const spaceRef = useRef(false);

  const historyRef = useRef<CanvasElement[][]>([cloneElements(initialElements)]);
  const histIdxRef = useRef(0);
  const hiddenMathIdsRef = useRef<Set<string>>(new Set());
  const recognitionSocketRef = useRef<WebSocket | null>(null);
  const recognitionConnectRef = useRef<Promise<WebSocket> | null>(null);
  const recognitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRequestRef = useRef(0);
  const recognitionStrokesRef = useRef<Record<string, RecognitionPoint[]>>({});

  // ── react state (synced for toolbar / overlays) ─────────────────
  const [tool, _setTool] = useState<Tool>("freedraw");
  const [style, _setStyle] = useState<ElementStyle>({ ...DEFAULT_STYLE, strokeColor: dark ? "#ffffff" : DEFAULT_STYLE.strokeColor });
  const [zoom, setZoomUI] = useState(100);
  const [hasInk, setHasInk] = useState(initialElements.some(el => !el.isDeleted));
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [recognitionError, setRecognitionError] = useState(false);
  const [latexEnabled, setLatexEnabled] = useState(false);
  const [latexOverlay, setLatexOverlay] = useState<LatexOverlay | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [overlayVersion, setOverlayVersion] = useState(0);
  const [overlayCamera, setOverlayCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [editingText, setEditingText] = useState<{ worldX: number; worldY: number; screenX: number; screenY: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const setTool = useCallback((t: Tool) => { toolRef.current = t; _setTool(t); }, []);

  // ── render ──────────────────────────────────────────────────────
  const render = useCallback(() => {
    const ctx = ctxRef.current;
    const cvs = canvasRef.current;
    if (!ctx || !cvs) return;
    const dpr = window.devicePixelRatio || 1;
    renderScene(ctx, cvs.width / dpr, cvs.height / dpr, elementsRef.current, selectedRef.current, cameraRef.current, darkRef.current, hiddenMathIdsRef.current);
  }, []);

  const updateStyle = useCallback((u: Partial<ElementStyle>) => {
    const next = { ...styleRef.current, ...u };
    styleRef.current = next;
    _setStyle(next);
    for (const el of elementsRef.current) {
      if (selectedRef.current.has(el.id) && !el.isDeleted) Object.assign(el.style, u);
    }
    render();
  }, [render]);

  const currentMathBounds = useCallback(() => {
    const math = elementsRef.current.filter((el): el is FreedrawElement => el.type === "freedraw" && !el.isDeleted);
    if (math.length === 0) return null;
    let x = Infinity, y = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of math) {
      const bounds = elementBounds(el);
      x = Math.min(x, bounds.x);
      y = Math.min(y, bounds.y);
      x1 = Math.max(x1, bounds.x + bounds.w);
      y1 = Math.max(y1, bounds.y + bounds.h);
    }
    return { x, y, w: Math.max(x1 - x, 1), h: Math.max(y1 - y, 1) };
  }, []);

  const clearRecognition = useCallback(() => {
    if (recognitionTimerRef.current) clearTimeout(recognitionTimerRef.current);
    recognitionRequestRef.current += 1;
    hiddenMathIdsRef.current.clear();
    setLatexOverlay(null);
    setRecognizing(false);
    setRecognitionError(false);
    setRecognizedWork(null);
    render();
  }, [render]);

  const receiveRecognition = useCallback((event: MessageEvent<string>) => {
    let message: { type?: string; requestId?: string; latex?: string; error?: string };
    try {
      message = JSON.parse(event.data);
    } catch {
      setRecognizing(false);
      return;
    }
    if (message.type === "error" && !message.requestId) {
      setRecognizing(false);
      setRecognitionError(true);
      return;
    }
    if (message.requestId !== String(recognitionRequestRef.current)) return;
    setRecognizing(false);
    if (message.type === "error" || !message.latex) { setRecognitionError(true); return; }
    const bounds = currentMathBounds();
    if (!bounds) return;
    hiddenMathIdsRef.current = new Set(
      elementsRef.current
        .filter((el) => el.type === "freedraw" && !el.isDeleted)
        .map((el) => el.id),
    );
    setLatexOverlay({ latex: message.latex, bounds });
    setRecognizedWork({ id: "student-work", latex: message.latex,
      boundingBox: { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h },
      sourceStrokeIds: [...hiddenMathIdsRef.current],
    });
    render();
  }, [currentMathBounds, render]);

  const connectRecognition = useCallback((): Promise<WebSocket> => {
    const existing = recognitionSocketRef.current;
    if (existing?.readyState === WebSocket.OPEN) return Promise.resolve(existing);
    if (recognitionConnectRef.current) return recognitionConnectRef.current;

    const configuredUrl = process.env.NEXT_PUBLIC_RECOGNIZER_WS_URL;
    const url = configuredUrl ?? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8000/ws/latex`;
    recognitionConnectRef.current = new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.onopen = () => {
        recognitionSocketRef.current = socket;
        recognitionConnectRef.current = null;
        resolve(socket);
      };
      socket.onmessage = receiveRecognition;
      socket.onerror = () => {
        recognitionConnectRef.current = null;
        setRecognizing(false);
        setRecognitionError(true);
        reject(new Error("Recognition WebSocket connection failed"));
      };
      socket.onclose = () => {
        if (recognitionSocketRef.current === socket) recognitionSocketRef.current = null;
        recognitionConnectRef.current = null;
        setRecognizing(false);
      };
    });
    return recognitionConnectRef.current;
  }, [receiveRecognition]);

  const scheduleRecognition = useCallback(() => {
    if (recognitionTimerRef.current) clearTimeout(recognitionTimerRef.current);
    recognitionRequestRef.current += 1;
    const requestId = String(recognitionRequestRef.current);
    if (!latexEnabled) return;
    const strokes = elementsRef.current
      .filter((el): el is FreedrawElement => el.type === "freedraw" && !el.isDeleted)
      .map((el) => recognitionStrokesRef.current[el.id] ?? el.points.map((p): RecognitionPoint => ({
        x: el.x + p.x,
        y: el.y + p.y,
        t: p.t,
        p: 0.5,
        pointerType: "mouse",
      })));
    if (strokes.length === 0) return;
    setRecognizing(true);
    recognitionTimerRef.current = setTimeout(() => {
      void connectRecognition()
        .then((socket) => { if (requestId === String(recognitionRequestRef.current)) socket.send(JSON.stringify({ requestId, strokes })); })
        .catch(() => { setRecognizing(false); setRecognitionError(true); });
    }, 600);
  }, [connectRecognition, latexEnabled]);

  const toggleLatex = useCallback(() => {
    if (latexEnabled) clearRecognition();
    setLatexEnabled((enabled) => !enabled);
  }, [clearRecognition, latexEnabled]);

  useEffect(() => () => {
    recognitionRequestRef.current += 1;
    if (recognitionSocketRef.current) recognitionSocketRef.current.onmessage = null;
    if (recognitionTimerRef.current) clearTimeout(recognitionTimerRef.current);
    recognitionSocketRef.current?.close();
  }, []);

  useEffect(() => {
    if (!latexEnabled) {
      recognitionSocketRef.current?.close();
      return;
    }
    scheduleRecognition();
  }, [latexEnabled, scheduleRecognition]);

  const syncScene = useCallback(() => {
    setHasInk(elementsRef.current.some(el => !el.isDeleted));
    setHistoryState({ canUndo: histIdxRef.current > 0, canRedo: histIdxRef.current < historyRef.current.length - 1 });
    onSceneChange(cloneElements(elementsRef.current));
  }, [onSceneChange]);

  // ── history ─────────────────────────────────────────────────────
  const pushHistory = useCallback(() => {
    const h = historyRef.current;
    h.length = histIdxRef.current + 1;
    h.push(cloneElements(elementsRef.current));
    histIdxRef.current = h.length - 1;
    syncScene();
  }, [syncScene]);

  const undo = useCallback(() => {
    if (histIdxRef.current <= 0) return;
    histIdxRef.current--;
    elementsRef.current = cloneElements(historyRef.current[histIdxRef.current]);
    selectedRef.current.clear();
    recognitionRequestRef.current += 1;
    hiddenMathIdsRef.current.clear();
    setLatexOverlay(null);
    setRecognizedWork(null);
    syncScene();
    render();
  }, [render, syncScene]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (histIdxRef.current >= h.length - 1) return;
    histIdxRef.current++;
    elementsRef.current = cloneElements(h[histIdxRef.current]);
    selectedRef.current.clear();
    recognitionRequestRef.current += 1;
    hiddenMathIdsRef.current.clear();
    setLatexOverlay(null);
    setRecognizedWork(null);
    syncScene();
    render();
  }, [render, syncScene]);

  // ── coordinate helper ───────────────────────────────────────────
  const screenPos = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // ── pointer handlers ────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== null || (e.button !== 0 && e.button !== 1)) return;
    activePointerRef.current = e.pointerId;
    canvasRef.current?.setPointerCapture(e.pointerId);
    selectedRef.current.clear();
    const sp = screenPos(e);
    const cam = cameraRef.current;
    const wp = screenToWorld(sp.x, sp.y, cam);
    const activeTool: Tool = spaceRef.current ? "hand" : toolRef.current;

    if (e.button === 1 || activeTool === "hand" || e.pointerType === "touch") {
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
        clearRecognition();
        const el: FreedrawElement = { id: genId(), type: "freedraw", x: wp.x, y: wp.y, width: 0, height: 0, points: [{ x: 0, y: 0, t: performance.now() }], style: { ...styleRef.current }, isDeleted: false };
        elementsRef.current.push(el);
        recognitionStrokesRef.current[el.id] = [{
          x: wp.x,
          y: wp.y,
          t: Date.now(),
          p: e.pressure > 0 ? e.pressure : 0.5,
          pointerType: e.pointerType || "mouse",
        }];
        curElRef.current = el;
        actionRef.current = { type: "drawing" };
        break;
      }
      case "text": {
        setEditingText({ worldX: wp.x, worldY: wp.y, screenX: sp.x, screenY: sp.y });
        break;
      }
      case "eraser": {
        clearRecognition();
        actionRef.current = { type: "erasing" };
        const hit = hitTest(elementsRef.current, wp.x, wp.y);
        if (hit) { hit.isDeleted = true; render(); }
        break;
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== activePointerRef.current) return;
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
      setOverlayCamera(cameraRef.current);
      setOverlayVersion((version) => version + 1);
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
        (el as FreedrawElement).points.push({ x: wp.x - el.x, y: wp.y - el.y, t: performance.now() });
        const recognitionStroke = recognitionStrokesRef.current[el.id];
        recognitionStroke?.push({
          x: wp.x,
          y: wp.y,
          t: Date.now(),
          p: e.pressure > 0 ? e.pressure : 0.5,
          pointerType: e.pointerType || "mouse",
        });
      }
      render();
    } else if (act.type === "moving") {
      const el = elementsRef.current.find((e) => e.id === act.elementId);
      if (el) { el.x = wp.x + act.offset.x; el.y = wp.y + act.offset.y; setOverlayVersion((version) => version + 1); render(); }
    } else if (act.type === "erasing") {
      const hit = hitTest(elementsRef.current, wp.x, wp.y);
      if (hit && !hit.isDeleted) { hit.isDeleted = true; render(); }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== activePointerRef.current) return;
    activePointerRef.current = null;
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
          for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
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
      if (el?.type === "freedraw" && !el.isDeleted) scheduleRecognition();
    }

    if (act.type === "moving" || act.type === "erasing") pushHistory();
    actionRef.current = { type: "none" };
    setOverlayVersion((version) => version + 1);
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
    const observer = new ResizeObserver(resize);
    if (canvasRef.current) observer.observe(canvasRef.current);
    window.addEventListener("resize", resize);
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
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
      setOverlayCamera(cameraRef.current);
      render();
    };
    cvs.addEventListener("wheel", onWheel, { passive: false });
    return () => cvs.removeEventListener("wheel", onWheel);
  }, [render]);

  // keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // skip while editing text
      if (editingText || (e.target instanceof Element && e.target.closest("input, textarea, select, button, [contenteditable=true]"))) return;
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

  // Theme changes update the next neutral pen color, never stored ink.
  useEffect(() => {
    const oldDefault = darkRef.current ? "#ffffff" : DEFAULT_STYLE.strokeColor;
    darkRef.current = dark;
    if (styleRef.current.strokeColor === oldDefault) {
      updateStyle({ strokeColor: dark ? "#ffffff" : DEFAULT_STYLE.strokeColor });
    }
    render();
  }, [dark, render, updateStyle]);

  // ── zoom helpers for UI buttons ─────────────────────────────────

  const zoomTo = useCallback((nz: number) => {
    const cam = cameraRef.current;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const r = cvs.getBoundingClientRect();
    const wc = screenToWorld(r.width / 2, r.height / 2, cam);
    cameraRef.current = { x: wc.x - r.width / 2 / nz, y: wc.y - r.height / 2 / nz, zoom: nz };
    setOverlayCamera(cameraRef.current);
    setZoomUI(Math.round(nz * 100));
    render();
  }, [render]);

  const renderedLatex = useMemo(() => {
    if (!latexOverlay?.latex) return null;
    return katex.renderToString(latexOverlay.latex, {
      displayMode: true,
      throwOnError: false,
      output: "html",
    });
  }, [latexOverlay]);

  const latexPosition = latexOverlay
      ? {
        left: (latexOverlay.bounds.x - overlayCamera.x) * overlayCamera.zoom,
        top: (latexOverlay.bounds.y - overlayCamera.y) * overlayCamera.zoom,
        minWidth: Math.max(48, latexOverlay.bounds.w * overlayCamera.zoom),
        minHeight: Math.max(32, latexOverlay.bounds.h * overlayCamera.zoom),
      }
    : undefined;
  void overlayVersion;

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
    <div className="canvas-stage">
      <canvas
        ref={canvasRef}
        className="drawing-surface"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="Drawing canvas"
      />

      {renderedLatex && latexPosition && (
        <div
          className="recognized-math"
          style={latexPosition}
          dangerouslySetInnerHTML={{ __html: renderedLatex }}
        />
      )}

      {/* ── tutor layer (recognized math + tutor annotations) ─── */}
      <TutorOverlay camera={overlayCamera} />

      {!hasInk && <div className="canvas-empty"><div className="empty-ink-mark"><svg viewBox="0 0 92 34" fill="none" aria-hidden="true"><path d="M4 25C18 5 29 3 24 18s-14 13-9 5S38 7 42 13s-11 18-8 11S50 6 56 12s-10 17-5 12S66 9 72 16s5 9 16-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg></div><h2>Start with what you know.</h2><p>Your pencil, your pace. There’s room to figure it out.</p></div>}

      <div className="canvas-topline"><span className="canvas-label"><span className="small-dot"/>YOUR WORKSPACE</span><button type="button" role="switch" aria-label="Typeset handwriting" aria-checked={latexEnabled} onClick={toggleLatex} className={`latex-toggle ${latexEnabled ? "is-on" : ""}`}><span className="math-symbol">ƒ</span><span>{recognizing ? "Reading your math…" : "Typeset math"}</span><span className="switch-track"><span/></span></button></div>
      {recognitionError && <div className="recognition-notice" role="status">Couldn’t convert that yet. Your handwriting is safe.<button onClick={scheduleRecognition}>Try again</button></div>}

      <IslandToolbar tool={tool} onToolChange={setTool} style={style} onStyleChange={updateStyle} onUndo={undo} onRedo={redo} canUndo={historyState.canUndo} canRedo={historyState.canRedo}/>
      <div className="canvas-footer"><span className="navigation-tip">Space + drag to move <span>·</span> Finger to pan</span><div className="zoom-controls"><button className="icon-button" type="button" onClick={() => zoomTo(Math.max(0.1, cameraRef.current.zoom / 1.25))} aria-label="Zoom out"><Icon name="minus" size={16}/></button><button className="zoom-percentage" type="button" onClick={() => zoomTo(1)} aria-label="Reset zoom to 100 percent">{zoom}%</button><button className="icon-button" type="button" onClick={() => zoomTo(Math.min(10, cameraRef.current.zoom * 1.25))} aria-label="Zoom in"><Icon name="plus" size={16}/></button></div></div>

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
