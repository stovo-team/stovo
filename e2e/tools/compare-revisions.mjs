import {spawnSync} from 'node:child_process';import {mkdtempSync,mkdirSync,cpSync,symlinkSync,rmSync,readFileSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {main,argumentsOf,hashFile,sha256} from '../../scripts/agent-workflows/common.mjs';
export function validateComparison({base,head}){if(!/^[a-f0-9]{40}$/.test(base??'')||!/^[a-f0-9]{40}$/.test(head??'')||base===head)throw Error('comparison requires distinct exact commit IDs');return {ok:true,base,head};}
export function compareRevisions({root,base,head,output,taskId,grep}){
 validateComparison({base,head});root=path.resolve(root);output=path.resolve(output);if(!/^[a-z0-9][a-z0-9-]*$/.test(taskId??''))throw Error('invalid task identity');
 const command=(bin,args,cwd=root)=>{const r=spawnSync(bin,args,{cwd,encoding:'utf8',timeout:240000});if(r.status!==0)throw Error(`${bin} ${args[0]} failed: ${r.stderr||r.stdout}`);return r.stdout;};
 for(const sha of [base,head])command('git',['cat-file','-e',sha+'^{commit}']);
 const temp=mkdtempSync(path.join(tmpdir(),'stovo-compare-')),owned=[],sides=[];mkdirSync(output,{recursive:true});
 try{for(const [side,sha] of [['before',base],['after',head]]){
  const checkout=path.join(temp,side);command('git',['worktree','add','--detach',checkout,sha]);owned.push(checkout);
  // A standalone CLI has no native Codex worktree API. Only its exact temporary checkouts are removed below.
  for(const relative of ['e2e/visual','e2e/tools','e2e/playwright.visual.config.ts','scripts/agent-workflows/common.mjs']){mkdirSync(path.dirname(path.join(checkout,relative)),{recursive:true});cpSync(path.join(root,relative),path.join(checkout,relative),{recursive:true});}
  for(const folder of ['frontend','e2e']){if(hashFile(path.join(root,folder,'package-lock.json'))===hashFile(path.join(checkout,folder,'package-lock.json')))symlinkSync(path.join(root,folder,'node_modules'),path.join(checkout,folder,'node_modules'),'dir');else command('npm',['ci'],path.join(checkout,folder));}
  const destination=path.join(output,side);const r=spawnSync(process.execPath,[path.join(checkout,'e2e/tools/capture-evidence.mjs'),'--task',taskId,'--output',destination,...(grep?['--grep',grep]:[])],{cwd:checkout,encoding:'utf8',timeout:240000});
  let capture;try{capture=JSON.parse(readFileSync(path.join(destination,'capture.json'),'utf8'));}catch{throw Error(`missing ${side} capture: ${r.stderr}`);}
  for(const s of capture.screenshots??[]){const absolute=path.resolve(checkout,s.path);s.path=path.relative(root,absolute);s.side=side;}
  sides.push({side,revision:sha,capture});if(r.status!==0||!capture.ok)break;
 }}finally{for(const checkout of owned.reverse())command('git',['worktree','remove','--force',checkout]);rmSync(temp,{recursive:true,force:true});}
 const comparison={schemaVersion:1,taskId,baseRevision:base,sourceRevision:head,ok:sides.length===2&&sides.every(s=>s.capture.ok),harnessDigest:sha256(readFileSync(path.join(root,'e2e/playwright.visual.config.ts'))),sides};
 writeFileSync(path.join(output,'comparison.json'),JSON.stringify(comparison,null,2)+'\n');return comparison;
}
main(import.meta.url,args=>{const o=argumentsOf(args);return compareRevisions({root:o.root??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),base:o.base,head:o.head,output:o.output,taskId:o.task,grep:o.grep});});
