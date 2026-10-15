const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectUiStringViolations } = require('./check-ui-localization.cjs');

function withSource(files, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-localization-'));
  try {
    for (const [file, source] of Object.entries(files)) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    }
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('finds visible JSX copy and reports stable source locations', () => {
  withSource({ 'View.tsx': 'export const View = () => <button>Save changes</button>;' }, (root) => {
    assert.deepEqual(collectUiStringViolations(root), [
      { file: 'View.tsx', line: 1, kind: 'jsx-text', value: 'Save changes' },
    ]);
  });
});

test('finds user-facing accessibility and form attributes', () => {
  withSource({
    'Form.tsx': '<input aria-label="Search messages" title="Search" placeholder="Type a message" />',
  }, (root) => {
    assert.deepEqual(collectUiStringViolations(root).map(({ kind, value }) => ({ kind, value })), [
      { kind: 'jsx-attribute', value: 'Search messages' },
      { kind: 'jsx-attribute', value: 'Search' },
      { kind: 'jsx-attribute', value: 'Type a message' },
    ]);
  });
});

test('finds known UI message setters and interpolated templates', () => {
  withSource({
    'Messages.tsx': 'setError(`Could not save ${name}`); toast.error("Upload failed");',
  }, (root) => {
    assert.deepEqual(collectUiStringViolations(root).map(({ kind, value }) => ({ kind, value })), [
      { kind: 'ui-message', value: 'Could not save ${name}' },
      { kind: 'ui-message', value: 'Upload failed' },
    ]);
  });
});

test('ignores technical identifiers and code-only literals', () => {
  withSource({
    'Technical.tsx': 'const endpoint = "/api/messages"; const mode = "webauthn.get"; return <img src="/logo.svg" />;',
  }, (root) => {
    assert.deepEqual(collectUiStringViolations(root), []);
  });
});

test('does not scan test source files as product UI', () => {
  withSource({ 'View.test.tsx': 'export const View = () => <button>Test helper</button>;' }, (root) => {
    assert.deepEqual(collectUiStringViolations(root), []);
  });
});

test('ignores developer diagnostics written to console', () => {
  withSource({ 'Diagnostics.ts': 'console.error("Internal error");' }, (root) => {
    assert.deepEqual(collectUiStringViolations(root), []);
  });
});
