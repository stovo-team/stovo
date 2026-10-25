import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const workflow = readFileSync(new URL('./workflows/trusted-pr-tests.yml', import.meta.url), 'utf8');
const budgetWorkflow = readFileSync(new URL('./workflows/pr-size.yml', import.meta.url), 'utf8');
const extract = () => {
  const match = budgetWorkflow.match(/\/\/ PR_BUDGET_BEGIN\n([\s\S]*?)\n\s*\/\/ PR_BUDGET_END/);
  assert.ok(match, 'PR budget must run before expensive checks');
  return match[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
};
function run(additions, deletions, override = {}, status = 200) {
  const payload = { additions, deletions, head: { sha: 'a'.repeat(40) }, ...override };
  return spawnSync(process.execPath, ['--input-type=module', '-e',
    `globalThis.fetch = async () => ({ok:${status===200},status:${status},json:async()=>(${JSON.stringify(payload)})});\n${extract()}`],
    { encoding:'utf8', env:{...process.env, GH_TOKEN:'test', GITHUB_API_URL:'https://api.github.com', GITHUB_REPOSITORY:'owner/repo', PR_NUMBER:'1', PR_HEAD:'a'.repeat(40)} });
}
test('445 total added/deleted lines pass and 446 fail with no file exclusions', () => {
  assert.equal(run(440,5).status, 0); assert.equal(run(440,6).status, 1);
  assert.equal(run(0,446).status, 1); assert.equal(run(0,0).status, 0);
});
test('unknown counts, API failure and stale head cannot pass', () => {
  for (const result of [run(null,0),run(-1,0),run(1.5,0),run(0,0,{head:{sha:'b'.repeat(40)}}),run(0,0,{},403)])
    assert.equal(result.status, 1, result.stdout+result.stderr);
});
test('discovery and pipeline contract depend on the budget gate', () => {
  for (const job of ['changes','pipeline-contract']) {
    const block = workflow.split(`  ${job}:`)[1].split(/\n  [a-z][a-z-]*:/)[0];
    assert.match(block, /needs: pr-size/);
  }
});

test('metadata-only budget uses available self-hosted Windows without checkout',()=>{assert.match(budgetWorkflow,/  pull_request_target:/);assert.doesNotMatch(budgetWorkflow,/  pull_request:/);assert.match(budgetWorkflow,/runs-on: \[self-hosted, Windows, tests\]/);assert.match(budgetWorkflow,/shell: powershell/);assert.match(budgetWorkflow,/setup-node@[a-f0-9]{40}/);assert.doesNotMatch(budgetWorkflow,/uses: actions\/checkout/);});
