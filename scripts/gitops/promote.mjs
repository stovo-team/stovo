import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  validateRelease,
  promoteBranch,
  setRollbackHold,
  resumeRollbackHold,
} from './release.mjs';

export function runGit(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...options });
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      args[key] = val;
    } else {
      args._.push(arg);
    }
  }
  return args;
}

export function main(argv = process.argv.slice(2), git = runGit, { exitOnError = false } = {}) {
  const args = parseArgs(argv);
  const command = args._[0];

  const handleResult = (result) => {
    if (!result.ok && exitOnError) {
      process.exitCode = 1;
    }
    return result;
  };

  if (command === 'validate') {
    const file = args.file;
    if (!file) throw new Error('Missing --file argument');
    const content = JSON.parse(fs.readFileSync(file, 'utf8'));
    return handleResult(validateRelease(content));
  }

  const targetBranch = args.target || 'gitops/stage';
  const remote = args.remote || 'origin';

  if (command === 'promote') {
    if (!args.candidate) throw new Error('Missing --candidate <file> argument');
    if (!args.checks) throw new Error('Missing --checks <file> argument');
    const candidate = JSON.parse(fs.readFileSync(args.candidate, 'utf8'));
    const checks = JSON.parse(fs.readFileSync(args.checks, 'utf8'));
    return handleResult(promoteBranch({ git, remote, targetBranch, candidate, checks }));
  }

  if (command === 'hold') {
    const reason = args.reason || 'Manual rollback hold';
    return handleResult(setRollbackHold({ git, remote, targetBranch, reason }));
  }

  if (command === 'resume') {
    const reason = args.reason || 'Resumed promotion';
    return handleResult(resumeRollbackHold({ git, remote, targetBranch, reason }));
  }

  return handleResult({ ok: false, reason: 'unknown command' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main(process.argv.slice(2), runGit, { exitOnError: true });
}
