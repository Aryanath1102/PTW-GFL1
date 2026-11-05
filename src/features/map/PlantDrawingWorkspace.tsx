import {useCallback,useEffect,useRef,useState} from 'react';
import {DRAWING,DRAWING_PDF,DrawingLocation} from './drawingMap';
import {DrawingMap2d} from './DrawingMap2d';
import {PlantSceneLoader} from './PlantSceneLoader';
import {PERMIT_ACTIVITY,ActivityId,ActivityMode} from './permitActivity';
const control='min-h-10 rounded-lg border border-slate-600/60 bg-[#132d3d] px-3 text-xs font-semibold text-slate-200 hover:border-cyan-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';
export function PlantDrawingWorkspace({onBack,onLegacy}:{onBack:()=>void;onLegacy:()=>void}){
 const workspace=useRef<HTMLElement>(null);
 const [fullscreen,setFullscreen]=useState(false);
 useEffect(()=>{
  const sync=()=>setFullscreen(document.fullscreenElement===workspace.current);
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setFullscreen(false);setDirectory(false);}};
  document.addEventListener('fullscreenchange',sync);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('fullscreenchange',sync);document.removeEventListener('keydown',escape);};
 },[]);
 useEffect(()=>{if(!fullscreen)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[fullscreen]);
 const toggleFullscreen=async()=>{
  if(fullscreen){if(document.fullscreenElement===workspace.current)await document.exitFullscreen();setFullscreen(false);}
  else {setFullscreen(true);try{await workspace.current?.requestFullscreen?.();}catch{/* Expanded app view is the fallback. */}}
 };
 const [tour,setTour]=useState(false);
 const [activityMode,setActivityMode]=useState<ActivityMode>('playing');
 const [activityId,setActivityId]=useState<ActivityId|null>(null);
 const [selected,setSelected]=useState<DrawingLocation|null>(null),[query,setQuery]=useState(''),[category,setCategory]=useState('All');
 const [mode,setMode]=useState<'3d'|'2d'>('3d'),[directory,setDirectory]=useState(false),[no3d,setNo3d]=useState(false),[imageError,setImageError]=useState(false);
 const [focusRequest,setFocusRequest]=useState(0),[command,setCommand]=useState<{id:number;type:'fit'|'in'|'out'|'top'|'visit'|ActivityId}>({id:0,type:'fit'});
 const items=DRAWING.locations.filter(item=>(category==='All'||item.category===category)&&`${item.name} ${item.sourceLabel}`.toLowerCase().includes(query.toLowerCase().trim()));
 const select=useCallback((item:DrawingLocation)=>{setActivityId(null);setTour(false);setSelected(item);setFocusRequest(n=>n+1);setDirectory(false);},[]);
 useEffect(()=>{if(!tour||!items.length)return;const timer=window.setInterval(()=>{setSelected(current=>items[(items.findIndex(item=>item.id===current?.id)+1)%items.length]);setFocusRequest(n=>n+1);},6500);return()=>clearInterval(timer);},[tour,query,category]);
 const step=(direction:number)=>{const index=items.findIndex(item=>item.id===selected?.id);if(items.length)select(items[(index+direction+items.length)%items.length]);};
 const unavailable=useCallback(()=>{setTour(false);setNo3d(true);setMode('2d');},[]);
 const navigate=(type:typeof command.type)=>{if(!PERMIT_ACTIVITY.some(stage=>stage.id===type))setActivityId(null);setTour(false);setCommand(prev=>({id:prev.id+1,type}));};
 const sceneProps={selected,focusRequest,command,activityMode,onSelect:select,onError:unavailable,onInteract:()=>setTour(false)};
 return <section ref={workspace} className={`flex min-h-0 flex-col overflow-hidden bg-[#071622] text-slate-200 ${fullscreen?'fixed inset-0 z-[100] h-[100dvh] w-screen':'h-[calc(100dvh-4rem)]'}`}>
  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
   <div className="flex items-center gap-3"><button className={control} onClick={onBack} aria-label="Back to dashboard">←</button><div><p className="text-[10px] uppercase tracking-[.18em] text-cyan-300">Dahej complex / GFL A</p><h1 className="mt-1 text-lg font-semibold text-white">Plant world explorer</h1></div></div>
   <div className="flex flex-wrap items-center gap-2"><button className={control} onClick={()=>setDirectory(!directory)} aria-expanded={directory} aria-controls="drawing-directory">{directory?'Close locations':'Locations'}</button><button className={`${control} ${mode==='3d'?'!border-cyan-400':''}`} onClick={()=>{setNo3d(false);setImageError(false);setMode('3d');}} aria-pressed={mode==='3d'}>{no3d?'Retry 3D':'3D world'}</button><button className={`${control} ${mode==='2d'?'!border-cyan-400':''}`} onClick={()=>{setTour(false);setMode('2d');}} aria-pressed={mode==='2d'}>2D plan</button><a className={`${control} inline-flex items-center`} href={DRAWING_PDF} target="_blank" rel="noopener noreferrer">Original PDF ↗</a><button className={control} onClick={()=>void toggleFullscreen()} aria-pressed={fullscreen}>{fullscreen?'Exit fullscreen':'Fullscreen'}</button></div>
  </header>
  {mode==='3d'&&<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#0c2432] px-4 py-2">
   <label htmlFor="activity-scene" className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Simulation</label>
   <select id="activity-scene" className={`${control} min-w-0 max-w-full`} value={activityId||''} onChange={e=>{const id=e.target.value as ActivityId;if(!id){setActivityId(null);navigate('fit');return;}setActivityId(id);if(activityMode==='hidden')setActivityMode('paused');navigate(id);}}>
    <option value="">Choose a work scene</option>{PERMIT_ACTIVITY.map(stage=><option key={stage.id} value={stage.id}>{stage.title} / {stage.location}</option>)}
   </select>
   <button className={control} onClick={()=>setActivityMode(activityMode==='playing'?'paused':'playing')} aria-pressed={activityMode==='playing'}>{activityMode==='playing'?'Pause':'Play'}</button>
   <button className={control} onClick={()=>setActivityMode(activityMode==='hidden'?'paused':'hidden')} aria-pressed={activityMode!=='hidden'}>{activityMode==='hidden'?'Show people':'Hide people'}</button>
   <span className="ml-auto text-[10px] text-slate-400">Illustrative / not live permit status</span>
  </div>}
  <div className="relative flex min-h-0 flex-1">
   {directory&&<button className="absolute inset-0 z-20 bg-black/50" aria-label="Close location directory" onClick={()=>setDirectory(false)}/>}
   <aside id="drawing-directory" className={`${directory?'flex':'hidden'} absolute inset-y-0 left-0 z-30 w-[min(310px,87vw)] flex-col border-r border-white/10 bg-[#0b1e2b] shadow-2xl`}>
    <div className="space-y-3 border-b border-white/10 p-4"><label htmlFor="drawing-search" className="block text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">Find a location</label><button className="absolute right-4 top-3 text-xs text-slate-300" onClick={()=>setDirectory(false)} aria-label="Close locations">Close</button><input id="drawing-search" type="search" className="w-full rounded-lg border border-slate-600 bg-[#071622] px-3 py-2.5 text-sm text-white focus:outline-cyan-300" placeholder="Plant, utility, storage or gate" value={query} onChange={e=>setQuery(e.target.value)}/><label className="flex items-center justify-between text-xs text-slate-400">Category<select className="rounded-md border border-slate-600 bg-[#102a3a] px-2 py-2 text-slate-200" value={category} onChange={e=>setCategory(e.target.value)}>{['All','Production','Utilities','Storage','Services','Access'].map(c=><option key={c}>{c}</option>)}</select></label></div>
    <div className="flex justify-between px-4 pb-2 pt-4 text-[10px] uppercase tracking-widest text-slate-400"><span>Labeled locations</span><span>{items.length} / {DRAWING.locations.length}</span></div>
    <div className="min-h-0 flex-1 overflow-auto p-2">{!items.length&&<p className="p-4 text-sm text-slate-400">No matching location.</p>}{items.map(item=><button key={item.id} aria-pressed={selected?.id===item.id} onClick={()=>select(item)} className={`mb-1 w-full rounded-xl border p-3 text-left focus-visible:outline-cyan-300 ${selected?.id===item.id?'border-cyan-500 bg-cyan-900/30':'border-transparent hover:bg-white/5'}`}><span className="block text-[10px] uppercase tracking-wider text-cyan-300/80">{item.category}</span><span className="mt-1 block text-sm leading-5">{item.name}</span></button>)}</div>
    <div className="space-y-2 border-t border-white/10 p-4"><p className="text-[10px] leading-5 text-slate-400">Drawing D1376 · Sheet 1<br/>Layout follows the supplied drawing. Heights and equipment are illustrative.</p><button className={`${control} w-full`} onClick={onLegacy}>Safety-district reference ↗</button></div>
   </aside>
   <div className="flex min-w-0 flex-1 flex-col">
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(ellipse_at_center,#173d50,#071622)]">
     {imageError?<div role="alert" className="flex h-full items-center justify-center p-6 text-center text-sm">The drawing image could not load. Open the original PDF above.</div>:mode==='3d'?<PlantSceneLoader {...sceneProps}/>:<DrawingMap2d {...sceneProps} onError={()=>setImageError(true)}/>}
     <div className="pointer-events-none absolute left-4 top-4 rounded-lg border border-white/10 bg-[#071622]/90 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-cyan-200">{mode==='3d'?'3D plant world':'Plan drawing'}</p></div>
     <div className="absolute right-4 top-4 flex flex-col gap-2" role="group" aria-label="Drawing navigation"><button className={control} onClick={()=>navigate('in')} aria-label="Zoom in">+</button><button className={control} onClick={()=>navigate('out')} aria-label="Zoom out">−</button><button className={control} onClick={()=>navigate('fit')}>Fit</button>{mode==='3d'&&<button className={control} onClick={()=>navigate('top')}>Top</button>}</div>
     <p className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-[#071622]/90 px-3 py-2 text-[11px] text-slate-300">{no3d?'3D did not open; use Retry 3D · 2D drawing enabled':mode==='3d'?'Drag to orbit · Right-drag to pan · Scroll to zoom':'Drag to pan · Scroll to zoom'}<span className="hidden sm:inline"> · Click a blue location point</span></p>
    </div>
    <div className="flex shrink-0 items-center justify-between gap-4 border-t border-cyan-900/60 bg-[#102b3a] px-4 py-2" aria-live="polite"><div><h2 className="text-sm font-semibold text-white">{activityId?PERMIT_ACTIVITY.find(stage=>stage.id===activityId)?.title:selected?.name||'Explore the plant'}</h2><p className="text-[11px] text-slate-400">{activityId?PERMIT_ACTIVITY.find(stage=>stage.id===activityId)?.location:selected?.category||'Choose a location or work scene'}</p></div><div className="flex flex-wrap justify-end gap-2">{activityId&&<details className="relative"><summary className={`${control} flex cursor-pointer items-center`}>Scene details</summary><p className="absolute bottom-12 right-0 z-20 w-[min(320px,80vw)] rounded-xl border border-slate-600 bg-[#0b1e2b] p-4 text-xs leading-5 shadow-xl">{PERMIT_ACTIVITY.find(stage=>stage.id===activityId)?.description}</p></details>}<button className={control} disabled={!items.length} onClick={()=>step(-1)} aria-label="Previous location">←</button><button className={control} disabled={!items.length} onClick={()=>step(1)} aria-label="Next location">→</button>{selected&&mode==='3d'&&<button className={control} onClick={()=>{setTour(false);navigate('visit');}}>Visit section</button>}<button className={control} disabled={!items.length} aria-pressed={tour} onClick={()=>{setActivityId(null);if(!selected&&items[0])select(items[0]);setTour(!tour);}}>{tour?'Pause tour':'Start tour'}</button></div></div>
   </div>
  </div>
 </section>;
}
