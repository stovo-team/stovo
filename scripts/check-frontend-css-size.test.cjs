const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, test } = require('node:test');
const { checkCssSizes } = require('./check-frontend-css-size.cjs');

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function fixture({ files = {}, baseline = { files: {}, exceptions: {} } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frontend-css-size-'));
  temporaryDirectories.push(root);
  const stylesDir = path.join(root, 'styles');
  fs.mkdirSync(stylesDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const filePath = path.join(stylesDir, name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  const baselinePath = path.join(root, 'baseline.json');
  fs.writeFileSync(baselinePath, JSON.stringify(baseline));
  return { stylesDir, baselinePath };
}

function cssLines(count) {
  return Array.from({ length: count }, (_, index) => `.item-${index} { color: red; }`).join('\n') + '\n';
}

test('rejects a new CSS partial above 2,500 lines', () => {
  const result = checkCssSizes(fixture({ files: { 'new.css': cssLines(2501) } }));
  assert.match(result.errors.join('\n'), /new\.css.*2501.*2500/);
});

test('warns when a CSS partial exceeds 1,500 lines', () => {
  const result = checkCssSizes(fixture({ files: { 'large.css': cssLines(1501) } }));
  assert.match(result.warnings.join('\n'), /large\.css.*1501.*1500/);
  assert.deepEqual(result.errors, []);
});

test('rejects growth to a baseline partial above 1,500 lines without an exception', () => {
  const result = checkCssSizes(fixture({
    files: { 'large.css': cssLines(1510) },
    baseline: { files: { 'large.css': 1505 }, exceptions: {} },
  }));
  assert.match(result.errors.join('\n'), /large\.css.*1505.*1510/);
});

test('rejects an existing partial that grows past 1,500 lines', () => {
  const result = checkCssSizes(fixture({
    files: { 'large.css': cssLines(1501) },
    baseline: { files: { 'large.css': 1490 }, exceptions: {} },
  }));
  assert.match(result.errors.join('\n'), /large\.css.*1490.*1501/);
});

test('allows baseline growth only within a documented exception cap', () => {
  const result = checkCssSizes(fixture({
    files: { 'large.css': cssLines(1510) },
    baseline: {
      files: { 'large.css': 1505 },
      exceptions: { 'large.css': { maxLines: 1510, reason: 'A temporary migration requires these rules.' } },
    },
  }));
  assert.deepEqual(result.errors, []);
});

test('rejects exception entries without a reason', () => {
  const result = checkCssSizes(fixture({
    files: { 'large.css': cssLines(1510) },
    baseline: { files: { 'large.css': 1505 }, exceptions: { 'large.css': { maxLines: 1510 } } },
  }));
  assert.match(result.errors.join('\n'), /large\.css.*reason/i);
});

test('ignores nested generated output and vendor CSS', () => {
  const result = checkCssSizes(fixture({
    files: {
      'generated-output.css': cssLines(2600),
      'vendor-package.css': cssLines(2600),
      'generated/output.css': cssLines(2600),
      'vendor/package.css': cssLines(2600),
      'authored.css': cssLines(20),
    },
  }));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});
