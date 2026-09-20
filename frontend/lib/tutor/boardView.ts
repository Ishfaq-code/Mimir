import type { BoundingBox } from "./types";
import { getPaused, getPreferences } from "./support";

export interface BoardRegion { id: string; bounds: BoundingBox; text?: string; strokeIds?: string[] }
export interface BoardView {
  snapshotId: string;
  revision: string;
  width: number;
  height: number;
  world: BoundingBox;
  regions: BoardRegion[];
  text: { text: string; bounds: BoundingBox }[];
  focus?: BoundingBox | null;
  workspaceWorld?: BoundingBox;
  obstacles?: BoundingBox[];
}
export interface BoardCapture { view: BoardView; blob: Blob }
export interface BoardHighlight { id: string; bounds: BoundingBox; label: string; createdAt: number; regions?: BoundingBox[]; strokeIds?: string[]; nonInkRegions?: BoundingBox[] }
interface BoardSource {
  capture(): Promise<BoardCapture>;
  revision(): string;
  isBusy?(): boolean;
  isSettled?(): boolean;
  reveal?(bounds: BoundingBox): void;
  hasContent?(): boolean;
  snap(bounds: BoundingBox, label: string): BoundingBox;
}
let source: BoardSource | null = null;
let latest: BoardView | null = null;
let cachedCapture: BoardCapture | null = null;
let pendingCapture: Promise<BoardCapture> | null = null;
let highlight: BoardHighlight | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
let focus: BoundingBox | null = null;
let tutorStatus: "ready" | "waiting" | "checking" = "ready";
const focusListeners = new Set<() => void>();
const statusListeners = new Set<() => void>();
export const getFocus = () => focus;
export const subscribeFocus = (fn: () => void) => { focusListeners.add(fn); return () => { focusListeners.delete(fn); }; };
export function setFocus(next: BoundingBox | null) { focus = next; latest = null; cachedCapture=null; clearHighlight(); focusListeners.forEach(fn => fn()); }
export const getTutorStatus = () => tutorStatus;
export const subscribeTutorStatus = (fn: () => void) => { statusListeners.add(fn); return () => { statusListeners.delete(fn); }; };
export function setTutorStatus(next: "ready" | "waiting" | "checking") { tutorStatus = next; statusListeners.forEach(fn => fn()); }
const settled = () => !!source && !source.isBusy?.() && (source.isSettled?.() ?? true);
export function revealBoardBounds(bounds: BoundingBox) { source?.reveal?.(bounds); }
export function getCurrentView(snapshotId: string) {
  return source && settled() && latest && latest.snapshotId === snapshotId && latest.revision === source.revision() ? latest : null;
}
export function getBoardStatus() {
  const ready=!getPaused() && settled();
  return {ready,available:!!source,revision:ready?source!.revision():null,hasContent:!!source && (source.hasContent?.()??true),preferences:getPreferences()};
}
export const subscribeHighlight = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getHighlight = () => highlight;
export function clearHighlight() {
  clearTimeout(hideTimer);
  highlight = null;
  listeners.forEach(fn => fn());
}
export function registerBoardSource(next: BoardSource) {
  source = next;
  cachedCapture=null;latest=null;
  return () => { if (source === next) { source = null; latest = null; cachedCapture=null; clearHighlight(); } };
}
export async function captureBoard(): Promise<BoardCapture> {
  if (!source || getPaused() || !settled()) throw new Error("Board unavailable, writing or conversation paused");
  if (cachedCapture && latest && cachedCapture.view.revision===source.revision()) return cachedCapture;
  if(pendingCapture) return pendingCapture;
  const currentSource=source;
  pendingCapture=(async()=>{
    const capture=await currentSource.capture();
    if(source!==currentSource || getPaused() || !settled() || capture.view.revision!==source.revision()) throw new Error("Board changed while capturing; look again");
    latest=capture.view;cachedCapture=capture;
    return capture;
  })();
  try{return await pendingCapture;}finally{pendingCapture=null;}
}
/** Model coordinates are in a 1000 × 1000 frame, independent of image resolution. */
export function regionToWorld(view: BoardView, region: BoundingBox): BoundingBox | null {
  const { x, y, width, height } = region;
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1000 || y + height > 1000) return null;
  return { x: view.world.x + x / 1000 * view.world.width, y: view.world.y + y / 1000 * view.world.height, width: width / 1000 * view.world.width, height: height / 1000 * view.world.height };
}
export function highlightRegion(args: BoundingBox & { snapshotId: string; label: string }) {
  if (getPaused() || !getPreferences().highlights) return { success: false, error: "highlight_disabled" };
  if (!getCurrentView(args.snapshotId)) return { success: false, error: "stale_snapshot_look_again" };
  const bounds = regionToWorld(latest!, args);
  if (!bounds || !args.label?.trim() || args.label.length > 120) return { success: false, error: "invalid_region" };
  clearTimeout(hideTimer);
  highlight = { id: crypto.randomUUID(), bounds: source!.snap(bounds, args.label), label: args.label, createdAt: Date.now() };
  listeners.forEach(fn => fn());
  // Long enough to finish a short spoken hint; dismissible immediately.
  hideTimer = setTimeout(clearHighlight, 9000);
  return { success: true, elementId: highlight.id };
}

export function highlightKnownRegions(args: { snapshotId: string; regionIds: string[]; label: string }) {
  if (getPaused() || !getPreferences().highlights) return { success: false, error: "highlight_disabled" };
  if (!getCurrentView(args.snapshotId)) return { success: false, error: "stale_snapshot_look_again" };
  if (!Array.isArray(args.regionIds) || !args.regionIds.length || args.regionIds.length > 30 || typeof args.label !== "string" || !args.label.trim() || args.label.length > 120) return { success: false, error: "invalid_regions" };
  const regions = args.regionIds.map(id => latest!.regions.find(region => region.id === id));
  if (regions.some(region => !region)) return { success: false, error: "unknown_region" };
  const boxes = regions.map(region => region!.bounds);
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  const bounds = { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
  clearTimeout(hideTimer);
  highlight = { id: crypto.randomUUID(), bounds, regions: boxes, strokeIds:regions.flatMap(r=>r!.strokeIds??[]), nonInkRegions:regions.filter(r=>!r!.strokeIds).map(r=>r!.bounds), label: args.label, createdAt: Date.now() };
  listeners.forEach(fn => fn());
  hideTimer = setTimeout(clearHighlight, 9000);
  return { success: true, elementId: highlight.id };
}
