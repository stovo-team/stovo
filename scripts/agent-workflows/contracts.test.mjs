import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
let api = {};
try { api = await import('./contracts.mjs'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
const sha = value => createHash('sha256').update(value).digest('hex');
export function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'stovo-contract-'));
  for (const name of ['spec.md','tests.md']) writeFileSync(path.join(root,name),name);
  const artifacts = ['spec.md','tests.md'].map((name,i)=>({ role:i ? 'test-plan':'spec', path:name, sha256:sha(name) }));
  return { root, record:{schemaVersion:1,taskId:'demo',state:'approved',artifacts,acceptance:[{id:'AC-01',expected:'Save is observable'}],checks:[{id:'check-save',acceptanceIds:['AC-01'],layer:'unit',command:['node','--test','save.test.mjs'],required:true}],approvals:[{actor:'human',source:'Human review in test fixture',decision:'approved',artifacts:Object.fromEntries(artifacts.map(a=>[a.path,a.sha256]))}],authorizations:[{scope:'local-implementation',source:'Human review in test fixture'}]} };
}
function run(change = ()=>{}, options = {}) { const f=fixture(); try { change(f); return api.validateContract?.(f.record,{root:f.root,...options}); } finally { rmSync(f.root,{recursive:true,force:true}); } }
test('valid reviewed contents pass without executing recorded commands',()=>assert.equal(run(f=>f.record.checks[0].command=['touch','MUST-NOT-EXECUTE'])?.ok,true));
test('edited approved test plan is stale',()=>assert.match(run(f=>writeFileSync(path.join(f.root,'tests.md'),'changed'))?.errors.join('\n') ?? '',/digest|stale/i));
test('approval covers both concrete artifact digests',()=>assert.equal(run(f=>delete f.record.approvals[0].artifacts['tests.md'])?.ok,false));
test('human source is required and publication is not inferred',()=>assert.equal(run(f=>f.record.approvals[0].source='')?.ok,false));
test('duplicate acceptance IDs and unknown check coverage fail',()=>{assert.equal(run(f=>f.record.acceptance.push(f.record.acceptance[0]))?.ok,false);assert.equal(run(f=>f.record.checks[0].acceptanceIds=['AC-missing'])?.ok,false);});
test('unsupported version, invalid states and scalar command fail',()=>{for(const change of [f=>f.record.schemaVersion=2,f=>f.record.state='shipped',f=>f.record.checks[0].command='echo unsafe'])assert.equal(run(change)?.ok,false);});
test('paths cannot escape through traversal, absolute path or symlink',()=>{for(const p of ['../spec.md','/etc/passwd'])assert.equal(run(f=>f.record.artifacts[0].path=p)?.ok,false);assert.equal(run(f=>{symlinkSync('/etc/passwd',path.join(f.root,'escape'));f.record.artifacts[0].path='escape';})?.ok,false);});
test('draft can be inspected but cannot satisfy approved target',()=>{assert.equal(run(f=>{f.record.state='draft';f.record.approvals=[];})?.ok,true);assert.equal(run(f=>{f.record.state='draft';f.record.approvals=[];},{expectedState:'approved'})?.ok,false);});
test('unknown authorization scope is invalid',()=>assert.equal(run(f=>f.record.authorizations[0].scope='everything')?.ok,false));
test('CLI emits useful JSON and a nonzero result for stale contents',()=>{const f=fixture();try{const file=path.join(f.root,'contract.json');writeFileSync(file,JSON.stringify(f.record));let r=spawnSync(process.execPath,['scripts/agent-workflows/validate-contract.mjs',file,'--root',f.root],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).ok,true);writeFileSync(path.join(f.root,'tests.md'),'changed');r=spawnSync(process.execPath,['scripts/agent-workflows/validate-contract.mjs',file,'--root',f.root],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).ok,false);}finally{rmSync(f.root,{recursive:true,force:true});}});
test('malformed untrusted collections fail without throwing',()=>{for(const change of [f=>f.record.authorizations={},f=>f.record.checks[0].acceptanceIds=5,f=>f.record.artifacts=[null],f=>f.record.acceptance=[null]])assert.doesNotThrow(()=>assert.equal(run(change)?.ok,false));});
