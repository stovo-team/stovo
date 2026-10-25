import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import path from 'node:path';import {tmpdir} from 'node:os';import {execFileSync} from 'node:child_process';
let api={};try{api=await import('./capture-backend.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
test('backend capture executes the supplied input and preserves real nonzero outcomes',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'stovo-backend-capture-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 try{
  git('init','-q');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  writeFileSync(path.join(root,'.gitignore'),'artifacts/\n');writeFileSync(path.join(root,'input.json'),'retry-message');git('add','.');git('commit','-qm','fixture');
  for(const exit of [0,7]){
   const observation=api.captureBackend?.({root,input:'input.json',output:`artifacts/${exit}.json`,command:[process.execPath,'-e',`process.stdin.pipe(process.stdout);process.exitCode=${exit}`],environment:'local',target:'fixture',runtime:process.version,kind:'api'});
   assert.equal(observation?.exitCode,exit);assert.equal(observation?.actual,'retry-message');assert.equal(observation?.sourceRevision,git('rev-parse','HEAD'));
   const receipt=JSON.parse(readFileSync(path.join(root,observation.artifact.path),'utf8'));assert.equal(receipt.stdout,'retry-message');assert.equal(receipt.exitCode,exit);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
