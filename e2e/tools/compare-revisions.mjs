import {spawnSync} from 'node:child_process';import {mkdtempSync,mkdirSync,cpSync,symlinkSync,rmSync,readFileSync,writeFileSync,readdirSync,lstatSync,unlinkSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {main,argumentsOf,hashFile,sha256} from '../../scripts/agent-workflows/common.mjs';
export function freezeHarness(root,target,paths){
 const entries=[];
 const visit=(relative)=>{const source=path.join(root,relative);if(lstatSync(source).isDirectory()){for(const name of readdirSync(source).sort())visit(path.join(relative,name));}else{if(!lstatSync(source).isFile())throw Error('harness sources must be regular files');entries.push([relative,hashFile(source)]);}};
 for(const relative of paths){visit(relative);mkdirSync(path.dirname(path.join(target,relative)),{recursive:true});cpSync(path.join(root,relative),path.join(target,relative),{recursive:true});}
 return sha256(JSON.stringify(entries));
}
export function linkNodeModules({source,destination,platform=process.platform,link=symlinkSync}){link(source,destination,platform==='win32'?'junction':'dir');}
export function windowsExtendedPath(value){const resolved=path.resolve(value);return resolved.startsWith('\\\\?\\')?resolved:'\\\\?\\'+resolved.replaceAll('/','\\');}
export function releaseWorktree({checkout,dependencyLinks=[],platform=process.platform,run,lstat=lstatSync,unlink=unlinkSync,remove=rmSync}={}){
 for(const destination of dependencyLinks){let stat;try{stat=lstat(destination);}catch{continue;}if(stat.isSymbolicLink())unlink(destination);else if(stat.isDirectory())remove(platform==='win32'?windowsExtendedPath(destination):destination,{recursive:true,force:true});}
 const args=platform==='win32'?['-c','core.longpaths=true','worktree','remove','--force',checkout]:['worktree','remove','--force',checkout];
 try{run('git',args);}catch{remove(platform==='win32'?windowsExtendedPath(checkout):checkout,{recursive:true,force:true});run('git',['worktree','prune']);}
}
export function detachDependencyLinks(checkout,{lstatSync:stat=lstatSync,rmSync:remove=rmSync}={}){
 for(const folder of ['frontend','e2e']){
  const destination=path.join(checkout,folder,'node_modules');
  let info;try{info=stat(destination);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(info.isSymbolicLink())remove(destination,{force:true});
 }
}
export function unlinkDependencyLinks(checkout,fs={lstatSync,unlinkSync,rmSync}){for(const folder of ['frontend','e2e']){const target=path.join(checkout,folder,'node_modules');let stat;try{stat=fs.lstatSync(target);}catch(e){if(e.code==='ENOENT')continue;throw e;}if(stat.isSymbolicLink())fs.unlinkSync(target);else fs.rmSync(target,{recursive:true,force:true});}}
export function validateComparison({base,head}){if(!/^[a-f0-9]{40}$/.test(base??'')||!/^[a-f0-9]{40}$/.test(head??'')||base===head)throw Error('comparison requires distinct exact commit IDs');return {ok:true,base,head};}
export function compareRevisions({root,base,head,output,taskId,grep}){
 validateComparison({base,head});root=path.resolve(root);output=path.resolve(output);if(!/^[a-z0-9][a-z0-9-]*$/.test(taskId??''))throw Error('invalid task identity');
 const command=(bin,args,cwd=root)=>{const r=spawnSync(bin,args,{cwd,encoding:'utf8',timeout:240000});if(r.status!==0)throw Error(`${bin} ${args[0]} failed: ${r.stderr||r.stdout}`);return r.stdout;};
 for(const sha of [base,head])command('git',['cat-file','-e',sha+'^{commit}']);
 const temp=mkdtempSync(path.join(tmpdir(),'stovo-compare-')),owned=[],dependencyLinks=[],sides=[];mkdirSync(output,{recursive:true});
 const harnessPaths=['e2e/visual','e2e/tools','e2e/playwright.visual.config.ts','scripts/agent-workflows/common.mjs','scripts/agent-workflows/source.mjs'];
 const harness=path.join(temp,'harness'),harnessDigest=freezeHarness(root,harness,harnessPaths);
 try{for(const [side,sha] of [['before',base],['after',head]]){
  const checkout=path.join(temp,side);command('git',['worktree','add','--detach',checkout,sha]);owned.push(checkout);
  // A standalone CLI has no native Codex worktree API. Only its exact temporary checkouts are removed below.
  for(const relative of harnessPaths){mkdirSync(path.dirname(path.join(checkout,relative)),{recursive:true});cpSync(path.join(harness,relative),path.join(checkout,relative),{recursive:true});}
  for(const folder of ['frontend','e2e']){const destination=path.join(checkout,folder,'node_modules');if(hashFile(path.join(root,folder,'package-lock.json'))===hashFile(path.join(checkout,folder,'package-lock.json'))){linkNodeModules({source:path.join(root,folder,'node_modules'),destination});dependencyLinks.push(destination);}else{command('npm',['ci'],path.join(checkout,folder));dependencyLinks.push(destination);}}
  const destination=path.join(output,side);const r=spawnSync(process.execPath,[path.join(checkout,'e2e/tools/capture-evidence.mjs'),'--task',taskId,'--output',destination,...(grep?['--grep',grep]:[])],{cwd:checkout,encoding:'utf8',timeout:240000});
  let capture;try{capture=JSON.parse(readFileSync(path.join(destination,'capture.json'),'utf8'));}catch{throw Error(`missing ${side} capture: ${r.stderr}`);}
  for(const s of capture.screenshots??[]){const absolute=path.resolve(checkout,s.path);s.path=path.relative(root,absolute);s.side=side;}
  sides.push({side,revision:sha,capture});if(r.status!==0||!capture.ok)break;
 }}finally{for(const checkout of owned.reverse())releaseWorktree({checkout,dependencyLinks:dependencyLinks.filter(link=>link===checkout||link.startsWith(checkout+path.sep)),run:(bin,args)=>command(bin,args)});rmSync(temp,{recursive:true,force:true});}
 const comparison={schemaVersion:1,taskId,baseRevision:base,sourceRevision:head,ok:sides.length===2&&sides.every(s=>s.capture.ok),harnessDigest,sides};
 writeFileSync(path.join(output,'comparison.json'),JSON.stringify(comparison,null,2)+'\n');return comparison;
}
main(import.meta.url,args=>{const o=argumentsOf(args);return compareRevisions({root:o.root??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),base:o.base,head:o.head,output:o.output,taskId:o.task,grep:o.grep});});
