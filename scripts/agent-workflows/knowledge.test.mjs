import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.resolve('scripts/agent-workflows/prepare-knowledge.mjs');
const locate = name => spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], {encoding:'utf8'}).stdout?.trim().split(/\r?\n/)[0] || name;
const git = locate('git'), shell = locate('bash');
const available = spawnSync('okf-agent', ['--help']).status === 0;
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'stovo-knowledge-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  spawnSync(git, ['init', '-q', root]);
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/guide.md'), '---\ntitle: Guide\ntype: guide\n---\n# Guide\n\ninitialneedle\n');
  writeFileSync(path.join(root, 'app.js'), 'function originalSymbol() {}\n');
  writeFileSync(path.join(root, 'AGENTS.md'), '# Existing instructions\n');
  return root;
}
function run(root, phase, env = process.env) {
  return spawnSync(process.execPath, [script, phase, '--root', root], { encoding: 'utf8', env });
}
function search(root, query) {
  const result = spawnSync('okf-agent', ['bundle', 'search', query, '--root', path.join(root, 'docs'), '--index-root', path.join(root, '.okf-index/docs')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('task start bootstraps both indexes and a checked wiki without changing host instructions', { skip: !available }, t => {
  const root = fixture(t), result = run(root, 'start');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(path.join(root, '.okf/manifest.yaml')));
  assert.ok(existsSync(path.join(root, '.okf-index/knowledge.sqlite3')));
  assert.ok(existsSync(path.join(root, '.okf-index/site/index.md')));
  assert.match(readFileSync(path.join(root, '.okf-index/wiki.md'), 'utf8'), /\(\.\.\/docs\/guide.md\)/);
  assert.match(readFileSync(path.join(root,'.okf-index/code-map.md'),'utf8'), /\(\.\.\/app\.js\)/);
  assert.equal(search(root, 'initialneedle')[0].path, 'guide.md');
  assert.equal(readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), '# Existing instructions\n');
  assert.ok(!existsSync(path.join(root, 'CLAUDE.md')));
  const checked = run(root, 'check');
  assert.equal(checked.status, 0, checked.stderr);
});

test('finish refreshes edited docs, removes deleted pages from search, and preserves curated knowledge', { skip: !available }, t => {
  const root = fixture(t);
  assert.equal(run(root, 'start').status, 0);
  const overview = path.join(root, '.okf/application/overview.md');
  writeFileSync(overview, readFileSync(overview, 'utf8') + '\nCurated fact remains.\n');
  writeFileSync(path.join(root, 'docs/guide.md'), '---\ntitle: Guide\ntype: guide\n---\n# Guide\n\nreplacementneedle\n');
  writeFileSync(path.join(root, 'docs/removed.md'), '---\ntype: guide\n---\n# Removed\n\ndeletedneedle\n');
  assert.equal(run(root, 'start').status, 0);
  rmSync(path.join(root, 'docs/removed.md'));
  writeFileSync(path.join(root, 'app.js'), 'function replacementSymbol() {}\n');
  const result = run(root, 'finish');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(search(root, 'initialneedle').length, 0);
  assert.equal(search(root, 'deletedneedle').length, 0);
  assert.doesNotMatch(readFileSync(path.join(root, '.okf-index/wiki.md'), 'utf8'), /removed.md/);
  assert.equal(search(root, 'replacementneedle')[0].path, 'guide.md');
  assert.match(readFileSync(overview, 'utf8'), /Curated fact remains\./);
  assert.match(readFileSync(path.join(root, '.okf-index/site/code-map.md'), 'utf8'), /replacementSymbol/);
  assert.equal(run(root, 'check').status, 0);
});

test('check reports stale wiki and malformed canonical documentation', { skip: !available }, t => {
  const root = fixture(t);
  assert.equal(run(root, 'start').status, 0);
  writeFileSync(path.join(root, 'app.js'), 'function newSymbol() {}\n');
  const stale = run(root, 'check');
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /stale/i);
  writeFileSync(path.join(root, 'docs/guide.md'), '# Missing metadata\n');
  const malformed = run(root, 'finish');
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /frontmatter/i);
});

