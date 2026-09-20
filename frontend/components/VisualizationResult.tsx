"use client";

import { useState } from "react";

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

function layoutLabels(objects: VisualizationObject[]) {
  const layouts: Record<string, LabelLayout> = {};
  const usedLabels: Bounds[] = [];
  const objectBoundsList = objects.map(objectBounds);
  objects.forEach((object, index) => {
    if (!object.label || object.type === "text") return;
    const bounds = objectBoundsList[index];
    const width = Math.min(180, Math.max(42, object.label.length * 8 + 16));
    const height = 24;
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
    };
    layouts[object.id] = clamped;
    usedLabels.push(clamped);
  });
  return layouts;
}

function renderLabel(label: string, layout: LabelLayout) {
  return <g transform={`translate(${layout.x} ${layout.y})`}>
    <rect width={layout.width} height={layout.height} rx="5" fill="var(--surface)" stroke="var(--line)"/>
    <text x="8" y="16" className="visualize-svg-label">{label}</text>
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

export default function VisualizationResult({ data }: { data: VisualizationData }) {
  const [frameIndex, setFrameIndex] = useState(0);
  const frame = data.frames[Math.min(frameIndex, data.frames.length - 1)];
  const labels = layoutLabels(frame.objects);
  const progress = data.frames.length > 1 ? frameIndex / (data.frames.length - 1) : 0;

  function moveFrame(next: number) {
    setFrameIndex(Math.min(data.frames.length - 1, Math.max(0, next)));
  }

  return <div className="visualization-result">
    <div className="visualize-variable-panel" aria-live="polite" aria-label="Current variables">
      {frame.variables.map(variable => <div className="visualize-variable" key={`${variable.name}-${variable.unit}`}><span>{variable.name}</span><strong>{variable.value} {variable.unit}</strong></div>)}
    </div>
    <div className="visualize-graph" aria-live="polite">
      <svg viewBox="0 0 800 450" role="img" aria-label={`${data.timeline.name} ${frame.value} ${data.timeline.unit}`}>
        <defs><marker id="visualize-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="context-stroke"/></marker></defs>
        <rect width="800" height="450" fill="var(--paper)"/>
        {frame.objects.map(object => renderObject(object, labels))}
      </svg>
    </div>
    <div className="visualize-controls">
      <div className="visualize-value"><span>{data.timeline.name}</span><strong>{frame.value} {data.timeline.unit}</strong></div>
      <input type="range" min={0} max={Math.max(0, data.frames.length - 1)} step={1} value={frameIndex} onChange={event => moveFrame(Number(event.target.value))} aria-label={`Change ${data.timeline.name}`}/>
      <div className="visualize-navigation"><button type="button" className="secondary-button" onClick={() => moveFrame(frameIndex - 1)} disabled={frameIndex === 0}>Previous</button><span>{Math.round(progress * 100)}%</span><button type="button" className="primary-button" onClick={() => moveFrame(frameIndex + 1)} disabled={frameIndex === data.frames.length - 1}>Next</button></div>
    </div>
  </div>;
}
