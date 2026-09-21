import { getCurrentView, highlightKnownRegions, getFocus, setFocus, revealBoardBounds } from "./boardView";
import { addTutorAnnotation, getTutorAnnotations } from "./store";
import { getPaused, getPreferences } from "./support";
import type { BoundingBox, TutorAnnotation } from "./types";
import { layoutHandwriting } from "./handwriting";
import type { BoardRegion } from "./boardView";

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
  // The board is infinite: a wide handwritten line must not disappear or shift
  // away from the student's column just because it exceeds the current viewport.
  const x = problem.x + (problem.width - width) / 2;
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
export function handwritingStyle(regions: BoardRegion[]) {
  const ink = regions.filter(r => r.strokeIds?.length && r.bounds.height >= 6);
  if (!ink.length) return { scale: 1, x: undefined, bounds: undefined, strokeWidth: 2.1 };
  const heights = ink.map(r => r.bounds.height).sort((a,b) => a-b);
  const typical = heights[Math.floor((heights.length - 1) / 2)];
  const letters = ink.filter(r => r.bounds.height <= typical * 1.8);
  const baseline = Math.max(...letters.map(r => r.bounds.y + r.bounds.height));
  const line = letters.filter(r => Math.abs(r.bounds.y + r.bounds.height - baseline) <= typical * .7);
  const lineHeights = line.map(r => r.bounds.height).sort((a,b) => a-b);
  const scale = Math.max(.4, Math.min(8, lineHeights[Math.floor((lineHeights.length - 1) / 2)] / 30));
  const widths = line.flatMap(r => r.strokeWidth && r.strokeWidth > 0 ? [r.strokeWidth] : []).sort((a,b) => a-b);
  // Include tall brackets on this line when choosing its center, while ordinary
  // symbols still determine the handwriting size.
  const lineBounds = unionBounds(line.map(r => r.bounds))!;
  const bounds = unionBounds(regions.filter(r => r.bounds.y < lineBounds.y + lineBounds.height && r.bounds.y + r.bounds.height > lineBounds.y).map(r => r.bounds))!;
  return { scale, x: bounds.x, bounds, strokeWidth: widths.length ? widths[Math.floor(widths.length / 2)] : 2.1 * scale };
}

