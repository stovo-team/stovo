import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyChecks, watchPr } from './pr-ci.mjs';
const check = (name, conclusion='SUCCESS', status='COMPLETED', workflowName='CI/CD Pipeline') => ({name,conclusion,status,workflowName});
const pr = (checks, head='a') => ({headRefOid:head,statusCheckRollup:checks});
test('every CI cell matters while CodeQL is explicitly ignored', () => {
  const result=classifyChecks(pr([check('Frontend CI'),check('Analyze (go)','FAILURE','COMPLETED','CodeQL')]));
  assert.equal(result.state,'passed'); assert.equal(result.ignored.length,1);
  assert.equal(classifyChecks(pr([check('Backend CI','FAILURE')])).state,'failed');
  for(const conclusion of ['CANCELLED','TIMED_OUT','NEUTRAL','ACTION_REQUIRED'])
    assert.equal(classifyChecks(pr([check('CI',conclusion)])).state,'failed');
});
test('empty, only ignored, missing/unknown and queued checks stay pending', () => {
  for(const checks of [[],null,[check('Analyze','FAILURE','COMPLETED','CodeQL')],[check('CI','','QUEUED')],[check('CI','')]])
    assert.equal(classifyChecks(pr(checks)).state,'pending');
});
test('legacy status contexts and conditional skips are reported honestly', () => {
  assert.equal(classifyChecks(pr([{context:'external',state:'ERROR'}])).state,'failed');
  const r=classifyChecks(pr([check('Pipeline Contract'),check('Backend CI','SKIPPED')]));
  assert.equal(r.state,'passed'); assert.equal(r.skipped.length,1);
  assert.equal(classifyChecks(pr([check('Backend CI','SKIPPED')])).state,'pending');
});
test('watch requires stable head and two settled snapshots', async () => {
  const inputs=[pr([]),pr([check('CI')]),pr([check('CI')],'b'),pr([check('CI')],'b')];let reads=0;
  const r=await watchPr({read:()=>inputs[reads++],sleep:async()=>{},interval:1,timeout:100,now:()=>0});
  assert.equal(r.state,'passed');assert.equal(r.head,'b');assert.equal(reads,4);
});
test('red returns immediately and pending times out without a false pass', async () => {
  const red=await watchPr({read:()=>pr([check('CI','FAILURE')]),sleep:async()=>{},timeout:5});
  assert.equal(red.state,'failed');let time=0;
  const yellow=await watchPr({read:()=>pr([]),sleep:async()=>{time+=10;},interval:1,timeout:5,now:()=>time});
  assert.equal(yellow.state,'pending');assert.equal(yellow.reason,'timeout');
});

test('publication creates/reuses a PR then waits for its actual CI', async () => {
  const {deliverPr}=await import('./pr-ci.mjs'); assert.equal(typeof deliverPr,'function');
  const calls=[];const run=(tool,args)=>{calls.push([tool,...args]);if(tool==='git'&&args[0]==='branch')return 'feature/demo\n';if(args[0]==='repo')return '{"nameWithOwner":"owner/repo"}';if(args[0]==='pr'&&args[1]==='list')return '[]';if(args[0]==='pr'&&args[1]==='create')return 'https://github.com/owner/repo/pull/1\n';if(args[0]==='pr'&&args[1]==='view')return JSON.stringify(pr([check('PR size'),check('Pipeline Contract'),check('Agent workflow gate')]));return '';};
  const r=await deliverPr({repo:'owner/repo',branch:'feature/demo',title:'Fix: demo',bodyFile:'body.md',run,sleep:async()=>{}});
  assert.equal(r.state,'passed');assert.equal(r.url,'https://github.com/owner/repo/pull/1');
  assert.ok(calls.findIndex(c=>c[0]==='git'&&c[1]==='push')<calls.findIndex(c=>c[2]==='create'));
  assert.equal(calls.filter(c=>c[1]==='pr'&&c[2]==='view').length,2);
  await assert.rejects(()=>deliverPr({repo:'other/repo',branch:'master',run}),/repository|branch/i);
});
