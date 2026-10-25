import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,symlinkSync,readlinkSync,cpSync,realpathSync,readdirSync,lstatSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
function setup(fn){const root=mkdtempSync(path.join(tmpdir(),'stovo-skills-'));try{const source=path.join(root,'source'),target=path.join(root,'target');mkdirSync(path.join(source,'stovo-demo'),{recursive:true});writeFileSync(path.join(source,'stovo-demo','SKILL.md'),'---\nname: stovo-demo\ndescription: Demo task\n---\nInstructions');const run=(...extra)=>spawnSync(process.execPath,['scripts/agent-workflows/install-skills.mjs','--source',source,'--target',target,...extra],{encoding:'utf8'});fn({root,source,target,run});}finally{rmSync(root,{recursive:true,force:true});}}
test('dry run writes no target; link install is idempotent',()=>setup(({target,run})=>{let r=run('--dry-run');assert.equal(r.status,0,r.stderr);assert.equal(existsSync(target),false);assert.equal(run().status,0);r=run();assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).unchanged.length,1);}));
test('unrelated skills survive and same-name collisions are refused',()=>setup(({target,run})=>{mkdirSync(target);writeFileSync(path.join(target,'unrelated'),'keep');mkdirSync(path.join(target,'stovo-demo'));writeFileSync(path.join(target,'stovo-demo','SKILL.md'),'mine');const r=run();assert.equal(r.status,1);assert.equal(readFileSync(path.join(target,'unrelated'),'utf8'),'keep');assert.equal(readFileSync(path.join(target,'stovo-demo','SKILL.md'),'utf8'),'mine');}));
test('copy installation updates owned unchanged sources but preserves user modifications',()=>setup(({source,target,run})=>{assert.equal(run('--mode','copy').status,0);assert.equal(run('--mode','copy').status,0);writeFileSync(path.join(source,'stovo-demo','SKILL.md'),'new skill');assert.equal(run('--mode','copy').status,0);const file=path.join(target,'stovo-demo','SKILL.md');assert.equal(readFileSync(file,'utf8'),'new skill');writeFileSync(file,'user modification');assert.equal(run('--mode','copy').status,1);assert.equal(readFileSync(file,'utf8'),'user modification');}));
test('source symlink escape and broken source are refused',()=>setup(({source,root,run})=>{rmSync(path.join(source,'stovo-demo'),{recursive:true});mkdirSync(path.join(root,'outside'));writeFileSync(path.join(root,'outside','SKILL.md'),'outside');symlinkSync(path.join(root,'outside'),path.join(source,'stovo-demo'));assert.equal(run().status,1);rmSync(path.join(source,'stovo-demo'));mkdirSync(path.join(source,'stovo-demo'));assert.equal(run().status,1);}));
test('existing target directory symlink is refused',()=>setup(({root,target,run})=>{mkdirSync(path.join(root,'outside'));symlinkSync(path.join(root,'outside'),target);assert.equal(run().status,1);assert.equal(existsSync(path.join(root,'outside','stovo-demo')),false);}));

test('linked installation survives moving the checkout',()=>setup(({root,target,run})=>{
  assert.equal(run().status,0);
  assert.equal(path.isAbsolute(readlinkSync(path.join(target,'stovo-demo'))),false);
  const moved=path.join(root,'moved');mkdirSync(moved);
  for(const name of ['source','target'])cpSync(path.join(root,name),path.join(moved,name),{recursive:true,verbatimSymlinks:true});
  assert.equal(realpathSync(path.join(moved,'target','stovo-demo')),path.join(moved,'source','stovo-demo'));
}));
test('canonical project skills are discoverable regular directories',()=>{
  const names=readdirSync('.agents/skills').filter(name=>name.startsWith('stovo-')).sort();
  for(const name of names){
    const entry=path.join('.agents/skills',name);
    assert.ok(lstatSync(entry).isDirectory(),entry);
    assert.equal(lstatSync(entry).isSymbolicLink(),false,entry);
    const skill=readFileSync(path.join(entry,'SKILL.md'),'utf8');
    assert.ok(skill.startsWith(`---\nname: ${name}\ndescription: `),name);
  }
  assert.ok(names.includes('stovo-task-context'));
  assert.ok(names.includes('stovo-bug-fix'));
});
test('installing canonical skills in their source checkout is a safe no-op',()=>setup(({source,run})=>{
  const before=readFileSync(path.join(source,'stovo-demo','SKILL.md'),'utf8');
  const result=run('--target',source);
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).unchanged,['stovo-demo']);
  assert.equal(readFileSync(path.join(source,'stovo-demo','SKILL.md'),'utf8'),before);
}));
