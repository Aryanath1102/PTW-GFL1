import {DRAWING} from './drawingMap';
import world from './plantWorld.json';
import {PERMIT_ACTIVITY,ActivityId} from './permitActivity';

/** Place illustrative activity along existing road segments, never through buildings. */
export function activityPlacement(id:ActivityId) {
  const definition=PERMIT_ACTIVITY.find(s=>s.id===id)!;
  const location=DRAWING.locations.find(l=>l.name===definition.location)!;
  if(id==='boiler'){
    const structure=world.structures.find(s=>s.locationId===location.id&&s.kind==='process');
    if(!structure)throw new Error('Boiler footprint missing');
    const x=structure.points.reduce((v,p)=>v+p[0],0)/structure.points.length;
    const z=structure.points.reduce((v,p)=>v+p[1],0)/structure.points.length;
    return {x:x-DRAWING.width/2,z:z-DRAWING.height/2,y:42,angle:0,width:16,location};
  }
  let best:{a:number[];b:number[];t:number;length:number;width:number;distance:number}|undefined;
  world.roads.forEach((road,r)=>road.slice(1).forEach((b,i)=>{
    const a=road[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(length<35||world.roadWidths[r][i]<8)return;
    const margin=Math.min(.4,18/length);
    const t=Math.max(margin,Math.min(1-margin,((location.x-a[0])*dx+(location.y-a[1])*dy)/(length*length)));
    const distance=Math.hypot(a[0]+t*dx-location.x,a[1]+t*dy-location.y);
    if(!best||distance<best.distance)best={a,b,t,length,width:world.roadWidths[r][i],distance};
  }));
  if(!best)throw new Error('No mapped corridor for permit activity');
  const segment=best as {a:number[];b:number[];t:number;length:number;width:number;distance:number};
  const dx=(segment.b[0]-segment.a[0])/segment.length,dz=(segment.b[1]-segment.a[1])/segment.length;
  return {y:0,x:segment.a[0]+segment.t*(segment.b[0]-segment.a[0])-DRAWING.width/2,
    z:segment.a[1]+segment.t*(segment.b[1]-segment.a[1])-DRAWING.height/2,
    angle:Math.atan2(dx,dz),width:segment.width,location};
}
