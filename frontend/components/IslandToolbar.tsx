"use client";

import { useEffect, useRef, useState } from "react";
import type { ElementStyle, Tool } from "@/lib/canvas/types";
import Icon from "./Icon";

const COLORS = [
  {name:"Black",color:"#1e1e1e"}, {name:"White",color:"#ffffff"},
  {name:"Green",color:"#2f9e44"}, {name:"Blue",color:"#1971c2"},
  {name:"Purple",color:"#7048e8"}, {name:"Red",color:"#e03131"},
  {name:"Orange",color:"#e8590c"}, {name:"Yellow",color:"#fcc419"},
];

interface IslandToolbarProps {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
  style: ElementStyle;
  onStyleChange: (style: Partial<ElementStyle>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onVisualize: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function IslandToolbar({tool,onToolChange,style,onStyleChange,onUndo,onRedo,onVisualize,canUndo,canRedo}: IslandToolbarProps) {
  const [optionsOpen,setOptionsOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if (!optionsOpen) return;
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOptionsOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOptionsOpen(false); };
    window.addEventListener("pointerdown",closeOutside);
    window.addEventListener("keydown",closeOnEscape);
    return ()=>{ window.removeEventListener("pointerdown",closeOutside);window.removeEventListener("keydown",closeOnEscape); };
  },[optionsOpen]);

  return <div className="drawing-tools" ref={root}>
    {optionsOpen ? <div className="ink-options" id="ink-options"><span className="eyebrow">INK COLOR</span><div className="color-options">{COLORS.map(item=><button key={item.name} className={`color-option ${style.strokeColor===item.color ? "selected" : ""}`} aria-label={`${item.name} ink`} aria-pressed={style.strokeColor===item.color} title={`${item.name} ink`} onClick={()=>onStyleChange({strokeColor:item.color})}><span style={{backgroundColor:item.color}}/>{style.strokeColor===item.color ? <Icon name="check" size={12} style={{color:item.name==="White"||item.name==="Yellow" ? "#1e1e1e" : "#ffffff"}}/> : null}</button>)}</div><div className="width-options"><span>Stroke width</span>{[1,2,4].map(width=><button className={style.strokeWidth===width ? "selected" : ""} key={width} aria-label={`Stroke width ${width}`} aria-pressed={style.strokeWidth===width} onClick={()=>onStyleChange({strokeWidth:width})}><span style={{height:width}}/></button>)}</div></div> : null}
    <div className="toolbar-row" aria-label="Drawing tools">
      <button className={`tool-button ${tool==="select" ? "selected" : ""}`} onClick={()=>onToolChange("select")} aria-label="Select" aria-pressed={tool==="select"} title="Select (V)"><Icon name="select" size={21}/><span>Select</span></button>
      <span className="tool-divider"/>
      <button className={`tool-button ${tool==="freedraw" ? "selected" : ""}`} onClick={()=>onToolChange("freedraw")} aria-label="Pen" aria-pressed={tool==="freedraw"} title="Pen (P)"><Icon name="pen" size={21}/><span>Pen</span></button>
      <button className={`tool-button ${tool==="eraser" ? "selected" : ""}`} onClick={()=>onToolChange("eraser")} aria-label="Eraser" aria-pressed={tool==="eraser"} title="Eraser (E)"><Icon name="eraser" size={21}/></button>
      <button className={`tool-button ${tool==="text" ? "selected" : ""}`} onClick={()=>onToolChange("text")} aria-label="Text" aria-pressed={tool==="text"} title="Text (T)"><Icon name="text" size={20}/></button>
      <button className="tool-button" onClick={onVisualize} aria-label="Visualize selected text" title="Visualize selected text"><Icon name="visual" size={20}/><span>Visualize</span></button>
      <span className="tool-divider"/>
      <button className="ink-options-toggle" onClick={()=>setOptionsOpen(open=>!open)} aria-expanded={optionsOpen} aria-controls="ink-options" aria-label="Ink options" title="Ink color and stroke width"><span className="current-ink" style={{backgroundColor:style.strokeColor}}/><Icon name="down" size={13}/></button>
      <span className="tool-divider"/>
      <button className="tool-button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)"><Icon name="undo" size={19}/></button>
      <button className="tool-button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)"><Icon name="redo" size={19}/></button>
    </div>
  </div>;
}
