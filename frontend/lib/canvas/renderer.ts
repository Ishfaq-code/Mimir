import type {
  Camera,
  CanvasElement,
  FreedrawElement,
  LinearElement,
  ShapeElement,
  TextElement,
} from "./types";

const GRID_SIZE = 20;

// ── public entry point ─────────────────────────────────────────────

export function renderScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  elements: CanvasElement[],
  selectedIds: Set<string>,
  camera: Camera,
  dark: boolean,
  hiddenIds: Set<string> = new Set(),
) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // background
  ctx.fillStyle = dark ? "#121212" : "#f5f5f5";
  ctx.fillRect(0, 0, width, height);

  // dot grid (screen space – dots stay a constant size)
  drawGrid(ctx, camera, width, height, dark);

  // camera transform – everything after this draws in world coords
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  for (const el of elements) {
    if (el.isDeleted || hiddenIds.has(el.id)) continue;
    ctx.save();
    drawElement(ctx, el);
    ctx.restore();
  }

  for (const el of elements) {
    if (el.isDeleted || !selectedIds.has(el.id)) continue;
    drawSelection(ctx, el, camera.zoom);
  }

  ctx.restore(); // camera
  ctx.restore(); // top‑level save
}

// ── grid ────────────────────────────────────────────────────────────

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  dark: boolean,
) {
  const gap = GRID_SIZE * cam.zoom;
  if (gap < 8) return; // too dense

  ctx.fillStyle = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)";
  const r = Math.max(0.5, Math.min(1.4, cam.zoom * 0.7));

  const sx = Math.floor(cam.x / GRID_SIZE) * GRID_SIZE;
  const sy = Math.floor(cam.y / GRID_SIZE) * GRID_SIZE;
  const ex = cam.x + w / cam.zoom;
  const ey = cam.y + h / cam.zoom;

  for (let wx = sx; wx <= ex; wx += GRID_SIZE) {
    for (let wy = sy; wy <= ey; wy += GRID_SIZE) {
      const px = (wx - cam.x) * cam.zoom;
      const py = (wy - cam.y) * cam.zoom;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ── element dispatch ────────────────────────────────────────────────

function drawElement(ctx: CanvasRenderingContext2D, el: CanvasElement) {
  ctx.strokeStyle = el.style.strokeColor;
  ctx.fillStyle = el.style.fillColor;
  ctx.lineWidth = el.style.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (el.type) {
    case "rectangle":
      return drawRect(ctx, el);
    case "ellipse":
      return drawEllipse(ctx, el);
    case "diamond":
      return drawDiamond(ctx, el);
    case "line":
    case "arrow":
      return drawLinear(ctx, el as LinearElement);
    case "freedraw":
      return drawFreedraw(ctx, el as FreedrawElement);
    case "text":
      return drawText(ctx, el as TextElement);
  }
}

// ── shapes ──────────────────────────────────────────────────────────

function drawRect(ctx: CanvasRenderingContext2D, el: ShapeElement) {
  const r = Math.min(
    8,
    Math.min(Math.abs(el.width), Math.abs(el.height)) / 4,
  );
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.width, el.height, Math.max(0, r));
  if (el.style.fillColor !== "transparent") ctx.fill();
  ctx.stroke();
}

function drawEllipse(ctx: CanvasRenderingContext2D, el: ShapeElement) {
  ctx.beginPath();
  ctx.ellipse(
    el.x + el.width / 2,
    el.y + el.height / 2,
    Math.abs(el.width / 2),
    Math.abs(el.height / 2),
    0,
    0,
    Math.PI * 2,
  );
  if (el.style.fillColor !== "transparent") ctx.fill();
  ctx.stroke();
}

function drawDiamond(ctx: CanvasRenderingContext2D, el: ShapeElement) {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  ctx.beginPath();
  ctx.moveTo(cx, el.y);
  ctx.lineTo(el.x + el.width, cy);
  ctx.lineTo(cx, el.y + el.height);
  ctx.lineTo(el.x, cy);
  ctx.closePath();
  if (el.style.fillColor !== "transparent") ctx.fill();
  ctx.stroke();
}

// ── linear (line / arrow) ───────────────────────────────────────────

function drawLinear(ctx: CanvasRenderingContext2D, el: LinearElement) {
  const pts = el.points;
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(el.x + pts[0][0], el.y + pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(el.x + pts[i][0], el.y + pts[i][1]);
  }
  ctx.stroke();

  if (el.type === "arrow") {
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
    const hl = Math.max(10, el.style.strokeWidth * 4);
    const lx = el.x + last[0];
    const ly = el.y + last[1];
    ctx.beginPath();
    ctx.moveTo(
      lx - hl * Math.cos(angle - Math.PI / 6),
      ly - hl * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(lx, ly);
    ctx.lineTo(
      lx - hl * Math.cos(angle + Math.PI / 6),
      ly - hl * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();
  }
}

// ── freedraw ────────────────────────────────────────────────────────

function drawFreedraw(ctx: CanvasRenderingContext2D, el: FreedrawElement) {
  const pts = el.points;
  if (pts.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(el.x + pts[0][0], el.y + pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(el.x + pts[i][0], el.y + pts[i][1], el.x + mx, el.y + my);
  }
  if (pts.length > 1) {
    const last = pts[pts.length - 1];
    ctx.lineTo(el.x + last[0], el.y + last[1]);
  }
  ctx.stroke();
}

// ── text ────────────────────────────────────────────────────────────

function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
  ctx.font = `${el.fontSize}px sans-serif`;
  ctx.fillStyle = el.style.strokeColor;
  ctx.textBaseline = "top";
  const lines = el.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], el.x, el.y + i * el.fontSize * 1.2);
  }
}

// ── selection outline ───────────────────────────────────────────────

function drawSelection(
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  zoom: number,
) {
  const b = normBounds(el);
  const pad = 5 / zoom;
  const lw = 1.5 / zoom;
  const hs = 8 / zoom;

  ctx.save();
  ctx.strokeStyle = "#4f8ff7";
  ctx.lineWidth = lw;
  ctx.setLineDash([]);
  ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);

  ctx.fillStyle = "#fff";
  for (const [hx, hy] of [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ] as const) {
    ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
  }
  ctx.restore();
}

function normBounds(el: CanvasElement) {
  if (el.type === "freedraw" || el.type === "line" || el.type === "arrow") {
    const pts = (el as LinearElement | FreedrawElement).points;
    if (!pts.length) return { x: el.x, y: el.y, w: 0, h: 0 };
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const [px, py] of pts) {
      if (px < x0) x0 = px;
      if (py < y0) y0 = py;
      if (px > x1) x1 = px;
      if (py > y1) y1 = py;
    }
    return { x: el.x + x0, y: el.y + y0, w: x1 - x0, h: y1 - y0 };
  }
  let { x, y, width: w, height: h } = el;
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  return { x, y, w, h };
}
