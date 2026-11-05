import {useState} from 'react';
import {PlantDrawingWorkspace} from './PlantDrawingWorkspace';
import {LegacySafetyMapWorkspace} from './LegacySafetyMapWorkspace';
export function SafetyMapWorkspace({onBack,initialDistrictId}:{onBack:()=>void;initialDistrictId?:string}){
 const [legacy,setLegacy]=useState(Boolean(initialDistrictId));
 return legacy?<LegacySafetyMapWorkspace onBack={()=>setLegacy(false)} initialDistrictId={initialDistrictId}/>:<PlantDrawingWorkspace onBack={onBack} onLegacy={()=>setLegacy(true)}/>;
}
