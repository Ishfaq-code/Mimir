/** Original single-line pen paths. These are strokes, not outlines of a font. */
const glyphs: Record<string, [number, string]> = {
  '0': [23, 'M15 2 C2 -1 1 17 5 26 C10 36 21 26 21 12 C21 5 19 2 15 2'],
  '1': [17, 'M3 9 Q9 5 11 2 L10 30|M4 31 Q10 30 16 30'],
  '2': [24, 'M2 8 C8 -2 22 1 21 10 C20 17 8 23 3 31 Q12 29 23 30'],
  '3': [23, 'M3 5 C12 -1 25 2 19 11 Q16 15 10 15 C25 12 27 28 16 31 Q8 33 2 28'],
  '4': [24, 'M15 2 L2 21 Q13 20 23 20|M18 5 L17 32'],
  '5': [23, 'M22 3 Q12 2 5 3 L4 16 C13 11 24 15 21 26 C18 35 7 33 2 28'],
  '6': [23, 'M20 3 C8 -3 1 14 3 25 C5 35 20 34 21 23 C22 12 8 11 3 22'],
  '7': [23, 'M2 4 Q14 3 23 3 Q13 16 8 32'],
  '8': [23, 'M13 16 C-2 10 4 0 15 2 C28 4 21 13 13 16 C-3 22 3 33 14 31 C28 28 25 20 13 16'],
  '9': [23, 'M20 16 C5 27 -1 12 6 4 C13 -3 23 4 21 16 Q18 28 7 32'],
  '+': [26, 'M2 17 Q13 16 25 16|M14 5 Q13 17 13 28'],
  '-': [25, 'M3 17 Q15 16 24 16'],
  '=': [26, 'M2 12 Q14 11 25 12|M3 23 Q16 22 25 22'],
  '*': [25, 'M4 7 Q12 18 22 27|M22 7 Q13 16 4 27'],
  '/': [21, 'M19 1 Q11 16 2 33'],
  '(': [13, 'M12 -1 C0 6 0 27 11 36'],
  ')': [13, 'M2 -1 C14 7 14 27 2 36'],
  '.': [9, 'M4 30 L5 31'],
  ',': [10, 'M6 28 Q6 32 3 36'],
  a: [22, 'M17 13 C5 5 0 25 7 30 C12 33 18 23 18 14 L17 31'],
  b: [23, 'M5 0 Q4 18 3 31|M4 20 C14 4 24 13 20 25 C16 34 7 32 4 28'],
  c: [21, 'M19 14 C8 3 0 19 5 28 Q10 35 20 27'],
  d: [23, 'M18 15 C6 5 0 22 5 29 C12 37 19 23 19 13 L21 0 L19 31'],
  e: [22, 'M3 22 Q23 22 19 13 C14 4 0 15 4 26 Q10 36 21 27'],
  f: [17, 'M16 2 C7 -4 8 12 5 34|M1 14 Q9 13 17 13'],
  g: [23, 'M18 14 C9 6 0 16 4 26 C9 36 19 23 19 13 L18 31 C17 44 4 41 2 36'],
  h: [23, 'M5 0 L3 31|M4 23 C12 6 22 8 20 21 L20 31'],
  i: [10, 'M5 13 L4 31|M6 4 L6 5'],
  j: [12, 'M8 13 L7 33 Q7 43 -1 38|M9 4 L9 5'],
  k: [22, 'M5 0 L3 31|M21 12 L5 22 Q14 21 21 32'],
  l: [11, 'M6 0 Q3 20 4 31'],
  m: [33, 'M3 13 L3 31 L4 21 C10 7 16 9 16 20 L16 30 L17 20 C25 7 31 11 30 24 L30 31'],
  n: [23, 'M3 13 L3 31 L4 21 C13 4 22 11 20 23 L20 31'],
  o: [23, 'M13 11 C1 10 0 30 11 31 C23 32 26 10 13 11'],
  p: [23, 'M4 13 L3 42|M4 20 C14 4 25 12 21 24 C17 34 8 31 4 29'],
  q: [23, 'M18 14 C7 5 0 21 5 29 C11 35 19 25 19 13 L18 41'],
  r: [18, 'M4 13 L3 31 L4 22 Q9 9 17 13'],
  s: [21, 'M19 14 C10 6 0 15 7 21 C27 24 17 36 3 28'],
  t: [17, 'M10 3 L8 26 Q8 35 16 29|M1 14 L17 13'],
  u: [23, 'M4 13 C1 39 17 33 19 13 L19 31'],
  v: [22, 'M2 13 Q6 24 10 31 Q17 23 22 12'],
  w: [31, 'M2 13 L7 31 L16 15 L21 31 L30 12'],
  x: [22, 'M3 12 Q12 22 21 32|M21 12 Q12 22 2 31'],
  y: [23, 'M3 12 L11 29|M21 12 Q14 34 4 42'],
  z: [22, 'M3 13 Q13 12 21 13 L3 31 L22 30'],
  A: [27, 'M1 32 L14 1 L26 32|M6 22 L21 21'],
  B: [25, 'M4 32 L5 2 C27 -1 28 13 6 16 C30 12 32 34 4 32'],
  C: [27, 'M25 6 C12 -7 0 7 3 23 C6 37 20 34 26 27'],
  D: [27, 'M4 32 L5 2 C35 -1 33 35 4 32'],
  E: [24, 'M23 3 L5 3 L4 31 L24 30|M5 16 L20 15'],
  F: [24, 'M23 3 L5 3 L4 32|M5 16 L20 15'],
  G: [29, 'M26 6 C11 -7 -2 9 4 25 C10 38 28 33 27 20 L17 20'],
  H: [28, 'M4 2 L3 32|M25 2 L24 32|M4 17 L24 16'],
  I: [17, 'M2 3 L17 2|M10 3 L9 31|M1 32 L17 31'],
  J: [23, 'M4 3 L23 2|M19 3 L18 23 C17 37 3 34 2 25'],
  K: [26, 'M5 2 L4 32|M25 2 L5 19 L25 32'],
  L: [23, 'M5 2 L4 31 L23 30'],
  M: [33, 'M2 32 L4 2 L17 23 L30 2 L31 32'],
  N: [29, 'M3 32 L4 2 L25 31 L26 2'],
  O: [29, 'M16 2 C-1 0 -3 33 14 32 C32 33 34 0 16 2'],
  P: [25, 'M4 32 L5 2 C30 -1 29 21 5 18'],
  Q: [30, 'M16 2 C-1 0 -3 33 14 32 C32 33 34 0 16 2|M17 24 L29 36'],
  R: [27, 'M4 32 L5 2 C30 -1 29 20 5 18|M14 18 L26 33'],
  S: [26, 'M24 6 C14 -4 -2 4 7 14 C12 20 30 17 23 28 Q13 39 2 27'],
  T: [26, 'M1 3 L27 2|M15 3 L13 32'],
  U: [28, 'M4 2 L3 22 C3 36 25 36 25 21 L26 2'],
  V: [27, 'M2 2 L13 32 L27 2'],
  W: [38, 'M2 2 L10 32 L20 9 L28 32 L38 2'],
  X: [26, 'M3 2 L25 32|M25 2 L2 32'],
  Y: [27, 'M2 2 L14 18 L27 2|M14 18 L13 32'],
  Z: [26, 'M2 3 L26 2 L2 32 L26 31'],
};

