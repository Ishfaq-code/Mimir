export function wrapPlainText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  maxWidth: number,
) {
  ctx.save();
  ctx.font = `${fontSize}px sans-serif`;
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n/g, "\n").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  const width = Math.max(10, ...lines.map(line => ctx.measureText(line || " ").width));
  ctx.restore();
  return {
    text: lines.join("\n"),
    width,
    height: Math.max(fontSize * 1.2, lines.length * fontSize * 1.2),
  };
}

export function textWrapWidth(viewportWidth: number, zoom: number, existing?: number) {
  if (existing && existing > 10) return existing;
  return Math.max(160, Math.min(560, (viewportWidth - 64) / zoom));
}
