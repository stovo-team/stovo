#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const TEST_FILE_REGEX = /(?:_test\.go|\.test\.(?:[jt]sx?|[mc]js))$/;
const SKIP_PATTERNS = [
  /\bt\.Skip(?:f)?\(/,
  /\b(?:test|it|describe)\.skip\(/,
  /\b(?:xit|xtest)\(/,
  /\/\/\s*skip-test/i,
];

const ASSERTION_PATTERNS = [
  /\bassert\./,
  /\brequire\./,
  /\bt\.(?:Errorf|Fatalf|Fail|FailNow|Error|Fatal)\(/,
  /\bexpect\(/,
  /\bassert\(/,
  /\.to\.(?:equal|deep|be|have)/,
];

export function parseDiff(diffText) {
  const files = [];
  let currentFile = null;

  for (const line of diffText.split('\n')) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (diffMatch) {
      currentFile = {
        path: diffMatch[2],
        addedLines: [],
        deletedLines: [],
      };
      files.push(currentFile);
      continue;
    }
    if (!currentFile) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentFile.addedLines.push(line.slice(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentFile.deletedLines.push(line.slice(1));
    }
  }

  return files;
}

export function verifyTestIntegrity(diffText) {
  const files = parseDiff(diffText);
  const violations = [];

  for (const file of files) {
    if (!TEST_FILE_REGEX.test(file.path)) continue;

    // Check 1: Skipped tests introduced
    for (const line of file.addedLines) {
      for (const pattern of SKIP_PATTERNS) {
        if (pattern.test(line)) {
          violations.push(
            `Anti-weakening: Test skipping pattern '${pattern}' added in ${file.path}: "${line.trim()}"`
          );
        }
      }
    }

    // Check 2: Assertion count net decrease
    let deletedAssertions = 0;
    for (const line of file.deletedLines) {
      if (ASSERTION_PATTERNS.some((pat) => pat.test(line))) {
        deletedAssertions++;
      }
    }

    let addedAssertions = 0;
    for (const line of file.addedLines) {
      if (ASSERTION_PATTERNS.some((pat) => pat.test(line))) {
        addedAssertions++;
      }
    }

    if (deletedAssertions > addedAssertions) {
      violations.push(
        `Anti-weakening: Assertions removed without replacement in ${file.path} (-${deletedAssertions - addedAssertions} assertions). Never weaken or delete a test to make a change pass.`
      );
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

export function runCheck(cwd = process.cwd()) {
  const git = (...args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      return '';
    }
  };

  // Determine diff range
  let diff = '';
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    // PR build
    diff = git('diff', `origin/${baseRef}...HEAD`);
    if (!diff) diff = git('diff', `${baseRef}...HEAD`);
  }

  if (!diff) {
    // Check if HEAD has a parent commit
    const hasParent = git('rev-parse', '--verify', 'HEAD~1');
    if (hasParent) {
      diff = git('diff', 'HEAD~1..HEAD');
    }
  }

  // Also include staged / unstaged diff if running locally
  const workingDiff = git('diff', 'HEAD');
  if (workingDiff) {
    diff = diff ? `${diff}\n${workingDiff}` : workingDiff;
  }

  if (!diff) {
    console.log('[check-test-integrity] Clean working tree / no test diff to check.');
    return 0;
  }

  const result = verifyTestIntegrity(diff);
  if (!result.ok) {
    console.error('[check-test-integrity] FAILED: Anti-weakening test integrity check violations found:');
    for (const v of result.violations) {
      console.error(`  - ${v}`);
    }
    return 1;
  }

  console.log('[check-test-integrity] PASSED: All test modifications preserve test integrity.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const code = runCheck();
  process.exit(code);
}
