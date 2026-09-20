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
import { renderScene, type CanvasScreenshot } from "@/lib/canvas/renderer";
import type { Screenshot } from "@/lib/screenshot";
import {
  clearRecognizedEquations,
  getEquations,
  setRecognizedEquations,
  setRecognitionStatus,
} from "@/lib/tutor/store";
import IslandToolbar from "./IslandToolbar";
import Icon from "./Icon";
import TutorOverlay from "./TutorOverlay";
import CanvasTextEditor, { type TextDraft } from "./CanvasTextEditor";


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

const SCREENSHOT_ID = "__screenshot__";

function screenshotBounds(screenshot: CanvasScreenshot) {
  return { x: screenshot.x, y: screenshot.y, w: screenshot.width, h: screenshot.height };
}

function pointInBounds(point: { x: number; y: number }, bounds: { x: number; y: number; w: number; h: number }, pad = 0) {
  return point.x >= bounds.x - pad && point.x <= bounds.x + bounds.w + pad && point.y >= bounds.y - pad && point.y <= bounds.y + bounds.h + pad;
}

function normalizedRect(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

type ResizeHandle = "nw" | "ne" | "sw" | "se";

function resizeBounds(start: { x: number; y: number; w: number; h: number }, handle: ResizeHandle, pointer: { x: number; y: number }, keepRatio: boolean) {
  let left = start.x;
  let right = start.x + start.w;
  let top = start.y;
  let bottom = start.y + start.h;
  if (handle.includes("w")) left = pointer.x;
  if (handle.includes("e")) right = pointer.x;
  if (handle.includes("n")) top = pointer.y;
  if (handle.includes("s")) bottom = pointer.y;
  if (keepRatio && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    const width = Math.max(2, Math.abs(right - left));
    const height = width / ratio;
    if (handle.includes("n")) top = bottom - height;
    else bottom = top + height;
  }
  return { x: Math.min(left, right), y: Math.min(top, bottom), w: Math.max(2, Math.abs(right - left)), h: Math.max(2, Math.abs(bottom - top)) };
}

function resizeHandleAt(point: { x: number; y: number }, bounds: { x: number; y: number; w: number; h: number }, tolerance: number): ResizeHandle | null {
  const handles: [ResizeHandle, number, number][] = [
    ["nw", bounds.x, bounds.y], ["ne", bounds.x + bounds.w, bounds.y],
    ["sw", bounds.x, bounds.y + bounds.h], ["se", bounds.x + bounds.w, bounds.y + bounds.h],
  ];
  return handles.find(([, x, y]) => Math.abs(point.x - x) <= tolerance && Math.abs(point.y - y) <= tolerance)?.[0] ?? null;
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
  | { type: "moving"; elementIds: string[]; offsets: Record<string, { x: number; y: number }>; startPointer: { x: number; y: number }; screenshotOffset: { x: number; y: number } | null; overlayBounds: Record<string, { x: number; y: number; w: number; h: number }> }
  | { type: "resizing"; target: string; handle: ResizeHandle; startBounds: { x: number; y: number; w: number; h: number }; startElement: CanvasElement | null }
  | { type: "marquee"; start: { x: number; y: number }; additive: boolean; initialIds: string[]; initialScreenshot: boolean }
  | { type: "erasing" };

interface LatexOverlay {
  id: string;
  strokeIds: string[];
  latex: string;
  bounds: { x: number; y: number; w: number; h: number };
  strokeWidth: number;
  color: string;
}

interface RecognitionPoint {
  x: number;
  y: number;
  t: number;
  p: number;
  pointerType: string;
}

function normalizeLatex(value: string) {
  let latex = value.trim()
    .replace(/^```(?:latex|tex)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const wrappers: RegExp[] = [
    /^\$\$([\s\S]*)\$\$$/,
    /^\$([\s\S]*)\$$/,
    /^\\\(([\s\S]*)\\\)$/,
    /^\\\[([\s\S]*)\\\]$/,
  ];
  for (const wrapper of wrappers) {
    const match = latex.match(wrapper);
    if (match) {
      latex = match[1].trim();
      break;
    }
  }

  latex = latex
    .replace(/\\begin\{(?:equation|equation\*|math|displaymath)\}/g, "")
    .replace(/\\end\{(?:equation|equation\*|math|displaymath)\}/g, "")
    .replace(/[\u2212]/g, "-")
    .replace(/[\u00d7]/g, "\\times")
    .replace(/[\u00f7]/g, "\\div")
    .replace(/[\u2264]/g, "\\leq")
    .replace(/[\u2265]/g, "\\geq")
    .replace(/\s+/g, " ")
    .trim();

  return latex;
}

// ── colour / width presets ──────────────────────────────────────────

const RECOGNITION_PAUSE_MS = Number(process.env.NEXT_PUBLIC_RECOGNITION_PAUSE_MS ?? 2000);

// ═══════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════

interface InfiniteCanvasProps {
  dark: boolean;
  screenshot: Screenshot | null;
}

export default function InfiniteCanvas({ dark, screenshot }: InfiniteCanvasProps) {
  // ── refs ────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const elementsRef = useRef<CanvasElement[]>([]);
  const screenshotRef = useRef<CanvasScreenshot | null>(null);
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });
  const selectedRef = useRef<Set<string>>(new Set());
  const selectedScreenshotRef = useRef(false);
  const marqueeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const toolRef = useRef<Tool>("freedraw");
  const styleRef = useRef<ElementStyle>({ ...DEFAULT_STYLE, strokeColor: dark ? "#ffffff" : DEFAULT_STYLE.strokeColor });
  const darkRef = useRef(dark);
  const activePointerRef = useRef<number | null>(null);

  const actionRef = useRef<Action>({ type: "none" });
  const curElRef = useRef<CanvasElement | null>(null);
  const spaceRef = useRef(false);

  const historyRef = useRef<CanvasElement[][]>([[]]);
  const histIdxRef = useRef(0);
  const hiddenMathIdsRef = useRef<Set<string>>(new Set());
  const recognitionSocketRef = useRef<WebSocket | null>(null);
  const recognitionConnectRef = useRef<Promise<WebSocket> | null>(null);
  const recognitionSessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRecognitionStrokesRef = useRef<Set<string>>(new Set());
  const recognitionRequestRef = useRef(0);
  const recognitionRequestStrokesRef = useRef<Record<string, string[]>>({});
  const recognitionStrokesRef = useRef<Record<string, RecognitionPoint[]>>({});

  // ── react state (synced for toolbar / overlays) ─────────────────
  const [tool, _setTool] = useState<Tool>("freedraw");
  const [style, _setStyle] = useState<ElementStyle>({ ...DEFAULT_STYLE, strokeColor: dark ? "#ffffff" : DEFAULT_STYLE.strokeColor });
  const [zoom, setZoomUI] = useState(100);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [recognitionError, setRecognitionError] = useState(false);
  const [latexEnabled, setLatexEnabled] = useState(false);
  const [latexOverlays, setLatexOverlays] = useState<Record<string, LatexOverlay>>({});
  const latexOverlaysRef = useRef<Record<string, LatexOverlay>>({});
  const [recognizing, setRecognizing] = useState(false);
  const [overlayVersion, setOverlayVersion] = useState(0);
  const [overlayCamera, setOverlayCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [editingText, setEditingText] = useState<TextDraft | null>(null);
  const textDraftRef = useRef<TextDraft | null>(null);

  const setTool = useCallback((t: Tool) => { toolRef.current = t; _setTool(t); }, []);

  // ── render ──────────────────────────────────────────────────────
  const render = useCallback(() => {
    const ctx = ctxRef.current;
    const cvs = canvasRef.current;
    if (!ctx || !cvs) return;
    const dpr = window.devicePixelRatio || 1;
    const hiddenIds = new Set(hiddenMathIdsRef.current);
    if (textDraftRef.current?.elementId) hiddenIds.add(textDraftRef.current.elementId);
    const selectedLatexBounds = Object.values(latexOverlaysRef.current)
      .filter((overlay) => overlay.strokeIds.some((id) => selectedRef.current.has(id)))
      .map((overlay) => overlay.bounds);
    renderScene(ctx, cvs.width / dpr, cvs.height / dpr, elementsRef.current, selectedRef.current, cameraRef.current, darkRef.current, hiddenIds, screenshotRef.current, selectedScreenshotRef.current, marqueeRef.current, selectedLatexBounds);
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

  const clearRecognition = useCallback(() => {
    recognitionRequestRef.current += 1;
    if (recognitionSessionTimerRef.current) clearTimeout(recognitionSessionTimerRef.current);
    recognitionSessionTimerRef.current = null;
    pendingRecognitionStrokesRef.current.clear();
    recognitionRequestStrokesRef.current = {};
    hiddenMathIdsRef.current.clear();
    latexOverlaysRef.current = {};
    setLatexOverlays({});
    setRecognizing(false);
    setRecognitionError(false);
    clearRecognizedEquations();
    render();
  }, [render]);

  const removeLatexOverlays = useCallback((strokeIds: string[]) => {
    const removed = new Set(strokeIds);
    const next = Object.fromEntries(Object.entries(latexOverlaysRef.current).filter(([, overlay]) => !overlay.strokeIds.some((strokeId) => removed.has(strokeId))));
    if (Object.keys(next).length === Object.keys(latexOverlaysRef.current).length) return;
    latexOverlaysRef.current = next;
    setLatexOverlays(next);
  }, []);

  const receiveRecognition = useCallback((event: MessageEvent<string>) => {
    let message: { type?: string; requestId?: string; strokeId?: string; strokeIds?: string[]; latex?: string; error?: string };
    try {
      message = JSON.parse(event.data);
    } catch {
      setRecognizing(false);
      return;
    }
    if (message.type === "error" && !message.requestId) {
      setRecognizing(false);
      setRecognitionError(true);
      setRecognitionStatus("uncertain");
      return;
    }
    const requestId = message.requestId ?? "";
    const strokeIds = message.strokeIds ?? (message.strokeId ? [message.strokeId] : recognitionRequestStrokesRef.current[requestId]);
    if (!strokeIds?.length) return;
    delete recognitionRequestStrokesRef.current[requestId];
    setRecognizing(false);
    if (message.type === "error" || !message.latex) {
      setRecognitionError(true);
      setRecognitionStatus("uncertain");
      return;
    }
    const elements = elementsRef.current.filter((el): el is FreedrawElement => strokeIds.includes(el.id) && el.type === "freedraw" && !el.isDeleted);
    if (!elements.length) return;
    const bounds = elements.reduce((combined, element) => {
      const current = elementBounds(element);
      const x = Math.min(combined.x, current.x);
      const y = Math.min(combined.y, current.y);
      const x1 = Math.max(combined.x + combined.w, current.x + current.w);
      const y1 = Math.max(combined.y + combined.h, current.y + current.h);
      return { x, y, w: x1 - x, h: y1 - y };
    }, elementBounds(elements[0]));
    const latex = normalizeLatex(message.latex);
    if (!latex) return;
    for (const strokeId of strokeIds) hiddenMathIdsRef.current.add(strokeId);
    const overlay: LatexOverlay = {
      id: requestId,
      strokeIds,
      latex,
      bounds,
      strokeWidth: Math.max(...elements.map((element) => element.style.strokeWidth)),
      color: elements[0].style.strokeColor,
    };
    latexOverlaysRef.current = { ...latexOverlaysRef.current, [requestId]: overlay };
    setLatexOverlays((previous) => ({
      ...previous,
      [requestId]: overlay,
    }));
    setRecognitionError(false);
    const equation = {
      id: `student-work-${requestId}`,
      latex,
      boundingBox: { x: bounds.x, y: bounds.y, width: bounds.w, height: bounds.h },
      sourceStrokeIds: strokeIds,
    };
    setRecognizedEquations([
      ...getEquations().filter((item) =>
        item.id !== "practice-problem" && item.id !== equation.id
      ),
      equation,
    ]);
    render();
  }, [render]);

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

  const sendRecognition = useCallback((strokeIds: string[]) => {
    const strokes = strokeIds.map((strokeId) => {
      const element = elementsRef.current.find((el): el is FreedrawElement => el.id === strokeId && el.type === "freedraw" && !el.isDeleted);
      if (!element) return null;
      return recognitionStrokesRef.current[strokeId] ?? element.points.map((p): RecognitionPoint => ({
          x: element.x + p.x,
          y: element.y + p.y,
          t: p.t,
          p: 0.5,
          pointerType: "mouse",
        }));
    }).filter((stroke): stroke is RecognitionPoint[] => Boolean(stroke?.length));
    if (!strokes.length) return;
    recognitionRequestRef.current += 1;
    const requestId = String(recognitionRequestRef.current);
    recognitionRequestStrokesRef.current[requestId] = strokeIds;
    setRecognizing(true);
    setRecognitionStatus("recognizing");
    void connectRecognition()
      .then((socket) => socket.send(JSON.stringify({ requestId, strokeIds, strokes })))
      .catch(() => {
        setRecognizing(false);
        setRecognitionError(true);
        setRecognitionStatus("uncertain");
      });
  }, [connectRecognition]);

  const scheduleRecognition = useCallback((strokeId: string) => {
    if (!latexEnabled) return;
    pendingRecognitionStrokesRef.current.add(strokeId);
    if (recognitionSessionTimerRef.current) clearTimeout(recognitionSessionTimerRef.current);
    recognitionSessionTimerRef.current = setTimeout(() => {
      recognitionSessionTimerRef.current = null;
      const strokeIds = [...pendingRecognitionStrokesRef.current];
      pendingRecognitionStrokesRef.current.clear();
      const unrecognizedStrokeIds = strokeIds.filter((strokeId) => !hiddenMathIdsRef.current.has(strokeId));
      if (unrecognizedStrokeIds.length) sendRecognition(unrecognizedStrokeIds);
    }, RECOGNITION_PAUSE_MS);
  }, [latexEnabled, sendRecognition]);

  const retryRecognition = useCallback(() => {
    setRecognitionError(false);
    const strokeIds = elementsRef.current
      .filter((el): el is FreedrawElement => el.type === "freedraw" && !el.isDeleted)
      .filter((el) => !hiddenMathIdsRef.current.has(el.id))
      .map((el) => el.id);
    if (strokeIds.length) sendRecognition(strokeIds);
  }, [sendRecognition]);

  const toggleLatex = useCallback(() => {
    if (latexEnabled) clearRecognition();
    setLatexEnabled((enabled) => !enabled);
  }, [clearRecognition, latexEnabled]);

  useEffect(() => () => {
    recognitionRequestRef.current += 1;
    if (recognitionSocketRef.current) recognitionSocketRef.current.onmessage = null;
    if (recognitionSessionTimerRef.current) clearTimeout(recognitionSessionTimerRef.current);
    recognitionSocketRef.current?.close();
  }, []);

  useEffect(() => {
    if (!latexEnabled) {
      recognitionSocketRef.current?.close();
      return;
    }
    elementsRef.current
      .filter((el): el is FreedrawElement => el.type === "freedraw" && !el.isDeleted)
      .filter((el) => !hiddenMathIdsRef.current.has(el.id))
      .forEach((el) => scheduleRecognition(el.id));
  }, [latexEnabled, scheduleRecognition]);

  const syncScene = useCallback(() => {
    setHistoryState({ canUndo: histIdxRef.current > 0, canRedo: histIdxRef.current < historyRef.current.length - 1 });
  }, []);

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
    latexOverlaysRef.current = {};
    setLatexOverlays({});
    clearRecognizedEquations();
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
    latexOverlaysRef.current = {};
    setLatexOverlays({});
    clearRecognizedEquations();
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
    const sp = screenPos(e);
    const cam = cameraRef.current;
    const wp = screenToWorld(sp.x, sp.y, cam);
    const activeTool: Tool = spaceRef.current ? "hand" : toolRef.current;

    if (activeTool === "select" && e.button === 0) {
      const tolerance = 10 / cam.zoom;
      const selectedElement = elementsRef.current.find((el) => selectedRef.current.has(el.id) && !el.isDeleted && resizeHandleAt(wp, elementBounds(el), tolerance));
      const selectedScreenshot = screenshotRef.current && selectedScreenshotRef.current ? resizeHandleAt(wp, screenshotBounds(screenshotRef.current), tolerance) : null;
      const resizeTarget = selectedScreenshot ? SCREENSHOT_ID : selectedElement?.id;
      const resizeHandle = selectedScreenshot ?? (selectedElement ? resizeHandleAt(wp, elementBounds(selectedElement), tolerance) : null);
      if (resizeTarget && resizeHandle) {
        const bounds = resizeTarget === SCREENSHOT_ID ? screenshotBounds(screenshotRef.current!) : elementBounds(selectedElement!);
        actionRef.current = { type: "resizing", target: resizeTarget, handle: resizeHandle, startBounds: bounds, startElement: selectedElement ? cloneElements([selectedElement])[0] : null };
        return;
      }

      const latexHit = Object.values(latexOverlaysRef.current).reverse().find((overlay) => pointInBounds(wp, overlay.bounds, tolerance));
      const hit = latexHit ? null : hitTest(elementsRef.current, wp.x, wp.y);
      const screenshotHit = !hit && !latexHit && screenshotRef.current && pointInBounds(wp, screenshotBounds(screenshotRef.current), tolerance);
      if (hit || latexHit || screenshotHit) {
        const hitIds = latexHit?.strokeIds ?? (hit ? [hit.id] : []);
        const id = hitIds[0] ?? SCREENSHOT_ID;
        const alreadySelected = id === SCREENSHOT_ID
          ? selectedScreenshotRef.current
          : hitIds.every((hitId) => selectedRef.current.has(hitId));
        if (e.shiftKey) {
          if (id === SCREENSHOT_ID) selectedScreenshotRef.current = !alreadySelected;
          else if (alreadySelected) hitIds.forEach((hitId) => selectedRef.current.delete(hitId));
          else hitIds.forEach((hitId) => selectedRef.current.add(hitId));
        } else if (!alreadySelected) {
          selectedRef.current.clear();
          selectedScreenshotRef.current = false;
          if (id === SCREENSHOT_ID) selectedScreenshotRef.current = true;
          else hitIds.forEach((hitId) => selectedRef.current.add(hitId));
        }

        if ((id === SCREENSHOT_ID && selectedScreenshotRef.current) || (id !== SCREENSHOT_ID && hitIds.some((hitId) => selectedRef.current.has(hitId)))) {
          const offsets: Record<string, { x: number; y: number }> = {};
          for (const element of elementsRef.current) {
            if (selectedRef.current.has(element.id)) offsets[element.id] = { x: element.x - wp.x, y: element.y - wp.y };
          }
          const overlayBounds: Record<string, { x: number; y: number; w: number; h: number }> = {};
          for (const overlay of Object.values(latexOverlaysRef.current)) {
            if (overlay.strokeIds.some((strokeId) => selectedRef.current.has(strokeId))) overlayBounds[overlay.id] = { ...overlay.bounds };
          }
          actionRef.current = {
            type: "moving",
            elementIds: [...selectedRef.current],
            offsets,
            startPointer: { ...wp },
            screenshotOffset: selectedScreenshotRef.current && screenshotRef.current ? { x: screenshotRef.current.x - wp.x, y: screenshotRef.current.y - wp.y } : null,
            overlayBounds,
          };
        } else {
          actionRef.current = { type: "none" };
        }
        render();
        return;
      }

      if (!e.shiftKey) {
        selectedRef.current.clear();
        selectedScreenshotRef.current = false;
      }
      marqueeRef.current = { x: sp.x, y: sp.y, w: 0, h: 0 };
      actionRef.current = { type: "marquee", start: wp, additive: e.shiftKey, initialIds: [...selectedRef.current], initialScreenshot: selectedScreenshotRef.current };
      render();
      return;
    }

    if (activeTool !== "select") {
      selectedRef.current.clear();
      selectedScreenshotRef.current = false;
    }

    if (e.button === 1 || activeTool === "hand" || (e.pointerType === "touch" && activeTool !== "text")) {
      actionRef.current = { type: "panning", startCam: { x: cam.x, y: cam.y }, startPtr: sp };
      return;
    }

    switch (activeTool) {
      case "select": {
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
        e.preventDefault();
        const hit = hitTest(elementsRef.current, wp.x, wp.y);
        const existing = hit?.type === "text" ? hit : null;
        const draft: TextDraft = {
          key: genId(), elementId: existing?.id,
          x: existing?.x ?? wp.x, y: existing?.y ?? wp.y,
          text: existing?.text ?? "", color: existing?.style.strokeColor ?? styleRef.current.strokeColor,
          fontSize: existing?.fontSize ?? 20,
        };
        textDraftRef.current = draft;
        setEditingText(draft);
        actionRef.current = { type: "none" };
        render();
        break;
      }
      case "eraser": {
        clearRecognition();
        actionRef.current = { type: "erasing" };
        const hit = hitTest(elementsRef.current, wp.x, wp.y);
        if (hit) { hit.isDeleted = true; removeLatexOverlays([hit.id]); render(); }
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
      elementsRef.current = elementsRef.current.map((element) => {
        const offset = act.offsets[element.id];
        return offset ? { ...element, x: wp.x + offset.x, y: wp.y + offset.y } : element;
      });
      if (act.screenshotOffset && screenshotRef.current) {
        screenshotRef.current.x = wp.x + act.screenshotOffset.x;
        screenshotRef.current.y = wp.y + act.screenshotOffset.y;
      }
      const deltaX = wp.x - act.startPointer.x;
      const deltaY = wp.y - act.startPointer.y;
      if (Object.keys(act.overlayBounds).length) {
        const nextOverlays = { ...latexOverlaysRef.current };
        for (const [overlayId, bounds] of Object.entries(act.overlayBounds)) {
          const overlay = nextOverlays[overlayId];
          if (overlay) overlay.bounds = { ...bounds, x: bounds.x + deltaX, y: bounds.y + deltaY };
        }
        latexOverlaysRef.current = nextOverlays;
        setLatexOverlays(nextOverlays);
      }
      setOverlayVersion((version) => version + 1);
      render();
    } else if (act.type === "resizing") {
      const next = resizeBounds(act.startBounds, act.handle, wp, e.shiftKey);
      if (act.target === SCREENSHOT_ID && screenshotRef.current) {
        Object.assign(screenshotRef.current, next);
      } else {
        const element = elementsRef.current.find((item) => item.id === act.target);
        const original = act.startElement;
        if (element && original) {
          let replacement: CanvasElement;
          if (original.type === "freedraw" || original.type === "line" || original.type === "arrow") {
            const originalBounds = elementBounds(original);
            const sx = originalBounds.w ? next.w / originalBounds.w : 1;
            const sy = originalBounds.h ? next.h / originalBounds.h : 1;
            const points = original.points.map((point) => {
              const [px, py] = pointXY(point);
              const worldX = original.x + px;
              const worldY = original.y + py;
              const nextPoint = [
                (worldX - originalBounds.x) * sx,
                (worldY - originalBounds.y) * sy,
              ] as [number, number];
              return Array.isArray(point) ? nextPoint : { x: nextPoint[0], y: nextPoint[1], t: point.t };
            }) as typeof original.points;
            replacement = { ...element, x: next.x, y: next.y, width: next.w, height: next.h, points } as CanvasElement;
          } else {
            replacement = { ...element, ...next } as CanvasElement;
          }
          elementsRef.current = elementsRef.current.map((item) => item.id === element.id ? replacement : item);
          const nextOverlays = { ...latexOverlaysRef.current };
          for (const overlay of Object.values(nextOverlays)) {
            if (!overlay.strokeIds.includes(element.id)) continue;
            const sourceElements = elementsRef.current.filter((item): item is FreedrawElement => overlay.strokeIds.includes(item.id) && item.type === "freedraw" && !item.isDeleted);
            if (!sourceElements.length) continue;
            const nextBounds = sourceElements.reduce((combined, source) => {
              const current = elementBounds(source);
              const x = Math.min(combined.x, current.x);
              const y = Math.min(combined.y, current.y);
              const x1 = Math.max(combined.x + combined.w, current.x + current.w);
              const y1 = Math.max(combined.y + combined.h, current.y + current.h);
              return { x, y, w: x1 - x, h: y1 - y };
            }, elementBounds(sourceElements[0]));
            nextOverlays[overlay.id] = { ...overlay, bounds: nextBounds };
          }
          latexOverlaysRef.current = nextOverlays;
          setLatexOverlays(nextOverlays);
        }
      }
      render();
    } else if (act.type === "marquee") {
      const rect = normalizedRect(act.start, wp);
      marqueeRef.current = {
        x: (rect.x - cam.x) * cam.zoom,
        y: (rect.y - cam.y) * cam.zoom,
        w: rect.w * cam.zoom,
        h: rect.h * cam.zoom,
      };
      selectedRef.current = new Set(act.initialIds);
      selectedScreenshotRef.current = act.initialScreenshot;
      for (const element of elementsRef.current) {
        if (!element.isDeleted && overlaps(elementBounds(element), rect)) selectedRef.current.add(element.id);
      }
      for (const overlay of Object.values(latexOverlaysRef.current)) {
        if (overlaps(overlay.bounds, rect)) overlay.strokeIds.forEach((strokeId) => selectedRef.current.add(strokeId));
      }
      if (screenshotRef.current && overlaps(screenshotBounds(screenshotRef.current), rect)) selectedScreenshotRef.current = true;
      render();
    } else if (act.type === "erasing") {
      const hit = hitTest(elementsRef.current, wp.x, wp.y);
      if (hit && !hit.isDeleted) { hit.isDeleted = true; removeLatexOverlays([hit.id]); render(); }
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
      if (el?.type === "freedraw" && !el.isDeleted) scheduleRecognition(el.id);
    }

    if (act.type === "moving" || act.type === "erasing" || (act.type === "resizing" && act.target !== SCREENSHOT_ID)) pushHistory();
    if (act.type === "marquee") marqueeRef.current = null;
    actionRef.current = { type: "none" };
    setOverlayVersion((version) => version + 1);
    render();
  };

  // ── text editing ────────────────────────────────────────────────

  const cancelText = useCallback((key: string) => {
    if (textDraftRef.current?.key !== key) return;
    textDraftRef.current = null;
    setEditingText(null);
    render();
  }, [render]);

  const finalizeText = useCallback((text: string, key: string) => {
    const draft = textDraftRef.current;
    if (!draft || draft.key !== key) return;
    textDraftRef.current = null;
    setEditingText(null);
    const val = text.trimEnd();
    const existing = elementsRef.current.find(el => el.id === draft.elementId);
    if (!val.trim()) {
      if (existing) { existing.isDeleted = true; pushHistory(); }
      render();
      return;
    }
    if (existing?.type === "text" && existing.text === val) { render(); return; }
    const ctx = ctxRef.current;
    const fontSize = draft.fontSize;
    let w = 100, h = fontSize * 1.2;
    if (ctx) {
      ctx.save();
      ctx.font = `${fontSize}px sans-serif`;
      const lines = val.split("\n");
      w = Math.max(...lines.map((l) => ctx.measureText(l).width), 10);
      h = lines.length * fontSize * 1.2;
      ctx.restore();
    }
    if (existing?.type === "text") {
      Object.assign(existing, { text: val, width: w, height: h });
    } else {
      const el: TextElement = { id: genId(), type: "text", x: draft.x, y: draft.y, width: w, height: h, text: val, fontSize, style: { ...styleRef.current, strokeColor: draft.color }, isDeleted: false };
      elementsRef.current.push(el);
    }
    pushHistory();
    render();
  }, [pushHistory, render]);

  // ── effects ─────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!screenshot) {
      screenshotRef.current = null;
      selectedScreenshotRef.current = false;
      render();
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const camera = cameraRef.current;
    const image = screenshot.image;
    const scale = Math.min(1, Math.max(120, bounds.width - 64) / image.naturalWidth, Math.max(100, bounds.height * .42) / image.naturalHeight);
    screenshotRef.current = {
      image, x: camera.x + 32 / camera.zoom, y: camera.y + 76 / camera.zoom,
      width: image.naturalWidth * scale / camera.zoom,
      height: image.naturalHeight * scale / camera.zoom,
    };
    selectedScreenshotRef.current = false;
    marqueeRef.current = null;
    const recognitionReset = window.setTimeout(clearRecognition, 0);
    render();
    return () => window.clearTimeout(recognitionReset);
  }, [screenshot, clearRecognition, render]);

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
        const map: Record<string, Tool> = { v: "select", "1": "select", p: "freedraw", e: "eraser", "2": "eraser", t: "text", "3": "text" };
        if (map[k]) { setTool(map[k]); return; }
      }

      if ((k === "delete" || k === "backspace") && selectedRef.current.size) {
        const deletedIds = [...selectedRef.current];
        for (const el of elementsRef.current) if (selectedRef.current.has(el.id)) el.isDeleted = true;
        removeLatexOverlays(deletedIds);
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
  }, [editingText, setTool, pushHistory, render, undo, redo, removeLatexOverlays]);

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

  const renderedLatex = useMemo(() => Object.values(latexOverlays).map((overlay) => {
    void overlayVersion;
    const fontSize = Math.max(
      16,
      Math.min(96, Math.max(overlay.bounds.h * 0.8, overlay.strokeWidth * 8)),
    );
    return {
      overlay,
      html: katex.renderToString(overlay.latex, {
        displayMode: true,
        throwOnError: false,
        output: "html",
      }),
      style: {
        left: (overlay.bounds.x - overlayCamera.x) * overlayCamera.zoom,
        top: (overlay.bounds.y - overlayCamera.y) * overlayCamera.zoom,
        minWidth: Math.max(48, overlay.bounds.w * overlayCamera.zoom),
        minHeight: Math.max(32, overlay.bounds.h * overlayCamera.zoom),
        fontSize: `${fontSize * overlayCamera.zoom}px`,
        color: overlay.color,
      },
    };
  }), [latexOverlays, overlayCamera, overlayVersion]);

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

      {renderedLatex.map(({ overlay, html, style: latexStyle }) => (
        <div
          key={overlay.id}
          className="recognized-math"
          style={latexStyle}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ))}

      {/* ── tutor layer (recognized math + tutor annotations) ─── */}
      <TutorOverlay camera={overlayCamera} />

      <div className="canvas-topline">
        {screenshot && <button className="show-question" onClick={() => {
          const image = screenshotRef.current;
          if (!image) return;
          const bounds = canvasRef.current!.getBoundingClientRect();
          const fit = Math.min(1, (bounds.width - 64) / image.width, (bounds.height * .5) / image.height);
          cameraRef.current = { x: image.x - 32 / fit, y: image.y - 76 / fit, zoom: fit };
          setOverlayCamera(cameraRef.current); setZoomUI(Math.round(fit * 100)); render();
        }}><Icon name="fit" size={16}/><span>Show question</span></button>}
        <button type="button" role="switch" aria-label="Typeset handwriting" aria-checked={latexEnabled} onClick={toggleLatex} className={`latex-toggle ${latexEnabled ? "is-on" : ""}`}><span className="math-symbol">ƒ</span><span>{recognizing ? "Reading your math…" : "Typeset math"}</span><span className="switch-track"><span/></span></button>
      </div>
      {recognitionError && <div className="recognition-notice" role="status">Couldn’t convert that yet. Your handwriting is safe.<button onClick={retryRecognition}>Try again</button></div>}

      <IslandToolbar tool={tool} onToolChange={setTool} style={style} onStyleChange={updateStyle} onUndo={undo} onRedo={redo} canUndo={historyState.canUndo} canRedo={historyState.canRedo}/>
      <div className="canvas-footer"><div className="zoom-controls"><button className="icon-button" type="button" onClick={() => zoomTo(Math.max(0.1, cameraRef.current.zoom / 1.25))} aria-label="Zoom out"><Icon name="minus" size={16}/></button><button className="zoom-percentage" type="button" onClick={() => zoomTo(1)} aria-label="Reset zoom to 100 percent">{zoom}%</button><button className="icon-button" type="button" onClick={() => zoomTo(Math.min(10, cameraRef.current.zoom * 1.25))} aria-label="Zoom in"><Icon name="plus" size={16}/></button></div></div>

      {editingText && <CanvasTextEditor key={editingText.key} draft={editingText} camera={overlayCamera} onCommit={finalizeText} onCancel={cancelText}/>}

    </div>
  );
}
