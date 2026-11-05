import {useEffect,useRef,useState} from 'react';
import {DRAWING,DRAWING_IMAGE} from './drawingMap';
import type {DrawingSceneProps} from './DrawingThreeScene';
export function DrawingMap2d({selected,focusRequest,command,onSelect,onError}:DrawingSceneProps){
 const svg=useRef<SVGSVGElement>(null);
 const lastCommand=useRef(command.id);
 const [view,setView]=useState({x:0,y:0,width:DRAWING.width,height:DRAWING.height});
 const drag=useRef<{x:number;y:number;view:typeof view;distance:number;matrix:DOMMatrix}|null>(null);
 const zoom=(factor:number,anchor?:{x:number;y:number})=>setView(v=>{const width=Math.min(DRAWING.width*2,Math.max(180,v.width*factor)),height=width*DRAWING.height/DRAWING.width;const a=anchor||{x:v.x+v.width/2,y:v.y+v.height/2};return {x:a.x-(a.x-v.x)*width/v.width,y:a.y-(a.y-v.y)*height/v.height,width,height};});
 const point=(x:number,y:number)=>{const matrix=svg.current?.getScreenCTM();return matrix?new DOMPoint(x,y).matrixTransform(matrix.inverse()):new DOMPoint(x,y);};
 useEffect(()=>{if(selected){const width=420,height=width*DRAWING.height/DRAWING.width;setView({x:selected.x-width/2,y:selected.y-height/2,width,height});}},[selected,focusRequest]);
 useEffect(()=>{if(command.id===lastCommand.current)return;lastCommand.current=command.id;if(command.type==='fit')setView({x:0,y:0,width:DRAWING.width,height:DRAWING.height});else if(command.type==='in'||command.type==='out')zoom(command.type==='in'?.75:1.33);},[command]);
 useEffect(()=>{const el=svg.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();zoom(e.deltaY<0?.85:1.18,point(e.clientX,e.clientY));};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 const radius=Math.max(3,view.width/180);
 return <svg ref={svg} className="absolute inset-0 h-full w-full touch-none" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} role="img" aria-label="GFL A drawing with selectable location points"
 onPointerDown={e=>{if(e.button!==0)return;const p=point(e.clientX,e.clientY);const matrix=svg.current?.getScreenCTM()?.inverse();if(!matrix)return;drag.current={x:p.x,y:p.y,view,distance:0,matrix};e.currentTarget.setPointerCapture(e.pointerId);}}
 onPointerMove={e=>{const d=drag.current;if(!d)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(d.matrix);const dx=p.x-d.x,dy=p.y-d.y;d.distance=Math.max(d.distance,Math.hypot(dx,dy));setView({...d.view,x:d.view.x-dx,y:d.view.y-dy});}}
 onPointerUp={e=>{const d=drag.current;drag.current=null;if(d&&d.distance<radius){const p=point(e.clientX,e.clientY);const nearest=DRAWING.locations.map(item=>({item,d:Math.hypot(item.x-p.x,item.y-p.y)})).sort((a,b)=>a.d-b.d)[0];if(nearest?.d<radius*3)onSelect(nearest.item);}if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
 onPointerCancel={()=>{drag.current=null;}}>
 <image href={DRAWING_IMAGE} width={DRAWING.width} height={DRAWING.height} onError={onError}/>
 {DRAWING.locations.map(item=><circle key={item.id} cx={item.x} cy={item.y} r={radius} fill={selected?.id===item.id?'#0369a1':'#0e7490'} fillOpacity={.8} stroke="white" strokeWidth={radius*.2}><title>{item.name}</title></circle>)}
 {selected&&<g pointerEvents="none"><circle cx={selected.x} cy={selected.y} r={radius*2.8} fill="none" stroke="#007fa7" strokeWidth={radius*.5}/><path d={`M${selected.x} ${selected.y-radius*3}v${-radius*6}`} stroke="#007fa7" strokeWidth={radius*.6}/><circle cx={selected.x} cy={selected.y-radius*9} r={radius*1.5} fill="#007fa7"/></g>}
 </svg>;
}
