import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AVENUES, SAFETY_DISTRICTS, STREETS } from '../../core/ptw/safetyDistricts';
import { SelectedEntity, SelectedEntityCategory } from './types';
import { districtVertices, focusDistance, locationCenter, plantToWorld, PlantLocation } from './plantGeometry';

interface Props {
  selection: SelectedEntity;
  focusRequest: number;
  command: { id: number; type: 'fit' | 'in' | 'out' | 'top' };
  onSelect: (category: SelectedEntityCategory, item: PlantLocation) => void;
  onUnavailable: () => void;
}
export default function PlantThreeScene({ selection, focusRequest, command, onSelect, onUnavailable }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const selectionRef = useRef(selection);
  const initialFocus = useRef(focusRequest);
  const callbacks = useRef({ onSelect, onUnavailable });
  callbacks.current = { onSelect, onUnavailable };
  const controller = useRef<{ focus: (selection: SelectedEntity) => void; command: (type: Props['command']['type']) => void } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch { callbacks.current.onUnavailable(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor(0x07131e, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D plant map. Use the location directory to select an area with the keyboard.');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 1, 12000);
    camera.position.set(1300, 1900, 1700);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.minDistance = 150;
    controls.maxDistance = 4300;
    controls.maxPolarAngle = Math.PI / 2.2;
    controls.enablePan = true;
    scene.add(new THREE.HemisphereLight(0xb5e9ff, 0x14273b, 2.8));
    const light = new THREE.DirectionalLight(0xc7f9ff, 3);
    light.position.set(-500, 1200, 400); scene.add(light);
    const ground = new THREE.Mesh(new THREE.BoxGeometry(2100, 14, 1320), new THREE.MeshStandardMaterial({ color: 0x0c2232, roughness: .82, metalness: .25 }));
    ground.position.y = -10; scene.add(ground);
    const grid = new THREE.GridHelper(3000, 60, 0x204d63, 0x102b3e); grid.position.y = -2; scene.add(grid);
    const objects: THREE.Object3D[] = [];
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const labels: THREE.Sprite[] = [];
    const textures: THREE.Texture[] = [];
    const keyFor = (category: string, id: string) => category + ':' + id;
    const addLabel = (text: string, x: number, z: number) => {
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 64;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.fillStyle = 'rgba(5,20,31,0.88)'; ctx.fillRect(0,0,160,64);
      ctx.strokeStyle = '#34768a'; ctx.strokeRect(1,1,158,62);
      ctx.font = '600 28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#dcf9ff'; ctx.fillText(text,80,32);
      const texture = new THREE.CanvasTexture(canvas); textures.push(texture); texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
      sprite.position.set(x,58,z); sprite.scale.set(75,30,1); sprite.renderOrder = 3; scene.add(sprite); labels.push(sprite);
    };
    SAFETY_DISTRICTS.forEach(item => {
      const points = districtVertices(item);
      const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x - 1000, 610 - p.y)));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 18, bevelEnabled: false }); geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshStandardMaterial({ color: 0x174458, emissive: 0x082738, emissiveIntensity: .5, roughness: .5, metalness: .4 });
      const mesh = new THREE.Mesh(geometry, material); mesh.userData = { category: 'DISTRICT', item }; scene.add(mesh); objects.push(mesh);
      materials.set(keyFor('DISTRICT',item.id),material);
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x4192a6, transparent: true, opacity: .65 })); scene.add(outline);
      const p = plantToWorld(item.center); addLabel(item.id,p.x,p.z);
    });
    const addRoad = (category: SelectedEntityCategory, item: typeof AVENUES[number] | typeof STREETS[number]) => {
      const a = plantToWorld({x:item.x1,y:item.y1}), b = plantToWorld({x:item.x2,y:item.y2});
      const length = Math.hypot(b.x-a.x,b.z-a.z);
      const material = new THREE.MeshStandardMaterial({ color: category === 'AVENUE' ? 0x37677c : 0x294658, emissive: 0x082738 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(length,2,6),material);
      mesh.position.set((a.x+b.x)/2,22,(a.z+b.z)/2); mesh.rotation.y = -Math.atan2(b.z-a.z,b.x-a.x);
      mesh.userData = {category,item}; scene.add(mesh); objects.push(mesh); materials.set(keyFor(category,item.id), material);
    };
    AVENUES.forEach(item=>addRoad('AVENUE',item)); STREETS.forEach(item=>addRoad('STREET',item));
    const marker = new THREE.Group(); scene.add(marker);
    const ring = new THREE.Mesh(new THREE.RingGeometry(18,23,64),new THREE.MeshBasicMaterial({color:0x67e8f9,side:THREE.DoubleSide,transparent:true})); ring.rotation.x=-Math.PI/2; ring.position.y=29; marker.add(ring);
    const halo = new THREE.Mesh(new THREE.RingGeometry(27,29,64),new THREE.MeshBasicMaterial({color:0x67e8f9,side:THREE.DoubleSide,transparent:true,opacity:.5})); halo.rotation.x=-Math.PI/2;halo.position.y=28;marker.add(halo);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2,2,110,12),new THREE.MeshBasicMaterial({color:0x67e8f9,transparent:true,opacity:.8}));beam.position.y=80;marker.add(beam);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(12),new THREE.MeshStandardMaterial({color:0xcffafe,emissive:0x22d3ee,emissiveIntensity:1}));tip.position.y=143;marker.add(tip);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let flight: {from:THREE.Vector3; to:THREE.Vector3; fromTarget:THREE.Vector3; target:THREE.Vector3; start:number} | null = null;
    const fly = (target: THREE.Vector3, position: THREE.Vector3) => {
      if (motion.matches) { camera.position.copy(position);controls.target.copy(target); flight=null;controls.update();return; }
      flight={from:camera.position.clone(),to:position,fromTarget:controls.target.clone(),target,start:performance.now()};
    };
    const focus = (selected:SelectedEntity) => {
      materials.forEach((mat,key)=>{const active=key===keyFor(selected.category,selected.item.id);mat.emissive.setHex(active?0x18a6bc:0x082738);mat.emissiveIntensity=active?.85:.45;});
      const p=plantToWorld(locationCenter(selected.item));marker.position.set(p.x,0,p.z);
      const target=new THREE.Vector3(p.x,0,p.z), distance=focusDistance(selected.item);
      fly(target,target.clone().add(new THREE.Vector3(.45,1.1,.95).multiplyScalar(distance)));
    };
    controller.current={focus,command(type){
      if(type==='fit')fly(new THREE.Vector3(),new THREE.Vector3(1300,1900,1700));
      else if(type==='top')fly(controls.target.clone(),controls.target.clone().add(new THREE.Vector3(0,Math.max(500,camera.position.distanceTo(controls.target)),1)));
      else {const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*(type==='in'?.75:1.33),150,4300));fly(controls.target.clone(),controls.target.clone().add(offset));}
    }};
    focus(selectionRef.current);
    if (!initialFocus.current) { flight=null;camera.position.set(1300,1900,1700);controls.target.set(0,0,0);controls.update(); }
    const cancelFlight=()=>{flight=null;};controls.addEventListener('start',cancelFlight);
    const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();let down={x:0,y:0};
    const pointerDown=(event:PointerEvent)=>{down={x:event.clientX,y:event.clientY};};
    const pick=(event:PointerEvent)=>{
      if(event.button!==0||Math.hypot(event.clientX-down.x,event.clientY-down.y)>6)return;
      const rect=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(mouse,camera);const hit=raycaster.intersectObjects(objects,false)[0];
      if(hit)callbacks.current.onSelect(hit.object.userData.category,hit.object.userData.item);
    };
    renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointerup',pick);
    const lost=(event:Event)=>{event.preventDefault();callbacks.current.onUnavailable();};renderer.domElement.addEventListener('webglcontextlost',lost);
    const resize=new ResizeObserver(()=>{const w=element.clientWidth,h=element.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe(element);
    let frame=0;
    const animate=(now:number)=>{
      frame=requestAnimationFrame(animate); if(document.hidden)return;
      if(flight){const t=Math.min(1,(now-flight.start)/1000),ease=t*t*(3-2*t);camera.position.lerpVectors(flight.from,flight.to,ease);controls.target.lerpVectors(flight.fromTarget,flight.target,ease);if(t===1)flight=null;}
      controls.update();
      const pulse=motion.matches?1:1+Math.sin(now*.003)*.14;halo.scale.setScalar(pulse);tip.rotation.y=motion.matches?0:now*.0007;
      labels.forEach(label=>{const size=THREE.MathUtils.clamp(camera.position.distanceTo(label.position)*.055,48,130);label.scale.set(size,size*.4,1);});
      renderer.render(scene,camera);
    }; frame=requestAnimationFrame(animate);
    return()=>{
      controller.current=null;cancelAnimationFrame(frame);resize.disconnect();controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',pointerDown);renderer.domElement.removeEventListener('pointerup',pick);renderer.domElement.removeEventListener('webglcontextlost',lost);
      scene.traverse(object=>{const obj=object as THREE.Mesh;obj.geometry?.dispose();if(obj.material){(Array.isArray(obj.material)?obj.material:[obj.material]).forEach(mat=>mat.dispose());}});
      textures.forEach(texture=>texture.dispose());renderer.dispose();renderer.domElement.remove();
    };
  },[]);
  useEffect(()=>{selectionRef.current=selection;if(focusRequest)controller.current?.focus(selection);},[selection,focusRequest]);
  useEffect(()=>{if(command.id)controller.current?.command(command.type);},[command]);
  return <div ref={host} className="absolute inset-0 touch-none" />;
}
