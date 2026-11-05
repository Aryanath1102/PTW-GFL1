import * as THREE from 'three';
import data from './plantWorld.json';
import {DRAWING} from './drawingMap';
import {industrialDetail} from './industrialDetail';
import {buildingDetail} from './buildingDetail';
import {surfaceGrain,slabJoints} from './plantSurface';

// Footprints and vegetation positions come from D1376. Vertical details are illustrative.
export function buildPlantWorld(){
 const group=new THREE.Group();
 const detail=industrialDetail();
 const architecture=buildingDetail();
 const materials={wall:new THREE.MeshStandardMaterial({color:0xcbd5d6,roughness:.8}),roof:new THREE.MeshStandardMaterial({color:0x65747c,roughness:.65}),road:new THREE.MeshStandardMaterial({color:0x696a63}),ground:new THREE.MeshStandardMaterial({color:0xa6a286}),pad:new THREE.MeshStandardMaterial({color:0xc5bda7}),water:new THREE.MeshStandardMaterial({color:0x198d9d,metalness:.45,roughness:.22}),metal:new THREE.MeshStandardMaterial({color:0xbacbd1,metalness:.6,roughness:.35}),accent:new THREE.MeshStandardMaterial({color:0x208f9e}),wood:new THREE.MeshStandardMaterial({color:0x6b5946}),leaf:new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),line:new THREE.MeshStandardMaterial({color:0xe3dbc0})};
 const grain=surfaceGrain();
 materials.road.map=grain;materials.ground.map=grain;materials.pad.map=grain;
 const mesh=(geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0,id?:string|null)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;if(id)m.userData.id=id;group.add(m);return m;};
 const x=(v:number)=>v-DRAWING.width/2,z=(v:number)=>v-DRAWING.height/2;
 mesh(new THREE.BoxGeometry(2300,8,2050),materials.ground,0,-5,0);
 const segment=(a:number[],b:number[],width:number,height:number,material:THREE.Material,y:number)=>{const dx=b[0]-a[0],dz=b[1]-a[1];const m=mesh(new THREE.BoxGeometry(width,height,Math.hypot(dx,dz)),material,x((a[0]+b[0])/2),y,z((a[1]+b[1])/2));m.rotation.y=Math.atan2(dx,dz);return m;};
 data.roads.forEach((line,roadIndex)=>line.slice(1).forEach((b,i)=>{const a=line[i],width=data.roadWidths[roadIndex][i];segment(a,b,width,1,materials.pad,0);segment(a,b,Math.max(1,width-2),1,materials.road,.6);const length=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let t=6;t<length-6;t+=18){const u=t/length,v=Math.min(t+6,length)/length;segment([a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u],[a[0]+(b[0]-a[0])*v,a[1]+(b[1]-a[1])*v],.6,.1,materials.line,1.2);}}));
 data.boundary.slice(1).forEach((b,i)=>segment(data.boundary[i],b,2,5,materials.wall,2));
 const inside=(px:number,py:number,points:number[][])=>{let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>py)!==(b[1]>py)&&px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 const occupied=data.structures.filter(s=>s.kind==='building'||s.kind==='tank').map(s=>({id:s.id,minX:Math.min(...s.points.map(p=>p[0])),maxX:Math.max(...s.points.map(p=>p[0])),minY:Math.min(...s.points.map(p=>p[1])),maxY:Math.max(...s.points.map(p=>p[1]))}));
 data.structures.forEach((s,structureIndex)=>{
  const firstPart=group.children.length;
  const shape=new THREE.Shape();s.points.forEach((p,i)=>{if(i===0)shape.moveTo(x(p[0]),-z(p[1]));else shape.lineTo(x(p[0]),-z(p[1]));});shape.closePath();
  const flat=['water','yard','tank','process'].includes(s.kind),height=s.kind==='yard'?.15:flat?2:s.height;
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});geometry.rotateX(-Math.PI/2);
  const building=mesh(geometry,s.kind==='water'?materials.water:flat?materials.pad:structureIndex%3===0?architecture.finishes.cool:architecture.finishes.cream,0,s.kind==='yard'?-.5:1,0,s.locationId);
  if(!flat)architecture.add(group,s.points.map(p=>[x(p[0]),z(p[1])]),height,structureIndex,s.locationId);
  const minX=Math.min(...s.points.map(p=>p[0])),maxX=Math.max(...s.points.map(p=>p[0])),minY=Math.min(...s.points.map(p=>p[1])),maxY=Math.max(...s.points.map(p=>p[1]));
  let count=0;for(let px=minX+10;px<maxX-9;px+=24)for(let py=minY+10;py<maxY-9;py+=24){if(count>=12||![[px-10,py-10],[px+10,py-10],[px-10,py+10],[px+10,py+10]].every(p=>inside(p[0],p[1],s.points)))continue;count++;
   if(s.kind==='process'&&!occupied.some(b=>b.id!==s.id&&px+10>b.minX&&px-10<b.maxX&&py+10>b.minY&&py-10<b.maxY))detail.processCell(x(px),z(py),height+1,count);
   else if(s.kind==='tank')detail.tank(x(px),z(py),height+1);
   // Roof equipment is omitted here to keep pitched roofs free of intersecting boxes.
  }
  detail.flush(group,{id:s.locationId});
  if(['process','tank'].includes(s.kind))group.add(slabJoints(s.points.map(p=>[x(p[0]),z(p[1])]),height+1.03));
  building.userData.sourcePath=s.sourcePath;
  // Label all parts of an outline consistently, including roofs and equipment.
  for(const part of group.children.slice(firstPart))Object.assign(part.userData,{
   structureId:s.id,name:s.name||'Unlabeled structure',
   category:s.locationId?DRAWING.locations.find(l=>l.id===s.locationId)?.category:('reviewMethod' in s?'PDF-reviewed facility':'Source name not verified'),
   outline:building,
  });
 });
 // Instancing keeps the tree belts inexpensive on office laptops.
 const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1,1.6,9,5),materials.wood,data.trees.length);
 const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(6.5,1),materials.leaf,data.trees.length);
 const foliage=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(4.7,1),materials.leaf,data.trees.length*2);
 const dummy=new THREE.Object3D();data.trees.forEach((p,i)=>{const scale=.8+(i%7)*.065;dummy.position.set(x(p[0]),4,z(p[1]));dummy.scale.set(1,1,1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);dummy.position.y=11;dummy.scale.set(scale,scale*1.3,scale);dummy.rotation.y=i*2.4;dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);crowns.setColorAt(i,new THREE.Color().setHSL(.22+(i%5)*.018,.38,.23+(i%4)*.035));
 for(let side=0;side<2;side++){
  dummy.position.set(x(p[0])+(side?2.4:-2.4)*scale,9.5+(i%3),z(p[1])+(side?1.5:-1.5)*scale);
  dummy.scale.set(scale,scale*1.1,scale);dummy.updateMatrix();foliage.setMatrixAt(i*2+side,dummy.matrix);
  foliage.setColorAt(i*2+side,new THREE.Color().setHSL(.23+(i%4)*.018,.4,.26+side*.035));
 }});
 trunks.castShadow=true;crowns.castShadow=true;foliage.castShadow=true;group.add(trunks,crowns,foliage);
 return group;
}
