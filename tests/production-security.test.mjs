import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const output = await build({stdin:{contents: `export { checklistApi } from './src/core/api/modules/checklist.api'; export { permitApproverApi } from './src/core/api/modules/permitApprover.api'; export { odataClient } from './src/core/api/odataClient'; export { clearProtectedStorage } from './src/core/auth/clearProtectedStorage';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',define:{'import.meta.env':'{"DEV":false}'}});
const mod={exports:{}};
new Function('require','module','exports',output.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {checklistApi,permitApproverApi,odataClient,clearProtectedStorage}=mod.exports;
test('production checklist failure and missing mandatory questions never use seed data',async()=>{
 const get=odataClient.get;
 try {
  odataClient.get=async()=>{throw new Error('SAP unavailable');};
  await assert.rejects(()=>checklistApi.fetchChecklist('HOT',{forceRefresh:true}),/SAP unavailable/);
  odataClient.get=async()=>({data:{value:[]}});
  await assert.rejects(()=>checklistApi.fetchChecklist('HOT',{forceRefresh:true}),/unavailable/);
  odataClient.get=async()=>({data:{value:[{QuestionaireId:'SAP-1',PermitType:'HOT'}]}});
  assert.equal((await checklistApi.fetchChecklist('HOT',{forceRefresh:true}))[0].QuestionaireId,'SAP-1');
 } finally {odataClient.get=get;checklistApi.clearCache();}
});
test('denied approval history fails without retrying or showing an empty workflow',async()=>{
 const get=odataClient.get;let calls=0;
 try {odataClient.get=async()=>{calls++;throw Object.assign(new Error('Denied'),{response:{status:403}});};await assert.rejects(()=>permitApproverApi.getApprovals('P1'),/Denied/);assert.equal(calls,1);}
 finally{odataClient.get=get;}
});
test('logout removes PTW protected data and tolerates disabled browser storage',()=>{
 const previous=globalThis.window;
 const values=new Map([['gfl_ptw_draft_100:TEST_x','private'],['ptw_isolation_permit_links','private'],['another_app','keep']]);
 const storage={get length(){return values.size;},key:i=>[...values.keys()][i],removeItem:key=>values.delete(key)};
 try {globalThis.window={localStorage:storage,sessionStorage:storage};clearProtectedStorage();assert.deepEqual([...values.keys()],['another_app']);Object.defineProperty(globalThis.window,'localStorage',{get(){throw new Error('disabled');}});assert.doesNotThrow(clearProtectedStorage);}
 finally{globalThis.window=previous;}
});
