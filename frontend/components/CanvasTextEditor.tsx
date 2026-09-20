"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Camera } from "@/lib/canvas/types";

export interface TextDraft {
  key: string;
  elementId?: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export default function CanvasTextEditor({ draft, camera, onCommit, onCancel }: {
  draft: TextDraft;
  camera: Camera;
  onCommit: (text: string, key: string) => void;
  onCancel: (key: string) => void;
}) {
  const [text, setText] = useState(draft.text);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const field = input.current;
    const box = root.current;
    const parent = box?.parentElement;
    if (!field || !box || !parent) return;
    const place = () => {
      field.style.height = "0px";
      field.style.height = `${Math.max(draft.fontSize * 1.2, field.scrollHeight)}px`;
      box.style.left = `${Math.max(8, Math.min((draft.x - camera.x) * camera.zoom - 7, parent.clientWidth - box.offsetWidth - 8))}px`;
      box.style.top = `${Math.max(8, Math.min((draft.y - camera.y) * camera.zoom - 7, parent.clientHeight - box.offsetHeight - 8))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [text, draft, camera]);

  useEffect(() => {
    input.current?.focus();
    input.current?.setSelectionRange(draft.text.length, draft.text.length);
  }, [draft.text]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) onCommit(text, draft.key);
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [text, onCommit, draft.key]);

  return <div ref={root} className="canvas-text-editor" style={{
    left: (draft.x - camera.x) * camera.zoom - 7,
    top: (draft.y - camera.y) * camera.zoom - 7,
  }} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCommit(text, draft.key);
  }}>
    <textarea ref={input} aria-label="Canvas text" title="Enter to save. Shift+Enter for a new line. Escape to cancel."
      value={text} onChange={event => setText(event.target.value)} wrap="off" spellCheck={false}
      style={{ fontSize: Math.max(16, draft.fontSize * camera.zoom), color: draft.color }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") { event.preventDefault(); onCancel(draft.key); }
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onCommit(text, draft.key); }
      }}/>
    <div className="text-editor-actions"><button type="button" onClick={() => onCancel(draft.key)}>Cancel</button><button type="button" onClick={() => onCommit(text, draft.key)}>Done</button></div>
  </div>;
}