export interface PenPath { d: string; x: number; y: number; scale: number }
export interface Handwriting { width: number; height: number; paths: PenPath[]; label: string }

/** Layout canonical algebra with a writing blank and true raised exponents. */
export function layoutHandwriting(template: string): Handwriting | null {
  if (!template || template.length > 200) return null;
  const text = template.replace(/\*\*/g, "^");
  const paths: PenPath[] = [];
  function sequence(value: string, x: number, y: number, scale: number, depth: number): number {
    if (depth > 3) throw new Error("Exponent nesting");
    for (let i = 0; i < value.length; i++) {
      if (value.startsWith("{{blank}}", i)) {
        paths.push({ d: "M3 35 Q49 34 98 35", x, y, scale });
        x += 106 * scale; i += 8; continue;
      }
      const char = value[i];
      if (/\s/.test(char)) { x += 10 * scale; continue; }
      if (char === "^") {
        let exponent = "";
        if (value[i + 1] === "(" || value[i + 1] === "{") {
          const opening = value[++i], closing = opening === "(" ? ")" : "}";
          let level = 1;
          while (++i < value.length) {
            if (value[i] === opening) level++;
            if (value[i] === closing && --level === 0) break;
            exponent += value[i];
          }
          if (level) throw new Error("Unclosed exponent");
        } else {
          exponent = value.slice(i + 1).match(/^(?:[+-]?\d+(?:\.\d+)?|[a-zA-Z])/)?.[0] ?? "";
          i += exponent.length;
        }
        if (!exponent) throw new Error("Missing exponent");
        x = sequence(exponent, x, y - 18 * scale, scale * .62, depth + 1);
        continue;
      }
      const glyph = glyphs[char];
      if (!glyph) throw new Error("Unsupported symbol");
      for (const d of glyph[1].split("|")) paths.push({ d, x, y, scale });
      x += (glyph[0] + 6) * scale;
    }
    return x;
  }
  try {
    const width = sequence(text, 4, 25, 1, 0) + 4;
    const top = Math.min(4, ...paths.map(path => path.y - 4 * path.scale));
    if (top < 4) for (const path of paths) path.y += 4 - top;
    const height = Math.max(74, ...paths.map(path => path.y + 44 * path.scale + 4));
    return { width, height, paths, label: template.replace("{{blank}}", "blank").replace(/\*/g, " × ") };
  } catch { return null; }
}

/** Use the same paths in the tutor's snapshot as on the visible SVG layer. */
export function paintHandwriting(ctx: CanvasRenderingContext2D, drawing: Handwriting) {
  ctx.lineWidth = 2.1; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const path of drawing.paths) {
    ctx.save(); ctx.translate(path.x, path.y); ctx.scale(path.scale, path.scale);
    ctx.stroke(new Path2D(path.d)); ctx.restore();
  }
}
