import type { Camera } from "./types";

type Point = { x: number; y: number };
const DRAG_THRESHOLD = 5;

/** Finger gestures only. Pencil/mouse editing keeps its own pointer owner. */
export class TouchNavigation {
  private points = new Map<number, Point>();
  private baseline: { camera: Camera; center: Point; distance: number } | null = null;
  private tap: { id: number; start: Point } | null = null;
  private dragging = false;

  get active() { return this.points.size > 0; }
  has(id: number) { return this.points.has(id); }

  private geometry() {
    const [a, b] = this.points.values();
    return b
      ? { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(b.x - a.x, b.y - a.y) }
      : { center: { ...a }, distance: 0 };
  }

  private rebase(camera: Camera) {
    this.baseline = this.active ? { camera: { ...camera }, ...this.geometry() } : null;
  }

  begin(id: number, point: Point, camera: Camera, allowTextTap: boolean) {
    if (!this.active) {
      this.dragging = false;
      this.tap = allowTextTap ? { id, start: { ...point } } : null;
    } else {
      this.tap = null;
      this.dragging = true;
    }
    this.points.set(id, { ...point });
    this.rebase(camera);
  }

  move(id: number, point: Point): Camera | null {
    if (!this.points.has(id) || !this.baseline) return null;
    this.points.set(id, { ...point });
    const { camera, center: start, distance: startDistance } = this.baseline;
    const { center, distance } = this.geometry();
    if (!this.dragging && Math.hypot(center.x - start.x, center.y - start.y) < DRAG_THRESHOLD) return null;
    this.dragging = true;
    this.tap = null;
    const zoom = Math.min(10, Math.max(0.1, camera.zoom * (startDistance > 1 ? distance / startDistance : 1)));
    // Keep the world point under the gesture center anchored during pan + pinch.
    return { x: camera.x + start.x / camera.zoom - center.x / zoom, y: camera.y + start.y / camera.zoom - center.y / zoom, zoom };
  }

  end(id: number, point: Point, camera: Camera, canceled = false): Point | null {
    if (!this.points.has(id)) return null;
    const tap = !canceled && this.tap?.id === id && Math.hypot(point.x - this.tap.start.x, point.y - this.tap.start.y) < DRAG_THRESHOLD
      ? { ...point } : null;
    this.points.delete(id);
    this.tap = null;
    this.rebase(camera);
    if (!this.active) this.dragging = false;
    return tap;
  }

  /** A Pencil contact takes priority; existing fingers stay ignored until lifted. */
  clear(): number[] {
    const ids = [...this.points.keys()];
    this.points.clear();
    this.baseline = null;
    this.tap = null;
    this.dragging = false;
    return ids;
  }
}
