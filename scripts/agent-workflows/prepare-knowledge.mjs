import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { main, argumentsOf } from './common.mjs';

// Use the CLI boundary so the repository needs no Python runtime integration.
export function prepareKnowledge({ root = '.', phase = 'start' } = {}) {
  if (!['start', 'finish', 'check'].includes(phase)) throw Error('phase must be start, finish, or check');
  const location = spawnSync('git', ['-C', path.resolve(root), 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (location.status !== 0) throw Error('knowledge preparation requires a Git checkout');
  root = location.stdout.trim();
  const commands = [];
  function okf(args) {
    const result = spawnSync('okf-agent', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (result.error?.code === 'ENOENT') throw Error('okf-agent unavailable; install the pinned version in docs/agent-workflows/knowledge.md');
    if (result.error) throw result.error;
    let payload;
    try { payload = JSON.parse(result.stdout); } catch { throw Error(`okf-agent ${args[0]} failed: ${result.stderr || result.stdout}`); }
    if (result.status !== 0 || payload.ok === false || payload.conformant === false) {
      throw Error(`okf-agent ${args.join(' ')} failed: ${JSON.stringify(payload)}`);
    }
    commands.push(args);
    return payload;
  }
  const bundle = ['--root', path.join(root, 'docs'), '--index-root', path.join(root, '.okf-index/docs')];
  if (phase !== 'check') {
    // index initializes missing knowledge without init's instruction/hook adapters.
    okf([phase === 'finish' ? 'update' : 'index', root]);
    okf(['docs', 'build', root]);
    okf(['bundle', 'update', ...bundle]);
    const pages = [];
    function visit(relative) {
      for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const name = `${relative}/${entry.name}`;
        if (entry.isDirectory()) visit(name);
        else if (entry.isFile() && entry.name.endsWith('.md')) pages.push(name);
      }
    }
    visit('docs');
    const wiki = '# Stovo documentation wiki\n\nGenerated navigation; edit the linked Markdown sources.\n\n' +
      '- [Repository knowledge and code map](site/index.md)\n\n' +
      pages.map(name => `- [${name.replace(/[\[\]]/g, '')}](../${name.split('/').map(encodeURIComponent).join('/')})`).join('\n') + '\n';
    writeFileSync(path.join(root, '.okf-index/wiki.md'), wiki);
  }
  okf(['validate', root]);
  okf(['docs', 'check', root]);
  const { diagnostics } = okf(['bundle', 'validate', ...bundle]);
  return { ok: true, phase, root, wiki: '.okf-index/wiki.md', commands, diagnostics };
}

main(import.meta.url, args => {
  const options = argumentsOf(args);
  if (options._.length !== 1 || Object.keys(options).some(key => !['_', 'root'].includes(key))) throw Error('usage: prepare-knowledge.mjs <start|finish|check> [--root <checkout>]');
  return prepareKnowledge({ root: options.root, phase: options._[0] });
});
