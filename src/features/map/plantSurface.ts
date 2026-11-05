import * as THREE from 'three';

/** Small deterministic texture: no downloads or expensive environment generation. */
export function surfaceGrain(repeat=12) {
  const size=64,bytes=new Uint8Array(size*size*4);
  let seed=1376;
  for(let i=0;i<size*size;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const shade=220+(seed%36);
    bytes.set([shade,shade,shade,255],i*4);
  }
  const texture=new THREE.DataTexture(bytes,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(repeat,repeat);
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

/** Concrete slab joints clipped to the exact source polygon. */
export function slabJoints(points:number[][],height:number) {
  const vertices:number[]=[];
  for(const axis of [0,1]){
    const other=1-axis,low=Math.min(...points.map(p=>p[axis])),high=Math.max(...points.map(p=>p[axis]));
    const step=Math.max(12,(high-low)/35);
    for(let line=low+step;line<high;line+=step){
      const hits:number[]=[];
      points.forEach((a,i)=>{const b=points[(i+1)%points.length];if((a[axis]>line)!==(b[axis]>line))hits.push(a[other]+(line-a[axis])/(b[axis]-a[axis])*(b[other]-a[other]));});
      hits.sort((a,b)=>a-b);
      for(let i=0;i+1<hits.length;i+=2){
        if(axis===0)vertices.push(line,height,hits[i],line,height,hits[i+1]);
        else vertices.push(hits[i],height,line,hits[i+1],height,line);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  return new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x8e8b7e,transparent:true,opacity:.38}));
}
