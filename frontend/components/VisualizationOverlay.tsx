"use client";

import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Camera } from "@/lib/canvas/types";
import Icon from "./Icon";
import VisualizationResult, { type VisualizationData } from "./VisualizationResult";

export interface VisualizationEmbed {
  id: string;
  problem: string;
  data: VisualizationData;
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function VisualizationOverlay({ embed, camera, onClose, onMove, onResize }: {
  embed: VisualizationEmbed;
  camera: Camera;
  onClose: () => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, w: number, h: number) => void;
}) {
  const [ready, setReady] = useState(false);
  const left = (embed.x - camera.x) * camera.zoom;
  const top = (embed.y - camera.y) * camera.zoom;
  const width = embed.w * camera.zoom;
  const height = embed.h * camera.zoom;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleDragStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget;
    el.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const origX = embed.x;
    const origY = embed.y;
    const onPointerMove = (move: PointerEvent) => {
      onMove(embed.id, origX + (move.clientX - startX) / camera.zoom, origY + (move.clientY - startY) / camera.zoom);
    };
    const onPointerUp = () => {
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
    };
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
  }, [embed.id, embed.x, embed.y, camera.zoom, onMove]);

  const handleResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget;
    el.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const origW = embed.w;
    const origH = embed.h;
    const onPointerMove = (move: PointerEvent) => {
      onResize(embed.id, Math.max(280, origW + (move.clientX - startX) / camera.zoom), Math.max(240, origH + (move.clientY - startY) / camera.zoom));
    };
    const onPointerUp = () => {
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
    };
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
  }, [embed.id, embed.w, embed.h, camera.zoom, onResize]);

  return (
    <div className={`visualization-overlay graph-overlay${ready ? " graph-overlay-visible" : ""}`} style={{ left, top, width, height }}>
      <div className="graph-overlay-header" onPointerDown={handleDragStart}>
        <span className="visualization-overlay-title">{embed.problem}</span>
        <button className="icon-button" type="button" onClick={onClose} onPointerDown={event => event.stopPropagation()} aria-label="Remove visualization from canvas">
          <Icon name="close" size={14}/>
        </button>
      </div>
      <div className="visualization-overlay-body">
        <VisualizationResult data={embed.data} compact markerId={`viz-arrow-${embed.id}`}/>
      </div>
      <div className="graph-resize-handle" onPointerDown={handleResizeStart}/>
    </div>
  );
}
