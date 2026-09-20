import { pointXY, type CanvasElement } from "./types";
import type { BoundingBox } from "../tutor/types";

type Point = [number, number];
type Segment = { a: Point; b: Point; bounds: BoundingBox };
export interface InkRegion { bounds: BoundingBox; strokeIds: string[] }
const near = (a: BoundingBox, b: BoundingBox, gap: number) => a.x <= b.x+b.width+gap && a.x+a.width+gap >= b.x && a.y <= b.y+b.height+gap && a.y+a.height+gap >= b.y;
function bounds(points: Point[]): BoundingBox {
  const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
  const x=Math.min(...xs), y=Math.min(...ys);
  return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
}
function distance(p: Point, a: Point, b: Point) {
  const dx=b[0]-a[0], dy=b[1]-a[1];
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function touches(a: Segment, b: Segment, gap: number) {
  if (!near(a.bounds,b.bounds,gap)) return false;
  const cross=(p:Point,q:Point,r:Point)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  if (near(a.bounds,b.bounds,0) && cross(a.a,a.b,b.a)*cross(a.a,a.b,b.b)<=0 && cross(b.a,b.b,a.a)*cross(b.a,b.b,a.b)<=0) return true;
  return Math.min(distance(a.a,b.a,b.b),distance(a.b,b.a,b.b),distance(b.a,a.a,a.b),distance(b.b,a.a,a.b))<=gap;
}

/** Rectangle overlap is only a broad-phase test; curved ink must actually meet. */
export function connectedInk(elements: CanvasElement[], gap=7): InkRegion[] {
  const strokes=elements.filter(el=>!el.isDeleted && el.type==="freedraw" && el.points.length).map(el=>{
    const points=(el as Extract<CanvasElement,{type:"freedraw"}>).points.map(p=>{const [x,y]=pointXY(p);return [x+el.x,y+el.y] as Point;});
    const segments=points.map((p,i)=>({a:points[Math.max(0,i-1)],b:p,bounds:bounds([points[Math.max(0,i-1)],p])}));
    return {id:el.id,bounds:bounds(points),segments};
  });
  const parents=strokes.map((_,i)=>i);
  const root=(i:number):number=>parents[i]===i?i:(parents[i]=root(parents[i]));
  for(let i=0;i<strokes.length;i++) for(let j=0;j<i;j++) {
    if(root(i)===root(j) || !near(strokes[i].bounds,strokes[j].bounds,gap)) continue;
    if(strokes[i].segments.some(a=>strokes[j].segments.some(b=>touches(a,b,gap)))) parents[root(i)]=root(j);
  }
  const groups=new Map<number,InkRegion>();
  strokes.forEach((stroke,i)=>{
    const key=root(i), existing=groups.get(key), b=stroke.bounds;
    if(!existing) groups.set(key,{bounds:b,strokeIds:[stroke.id]});
    else {
      const a=existing.bounds, x=Math.min(a.x,b.x),y=Math.min(a.y,b.y);
      existing.bounds={x,y,width:Math.max(a.x+a.width,b.x+b.width)-x,height:Math.max(a.y+a.height,b.y+b.height)-y};
      existing.strokeIds.push(stroke.id);
    }
  });
  return [...groups.values()].sort((a,b)=>a.bounds.x-b.bounds.x || a.bounds.y-b.bounds.y);
}
