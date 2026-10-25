import test from 'node:test';import assert from 'node:assert/strict';
let api={};try{api=await import('./compare-revisions.mjs');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
test('comparison requires exact commit IDs and distinct sides',()=>{for(const values of [{base:'master',head:'1'.repeat(40)},{base:'--unsafe',head:'1'.repeat(40)},{base:'1'.repeat(40),head:'1'.repeat(40)}])assert.throws(()=>api.validateComparison?.(values));});
test('valid exact base/head identities produce an immutable plan',()=>assert.equal(api.validateComparison?.({base:'0'.repeat(40),head:'1'.repeat(40)})?.ok,true));
test('Windows dependency reuse creates a directory junction instead of a privileged symlink',()=>{const calls=[];api.linkNodeModules?.({source:'C:/repo/frontend/node_modules',destination:'C:/tmp/before/frontend/node_modules',platform:'win32',link:(source,destination,type)=>calls.push({source,destination,type})});assert.deepEqual(calls,[{source:'C:/repo/frontend/node_modules',destination:'C:/tmp/before/frontend/node_modules',type:'junction'}]);});
test('both sides use a frozen harness even if the author checkout changes',async()=>{const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');const root=fs.mkdtempSync(path.join(os.tmpdir(),'stovo-harness-'));try{fs.mkdirSync(path.join(root,'source'));fs.writeFileSync(path.join(root,'source','case'),'original');const hash=api.freezeHarness?.(path.join(root,'source'),path.join(root,'frozen'),['case']);assert.equal(typeof hash,'string');fs.writeFileSync(path.join(root,'source','case'),'changed');assert.equal(fs.readFileSync(path.join(root,'frozen','case'),'utf8'),'original');}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('comparison cleanup removes dependency junctions before Git and preserves shared dependencies',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path'),{execFileSync}=await import('node:child_process');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'stovo-comparison-cleanup-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'});
 try{
  git('init','-q');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  fs.writeFileSync(path.join(root,'.gitignore'),'node_modules/\n');git('add','.');git('commit','-qm','base');
  const checkout=path.join(root,'comparison');git('worktree','add','--detach',checkout,'HEAD');
  const shared=path.join(root,'node_modules');fs.mkdirSync(shared);fs.writeFileSync(path.join(shared,'keep'),'shared dependency');
  for(const folder of ['frontend','e2e']){fs.mkdirSync(path.join(checkout,folder));api.linkNodeModules({source:shared,destination:path.join(checkout,folder,'node_modules')});}
  api.cleanupComparisonWorktree?.({checkout,command:(bin,args)=>{
   // Git for Windows recursively deleting junctions can hit MAX_PATH. Git must receive a checkout without dependencies.
   for(const folder of ['frontend','e2e'])assert.equal(fs.existsSync(path.join(checkout,folder,'node_modules')),false);
   return execFileSync(bin,args,{cwd:root,encoding:'utf8'});
  }});
  assert.equal(fs.existsSync(checkout),false);assert.equal(fs.readFileSync(path.join(shared,'keep'),'utf8'),'shared dependency');
  assert.equal(git('worktree','list','--porcelain').includes(checkout),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
