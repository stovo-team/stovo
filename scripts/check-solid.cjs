#!/usr/bin/env node
/**
 * Cross-platform SOLID architecture & file size boundary checker/updater.
 * Works natively on Windows, macOS, and Linux without bash/WSL dependencies.
 */
const fs = require('fs');
const path = require('path');

const LIMIT = 400;
const ROOT = path.resolve(__dirname, '..');
const BASELINE_FILE = path.join(ROOT, '.architecture', 'size-baseline.tsv');

const args = process.argv.slice(2);
const isUpdate = args.includes('--update') || args.includes('-u');
const scope = args.find(a => !a.startsWith('-')) || 'all';

function walkDir(dir, filterFn) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(walkDir(fullPath, filterFn));
    } else if (filterFn(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function toPosix(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function getBackendFiles() {
  const backendDir = path.join(ROOT, 'backend', 'internal');
  return walkDir(backendDir, (p) => {
    const posix = toPosix(p);
    return p.endsWith('.go') &&
      !p.endsWith('_test.go') &&
      !posix.startsWith('backend/internal/ent/');
  });
}

function getFrontendFiles() {
  const frontendDir = path.join(ROOT, 'frontend', 'src');
  return walkDir(frontendDir, (p) => {
    return (p.endsWith('.ts') || p.endsWith('.tsx')) &&
      !p.includes('.test.');
  });
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  let lines = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') lines++;
  }
  if (content.length > 0 && !content.endsWith('\n')) lines++;
  return lines;
}

function readBaselines() {
  const map = new Map();
  if (fs.existsSync(BASELINE_FILE)) {
    const lines = fs.readFileSync(BASELINE_FILE, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 2 && parts[0].trim()) {
        map.set(parts[0].trim(), parseInt(parts[1].trim(), 10));
      }
    }
  }
  return map;
}

function handleUpdate() {
  const allFiles = [...getBackendFiles(), ...getFrontendFiles()];
  const entries = [];

  for (const f of allFiles) {
    const rel = toPosix(f);
    const lines = countLines(f);
    if (lines > LIMIT) {
      entries.push([rel, lines]);
    }
  }

  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const content = entries.map(([file, lines]) => `${file}\t${lines}`).join('\n') + '\n';
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, content, 'utf-8');
  console.log(`Successfully updated ${toPosix(BASELINE_FILE)} with ${entries.length} baselines.`);
}

function checkBoundaries() {
  const baselineMap = readBaselines();
  let failed = false;

  const filesToCheck = [];
  if (scope === 'all' || scope === 'backend') {
    filesToCheck.push(...getBackendFiles());
  }
  if (scope === 'all' || scope === 'frontend') {
    filesToCheck.push(...getFrontendFiles());
  }

  for (const f of filesToCheck) {
    const rel = toPosix(f);
    const lines = countLines(f);
    if (lines > LIMIT) {
      const allowed = baselineMap.get(rel);
      if (allowed === undefined) {
        console.error(`SOLID architecture check failed: ${rel} is ${lines} lines; new production files must be at most ${LIMIT} lines. Run 'npm run baseline:update' if intentional.`);
        failed = true;
      } else if (lines > allowed) {
        console.error(`SOLID architecture check failed: ${rel} grew from its ${allowed}-line migration baseline to ${lines} lines. Run 'npm run baseline:update' if intentional.`);
        failed = true;
      }
    }
  }

  // Import boundary checks
  if (scope === 'all' || scope === 'backend') {
    const domainFiles = walkDir(path.join(ROOT, 'backend', 'internal', 'domain'), (p) => p.endsWith('.go') && !p.endsWith('_test.go'));
    const outerRegex = /stovo-messenger\/backend\/internal\/(app|bootstrap|repository|ports|storage|broker|cache|logging|tunnel)/;
    for (const f of domainFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      if (outerRegex.test(content)) {
        console.error(`SOLID architecture check failed: ${toPosix(f)} imports an outer-layer package`);
        failed = true;
      }
    }

    const featureFiles = walkDir(path.join(ROOT, 'backend', 'internal', 'features'), (p) => p.endsWith('.go') && !p.endsWith('_test.go'));
    const featureForbiddenRegex = /stovo-messenger\/backend\/internal\/(app|bootstrap|repository|ports|storage|broker|cache|logging|tunnel)|\/(ent|redis|socketio)/;
    for (const f of featureFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      if (featureForbiddenRegex.test(content)) {
        console.error(`SOLID architecture check failed: ${toPosix(f)} imports an adapter or transport package`);
        failed = true;
      }
    }
  }

  if (scope === 'all' || scope === 'frontend') {
    const feFeatureFiles = walkDir(path.join(ROOT, 'frontend', 'src', 'features'), (p) => (p.endsWith('.ts') || p.endsWith('.tsx')) && !p.includes('.test.'));
    const pageImportRegex = /from\s+['"][^'"]*pages\/|from\s+['"][^'"]*\.\.\/pages/;
    for (const f of feFeatureFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      if (pageImportRegex.test(content)) {
        console.error(`SOLID architecture check failed: a frontend feature (${toPosix(f)}) imports a page module`);
        failed = true;
      }
    }
  }

  if (failed) {
    process.exit(1);
  }
  console.log('SOLID architecture checks passed');
}

if (isUpdate) {
  handleUpdate();
} else {
  checkBoundaries();
}
