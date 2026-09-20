import katex from "katex";
import { getCurrentView, highlightKnownRegions, getFocus, setFocus } from "./boardView";
import { addTutorAnnotation, getTutorAnnotations } from "./store";
import { getPaused } from "./support";
import type { BoundingBox } from "./types";

export function scaffoldLatex(template: string) {
  return template.replace(/\{\{blank\}\}/g, "\\underline{\\hspace{2.8em}}")
    .replace(/\*/g, "\\cdot ");
}
const overlaps = (a: BoundingBox, b: BoundingBox) => a.x < b.x+b.width+16 && a.x+a.width+16 > b.x && a.y < b.y+b.height+16 && a.y+a.height+16 > b.y;
export function unionBounds(boxes: BoundingBox[]): BoundingBox | null {
  if (!boxes.length) return null;
  const x=Math.min(...boxes.map(b=>b.x)), y=Math.min(...boxes.map(b=>b.y));
  return { x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y };
}
export function scaffoldPosition(world: BoundingBox, problem: BoundingBox, width: number, height: number, obstacles: BoundingBox[]): BoundingBox | null {
  const maxY = world.y + world.height - 140;
  const xs = [problem.x, problem.x+problem.width+40, world.x+24];
  for (let y=problem.y+problem.height+36; y+height<maxY; y+=height+24) {
    for (const x of xs) {
      const box={x,y,width,height};
      if (x>=world.x+12 && x+width<world.x+world.width-90 && !obstacles.some(b=>overlaps(box,b))) return box;
    }
  }
  return null;
}
export function applyTeachingPlan(args: {snapshotId:string; problemRegionIds:string[]; regionIds:string[]; label:string; scaffold:string|null}) {
  const view = getCurrentView(args.snapshotId);
  if (!view || getPaused()) return {success:false,error:"stale_snapshot_look_again"};
  if (![args.problemRegionIds,args.regionIds].every(ids=>Array.isArray(ids) && ids.length<=80 && ids.every(id=>typeof id==="string" && view.regions.some(r=>r.id===id)))) return {success:false,error:"unknown_region"};
  if (!args.regionIds.every(id=>args.problemRegionIds.includes(id))) return {success:false,error:"outside_problem"};
  const problemBounds = unionBounds(view.regions.filter(r=>args.problemRegionIds.includes(r.id)).map(r=>r.bounds));
  let annotation = null;
  if (args.scaffold != null) {
    if (typeof args.scaffold !== "string" || args.scaffold.length>120 || args.scaffold.split("{{blank}}").length!==2 || !/^[a-zA-Z0-9\s+\-*/^=().{},]+$/.test(args.scaffold) || !problemBounds) return {success:false,error:"invalid_scaffold"};
    const latex = scaffoldLatex(args.scaffold);
    const measure = document.createElement("div");
    measure.style.cssText="position:fixed;left:-9999px;top:0;visibility:hidden;font-size:34px;white-space:nowrap;line-height:1.2";
    measure.innerHTML=katex.renderToString(latex,{throwOnError:true,trust:false});
    document.body.appendChild(measure);
    const rect=measure.getBoundingClientRect(); measure.remove();
    const obstacles=[...(view.obstacles??view.regions.map(r=>r.bounds)), ...getTutorAnnotations().map(a=>({x:a.x,y:a.y,width:a.width??360,height:a.height??64}))];
    const placement=scaffoldPosition(view.workspaceWorld ?? view.world,problemBounds,rect.width+8,Math.max(64,rect.height+8),obstacles);
    if (placement) annotation={id:crypto.randomUUID(),owner:"tutor" as const,type:"latex" as const,createdAt:Date.now(),latex,template:args.scaffold,...placement};
  }
  // Finish validation before mutating either layer. Recolor never edits source ink.
  if (args.regionIds.length) highlightKnownRegions({snapshotId:args.snapshotId,regionIds:args.regionIds,label:args.label || "Current step"});
  if (annotation) {
    const focus=getFocus();
    if (focus && (annotation.x+annotation.width>focus.x+focus.width || annotation.y+annotation.height>focus.y+focus.height || annotation.x<focus.x || annotation.y<focus.y)) {
      setFocus(unionBounds([focus,{x:annotation.x-16,y:annotation.y-16,width:annotation.width+32,height:annotation.height+32}]));
    }
    addTutorAnnotation(annotation);
  }
  return {success:true,problemBounds,scaffoldPlaced:!!annotation};
}
