import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import ts from 'typescript';
const result=await build({stdin:{contents:`export {sitePermitApi} from './src/core/api/modules/sitePermit.api';export {odataClient} from './src/core/api/odataClient';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',define:{'import.meta.env':'{}'}});
const mod={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(createRequire(import.meta.url),mod,mod.exports);
const {sitePermitApi,odataClient}=mod.exports;
const original={patch:odataClient.patch,get:odataClient.get,post:odataClient.post};
const reset=()=>Object.assign(odataClient,original);

test('Quick Edit passes the new PATCH response ETag to Resubmit',async()=>{
 const calls=[];
 try {
  odataClient.patch=async(url,data,etag)=>{calls.push('patch');assert.equal(etag,'W/"old"');return {data:{Permit_No:'P1'},headers:{etag:'W/"new"'}};};
  odataClient.get=async()=>{throw new Error('Unexpected read');};
  odataClient.post=async(url,body,config)=>{calls.push('action');assert.equal(config.headers['If-Match'],'W/"new"');return {data:{Permit_No:'P1',Status:'CRTD'}};};
  await sitePermitApi.reviseAndResubmit('P1',{JobDesc:'Revised'},'Fixed','W/"old"');assert.deepEqual(calls,['patch','action']);
 }finally{reset();}
});
test('204 PATCH rereads the current version before resubmitting',async()=>{
 const calls=[];
 try{
  odataClient.patch=async()=>{calls.push('patch');return {status:204,data:undefined,headers:{}};};
  odataClient.get=async url=>{calls.push('read');assert.equal(url,"PermitInfo('P1')");return {data:{'@odata.etag':'W/"new"'}};};
  odataClient.post=async(url,body,config)=>{calls.push('action');assert.equal(config.headers['If-Match'],'W/"new"');return {data:{Permit_No:'P1',Status:'CRTD'}};};
  await sitePermitApi.reviseAndResubmit('P1',{JobDesc:'Revised'},'Fixed','W/"old"');assert.deepEqual(calls,['patch','read','action']);
 }finally{reset();}
});
test('failed save or missing updated version never invokes resubmit',async()=>{
 try{
  odataClient.post=async()=>{assert.fail('Must not resubmit');};
  odataClient.patch=async()=>{throw new Error('Save denied');};
  await assert.rejects(()=>sitePermitApi.reviseAndResubmit('P1',{JobDesc:'Revised'}),/Save denied/);
  odataClient.patch=async()=>({data:{},headers:{}});odataClient.get=async()=>({data:{},headers:{}});
  await assert.rejects(()=>sitePermitApi.reviseAndResubmit('P1',{JobDesc:'Revised'}),/Changes were saved.*new permit version/);
 }finally{reset();}
});
test('direct resubmit skips PATCH and partial save failure is clearly reported',async()=>{
 try{
  odataClient.patch=async()=>{assert.fail('No changes to save');};
  odataClient.post=async(url,body,config)=>{assert.equal(config.headers['If-Match'],'W/"old"');return {data:{Permit_No:'P1',Status:'CRTD'}};};
  await sitePermitApi.reviseAndResubmit('P1',{},'Fixed','W/"old"');
  odataClient.patch=async()=>({data:{'@odata.etag':'W/"new"'}});
  odataClient.post=async()=>{throw new Error('Action denied');};
  await assert.rejects(()=>sitePermitApi.reviseAndResubmit('P1',{JobDesc:'Revised'}),/Header changes were saved.*Action denied/);
 }finally{reset();}
});
test('resubmit dialog is not inside an active-tab conditional',()=>{
 const file=ts.createSourceFile('PermitDisplayWorkspace.tsx',readFileSync('src/features/permits/PermitDisplayWorkspace.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let dialogs=0;
 function visit(node){
  if(ts.isJsxExpression(node)&&node.expression&&ts.isBinaryExpression(node.expression)&&node.expression.left.getText(file)==='showResubmitModal'){
   dialogs++;for(let parent=node.parent;parent;parent=parent.parent){if(ts.isJsxExpression(parent))assert.doesNotMatch(parent.expression?.getText(file)||'',/^activeTab\s*===/,'Dialog must open from every detail tab');}
  }
  ts.forEachChild(node,visit);
 }visit(file);assert.equal(dialogs,1);
});
