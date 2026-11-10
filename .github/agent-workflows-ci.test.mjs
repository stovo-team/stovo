import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {changedSourcePaths} from '../scripts/agent-workflows/source.mjs';
import {visualApplicable,aggregate} from './agent-workflows-gate.mjs';
const workflow=()=>readFileSync(new URL('./workflows/agent-evidence.yml',import.meta.url),'utf8');
const workflowFile=name=>readFileSync(new URL(`./workflows/${name}`,import.meta.url),'utf8');
test('docs applicability and shared tokens are explicit and conservative',()=>{assert.equal(visualApplicable(['docs/readme.md']),false);for(const p of ['frontend/src/design-system/tokens.css','frontend/src/page.test.ts','e2e/visual/scenarios.ts'])assert.equal(visualApplicable([p]),true);assert.throws(()=>visualApplicable(null),/paths/);});
test('agent workflow implementation changes do not require product screenshots',()=>{for(const p of ['.github/agent-workflows-gate.mjs','.github/workflows/agent-evidence.yml'])assert.equal(visualApplicable([p]),false,p);});
test('aggregate rejects missing cancelled skipped or failing required jobs',()=>{const n={changes:{result:'success',outputs:{visual:'false'}},validators:{result:'success'},visual:{result:'skipped'}};assert.equal(aggregate(n).ok,true);for(const status of ['cancelled','failure','skipped',undefined])assert.equal(aggregate({...n,validators:{result:status}}).ok,false);for(const status of ['cancelled','failure','skipped',undefined])assert.equal(aggregate({...n,changes:{result:'success',outputs:{visual:'true'}},visual:{result:status}}).ok,false);assert.equal(aggregate({...n,changes:{result:'failure',outputs:{visual:'false'}}}).ok,false);assert.equal(aggregate({...n,changes:{result:'success',outputs:{}}}).ok,false);});
test('paused agent jobs route fork checkouts to hosted Ubuntu',()=>{
 const w=workflow();assert.match(w,/on:\n  pull_request:/);
 for(const job of ['changes','validators','visual']){const section=w.match(new RegExp(`${job}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:|$)`))?.[1]??'';assert.match(section,/^    if: \$\{\{ false/m);assert.match(section,/runs-on: ubuntu-24\.04/);}

 const visual=w.match(/  visual:\n([\s\S]*?)(?=\n  aggregate:|$)/)?.[1]??'';assert.match(visual,/runner\.os == 'Windows'/);assert.match(visual,/playwright install chromium/);assert.match(visual,/playwright install --with-deps chromium/);assert.match(w,/permissions:\n  contents: read/);assert.doesNotMatch(w,/pull_request_target|secrets\.|contents: write|pull-requests: write/);assert.doesNotMatch(w,/^    paths:/m);for(const action of w.matchAll(/uses: ([^\s]+)/g))assert.match(action[1],/@[a-f0-9]{40}$/);assert.match(w,/persist-credentials: false/);assert.match(w,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
});
test('change discovery outlasts a slow full Windows checkout',()=>{const changes=workflow().match(/  changes:\n([\s\S]*?)\n  validators:/)?.[1]??'';assert.match(changes,/timeout-minutes: 15/);});
test('agent evidence workload is paused while the stable gate reports a labeled success',()=>{
 const w=workflow();
 for(const job of ['changes','validators','visual']){
  const section=w.match(new RegExp(`  ${job}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:|$)`))?.[1]??'';
  assert.match(section,/^    if: \$\{\{ false/m,`${job} job must remain paused`);
 }
 const aggregateSection=w.match(/  aggregate:\n([\s\S]*)$/)?.[1]??'';
 assert.match(aggregateSection,/name: Agent workflow gate/);
 assert.match(aggregateSection,/if: \$\{\{ always\(\) \}\}/);
 assert.match(aggregateSection,/needs: \[changes, validators, visual\]/);
 assert.match(aggregateSection,/Report temporary pause/);
 assert.match(aggregateSection,/GITHUB_STEP_SUMMARY/);
 assert.doesNotMatch(aggregateSection,/actions\/checkout|setup-node|agent-workflows-gate\.mjs/);
});
test('stable hosted gate always reports the temporary pause without checking out PR code',()=>{const w=workflow();const aggregateSection=w.match(/  aggregate:\n([\s\S]*)$/)?.[1]??'';assert.match(aggregateSection,/name: Agent workflow gate/);assert.match(aggregateSection,/runs-on: ubuntu-24\.04/);assert.match(aggregateSection,/if: \$\{\{ always\(\) \}\}/);assert.match(aggregateSection,/needs: \[changes, validators, visual\]/);assert.match(aggregateSection,/Report temporary pause/);assert.match(aggregateSection,/temporarily disabled/);assert.doesNotMatch(aggregateSection,/actions\/checkout|setup-node/);});
test('change discovery uses the true PR merge base without a full checkout',()=>{const changes=workflow().match(/  changes:\n([\s\S]*?)(?=\n  validators:)/)?.[1]??'';assert.match(changes,/fetch-depth: 1/);assert.doesNotMatch(changes,/fetch-depth: 0/);assert.match(changes,/git fetch --no-tags --depth=1 origin \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);assert.match(changes,/GITHUB_TOKEN: \$\{\{ github\.token \}\}/);const selector=readFileSync(new URL('./agent-workflows-gate.mjs',import.meta.url),'utf8');assert.match(selector,/git',\['merge-base',base,head\]/);assert.match(selector,/compare\/\$\{base\}\.\.\.\$\{head\}/);});
test('visual evidence retries transient Chromium download failures on both platforms',()=>{const w=workflow();assert.match(w,/for attempt in 1 2 3/);assert.match(w,/install_command=\(npx playwright install chromium\)/);assert.match(w,/install_command=\(npx playwright install --with-deps chromium\)/);assert.match(w,/if "\$\{install_command\[@\]\}"; then/);assert.match(w,/if \[ "\$attempt" -eq 3 \]; then exit 1; fi/);});
test('documentation and CodeQL route fork PR code to hosted Ubuntu',()=>{
 for(const name of ['docs-validation.yml','codeql.yml']){const w=workflowFile(name);assert.match(w,/runs-on: ubuntu-24\.04/);assert.doesNotMatch(w,/runs-on:[^\n]*self-hosted|author_association/);}
 const docs=workflowFile('docs-validation.yml');assert.match(docs,/helm-\$version-windows-amd64\.zip/);const codeql=workflowFile('codeql.yml');assert.match(codeql,/setup-go@/);assert.match(codeql,/javascript-typescript/); assert.doesNotMatch(codeql,/java-kotlin|gradlew/);
});
test('CodeQL uses a supported build mode for GitHub Actions analysis',()=>{
 const codeql=workflowFile('codeql.yml');
 assert.match(codeql,/language: actions\s+build_mode: none/);
 assert.match(codeql,/language: go\s+build_mode: autobuild/);
 assert.match(codeql,/language: javascript-typescript\s+build_mode: autobuild/);
 assert.match(codeql,/build-mode: \$\{\{ matrix\.build_mode \}\}/);
 assert.match(codeql,/if: matrix\.language != 'actions'\s+uses: github\/codeql-action\/autobuild/);
});
test('frontend fixes require screenshot evidence in agent instructions',()=>{const instructions=readFileSync(new URL('../AGENTS.md',import.meta.url),'utf8');assert.match(instructions,/frontend fix[\s\S]*screenshot/i);});
test('cross-platform size baseline covers the Windows mock API line count',()=>{const baseline=readFileSync(new URL('../docs/engineering/size-baseline.tsv',import.meta.url),'utf8');assert.match(baseline,/^frontend\/src\/dev\/mockApi\.ts\t442$/m);});

function renamedSource(check){
 const root=mkdtempSync(path.join(tmpdir(),'stovo-gate-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 try{
  git('init','-q');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  for(const dir of ['frontend/src','backend','docs'])mkdirSync(path.join(root,dir),{recursive:true});
  writeFileSync(path.join(root,'frontend/src/view.js'),'frontend view');writeFileSync(path.join(root,'backend/service.go'),'backend service');
  git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
  git('mv','frontend/src/view.js','docs/view.js');git('mv','backend/service.go','docs/service.go');git('commit','-qm','move sources');
  check({root,base,head:git('rev-parse','HEAD')});
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('CI selection cannot hide affected source by renaming it into docs',()=>renamedSource(({root,base,head})=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./agent-workflows-gate.mjs',import.meta.url)),'select'],{cwd:root,encoding:'utf8',env:{...process.env,BASE_SHA:base,HEAD_SHA:head,GITHUB_OUTPUT:path.join(root,'output')}});
 assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).visualRequired,true);
}));
test('CI selection ignores frontend files added only to a newer base',()=>staleBase(({root,base,head})=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./agent-workflows-gate.mjs',import.meta.url)),'select'],{cwd:root,encoding:'utf8',env:{...process.env,BASE_SHA:base,HEAD_SHA:head,GITHUB_OUTPUT:path.join(root,'output')}});
 assert.equal(result.status,0,result.stderr);
 const selection=JSON.parse(result.stdout);
 assert.equal(selection.visualRequired,false);
 assert.deepEqual(selection.changedPaths,['docs/pr-note.md']);
}));
test('delivery path discovery retains deleted side of source renames',()=>renamedSource(({root,base})=>{
 const paths=changedSourcePaths(root,base);assert.ok(paths.includes('backend/service.go'));assert.ok(paths.includes('frontend/src/view.js'));
}));

test('backend and delivery tooling avoid unrelated visual capture while shared capture helpers retain it',()=>{
 for(const file of ['scripts/agent-workflows/capture-backend.mjs','scripts/agent-workflows/validate-delivery.mjs','scripts/agent-workflows/watch-pr.mjs','scripts/agent-workflows/okf-knowledge.mjs'])assert.equal(visualApplicable([file]),false,file);
 for(const file of ['scripts/agent-workflows/common.mjs','scripts/agent-workflows/source.mjs','frontend/src/View.tsx','e2e/tools/capture-evidence.mjs'])assert.equal(visualApplicable([file]),true,file);
});

function staleBase(check){
 const root=mkdtempSync(path.join(tmpdir(),'stovo-stale-base-'));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 try{
  git('init','-q');git('config','user.email','fixture@example.invalid');git('config','user.name','Fixture');
  mkdirSync(path.join(root,'docs'),{recursive:true});writeFileSync(path.join(root,'docs/readme.md'),'base');
  git('add','.');git('commit','-qm','base');const mergeBase=git('rev-parse','HEAD');
  git('switch','-c','feature');writeFileSync(path.join(root,'docs/pr-note.md'),'PR documentation');
  git('add','.');git('commit','-qm','docs-only PR change');const head=git('rev-parse','HEAD');
  git('switch','-c','upstream',mergeBase);mkdirSync(path.join(root,'frontend/src'),{recursive:true});
  writeFileSync(path.join(root,'frontend/src/upstream.js'),'upstream change');git('add','.');git('commit','-qm','newer base frontend change');
  check({root,base:git('rev-parse','HEAD'),head});
 }finally{rmSync(root,{recursive:true,force:true});}
}
