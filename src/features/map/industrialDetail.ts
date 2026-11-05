import * as THREE from 'three';

type Point = [number, number, number];

/** Illustrative equipment within source footprints, batched by material and shape. */
export function industrialDetail() {
  const materials = {
    steel: new THREE.MeshStandardMaterial({ color: 0x667d77, metalness: .4, roughness: .4 }),
    tank: new THREE.MeshStandardMaterial({color:0xc5d1ae,roughness:.64,metalness:.18}),
    blue: new THREE.MeshStandardMaterial({color:0x429db5,roughness:.5,metalness:.2}),
    silver: new THREE.MeshStandardMaterial({ color: 0xd6dadd, metalness: .4, roughness: .29 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xe8ae27, metalness: .38, roughness: .4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x354149, metalness: .45, roughness: .6 }),
  };
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
    cap: new THREE.ConeGeometry(1, 1, 20),
    ring: new THREE.TorusGeometry(1, .035, 4, 24),
  };
  type Finish = keyof typeof materials;
  type Form = keyof typeof geometries;
  const batches = new Map<string, { form: Form; finish: Finish; matrices: THREE.Matrix4[] }>();
  const dummy = new THREE.Object3D();
  function part(form: Form, finish: Finish, position: Point, scale: Point, rotation?: THREE.Quaternion) {
    dummy.position.set(...position); dummy.scale.set(...scale);
    dummy.quaternion.copy(rotation || new THREE.Quaternion()); dummy.updateMatrix();
    const key = `${form}:${finish}`;
    if (!batches.has(key)) batches.set(key, { form, finish, matrices: [] });
    batches.get(key)!.matrices.push(dummy.matrix.clone());
  }
  function bar(a: Point, b: Point, width: number, finish: Finish = 'steel', round = false) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.sub(from);
    const center = from.addScaledVector(delta, .5);
    part(round ? 'cylinder' : 'box', finish, center.toArray() as Point,
      [width, delta.length(), width], new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  }
  function rail(cx: number, cz: number, y: number, span: number) {
    for (const side of [-1, 1]) {
      const z = cz + side * span;
      for (const level of [1.1, 2.3]) bar([cx-span,y+level,z],[cx+span,y+level,z],.16,'yellow');
      for (const dx of [-span, 0, span]) bar([cx+dx,y,z],[cx+dx,y+2.3,z],.18,'yellow');
    }
    for (const side of [-1,1]) for (const level of [1.1,2.3])
      bar([cx+side*span,y+level,cz-span],[cx+side*span,y+level,cz+span],.16,'yellow');
  }
  function ladder(cx: number, cz: number, bottom: number, top: number) {
    for (const side of [-1,1]) bar([cx+side*.65,bottom,cz],[cx+side*.65,top+2,cz],.15,'yellow');
    for(let y=bottom+.8;y<top+1;y+=1) bar([cx-.65,y,cz],[cx+.65,y,cz],.12,'steel');
  }
  function vessel(cx: number, cz: number, base: number, height: number, radius: number) {
    part('cylinder','tank',[cx,base+height/2,cz],[radius,height,radius]);
    part('cap','tank',[cx,base+height+.8,cz],[radius,1.6,radius]);
    const horizontal = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
    for(let y=base+2;y<base+height;y+=4) part('ring','steel',[cx,y,cz],[radius+.05,radius+.05,radius+.05],horizontal);
    part('cylinder','dark',[cx,base+.3,cz],[radius+.5,.6,radius+.5]);
    // External riser, crossover and flange.
    bar([cx+radius+1,base+1,cz],[cx+radius+1,base+height+3,cz],.45,'yellow',true);
    bar([cx,base+height+3,cz],[cx+radius+1,base+height+3,cz],.45,'yellow',true);
    bar([cx,base+height,cz],[cx,base+height+3,cz],.45,'yellow',true);
    part('cylinder','steel',[cx+radius+1,base+3,cz],[.7,.35,.7]);
  }
  function processCell(cx: number, cz: number, floor: number, index: number) {
    const deck = floor + 12, top = floor + 23;
    for(const dx of [-8,8]) for(const dz of [-8,8]) {
      part('box','dark',[cx+dx,floor+.4,cz+dz],[2,.8,2]);
      bar([cx+dx,floor,cz+dz],[cx+dx,top,cz+dz],.65);
    }
    for(const y of [deck,top]) {
      for(const side of [-1,1]) {
        bar([cx-8,y,cz+side*8],[cx+8,y,cz+side*8],.65);
        bar([cx+side*8,y,cz-8],[cx+side*8,y,cz+8],.65);
      }
      // A perimeter walkway leaves the equipment bay open.
      for(const side of [-1,1]) {
        part('box','silver',[cx,y,cz+side*7],[16,.35,2]);
        part('box','silver',[cx+side*7,y,cz],[2,.35,12]);
      }
      rail(cx,cz,y,8);
    }
    for(const side of [-1,1]) {
      bar([cx-8,floor+1,cz+side*8],[cx+8,deck,cz+side*8],.3);
      bar([cx+8,floor+1,cz+side*8],[cx-8,deck,cz+side*8],.3);
    }
    vessel(cx,cz,floor+2,index%3===0?34:26,3.5);
    ladder(cx+6.5,cz-8.3,floor,top);
    // Pump motor, maintenance plinth and a visible valve at the lower deck.
    part('box','dark',[cx-5,floor+.5,cz-4],[3,1,4]);
    bar([cx-5,floor+1.8,cz-5],[cx-5,floor+1.8,cz-2],.85,'blue',true);
    part('ring','yellow',[cx+4.5,floor+5,cz],[.7,.7,.7]);
    bar([cx+3.5,floor+5,cz],[cx+4.5,floor+5,cz],.16,'steel',true);
    // Parallel process lines with rack supports and visible couplings.
    for(let n=0;n<4;n++) {
      const z=cz-4.5+n*1.2;
      bar([cx-10,deck+1,z],[cx+10,deck+1,z],.32,'silver',true);
    }
  }
  return {
    processCell,
    tank(cx: number, cz: number, floor: number) {
      vessel(cx,cz,floor,20,6.5);
      rail(cx,cz,floor+21,5);
      ladder(cx+7,cz,floor,floor+21);
    },
    flush(group: THREE.Group, metadata: Record<string, unknown>) {
      for(const {form,finish,matrices} of batches.values()) {
        const mesh=new THREE.InstancedMesh(geometries[form],materials[finish],matrices.length);
        matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
        mesh.castShadow=true;mesh.receiveShadow=true;Object.assign(mesh.userData,metadata);
        mesh.computeBoundingSphere();group.add(mesh);
      }
      batches.clear();
    },
  };
}
