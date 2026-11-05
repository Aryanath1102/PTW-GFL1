import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {DRAWING,DrawingLocation,drawingWorld} from './drawingMap';
import {buildPlantWorld} from './buildPlantWorld';
import {buildPermitActivity} from './buildPermitActivity';
import {ActivityId,ActivityMode,PERMIT_ACTIVITY} from './permitActivity';
export interface DrawingSceneProps {
 selected:DrawingLocation|null;
 focusRequest:number;
 command:{id:number;type:'fit'|'in'|'out'|'top'|'visit'|ActivityId};
 onSelect:(item:DrawingLocation)=>void;
 onError:()=>void;
 onInteract?:()=>void;
 onReady?:()=>void;
 activityMode?:ActivityMode;
}
export default function DrawingThreeScene(props:DrawingSceneProps){
 const lastCommand=useRef(props.command.id);
 const host=useRef<HTMLDivElement>(null),latest=useRef(props);latest.current=props;
 const api=useRef<{focus:(item:DrawingLocation)=>void;command:(type:DrawingSceneProps['command']['type'])=>void}|null>(null);
 useEffect(()=>{
  const element=host.current;if(!element)return;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});}catch{latest.current.onError();return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x07131e,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;element.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','3D plant world based on GFL A drawing. Heights are illustrative. Use the location directory for keyboard selection.');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,1,15000);
  scene.background=new THREE.Color(0xdfe6e8);
  scene.fog=new THREE.Fog(0xdfe6e8,3500,11000);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=45;controls.maxDistance=9000;controls.maxPolarAngle=Math.PI/2.12;
  const world=(p:{x:number;y:number},height=0)=>{const w=drawingWorld(p);return new THREE.Vector3(w.x,height,w.z);};
  scene.add(new THREE.HemisphereLight(0xd8f0ff,0x625d50,1.5));
  const sun=new THREE.DirectionalLight(0xffecd1,3.2);sun.position.set(-650,1200,400);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-1200,right:1200,top:1100,bottom:-1100,near:1,far:3000});sun.shadow.bias=-.0002;sun.shadow.normalBias=.12;scene.add(sun);
  const plant=buildPlantWorld();scene.add(plant);
  const activity=buildPermitActivity();scene.add(activity.group);let previousTime=0;
  let frame=0,overview=true,firstFrame=true;
  const dots:THREE.Mesh[]=[];
  DRAWING.locations.forEach(item=>{const dot=new THREE.Mesh(new THREE.SphereGeometry(6,10,8),new THREE.MeshBasicMaterial({color:0x087caa}));dot.position.copy(world(item,50));Object.assign(dot.userData,{id:item.id,name:item.name,category:item.category});scene.add(dot);dots.push(dot);});
  const marker=new THREE.Group();scene.add(marker);marker.visible=false;
  const ring=new THREE.Mesh(new THREE.RingGeometry(18,22,48),new THREE.MeshBasicMaterial({color:0x007da4,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=5;marker.add(ring);
  const halo=new THREE.Mesh(new THREE.RingGeometry(27,30,48),new THREE.MeshBasicMaterial({color:0x0891b2,side:THREE.DoubleSide,transparent:true,opacity:.65}));halo.rotation.x=-Math.PI/2;halo.position.y=5;marker.add(halo);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(1.8,1.8,85,8),new THREE.MeshBasicMaterial({color:0x007da4}));pole.position.y=47;marker.add(pole);
  const tip=new THREE.Mesh(new THREE.OctahedronGeometry(10),new THREE.MeshBasicMaterial({color:0x006b8b}));tip.position.y=95;marker.add(tip);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let flight:{start:number;from:THREE.Vector3;to:THREE.Vector3;fromTarget:THREE.Vector3;target:THREE.Vector3}|null=null;
  const fly=(target:THREE.Vector3,to:THREE.Vector3,instant=false)=>{if(reduced.matches||instant){flight=null;camera.position.copy(to);controls.target.copy(target);controls.update();}else flight={start:performance.now(),from:camera.position.clone(),to,fromTarget:controls.target.clone(),target};};
  const fit=(instant=false)=>{overview=true;const radius=Math.hypot(DRAWING.width,DRAWING.height)/2;const half=Math.min(THREE.MathUtils.degToRad(21),Math.atan(Math.tan(THREE.MathUtils.degToRad(21))*camera.aspect));fly(new THREE.Vector3(),new THREE.Vector3(.18,1,.6).normalize().multiplyScalar(radius/Math.sin(half)*1.06),instant);};
  const focus=(item:DrawingLocation)=>{overview=false;marker.visible=true;marker.position.copy(world(item));dots.forEach(d=>(d.material as THREE.MeshBasicMaterial).color.setHex(d.userData.id===item.id?0x003e59:0x087caa));const target=world(item);fly(target,target.clone().add(new THREE.Vector3(100,310,260)));};
  api.current={focus,command(type){if(PERMIT_ACTIVITY.some(s=>s.id===type)){overview=false;const target=activity.anchors.get(type as ActivityId)!;marker.visible=false;fly(target.clone(),target.clone().add(new THREE.Vector3(22,26,38)));return;}if(type==='fit')fit();else{overview=false;const target=controls.target.clone(),offset=camera.position.clone().sub(target);if(type==='visit'&&latest.current.selected){const point=world(latest.current.selected,18);fly(point,point.clone().add(new THREE.Vector3(55,65,110)));}else if(type==='top')fly(target,target.clone().add(new THREE.Vector3(0,offset.length(),.1)));else{offset.setLength(THREE.MathUtils.clamp(offset.length()*(type==='in'?.75:1.33),45,9000));fly(target,target.clone().add(offset));}}}};
  const resize=new ResizeObserver(()=>{const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();if(overview)fit(true);});resize.observe(element);fit(true);if(latest.current.selected)focus(latest.current.selected);if(latest.current.command.id&&PERMIT_ACTIVITY.some(stage=>stage.id===latest.current.command.type))api.current.command(latest.current.command.type);
  const canvas=renderer.domElement;
  canvas.tabIndex=0;
  const tooltip=document.createElement('div');tooltip.setAttribute('role','tooltip');tooltip.id='plant-world-hover';
  tooltip.className='pointer-events-none absolute z-10 max-w-[240px] rounded-xl border border-cyan-400/70 bg-slate-950/95 px-3 py-2 text-xs text-white shadow-xl';
  tooltip.style.display='none';element.appendChild(tooltip);
  const title=document.createElement('div'),detail=document.createElement('div');title.className='font-semibold';detail.className='mt-1 text-[10px] text-slate-300';tooltip.append(title,detail);
  let outline:THREE.LineSegments|null=null,hovered:string|null=null,dragging=false;
  const clearHover=()=>{tooltip.style.display='none';canvas.style.cursor='grab';canvas.removeAttribute('aria-describedby');hovered=null;if(outline){scene.remove(outline);outline.geometry.dispose();(outline.material as THREE.Material).dispose();outline=null;}};
  const ray=new THREE.Raycaster();
  const hitAt=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2),camera);
   // Respect the nearest visible surface; never pick a named building through another object.
   return ray.intersectObjects([...dots,plant],true)[0];};
  const showHover=(e:PointerEvent)=>{const hit=hitAt(e),object=hit?.object;if(!object?.userData.name){clearHover();return;}
   const key=object.userData.structureId||object.userData.id;
   if(key!==hovered){clearHover();hovered=key;title.textContent=object.userData.name;detail.textContent=object.userData.id?`${object.userData.category} · Click to visit`:`${object.userData.category} · ${object.userData.structureId}`;
    const base=object.userData.outline as THREE.Mesh|undefined;
    if(base){outline=new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry),new THREE.LineBasicMaterial({color:0x67e8f9}));outline.position.copy(base.position);scene.add(outline);}
   }
   tooltip.style.display='block';canvas.style.cursor=object.userData.id?'pointer':'help';canvas.setAttribute('aria-describedby',tooltip.id);
   const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
   tooltip.style.left=`${Math.max(8,Math.min(x+14,r.width-tooltip.offsetWidth-8))}px`;
   tooltip.style.top=`${Math.max(8,Math.min(y+16,r.height-tooltip.offsetHeight-8))}px`;
  };
  controls.addEventListener('start',()=>{flight=null;overview=false;clearHover();latest.current.onInteract?.();});
  let down={x:0,y:0},maxTravel=0;
  const pointerDown=(e:PointerEvent)=>{dragging=true;down={x:e.clientX,y:e.clientY};maxTravel=0;clearHover();};
  const move=(e:PointerEvent)=>{if(dragging){maxTravel=Math.max(maxTravel,Math.hypot(e.clientX-down.x,e.clientY-down.y));return;}if(e.pointerType!=='touch')showHover(e);};
  const pick=(e:PointerEvent)=>{dragging=false;if(e.button!==0||maxTravel>6)return;const hit=hitAt(e);if(!hit)return;const item=DRAWING.locations.find(x=>x.id===hit.object.userData.id);if(item){clearHover();latest.current.onSelect(item);}else showHover(e);};
  const leave=()=>{dragging=false;clearHover();};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')clearHover();};
  const lost=(e:Event)=>{e.preventDefault();clearHover();latest.current.onError();};
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',pick);canvas.addEventListener('pointerleave',leave);canvas.addEventListener('pointercancel',leave);canvas.addEventListener('keydown',key);canvas.addEventListener('blur',clearHover);canvas.addEventListener('webglcontextlost',lost);
  const animate=(time:number)=>{frame=requestAnimationFrame(animate);if(document.hidden){previousTime=time;return;}const delta=previousTime?(time-previousTime)/1000:0;previousTime=time;activity.group.visible=latest.current.activityMode!=='hidden';if(activity.group.visible)activity.update(delta,latest.current.activityMode==='playing'&&!reduced.matches,camera);if(flight){clearHover();const t=Math.min(1,(time-flight.start)/900),ease=t*t*(3-2*t);camera.position.lerpVectors(flight.from,flight.to,ease);controls.target.lerpVectors(flight.fromTarget,flight.target,ease);if(t===1)flight=null;}controls.update();halo.scale.setScalar(reduced.matches?1:1+Math.sin(time*.003)*.12);try{renderer.render(scene,camera);if(firstFrame){firstFrame=false;latest.current.onReady?.();}}catch{cancelAnimationFrame(frame);latest.current.onError();}};frame=requestAnimationFrame(animate);
  return()=>{clearHover();tooltip.remove();api.current=null;cancelAnimationFrame(frame);resize.disconnect();controls.dispose();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',pick);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('pointercancel',leave);canvas.removeEventListener('keydown',key);canvas.removeEventListener('blur',clearHover);canvas.removeEventListener('webglcontextlost',lost);const textures=new Set<THREE.Texture>();scene.traverse(obj=>{const mesh=obj as THREE.Mesh;if(obj instanceof THREE.InstancedMesh)obj.dispose();mesh.geometry?.dispose();if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>{const map=(m as THREE.MeshStandardMaterial).map;if(map)textures.add(map);m.dispose();});});textures.forEach(texture=>texture.dispose());renderer.dispose();canvas.remove();};
 },[]);
 useEffect(()=>{if(props.selected)api.current?.focus(props.selected);},[props.selected,props.focusRequest]);
 useEffect(()=>{if(props.command.id!==lastCommand.current){lastCommand.current=props.command.id;api.current?.command(props.command.type);}},[props.command]);
 return <div ref={host} className="absolute inset-0 touch-none"/>;
}