export function applyTeachingPlan(args: {snapshotId:string; problemRegionIds:string[]; regionIds:string[]; label:string; scaffold:string|null; completedStep?:string|null; problem?:string; replaceAnnotationId?:string|null; aiWrites?:boolean}) {
  const view = getCurrentView(args.snapshotId);
  if (!view || getPaused()) return {success:false,error:"stale_snapshot_look_again"};
  if (![args.problemRegionIds,args.regionIds].every(ids=>Array.isArray(ids) && ids.length<=80 && ids.every(id=>typeof id==="string" && view.regions.some(r=>r.id===id)))) return {success:false,error:"unknown_region"};
  if (!args.regionIds.every(id=>args.problemRegionIds.includes(id))) return {success:false,error:"outside_problem"};
  const problemBounds = unionBounds(view.regions.filter(r=>args.problemRegionIds.includes(r.id)).map(r=>r.bounds));
  let annotation: (TutorAnnotation & BoundingBox) | null = null;
  const template = args.completedStep ?? args.scaffold;
  if (template != null) {
    // A mode switch takes effect immediately, including during an in-flight tool.
    if (args.aiWrites !== undefined && args.aiWrites !== getPreferences().aiWrites) return {success:false,error:"writing_mode_changed"};
    const blanks = args.completedStep != null ? 0 : 1;
    if ((args.completedStep != null && args.scaffold != null) || typeof template !== "string" || !template || template.length>120 || template.split("{{blank}}").length!==blanks+1 || !/^[a-zA-Z0-9\s+\-*/^=().{},]+$/.test(template) || !problemBounds) return {success:false,error:"invalid_scaffold"};
    const latex = scaffoldLatex(template);
    const drawing = layoutHandwriting(template);
    if (!drawing) return {success:false,error:"invalid_scaffold"};
    const regions = view.regions.filter(r => args.problemRegionIds.includes(r.id));
    const sourceStrokeIds = regions.flatMap(r => r.strokeIds ?? []);
    const existing = getTutorAnnotations();
    const sameColumn = (a: TutorAnnotation) => a.problem?.replace(/\s/g, "") === args.problem?.replace(/\s/g, "") && (
      a.sourceStrokeIds?.some(id => sourceStrokeIds.includes(id)) ||
      (!!a.sourceBounds && overlaps(a.sourceBounds, problemBounds)) ||
      // The student's answer inside a tutor blank belongs to the whole line,
      // even when the model selects only that new handwriting region.
      regions.some(r => overlaps({x:a.x,y:a.y,width:a.width??360,height:a.height??64},r.bounds))
    );
    const duplicate = existing.find(a => sameColumn(a) && a.template?.replace(/\s/g, "") === template.replace(/\s/g, ""));
    if (duplicate) return {success:true,problemBounds,stepPlaced:true,scaffoldPlaced:blanks===1,annotationId:duplicate.id,reused:true};
    const replacement = args.replaceAnnotationId ? existing.find(a => a.id === args.replaceAnnotationId && sameColumn(a)) : undefined;
    if (args.replaceAnnotationId && (!replacement || !replacement.template?.includes("{{blank}}"))) return {success:false,error:"stale_annotation"};
    const previous = existing.findLast(sameColumn);
    const newerInk = previous ? regions.filter(r => r.strokeIds?.length && r.bounds.y >= previous.y + (previous.height ?? 64) + 16) : [];
    const style = handwritingStyle(newerInk.length ? newerInk : regions);
    // Filling an existing blank is not a new line or a new handwriting style.
    const continuation = newerInk.length ? undefined : previous;
    const handwritingScale = replacement?.handwritingScale ?? continuation?.handwritingScale ?? style.scale;
    const handwritingStrokeWidth = replacement?.handwritingStrokeWidth ?? continuation?.handwritingStrokeWidth ?? style.strokeWidth;
    const width = drawing.width * handwritingScale, height = drawing.height * handwritingScale;
    const obstacles=[...(view.obstacles??view.regions.map(r=>r.bounds)), ...existing.filter(a => a !== replacement).map(a=>({x:a.x,y:a.y,width:a.width??360,height:a.height??64}))];
    const columnCenterX = replacement?.columnCenterX ?? continuation?.columnCenterX
      ?? (continuation ? (continuation.sourceBounds ? continuation.sourceBounds.x + continuation.sourceBounds.width / 2 : continuation.x + (continuation.width ?? width) / 2)
        : (style.bounds ?? problemBounds).x + (style.bounds ?? problemBounds).width / 2);
    const bottom = Math.max(problemBounds.y + problemBounds.height, previous ? previous.y + (previous.height ?? 64) : -Infinity);
    const anchor = { x: columnCenterX, y: bottom, width: 0, height: 0 };
    const placement = replacement ? {x:columnCenterX-width/2,y:replacement.y,width,height}
      : scaffoldPosition(view.workspaceWorld ?? view.world,anchor,width,height,obstacles);
    if (!placement) return {success:false,error:"no_writing_space"};
    // Never replace a blank that the student has started filling with their pen.
    if (replacement && view.regions.some(r => r.strokeIds?.length && (overlaps(placement,r.bounds) || overlaps({x:replacement.x,y:replacement.y,width:replacement.width??360,height:replacement.height??64},r.bounds)))) return {success:false,error:"blank_contains_student_ink"};
    annotation={id:replacement?.id ?? crypto.randomUUID(),owner:"tutor",type:"latex",createdAt:Date.now(),latex,template,handwritingScale,handwritingStrokeWidth,problem:args.problem,sourceStrokeIds:[...new Set([...(previous?.sourceStrokeIds??[]),...sourceStrokeIds])],sourceBounds:previous?.sourceBounds??problemBounds,columnCenterX,...placement};
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
  return {success:true,problemBounds,scaffoldPlaced:!!annotation && args.scaffold != null,stepPlaced:!!annotation,annotationId:annotation?.id};
}
