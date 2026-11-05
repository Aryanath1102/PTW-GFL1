import * as THREE from 'three';
import {PERMIT_ACTIVITY,ActivityId} from './permitActivity';
import {activityPlacement} from './permitActivityPlacement';

/** Decorative demonstration only: never reads or changes SAP permit status. */
export function buildPermitActivity() {
  const group=new THREE.Group();group.name='Permit workflow simulation';
  const mat=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:.65});
  const orange=mat(0xd67a22),glass=mat(0x416577),glove=mat(0xd9d5bd);
  const navy=mat(0x243b53),vest=mat(0xefb52c),skin=mat(0xc69776),white=mat(0xf4f1dc),boot=mat(0x263238),screen=mat(0x247f9b),steel=mat(0x6b7c83);
  const box=new THREE.BoxGeometry(1,1,1),head=new THREE.SphereGeometry(.55,10,8),helmet=new THREE.SphereGeometry(.66,10,8,0,Math.PI*2,0,Math.PI/2);
  const mesh=(parent:THREE.Object3D,geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{
    const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;
  };
  function person(parent:THREE.Group,x:number,z:number,tool:'paper'|'tablet'|'wrench',officer=false){
    const root=new THREE.Group();root.position.set(x,.7,z);root.userData={role:'simulated-worker',tool};parent.add(root);
    mesh(root,box,navy,0,3.6,0,1.45,2.1,.8);
    mesh(root,box,officer?vest:orange,0,3.65,.05,1.5,1.7,.88);
    mesh(root,box,white,0,3.3,.51,1.5,.16,.06);
    for(const side of [-1,1])mesh(root,box,white,side*.45,3.9,.51,.13,1.2,.06);
    mesh(root,head,skin,0,5.25,0);
    mesh(root,helmet,officer?white:vest,0,5.65,0);
    mesh(root,box,officer?white:vest,0,5.66,.1,1.4,.12,1.25);
    // Stylized face, protective glasses, helmet ribs, harness and utility pockets.
    mesh(root,head,skin,0,5.2,.48,.23,.28,.35);
    for(const side of [-1,1]){
      mesh(root,head,skin,side*.54,5.25,0,.22,.3,.23);
      mesh(root,box,boot,side*.25,5.37,.48,.47,.34,.12);
      mesh(root,box,glass,side*.25,5.37,.56,.35,.23,.04);
      mesh(root,head,white,side*.25,5.38,.59,.18,.16,.05);
      mesh(root,head,boot,side*.25,5.38,.62,.08,.1,.03);
      mesh(root,box,orange,side*.32,5.97,0,.07,.31,.85);
      mesh(root,box,boot,side*.6,3.75,.54,.16,1.7,.09);
      mesh(root,box,steel,side*.6,3.65,.62,.23,.22,.04);
      mesh(root,box,navy,side*.32,3.55,.55,.4,.5,.12);
      mesh(root,box,steel,side*.32,3.76,.63,.3,.04,.02);
    }
    mesh(root,box,boot,0,5.37,.53,.18,.08,.1);
    mesh(root,box,boot,0,4.99,.49,.28,.04,.04);
    mesh(root,box,boot,0,2.85,.03,1.5,.2,.93);
    mesh(root,box,steel,0,2.85,.53,.24,.22,.07);
    mesh(root,box,orange,-.77,2.7,0,.3,.6,.6);
    const limb=new THREE.CylinderGeometry(.24,.21,1.3,8);
    const legs=[-1,1].map(side=>{const pivot=new THREE.Group();pivot.position.set(side*.43,2.6,0);root.add(pivot);mesh(pivot,box,navy,0,-1.0,0,.6,2,.65);mesh(pivot,box,boot,0,-2,.18,.7,.4,1);return pivot;});
    const arms=[-1,1].map(side=>{const pivot=new THREE.Group();pivot.position.set(side*.95,4.4,0);root.add(pivot);mesh(pivot,limb,officer?navy:orange,0,-.65,0);mesh(pivot,head,glove,0,-1.35,0,.5,.5,.5);return pivot;});
    const held=new THREE.Group();held.position.set(0,-1.35,.35);arms[1].add(held);arms[1].rotation.x=-.5;
    if(tool==='tablet'){
      mesh(held,box,boot,0,0,0,1.05,1.45,.15);mesh(held,box,screen,0,0,.09,.86,1.2,.03);
      for(let i=0;i<3;i++)mesh(held,box,white,0,.32-i*.25,.12,.6,.07,.02);
    }else if(tool==='paper'){
      mesh(held,box,steel,0,0,0,1.1,1.5,.1);mesh(held,box,white,0,0,.07,.95,1.3,.02);
      for(let i=0;i<4;i++)mesh(held,box,navy,0,.35-i*.22,.09,.65,.035,.01);
    }else {mesh(held,box,steel,0,0,0,.18,1.65,.2);mesh(held,box,steel,0,.8,0,.55,.3,.2);}
    return {root,legs,arms,held};
  }
  const anchors=new Map<ActivityId,THREE.Vector3>();
  const actors:Array<{person:ReturnType<typeof person>;stage:ActivityId;index:number;base:THREE.Vector3}>=[];
  const labels:THREE.Sprite[]=[];const rings:THREE.Mesh[]=[];
  for(const stage of PERMIT_ACTIVITY){
    const position=activityPlacement(stage.id),station=new THREE.Group();
    station.position.set(position.x,position.y,position.z);station.rotation.y=position.angle;station.userData={simulation:true,stage:stage.id};group.add(station);
    anchors.set(stage.id,new THREE.Vector3(position.x,position.y+3,position.z));
    const color=mat(stage.color);
    const ring=new THREE.Mesh(new THREE.RingGeometry(8.7,9,48),new THREE.MeshBasicMaterial({color:stage.color,side:THREE.DoubleSide,transparent:true,opacity:.65}));ring.rotation.x=-Math.PI/2;ring.position.y=1.3;station.add(ring);rings.push(ring);
    // A document-review stand; in the work scene it becomes a small maintenance bench.
    mesh(station,box,steel,0,1.5,5,2.8,3,1.5);mesh(station,box,color,0,3.1,5,3.3,.3,2);
    mesh(station,box,white,.2,3.3,5,1.5,.06,1.2);
    if(stage.id==='boiler'){
      const platform=mesh(station,box,steel,0,.45,0,15,.5,17);platform.userData.role='boiler-platform';
      for(const x of [-7,7])for(const z of [-8,8]){
        mesh(station,box,steel,x,-position.y/2,z,.5,position.y,.5);
        mesh(station,box,vest,x,2.4,z,.18,3.8,.18);
      }
      for(const y of [1.4,3.5]){
        for(const x of [-7,7])mesh(station,box,vest,x,y,0,.15,.15,16);
        for(const z of [-8,8])mesh(station,box,vest,0,y,z,14,.15,.15);
      }
      for(const x of [-1,1])mesh(station,box,steel,x,-position.y/2,8.7,.18,position.y,.18);
      for(let y=-position.y+1;y<0;y+=1.2)mesh(station,box,steel,0,y,8.7,2,.15,.15);
      // Isolated cabinet, meter, lockout tag and tool case at the work face.
      mesh(station,box,navy,3,3.3,-.1,2.1,4,1.2);
      mesh(station,box,steel,3,3.3,.55,1.9,3.7,.08);
      mesh(station,box,screen,3,4.4,.64,1.2,.7,.05);
      mesh(station,box,boot,3.7,3,.7,.1,.6,.12);
      mesh(station,box,orange,3.7,2.7,.78,.35,.55,.05);
      mesh(station,box,boot,-4,1.1,0,2,.8,1.3);
      for(let i=0;i<3;i++)mesh(station,box,steel,-4+i*.5,1.6,0,.15,.1,.8);
    }
    if(stage.id==='working'){
      for(const z of [-8,8])for(const x of [-3,3]){
        mesh(station,box,vest,x,2,z,.25,2,.25);mesh(station,box,boot,x,1.1,z,1,.15,1);
      }
      for(const z of [-8,8])mesh(station,box,vest,0,2.8,z,6,.18,.12);
      mesh(station,new THREE.CylinderGeometry(.8,.8,4,12),steel,0,3,-3);
    }
    for(let i=0;i<3;i++){
      const p=person(station,(i-1)*2.2,i===1?3:-2,i===0?'tablet':(stage.id==='working'||stage.id==='boiler')&&i===2?'wrench':'paper',i===1);
      if(i===1)p.root.rotation.y=Math.PI;
      if(stage.id==='boiler'&&i===2){p.root.position.set(3,.7,2);p.root.rotation.y=Math.PI;}
      if(stage.id==='drill'&&i===0)p.root.position.x=-2;
      actors.push({person:p,stage:stage.id,index:i,base:p.root.position.clone()});
    }
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');if(ctx){
      ctx.fillStyle='#0b1e2b';ctx.fillRect(0,0,512,128);ctx.fillStyle='#'+stage.color.toString(16).padStart(6,'0');ctx.fillRect(0,0,8,128);
      ctx.font='600 29px sans-serif';ctx.fillText(stage.title,24,49);ctx.fillStyle='#b9cbd4';ctx.font='21px sans-serif';ctx.fillText('SIMULATION · '+stage.location,24,91);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.position.set(0,21,0);sprite.scale.set(48,12,1);station.add(sprite);labels.push(sprite);
    }
  }
  let elapsed=0;
  return {group,anchors,update(delta:number,moving:boolean,camera:THREE.Camera){
    if(moving)elapsed+=Math.min(delta,.05);
    for(const actor of actors){
      const {person:p,stage,index,base}=actor;
      if((stage==='operator'||stage==='drill')&&index===0){
        const pace=stage==='drill'?1.8:1;
        const phase=(elapsed*.09*pace)%1,travel=phase<.5?phase*2:(1-phase)*2;
        p.root.position.z=base.z-9+travel*9;p.root.rotation.y=phase<.5?0:Math.PI;
        p.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(elapsed*5*pace+i*Math.PI)*.38*pace);
        p.arms[0].rotation.x=-Math.sin(elapsed*5*pace)*.3*pace;
      }else{
        p.arms[1].rotation.x=(stage==='boiler'&&index===2?-1.1:-.5)+Math.sin(elapsed*2+index)*.12;
        p.root.rotation.z=Math.sin(elapsed*1.2+index)*.015;
        p.arms[0].rotation.x=-.3+Math.sin(elapsed*(stage==='working'?2:1)+index)*.12;
        p.held.rotation.x=-.2+Math.sin(elapsed+index)*.06;
        p.root.position.y=base.y+Math.sin(elapsed*1.4+index)*.035;
      }
    }
    rings.forEach((ring,i)=>(ring.material as THREE.MeshBasicMaterial).opacity=.5+Math.sin(elapsed*1.6+i)*.12);
    labels.forEach(label=>{const position=new THREE.Vector3();label.getWorldPosition(position);const width=THREE.MathUtils.clamp(camera.position.distanceTo(position)*.09,32,180);label.scale.set(width,width/4,1);});
  }};
}
