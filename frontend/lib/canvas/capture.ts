import { renderScene, type CanvasScreenshot } from "./renderer";
import { pointXY, type Camera, type CanvasElement } from "./types";
import { getScreenshotRegions } from "../screenshot";
import { getFocus } from "../tutor/boardView";
import type { BoardRegion } from "../tutor/boardView";
import type { BoardCapture } from "../tutor/boardView";
import type { BoundingBox } from "../tutor/types";
import { connectedInk } from "./inkRegions";
import { getTutorAnnotations } from "../tutor/store";
import { layoutHandwriting, paintHandwriting } from "../tutor/handwriting";

export function boundsOf(el: CanvasElement): BoundingBox {
  if ("points" in el && el.points.length) {
    const points = el.points.map(pointXY);
    const x = Math.min(...points.map(p => p[0])), y = Math.min(...points.map(p => p[1]));
    return { x: el.x + x, y: el.y + y, width: Math.max(...points.map(p => p[0])) - x, height: Math.max(...points.map(p => p[1])) - y };
  }
  return { x: Math.min(el.x, el.x + el.width), y: Math.min(el.y, el.y + el.height), width: Math.abs(el.width), height: Math.abs(el.height) };
}
export function snapToInk(bounds: BoundingBox, elements: CanvasElement[]): BoundingBox {
  const nearby = elements.filter(el => !el.isDeleted && el.type === "freedraw").map(boundsOf).filter(b =>
    b.x + b.width / 2 >= bounds.x && b.x + b.width / 2 <= bounds.x + bounds.width &&
    b.y + b.height / 2 >= bounds.y && b.y + b.height / 2 <= bounds.y + bounds.height);
  if (!nearby.length) return bounds;
  const x = Math.min(...nearby.map(b => b.x)), y = Math.min(...nearby.map(b => b.y));
  return { x, y, width: Math.max(...nearby.map(b => b.x + b.width)) - x, height: Math.max(...nearby.map(b => b.y + b.height)) - y };
}
/** Connected strokes make small selectable ink regions. No OCR is needed. */
export function inkRegions(elements: CanvasElement[], gap = 7): BoundingBox[] {
  return connectedInk(elements,gap).map(region=>region.bounds);
}

export async function captureScene(elements: CanvasElement[], screenshot: CanvasScreenshot | null, camera: Camera, width: number, height: number, dark: boolean, revision: string): Promise<BoardCapture> {
  if (!width || !height) throw new Error("Canvas is not visible");
  const workspaceWorld={x:camera.x,y:camera.y,width:width/camera.zoom,height:height/camera.zoom};
  const focus=getFocus();
  if (focus) {
    const x=Math.max(focus.x,workspaceWorld.x),y=Math.max(focus.y,workspaceWorld.y);
    const right=Math.min(focus.x+focus.width,workspaceWorld.x+workspaceWorld.width);
    const bottom=Math.min(focus.y+focus.height,workspaceWorld.y+workspaceWorld.height);
    if(right-x<20||bottom-y<20) throw new Error("Focused problem is offscreen; bring it into view or clear focus");
    width=(right-x)*camera.zoom;height=(bottom-y)*camera.zoom;
    camera={x,y,zoom:camera.zoom};
  }
  const scale = Math.min(1.5, 1400 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas capture unavailable");
  ctx.scale(scale, scale);
  // Include original student ink even when Typeset math is on.
  // No toolbar, caption, selection handles, or content from outside this app.
  renderScene(ctx, width, height, elements, new Set(), camera, dark, new Set(), screenshot);
  for (const annotation of getTutorAnnotations()) {
    const drawing = annotation.template && layoutHandwriting(annotation.template);
    if (!drawing) continue;
    ctx.save();
    ctx.translate((annotation.x - camera.x) * camera.zoom, (annotation.y - camera.y) * camera.zoom);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.strokeStyle = dark ? "#a7d9bd" : "#28644c";
    paintHandwriting(ctx, drawing);
    ctx.restore();
  }
  const ink = connectedInk(elements);
  const candidates: Omit<BoardRegion, "id">[] = ink.map(region => ({ ...region }));
  for (const el of elements) {
    if (el.isDeleted || el.type !== "text") continue;
    ctx.font = `${el.fontSize}px sans-serif`;
    el.text.split("\n").forEach((line, lineIndex) => {
      for (const match of line.matchAll(/\d+(?:\.\d+)?|[a-zA-Z]+|[^\s]/g)) {
        candidates.push({ text: match[0], bounds: { x: el.x + ctx.measureText(line.slice(0, match.index)).width, y: el.y + lineIndex * el.fontSize * 1.2, width: ctx.measureText(match[0]).width, height: el.fontSize * 1.2 } });
      }
    });
  }
  if (screenshot) for (const region of getScreenshotRegions(screenshot.image)) candidates.push({ text: region.text, bounds: { x: screenshot.x + region.x * screenshot.width, y: screenshot.y + region.y * screenshot.height, width: region.width * screenshot.width, height: region.height * screenshot.height } });
  const regions = candidates.filter(({bounds:b}) => b.x + b.width > camera.x && b.y + b.height > camera.y && b.x < camera.x + width / camera.zoom && b.y < camera.y + height / camera.zoom).slice(0, 80).map((region, i) => ({ ...region, text: region.text?.slice(0, 40), bounds: Object.fromEntries(Object.entries(region.bounds).map(([key, value]) => [key, Math.round(value * 100) / 100])) as unknown as BoundingBox, id: `R${i+1}` }));
  // Labels exist only in the tutor's image, never on the student's canvas.
  for (const region of regions) {
    const b = region.bounds, x = (b.x - camera.x) * camera.zoom, y = (b.y + b.height - camera.y) * camera.zoom + 5;
    ctx.font = "10px sans-serif";
    ctx.fillStyle = dark ? "#293732" : "#e7f0e9";
    ctx.fillRect(x, y, ctx.measureText(region.id).width + 5, 13);
    ctx.fillStyle = dark ? "#a7e0bf" : "#246044";
    ctx.textBaseline = "top"; ctx.fillText(region.id, x + 2, y + 1);
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Capture failed")), "image/jpeg", .85));
  if (blob.size > 1_500_000) throw new Error("Board image is too large; zoom in and try again");
  return { blob, view: {
    snapshotId: crypto.randomUUID(), revision, width: canvas.width, height: canvas.height,
    regions, focus, workspaceWorld,
    obstacles: [...ink.map(region=>region.bounds), ...elements.filter(el => !el.isDeleted && el.type !== "freedraw").map(boundsOf), ...(screenshot ? [{x:screenshot.x,y:screenshot.y,width:screenshot.width,height:screenshot.height}] : [])],
    world: { x: camera.x, y: camera.y, width: width / camera.zoom, height: height / camera.zoom },
    text: [],
  } };
}