test('missing OKF fails explicitly before writing knowledge', t => {
  const root = fixture(t), bin = path.join(root, 'bin');
  mkdirSync(bin);
  // Restrict PATH to Git's directory, excluding the separately installed OKF CLI.
  const result = run(root, 'start', { ...process.env, PATH: path.dirname(git) });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /okf-agent.*unavailable/i);
  assert.ok(!existsSync(path.join(root, '.okf')));
});

test('invalid phase fails without creating an index', t => {
  const root = fixture(t), result = run(root, 'unknown');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /start.*finish.*check/);
  assert.ok(!existsSync(path.join(root, '.okf-index')));
});

test('Git branch checkout and merge hooks prepare the current worktree', { skip: !available }, t => {
  for (const name of ['post-checkout', 'post-merge']) {
    const root = fixture(t);
    mkdirSync(path.join(root, 'scripts/agent-workflows'), { recursive: true });
    for (const name of ['prepare-knowledge.mjs', 'common.mjs']) cpSync(path.join(path.dirname(script), name), path.join(root, 'scripts/agent-workflows', name));
    const result = spawnSync(shell, [path.resolve('.githooks', name), 'old', 'new', '1'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(path.join(root, '.okf-index/wiki.md')));
  }
});

test('file checkout skips refresh and failed branch refresh warns without blocking Git', t => {
  const root = fixture(t), hook = path.resolve('.githooks/post-checkout');
  const skipped = spawnSync(shell, [hook, 'old', 'new', '0'], { cwd: root, encoding: 'utf8' });
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.ok(!existsSync(path.join(root, '.okf-index')));
  mkdirSync(path.join(root, 'scripts/agent-workflows'), { recursive: true });
  for (const name of ['prepare-knowledge.mjs', 'common.mjs']) cpSync(path.join(path.dirname(script), name), path.join(root, 'scripts/agent-workflows', name));
  const result = spawnSync(shell, [hook, 'old', 'new', '1'], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /Knowledge refresh failed/);
});

test('successful preparation exposes link diagnostics for maintenance', { skip: !available }, t => {
  const root = fixture(t);
  writeFileSync(path.join(root, 'docs/guide.md'), '---\ntype: guide\n---\n# Guide\n\n[Missing](missing.md)\n');
  const result = run(root, 'start');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(Array.isArray(JSON.parse(result.stdout).diagnostics), 'preparation must expose diagnostics');
  assert.ok(JSON.parse(result.stdout).diagnostics.some(item => item.path === 'guide.md' && item.message.includes('missing.md')));
});


test('pre-commit refreshes knowledge and rejects malformed maintained docs', {skip:!available}, t => {
  const root=fixture(t);mkdirSync(path.join(root,'scripts/agent-workflows'),{recursive:true});
  for(const name of ['prepare-knowledge.mjs','common.mjs'])cpSync(path.join(path.dirname(script),name),path.join(root,'scripts/agent-workflows',name));
  const hook=path.resolve('.githooks/pre-commit');
  assert.equal(spawnSync(shell,[hook],{cwd:root}).status,0);
  assert.ok(existsSync(path.join(root,'.okf-index/wiki.md')));
  writeFileSync(path.join(root,'docs/guide.md'),'# Missing metadata\n');
  assert.notEqual(spawnSync(shell,[hook],{cwd:root}).status,0);
});

test('Git lifecycle hooks are executable in the tracked checkout',()=>{for(const hook of ['pre-commit','commit-msg','post-checkout','post-merge'])assert.match(spawnSync(git,['ls-files','--stage','--',`.githooks/${hook}`],{encoding:'utf8'}).stdout,/^100755 /);});

test('CI requires compatible Python before real OKF checks without disallowed setup actions',()=>{const workflow=readFileSync('.github/workflows/agent-evidence.yml','utf8');assert.doesNotMatch(workflow,/uses: actions\/setup-python/);assert.match(workflow,/sys.version_info >= \(3, 11\)/);assert.match(workflow,/pip install.*okf-agent/);});
