import { getCurrentView, highlightKnownRegions, getFocus, setFocus, revealBoardBounds } from "./boardView";
import { addTutorAnnotation, getTutorAnnotations } from "./store";
import { getPaused } from "./support";
import type { BoundingBox, TutorAnnotation } from "./types";
import { layoutHandwriting } from "./handwriting";

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
  if (width > world.width - 120) return null;
  const x = Math.max(world.x + 20, Math.min(problem.x, world.x + world.width - width - 90));
  let y = problem.y + problem.height + 28;
  // Follow the working column downward, including ink the model did not label.
  // The canvas can pan to reveal the result instead of inserting it beside work.
  for (const obstacle of obstacles) {
    if (obstacle.y >= problem.y && obstacle.y < world.y + world.height && obstacle.x < x + width + 16 && obstacle.x + obstacle.width + 16 > x) {
      y = Math.max(y, obstacle.y + obstacle.height + 28);
    }
  }
  for (let i = 0; i <= obstacles.length; i++) {
    const box = {x,y,width,height};
    const collisions = obstacles.filter(b => overlaps(box,b));
    if (!collisions.length) return box;
    y = Math.max(...collisions.map(b => b.y + b.height)) + 28;
  }
  return null;
}
export function applyTeachingPlan(args: {snapshotId:string; problemRegionIds:string[]; regionIds:string[]; label:string; scaffold:string|null}) {
  const view = getCurrentView(args.snapshotId);
  if (!view || getPaused()) return {success:false,error:"stale_snapshot_look_again"};
  if (![args.problemRegionIds,args.regionIds].every(ids=>Array.isArray(ids) && ids.length<=80 && ids.every(id=>typeof id==="string" && view.regions.some(r=>r.id===id)))) return {success:false,error:"unknown_region"};
  if (!args.regionIds.every(id=>args.problemRegionIds.includes(id))) return {success:false,error:"outside_problem"};
  const problemBounds = unionBounds(view.regions.filter(r=>args.problemRegionIds.includes(r.id)).map(r=>r.bounds));
  let annotation: (TutorAnnotation & BoundingBox) | null = null;
  if (args.scaffold != null) {
    if (typeof args.scaffold !== "string" || args.scaffold.length>120 || args.scaffold.split("{{blank}}").length!==2 || !/^[a-zA-Z0-9\s+\-*/^=().{},]+$/.test(args.scaffold) || !problemBounds) return {success:false,error:"invalid_scaffold"};
    const latex = scaffoldLatex(args.scaffold);
    const drawing = layoutHandwriting(args.scaffold);
    if (!drawing) return {success:false,error:"invalid_scaffold"};
    const obstacles=[...(view.obstacles??view.regions.map(r=>r.bounds)), ...getTutorAnnotations().map(a=>({x:a.x,y:a.y,width:a.width??360,height:a.height??64}))];
    const studentWork = unionBounds(view.regions.filter(r=>r.strokeIds?.length && args.problemRegionIds.includes(r.id)).map(r=>r.bounds));
    const anchor = { ...problemBounds, x: studentWork?.x ?? problemBounds.x };
    const placement=scaffoldPosition(view.workspaceWorld ?? view.world,anchor,drawing.width,drawing.height,obstacles);
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
    revealBoardBounds(annotation);
  }
  return {success:true,problemBounds,scaffoldPlaced:!!annotation};
}
