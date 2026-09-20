"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import type { Camera } from "@/lib/canvas/types";
import type { BoundingBox } from "@/lib/tutor/types";
import { getFocus, setFocus, subscribeFocus } from "@/lib/tutor/boardView";

export default function ProblemFocus({camera}:{camera:Camera}) {
  const focus=useSyncExternalStore(subscribeFocus,getFocus,()=>null);
  const [armed,setArmed]=useState(false);
  const [draft,setDraft]=useState<BoundingBox|null>(null);
  const start=useRef<{x:number;y:number}|null>(null);
  const box=draft??focus;
  function point(e: React.PointerEvent<HTMLDivElement>) {
    const rect=e.currentTarget.getBoundingClientRect();
    return {x:(e.clientX-rect.left)/camera.zoom+camera.x,y:(e.clientY-rect.top)/camera.zoom+camera.y};
  }
  return <>
    {box && <div className="problem-focus-outline" style={{left:(box.x-camera.x)*camera.zoom,top:(box.y-camera.y)*camera.zoom,width:box.width*camera.zoom,height:box.height*camera.zoom}}><span>Working here</span></div>}
    <div className="problem-focus-controls">
      <button type="button" className="show-question" aria-pressed={armed} onClick={()=>{setArmed(!armed);setDraft(null);start.current=null;}}>{armed?"Cancel focus":focus?"Change focus":"Focus a problem"}</button>
      {focus && <button className="show-question" onClick={()=>setFocus(null)} aria-label="Clear problem focus">×</button>}
      {armed && <span role="status">Drag around the problem and your work.</span>}
    </div>
    {armed && <div className="problem-focus-picker" onKeyDown={e=>{if(e.key==="Escape"){setArmed(false);setDraft(null);}}} tabIndex={0} aria-label="Drag to focus on a problem" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);start.current=point(e);}} onPointerMove={e=>{if(!start.current)return;const p=point(e),a=start.current;setDraft({x:Math.min(p.x,a.x),y:Math.min(p.y,a.y),width:Math.abs(p.x-a.x),height:Math.abs(p.y-a.y)});}} onPointerUp={e=>{if(start.current){const p=point(e),a=start.current;if(Math.abs(p.x-a.x)*camera.zoom>20&&Math.abs(p.y-a.y)*camera.zoom>20)setFocus({x:Math.min(p.x,a.x),y:Math.min(p.y,a.y),width:Math.abs(p.x-a.x),height:Math.abs(p.y-a.y)});}start.current=null;setDraft(null);setArmed(false);}} onPointerCancel={()=>{start.current=null;setDraft(null);setArmed(false);}}/>}
  </>;
}
