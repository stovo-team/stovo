import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';import path from 'node:path';import {tmpdir} from 'node:os';import {sha256} from './common.mjs';
let api={};try{api=await import('./evidence.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
function run(change=()=>{}){const root=mkdtempSync(path.join(tmpdir(),'stovo-evidence-'));try{for(const f of ['before.png','after.png'])writeFileSync(path.join(root,f),f);const contract={taskId:'demo',checks:[{id:'unit',required:true,acceptanceIds:['AC-01']}]};const contractDigest=sha256('original contract bytes');const sourceRevision='1'.repeat(40),baseRevision='0'.repeat(40);const manifest={schemaVersion:1,taskId:'demo',sourceRevision,baseRevision,dirty:false,contractDigest,environment:{platform:'linux',browserVersion:'Chromium-test',timezone:'UTC'},checks:[{id:'unit',result:'passed',durationMs:1,command:['node','--test'],acceptanceIds:['AC-01'],artifacts:[]}],screenshots:['before','after'].map(side=>({scenarioId:'V-01',side,sourceRevision:side==='before'?baseRevision:sourceRevision,viewport:{width:390,height:844},theme:'light',locale:'ru',path:side+'.png',sha256:sha256(side+'.png')})),limitations:[]};change({root,manifest,contract});return api.validateEvidence?.(manifest,{root,contract,contractDigest,expectedRevision:sourceRevision,requireVisual:true});}finally{rmSync(root,{recursive:true,force:true});}}
test('matching source-bound screenshot pair and required checks pass',()=>assert.equal(run()?.ok,true));
test('stale revision, contract digest and dirty source fail',()=>{for(const change of [f=>f.manifest.sourceRevision='2'.repeat(40),f=>f.manifest.contractDigest='a'.repeat(64),f=>f.manifest.dirty=true])assert.equal(run(change)?.ok,false);});
test('missing or tampered screenshot and escaping symlink fail',()=>{for(const change of [f=>rmSync(path.join(f.root,'after.png')),f=>writeFileSync(path.join(f.root,'after.png'),'tampered'),f=>{rmSync(path.join(f.root,'after.png'));symlinkSync('/etc/passwd',path.join(f.root,'after.png'));}])assert.equal(run(change)?.ok,false);});
test('different metadata, missing base and duplicate pair fail',()=>{for(const change of [f=>f.manifest.screenshots[1].viewport.width=1440,f=>f.manifest.screenshots.shift(),f=>f.manifest.screenshots.push(f.manifest.screenshots[0])])assert.equal(run(change)?.ok,false);});
test('after-only state needs concrete reason and review source',()=>{assert.equal(run(f=>f.manifest.screenshots.shift())?.ok,false);assert.equal(run(f=>{f.manifest.screenshots.shift();f.manifest.afterOnly=[{scenarioId:'V-01',reason:'New state absent from base',source:'Human review fixture'}];})?.ok,true);});
test('missing, failed, blocked and skipped required results cannot pass',()=>{for(const change of [f=>f.manifest.checks=[],...['failed','blocked','skipped','not-applicable'].map(status=>f=>f.manifest.checks[0].result=status)])assert.equal(run(change)?.ok,false);});
test('malformed evidence returns errors rather than throwing',()=>{for(const change of [f=>f.manifest.screenshots=[null],f=>f.manifest.checks={},f=>f.manifest.environment=null])assert.doesNotThrow(()=>assert.equal(run(change)?.ok,false));});
test('malformed artifact and contract check collections fail without exceptions',()=>{for(const change of [f=>f.manifest.checks[0].artifacts={},f=>f.contract.checks=[null],f=>f.contract.checks[0].acceptanceIds=7])assert.doesNotThrow(()=>assert.equal(run(change)?.ok,false));});

function backend(f){
 const artifact=name=>{writeFileSync(path.join(f.root,name),name);return {path:name,sha256:sha256(name)};};
 const observation=(sourceRevision,actual)=>{
  const receipt={schemaVersion:1,sourceRevision,inputDigest:sha256('request.json'),environment:'local',target:'disposable-api',runtime:'go1.25 postgres16',command:['node','--test'],startedAt:'2026-10-25T01:00:00Z',kind:'api',actual,stdout:actual,stderr:'',exitCode:0};
  const file=actual+'.json',bytes=JSON.stringify(receipt);writeFileSync(path.join(f.root,file),bytes);
  return {...receipt,executionSource:'local command transcript',artifact:{path:file,sha256:sha256(bytes)}};
 };
 f.manifest.backendImpact=[{id:'B-01',checkId:'unit',acceptanceId:'AC-01',expected:'Retry stores one message',input:artifact('request.json'),before:observation(f.manifest.baseRevision,'duplicates'),after:observation(f.manifest.sourceRevision,'one-message')}];
 f.contract.acceptance=[{id:'AC-01',expected:'Retry stores one message'}];
}
test('backend requirement rejects invented pass without observations',()=>{
 const result=run(f=>{f.contract.backendImpactRequired=true;});
 assert.equal(result.ok,false);
});
test('backend observations bind same input, source, environment and actual hashed output',()=>{
 assert.equal(run(backend).ok,true);
 for(const mutate of [
  f=>f.manifest.backendImpact[0].after.sourceRevision=f.manifest.baseRevision,
  f=>f.manifest.backendImpact[0].after.environment='production',
  f=>f.manifest.backendImpact[0].after.target='another-api',
  f=>f.manifest.backendImpact[0].after.actual='',
  f=>f.manifest.backendImpact[0].after.exitCode=7,
  f=>f.manifest.backendImpact[0].after.inputDigest='f'.repeat(64),
  f=>{f.manifest.backendImpact[0].before.command=['echo','passed'];f.manifest.backendImpact[0].after.command=['echo','passed'];},
  f=>f.manifest.backendImpact[0].expected='Changed assertion',
  f=>f.manifest.backendImpact[0].after.executionSource='',
  f=>f.manifest.backendImpact[0].before.artifact.sha256='f'.repeat(64),
  f=>f.manifest.backendImpact[0].input.path='../request.json',
  f=>f.manifest.backendImpact=[null]
 ]) assert.equal(run(f=>{backend(f);mutate(f);}).ok,false);
});
