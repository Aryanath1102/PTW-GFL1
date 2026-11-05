import * as THREE from 'three';

/** Architectural finishes are illustrative; all roofs use the source polygon. */
export function buildingDetail() {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const finishes = {
    blue: new THREE.MeshStandardMaterial({color:0x3198c6,roughness:.43,metalness:.22,side:THREE.DoubleSide}),
    red: new THREE.MeshStandardMaterial({color:0x98634b,roughness:.5,metalness:.18,side:THREE.DoubleSide}),
    grey: new THREE.MeshStandardMaterial({color:0xa9a496,roughness:.88,metalness:.08,side:THREE.DoubleSide}),
    white: new THREE.MeshStandardMaterial({color:0xe8e9df,roughness:.7,side:THREE.DoubleSide}),
    cream: new THREE.MeshStandardMaterial({color:0xe4e0d0,roughness:.85}),
    cool: new THREE.MeshStandardMaterial({color:0xc7d2da,roughness:.8}),
    frame: new THREE.MeshStandardMaterial({color:0x6a7c79,roughness:.5,metalness:.25}),
    glass: new THREE.MeshStandardMaterial({color:0x264a60,roughness:.22,metalness:.3}),
    trim: new THREE.MeshStandardMaterial({color:0xf0efdf,roughness:.6}),
    door: new THREE.MeshStandardMaterial({color:0x718995,roughness:.6,metalness:.25}),
    yellow: new THREE.MeshStandardMaterial({color:0xf2c752,roughness:.65}),
  };
  return {
    finishes,
    add(group:THREE.Group,points:number[][],height:number,index:number,id:string|null) {
      const batches=new Map<keyof typeof finishes,THREE.Matrix4[]>();
      const dummy=new THREE.Object3D();
      const add=(finish:keyof typeof finishes,x:number,y:number,z:number,w:number,h:number,d:number,angle=0)=>{
        dummy.position.set(x,y,z);dummy.rotation.set(0,angle,0);dummy.scale.set(w,h,d);dummy.updateMatrix();
        if(!batches.has(finish))batches.set(finish,[]);
        batches.get(finish)!.push(dummy.matrix.clone());
      };
      const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
      const minZ=Math.min(...points.map(p=>p[1])),maxZ=Math.max(...points.map(p=>p[1]));
      const axis=maxX-minX<maxZ-minZ?0:1;
      const low=axis===0?minX:minZ,high=axis===0?maxX:maxZ,mid=(low+high)/2;
      const rise=Math.min(5,(high-low)*.12),eave=height+1.25;
      const roofY=(p:number[])=>eave+rise*(1-Math.abs(p[axis]-mid)/Math.max(.01,(high-low)/2));
      const shape=new THREE.Shape(points.map(p=>new THREE.Vector2(p[0],p[1])));
      const flat=new THREE.ShapeGeometry(shape),positions=flat.attributes.position,indices=flat.index!;
      const vertices:number[]=[];
      // Split every source triangle at the ridge, including concave footprints.
      const clip=(polygon:number[][],side:number)=>{
        const out:number[][]=[];
        polygon.forEach((p,i)=>{const q=polygon[(i+1)%polygon.length],a=(p[axis]-mid)*side>=0,b=(q[axis]-mid)*side>=0;
          if(a)out.push(p);
          if(a!==b){const t=(mid-p[axis])/(q[axis]-p[axis]);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
        });return out;
      };
      for(let i=0;i<indices.count;i+=3){const triangle=[0,1,2].map(n=>{const j=indices.getX(i+n);return [positions.getX(j),positions.getY(j)];});
        for(const side of [-1,1]){const polygon=clip(triangle,side);for(let j=1;j<polygon.length-1;j++)for(const p of [polygon[0],polygon[j],polygon[j+1]])vertices.push(p[0],roofY(p),p[1]);}
      }
      flat.dispose();
      // Close the triangular gable ends and sloping fascia above the wall tops.
      points.forEach((a,i)=>{
        const b=points[(i+1)%points.length];
        const edge=[a];
        if((a[axis]-mid)*(b[axis]-mid)<0){const t=(mid-a[axis])/(b[axis]-a[axis]);edge.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
        edge.push(b);
        for(let j=1;j<edge.length;j++){
          const p=edge[j-1],q=edge[j];
          vertices.push(p[0],height+1,p[1],q[0],height+1,q[1],q[0],roofY(q),q[1],p[0],height+1,p[1],q[0],roofY(q),q[1],p[0],roofY(p),p[1]);
        }
      });
      const roofGeometry=new THREE.BufferGeometry();roofGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));roofGeometry.computeVertexNormals();
      const roof=new THREE.Mesh(roofGeometry,index%9===0?finishes.red:index%3===0?finishes.white:index%2===0?finishes.grey:finishes.blue);
      roof.castShadow=true;roof.receiveShadow=true;roof.userData.id=id;roof.userData.detail='pitched-roof';group.add(roof);
      // Trim, columns and inset window frames follow each actual façade edge.
      points.forEach((a,i)=>{
        const b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
        if(length<2)return;
        const angle=-Math.atan2(dz,dx),cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2;
        add('frame',cx,1.7,cz,length,1.1,.4,angle);
        add('frame',cx,height+.85,cz,length,.65,.6,angle);
        add('door',a[0],height/2+1,a[1],.35,height,.5,angle);
        const bays=Math.min(16,Math.floor(length/7));
        for(let k=0;k<=bays;k++){
          const t=bays?k/bays:.5;
          add('trim',a[0]+dx*t,height/2+1,a[1]+dz*t,.35,height,.45,angle);
        }
        for(let k=0;k<bays;k++){
          const t=(k+.5)/bays,px=a[0]+dx*t,pz=a[1]+dz*t;
          const levels=Math.max(1,Math.min(4,Math.floor(height/7)));
          for(let floor=0;floor<levels;floor++){
            const y=4+floor*6;
            if(y+1.5>height)continue;
            add('trim',px,y,pz,3.2,2.7,.55,angle);
            add('glass',px,y,pz,2.7,2.2,.65,angle);
            add('trim',px,y,pz,.12,2.2,.7,angle);
            add('trim',px,y-1.3,pz,3.5,.25,1,angle);
          }
        }
        if(length>14&&i%2===0){
          add('frame',cx,3.7,cz,5.8,5.5,.75,angle);
          add('door',cx,3.6,cz,5.2,5,.85,angle);
          for(let y=1.5;y<6;y+=.65)add('trim',cx,y,cz,5.1,.07,.9,angle);
          add('yellow',cx,1.15,cz,6.3,.2,1.1,angle);
          add('glass',cx,3.2,cz,.25,.9,1.05,angle);
          add('trim',cx,6.65,cz,6.4,.3,2.1,angle);
        }
      });
      // Roof seams clipped to the footprint, so narrow or irregular roofs stay clean.
      const across=1-axis;
      const start=across===0?minX:minZ,end=across===0?maxX:maxZ;
      const spacing=Math.max(3,(end-start)/30);
      for(let t=start+spacing;t<end;t+=spacing){
        const hits:number[]=[];
        points.forEach((a,i)=>{const b=points[(i+1)%points.length];if((a[across]>t)!==(b[across]>t))hits.push(a[axis]+(t-a[across])/(b[across]-a[across])*(b[axis]-a[axis]));});
        hits.sort((a,b)=>a-b);
        for(let i=0;i+1<hits.length;i+=2){
          const breaks=[hits[i],...(hits[i]<mid&&hits[i+1]>mid?[mid]:[]),hits[i+1]];
          for(let j=1;j<breaks.length;j++){
            const a=axis===0?[breaks[j-1],t]:[t,breaks[j-1]],b=axis===0?[breaks[j],t]:[t,breaks[j]];
            const from=new THREE.Vector3(a[0],roofY(a)+.08,a[1]),to=new THREE.Vector3(b[0],roofY(b)+.08,b[1]);
            const delta=to.clone().sub(from);dummy.position.copy(from.add(to).multiplyScalar(.5));dummy.scale.set(.1,delta.length(),.1);
            dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());dummy.updateMatrix();
            if(!batches.has('frame'))batches.set('frame',[]);batches.get('frame')!.push(dummy.matrix.clone());
          }
        }
      }
      for(const [finish,matrices] of batches){
        const mesh=new THREE.InstancedMesh(box,finishes[finish],matrices.length);
        matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.computeBoundingSphere();mesh.castShadow=true;mesh.receiveShadow=true;
        mesh.userData.id=id;mesh.userData.detail='facade';group.add(mesh);
      }
    },
  };
}
