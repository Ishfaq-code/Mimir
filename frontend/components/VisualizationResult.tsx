"use client";

import { useEffect, useRef, useState } from "react";

export interface VisualizationObject {
  id: string;
  type: "circle" | "rect" | "line" | "arrow" | "path" | "text";
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  radius?: number;
  width?: number;
  height?: number;
  points?: { x: number; y: number }[];
  text?: string;
  color: string;
  label?: string;
}

export interface VisualizationData {
  timeline: {
    name: string;
    unit: string;
    minimum: number;
    maximum: number;
    step: number;
  };
  frames: { value: number; variables: { name: string; value: number; unit: string }[]; objects: VisualizationObject[] }[];
}

interface LabelLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function objectBounds(object: VisualizationObject): Bounds {
  const x = object.x ?? 0;
  const y = object.y ?? 0;
  if (object.type === "circle") {
    const radius = object.radius ?? 12;
    return { x: x - radius, y: y - radius, width: radius * 2, height: radius * 2 };
  }
  if (object.type === "rect") return { x, y, width: object.width ?? 40, height: object.height ?? 40 };
  if (object.type === "line" || object.type === "arrow") {
    const x2 = object.x2 ?? x;
    const y2 = object.y2 ?? y;
    return { x: Math.min(x, x2), y: Math.min(y, y2), width: Math.abs(x2 - x), height: Math.abs(y2 - y) };
  }
  const points = object.points ?? [];
  if (points.length) {
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  return { x, y, width: 0, height: 0 };
}

function overlaps(a: Bounds, b: Bounds) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function layoutLabels(objects: VisualizationObject[], fontSize: number) {
  const layouts: Record<string, LabelLayout> = {};
  const usedLabels: Bounds[] = [];
  const objectBoundsList = objects.map(objectBounds);
  objects.forEach((object, index) => {
    if (!object.label || object.type === "text") return;
    const bounds = objectBoundsList[index];
    const width = Math.min(180, Math.max(42, object.label.length * fontSize * .62 + 16));
    const height = fontSize + 11;
    const candidates = [
      { x: bounds.x + bounds.width / 2 - width / 2, y: bounds.y - height - 8 },
      { x: bounds.x + bounds.width + 8, y: bounds.y + bounds.height / 2 - height / 2 },
      { x: bounds.x + bounds.width / 2 - width / 2, y: bounds.y + bounds.height + 8 },
      { x: bounds.x - width - 8, y: bounds.y + bounds.height / 2 - height / 2 },
    ];
    const preferred = objects[index].id.split("").reduce((hash, character) => hash + character.charCodeAt(0), 0) % candidates.length;
    const orderedCandidates = [...candidates.slice(preferred), ...candidates.slice(0, preferred)];
    const candidate = orderedCandidates.find(position => {
      const labelBounds = { ...position, width, height };
      return labelBounds.x >= 4 && labelBounds.y >= 4 && labelBounds.x + width <= 796 && labelBounds.y + height <= 446
        && !usedLabels.some(label => overlaps(labelBounds, label))
        && !objectBoundsList.some((other, otherIndex) => otherIndex !== index && overlaps(labelBounds, other));
    }) ?? candidates[0];
    const clamped = {
      x: Math.max(4, Math.min(796 - width, candidate.x)),
      y: Math.max(4, Math.min(446 - height, candidate.y)),
      width,
      height,
      fontSize,
    };
    layouts[object.id] = clamped;
    usedLabels.push(clamped);
  });
  return layouts;
}

function renderLabel(label: string, layout: LabelLayout) {
  return <g transform={`translate(${layout.x} ${layout.y})`}>
    <rect width={layout.width} height={layout.height} rx="5" fill="var(--surface)" stroke="var(--line)"/>
    <text x="8" y={layout.fontSize + 2} style={{ fontSize: layout.fontSize }} className="visualize-svg-label">{label}</text>
  </g>;
}

function renderObject(object: VisualizationObject, labels: Record<string, LabelLayout>) {
  const key = object.id;
  const x = object.x ?? 0;
  const y = object.y ?? 0;
  const color = object.color || "#2f9e44";
  const label = object.label && labels[object.id] ? renderLabel(object.label, labels[object.id]) : null;

  if (object.type === "circle") return <g key={key}><circle cx={x} cy={y} r={object.radius ?? 12} fill={color}/>{label}</g>;
  if (object.type === "rect") return <g key={key}><rect x={x} y={y} width={object.width ?? 40} height={object.height ?? 40} fill={color}/>{label}</g>;
  if (object.type === "line" || object.type === "arrow") {
    const line = <line x1={x} y1={y} x2={object.x2 ?? x} y2={object.y2 ?? y} stroke={color} strokeWidth="4" markerEnd={object.type === "arrow" ? "url(#visualize-arrow)" : undefined}/>;
    return <g key={key}>{line}{label}</g>;
  }
  if (object.type === "path") {
    const points = object.points ?? [];
    const path = points.map(point => `${point.x},${point.y}`).join(" ");
    return <g key={key}><polyline points={path} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>{label}</g>;
  }
  return <text key={key} x={x} y={y} fill={color} className="visualize-svg-text">{object.text ?? object.label ?? ""}</text>;
}

// Interpolate validated keyframes for continuous playback without another API call.
function interpolateFrame(data: VisualizationData, position: number) {
  const index = Math.floor(position);
  const start = data.frames[index];
  const end = data.frames[Math.min(index + 1, data.frames.length - 1)];
  const fraction = position - index;
  const mix = (a: number, b: number) => a + (b - a) * fraction;
  return {
    value: mix(start.value, end.value),
    variables: start.variables.map(variable => ({ ...variable,
      value: mix(variable.value, end.variables.find(next => next.name === variable.name)?.value ?? variable.value),
    })),
    objects: start.objects.map(object => {
      const next = end.objects.find(next => next.id === object.id);
      if (!next || next.type !== object.type) return object;
      const result = { ...object };
      for (const key of ["x", "y", "x2", "y2", "radius", "width", "height"] as const) {
        const from = object[key], to = next[key];
        if (typeof from === "number" && typeof to === "number") result[key] = mix(from, to);
      }
      return result;
    }),
  };
}

const displayValue = (value: number) => Number(value.toFixed(2));

function PlaybackIcon({ kind }: { kind: "play" | "pause" | "back" | "forward" }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "play" ? <path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none"/> : kind === "pause" ? <><path d="M8 5v14M16 5v14" strokeWidth="3"/></> : kind === "back" ? <><path d="M6 5v14M18 5l-10 7 10 7Z"/></> : <><path d="M18 5v14M6 5l10 7-10 7Z"/></>}
  </svg>;
}

const variableNames: Record<string, string> = { t: "Time", x: "Distance", v: "Speed", a: "Acceleration" };

export default function VisualizationResult({ data }: { data: VisualizationData }) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(true);
  const last = data.frames.length - 1;
  const isPlaying = playing && position < last;
  const frame = interpolateFrame(data, Math.min(position, last));
  const vertical = data.frames[0].objects.some(object => object.id === "ball");
  const graphRef = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(800);
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const observer = new ResizeObserver(entries => setGraphWidth(entries[0].contentRect.width));
    observer.observe(graph);
    return () => observer.disconnect();
  }, []);
  const labels = layoutLabels(frame.objects, Math.max(13, 12 * (vertical ? 460 : 770) / Math.max(1, graphWidth)));

  useEffect(() => {
    if (!isPlaying) return;
    let requestId: number;
    let previous: number | undefined;
    const tick = (now: number) => {
      if (previous !== undefined) {
        const elapsed = Math.min(now - previous, 100);
        setPosition(value => Math.min(last, value + elapsed * last / 8000));
      }
      previous = now;
      requestId = requestAnimationFrame(tick);
    };
    requestId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(requestId);
  }, [isPlaying, last]);

  function seek(next: number) {
    setPlaying(false);
    setPosition(Math.min(last, Math.max(0, next)));
  }

  function togglePlayback() {
    if (isPlaying) setPlaying(false);
    else {
      if (position >= last) setPosition(0);
      setPlaying(true);
    }
  }

  return <div className="visualization-result">
    <div className="visualize-variable-panel" aria-label="Current variables">
      {frame.variables.map(variable => <div className="visualize-variable" key={`${variable.name}-${variable.unit}`}><span>{variableNames[variable.name] ?? variable.name}</span><strong>{displayValue(variable.value)} <small>{variable.unit}</small></strong></div>)}
    </div>
    <div ref={graphRef} className={`visualize-graph${vertical ? " is-vertical" : ""}`}>
      <svg viewBox={vertical ? "160 30 460 410" : "30 165 770 220"} role="img" aria-label={`${data.timeline.name} ${displayValue(frame.value)} ${data.timeline.unit}`}>
        <defs><marker id="visualize-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke"/></marker></defs>
        <rect width="800" height="450" fill="var(--paper)"/>
        {frame.objects.map(object => renderObject(object, labels))}
      </svg>
    </div>
    <div className="visualize-controls">
      <div className="visualize-transport"><span className="visualize-status">{isPlaying ? "Playing" : position >= last ? "Complete" : "Paused"}</span>
      <div className="visualize-navigation">
        <button type="button" className="secondary-button" onClick={() => seek(Math.ceil(position) - 1)} disabled={position === 0} aria-label="Step backward" title="Step backward"><PlaybackIcon kind="back"/></button>
        <button type="button" className="primary-button" onClick={togglePlayback} disabled={last === 0} aria-label={isPlaying ? "Pause visualization" : "Play visualization"}><PlaybackIcon kind={isPlaying ? "pause" : "play"}/><span>{isPlaying ? "Pause" : "Play"}</span></button>
        <button type="button" className="secondary-button" onClick={() => seek(Math.floor(position) + 1)} disabled={position >= last} aria-label="Step forward" title="Step forward"><PlaybackIcon kind="forward"/></button>
      </div>
      <span className="visualize-time">{displayValue(frame.value)} <span>/ {displayValue(data.timeline.maximum)} {data.timeline.unit}</span></span></div>
      <input type="range" min={0} max={Math.max(0, last)} step="any" value={position} onChange={event => seek(Number(event.target.value))} aria-label={`Change ${data.timeline.name}`} aria-valuetext={`${displayValue(frame.value)} ${data.timeline.unit}`}/>

    </div>
  </div>;
}
