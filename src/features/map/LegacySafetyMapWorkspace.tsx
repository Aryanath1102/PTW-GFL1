import React, { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { AVENUES, SAFETY_DISTRICTS, STREETS, SafetyDistrict } from '../../core/ptw/safetyDistricts';
import { PlantInteractiveSvg } from './PlantInteractiveSvg';
import { SelectedEntity, SelectedEntityCategory } from './types';
import { locationCenter, PlantLocation } from './plantGeometry';
const PlantThreeScene = lazy(() => import('./PlantThreeScene'));
interface SafetyMapWorkspaceProps { onBack: () => void; initialDistrictId?: string; }
const layers = { districts: true, hatches: true, avenues: true, streets: true, pins: false };
const ignore = () => {};
const button = 'plant-control';
export const LegacySafetyMapWorkspace: React.FC<SafetyMapWorkspaceProps> = ({ onBack, initialDistrictId }) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState<SelectedEntityCategory>('DISTRICT');
  const [selection, setSelection] = useState<SelectedEntity>(() => {
    const item = SAFETY_DISTRICTS.find(d => d.id === initialDistrictId || d.code === initialDistrictId) || SAFETY_DISTRICTS[0];
    return { category: 'DISTRICT', item, pinCoords: item.center };
  });
  const [focusRequest, setFocusRequest] = useState(initialDistrictId ? 1 : 0);
  const [command, setCommand] = useState<{id:number;type:'fit'|'in'|'out'|'top'}>({id:0,type:'fit'});
  const [viewState, setViewState] = useState({ x: 0, y: 0, scale: 1 });
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const locations = useMemo(() => [
    ...SAFETY_DISTRICTS.map(item => ({ category: 'DISTRICT' as const, item })),
    ...AVENUES.map(item => ({ category: 'AVENUE' as const, item })),
    ...STREETS.map(item => ({ category: 'STREET' as const, item })),
  ], []);
  const results = useMemo(() => locations.filter(({item,category}) => query.trim()
    ? `${item.id} ${item.name} ${'owner' in item ? item.owner : ''}`.toLowerCase().includes(query.trim().toLowerCase()) : category===filter), [locations,query,filter]);
  const focus2d = (point:{x:number;y:number}) => setViewState({scale:2,x:1000-point.x*2,y:610-point.y*2});
  const select = useCallback((category:SelectedEntityCategory,item:PlantLocation) => {
    const point=locationCenter(item);setSelection({category,item,pinCoords:point});focus2d(point);setFocusRequest(value=>value+1);setDirectoryOpen(false);
  },[]);
  const navigate=(type:typeof command.type)=>{
    setCommand(prev=>({id:prev.id+1,type}));
    if(type==='fit')setViewState({x:0,y:0,scale:1});
    else if(type==='in'||type==='out')setViewState(prev=>{const scale=Math.min(4.5,Math.max(.55,prev.scale*(type==='in'?1.25:.8)));return {scale,x:1000-(1000-prev.x)*scale/prev.scale,y:610-(610-prev.y)*scale/prev.scale};});
  };
  const district=selection.category==='DISTRICT'?selection.item as SafetyDistrict:null;
  const fallback=useCallback(()=>{setUnavailable(true);setMode('2d');},[]);
  return <section className="plant-explorer">
    <style>{`
      .plant-explorer{height:calc(100dvh - 4rem);min-height:560px;display:flex;flex-direction:column;background:#07131e;color:#dcebf4;font-family:inherit;overflow:hidden}
      .plant-explorer button:focus-visible,.plant-explorer input:focus-visible{outline:2px solid #67e8f9;outline-offset:3px}
      .plant-control{min-height:42px;min-width:42px;padding:0 13px;border:1px solid #264251;border-radius:10px;color:#cde1eb;background:#102431;font-size:12px;font-weight:600;transition:background .2s,border-color .2s}
      .plant-control:hover{background:#1c3a49;border-color:#4c8597}.plant-control[aria-pressed=true]{background:#164251;color:#a5f3fc;border-color:#37aabe}
      .plant-eyebrow{font-size:10px;letter-spacing:.18em;font-weight:700;text-transform:uppercase;color:#7ca7ba}
      .plant-location{display:block;width:100%;text-align:left;border:1px solid transparent;border-radius:12px;padding:13px;margin-bottom:5px;transition:background .2s,border-color .2s;background:transparent}
      .plant-location:hover{background:#132b39}.plant-location[aria-pressed=true]{background:linear-gradient(110deg,#133d4c,#112936);border-color:#34768a;box-shadow:inset 3px 0 #67e8f9}
      .plant-map-stage{background:radial-gradient(ellipse at 50% 40%,#153b4c 0%,#091c2a 48%,#06121e 100%)}
      .plant-map-stage canvas{display:block;max-width:100%}.plant-detail{background:linear-gradient(115deg,#122c3a,#0a1b28);border-top:1px solid #294351}
      .plant-enter{animation:plant-enter .45s ease-out}@keyframes plant-enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @media(prefers-reduced-motion:reduce){.plant-explorer *{animation:none!important;transition:none!important}}
    `}</style>
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button className={button} onClick={onBack} aria-label="Back to dashboard"><span className="material-symbols-outlined text-lg">arrow_back</span></button>
        <div><p className="plant-eyebrow mb-1">Dahej complex / district reference</p><h1 className="text-lg font-semibold tracking-tight text-white">Safety-district reference<span className="ml-3 hidden rounded border border-cyan-800 px-2 py-0.5 align-middle text-[10px] tracking-widest text-cyan-200 sm:inline">{mode.toUpperCase()}</span></h1></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 pr-4 text-xs text-slate-400 md:flex"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />{SAFETY_DISTRICTS.length} mapped districts</div>
        <button className={`${button} lg:hidden`} aria-expanded={directoryOpen} aria-controls="map-directory" onClick={()=>setDirectoryOpen(!directoryOpen)}>{directoryOpen?'Close':'Locations'}</button>
        <button className={button} aria-pressed={mode==='3d'} disabled={unavailable} onClick={()=>setMode('3d')}>3D</button>
        <button className={button} aria-pressed={mode==='2d'} onClick={()=>setMode('2d')}>2D</button>
      </div>
    </header>
    <div className="relative flex min-h-0 flex-1">
      {directoryOpen&&<button aria-label="Close location directory" onClick={()=>setDirectoryOpen(false)} className="absolute inset-0 z-20 bg-black/50 lg:hidden" />}
      <aside id="map-directory" className={`${directoryOpen?'flex':'hidden'} absolute inset-y-0 left-0 z-30 w-[min(320px,87vw)] flex-col border-r border-white/10 bg-[#0b1d2a] lg:static lg:flex lg:w-[300px] lg:shrink-0`}>
        <div className="border-b border-white/10 p-4">
          <label htmlFor="map-location-search" className="plant-eyebrow mb-3 block">Location directory</label>
          <div className="flex items-center gap-2 rounded-xl border border-[#2c4959] bg-[#071621] px-3"><span className="material-symbols-outlined text-lg text-slate-400">search</span><input id="map-location-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find an area or road" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white placeholder:text-slate-500" /></div>
          <div className="mt-3 flex gap-1" aria-label="Location category">{(['DISTRICT','AVENUE','STREET'] as const).map(type=><button key={type} className={`${button} flex-1 !min-w-0 !px-2 !text-[11px]`} aria-pressed={filter===type&&!query} onClick={()=>{setFilter(type);setQuery('');}}>{type==='DISTRICT'?'Districts':type==='AVENUE'?'Avenues':'Streets'}</button>)}</div>
        </div>
        <div className="flex items-center justify-between px-5 pb-1 pt-4"><p className="plant-eyebrow">{query?'Search results':filter==='DISTRICT'?'Safety districts':filter==='AVENUE'?'Avenues':'Streets'}</p><span className="text-xs text-slate-400">{results.length}</span></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Map locations">
          {!results.length&&<p className="px-3 py-8 text-sm text-slate-400">No locations found. Try a name or district number.</p>}
          {results.map(({category,item})=><button key={`${category}-${item.id}`} className="plant-location" aria-pressed={selection.item.id===item.id&&selection.category===category} onClick={()=>select(category,item)}>
            <div className="mb-1.5 flex items-center justify-between"><span className="font-mono text-[11px] font-semibold tracking-wider text-cyan-200">{item.id}</span><span className="material-symbols-outlined text-base text-cyan-300/60">{selection.item.id===item.id&&selection.category===category?'my_location':'north_east'}</span></div>
            <span className="block text-[13px] leading-5 text-slate-200">{'shortLabel' in item?item.shortLabel:item.name}</span>
          </button>)}
        </div>
        <div className="border-t border-white/10 p-4 text-[11px] leading-5 text-slate-500">Reference drawing: GFL-PP-DWG-SD-04-15-D0127.<br/>3D heights are illustrative.</div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="plant-map-stage relative min-h-[250px] flex-1 overflow-hidden">
          <div className="pointer-events-none absolute left-5 top-5 z-10"><p className="plant-eyebrow">{mode==='3d'?'Spatial view':'Drawing view'}</p><p className="mt-1 text-xs text-slate-400">Select a district to explore</p></div>
          {mode==='3d'?<Suspense fallback={<div role="status" className="flex h-full items-center justify-center text-sm text-cyan-100">Preparing the plant view…</div>}><PlantThreeScene selection={selection} focusRequest={focusRequest} command={command} onSelect={select} onUnavailable={fallback}/></Suspense>:
            <PlantInteractiveSvg currentSelection={selection} onSelectEntity={select} activePermits={[]} onSelectPermit={ignore} layers={layers} theme="dark" hoverTarget="" onHoverTargetChange={ignore} cursorCoords={{x:0,y:0}} onCursorCoordsChange={ignore} interactionMode="inspect" onTriggerPinDropModal={ignore} viewState={viewState} setViewState={setViewState}/>}
          <div className="absolute right-4 top-4 flex flex-col gap-2" role="group" aria-label="Map navigation">
            <button className={button} onClick={()=>navigate('in')} aria-label="Zoom in">+</button><button className={button} onClick={()=>navigate('out')} aria-label="Zoom out">−</button>
            <button className={button} onClick={()=>navigate('fit')} aria-label="Show whole plant"><span className="material-symbols-outlined text-lg">fit_screen</span></button>
            {mode==='3d'&&<button className={button} onClick={()=>navigate('top')} aria-label="Top view"><span className="material-symbols-outlined text-lg">layers</span></button>}
          </div>
          <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-white/10 bg-[#081622]/90 px-3 py-2 text-[11px] text-slate-400">{unavailable?'3D is unavailable on this device. Showing the 2D map.':mode==='3d'?'Drag to orbit · Right-drag to pan · Scroll to zoom':'Drag to move · Scroll to zoom'}</div>
          <div className="pointer-events-none absolute bottom-4 right-4 text-center text-cyan-200"><span className="material-symbols-outlined text-2xl">view_in_ar</span><span className="block text-[9px] text-slate-500">Plant layout</span></div>
        </div>
        <div className="plant-detail shrink-0 px-5 py-4" aria-live="polite">
          <div key={`${selection.category}-${selection.item.id}`} className="plant-enter flex items-start justify-between gap-4">
            <div className="min-w-0"><div className="mb-2 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_12px_#22d3ee]"/><span className="plant-eyebrow !text-cyan-200">Selected location · {selection.item.id}</span></div><h2 className="text-sm font-semibold leading-6 text-white sm:text-base">{selection.item.name}</h2>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400">{district&&<span>Area owner <span className="ml-1 text-slate-200">{district.owner}</span></span>}{district?.nearestGate&&<span>{district.nearestGate}</span>}<span className="font-mono text-slate-500">Drawing {Math.round(selection.pinCoords.x)}, {Math.round(selection.pinCoords.y)}</span></div>
            </div>
            <button className={`${button} shrink-0 !border-cyan-700 !bg-cyan-900/40 !text-cyan-100`} onClick={()=>{setFocusRequest(n=>n+1);focus2d(selection.pinCoords);}}>Locate <span aria-hidden="true">↗</span></button>
          </div>
        </div>
      </div>
    </div>
  </section>;
};
