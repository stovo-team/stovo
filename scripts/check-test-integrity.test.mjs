import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff, verifyTestIntegrity } from './check-test-integrity.mjs';

test('parseDiff extracts added and deleted lines per file', () => {
  const diff = `
diff --git a/backend/auth_test.go b/backend/auth_test.go
--- a/backend/auth_test.go
+++ b/backend/auth_test.go
@@ -10,3 +10,3 @@
-	assert.Equal(t, 1, 1)
+	assert.Equal(t, 2, 2)
`;
  const files = parseDiff(diff);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, 'backend/auth_test.go');
  assert.deepEqual(files[0].deletedLines, ['\tassert.Equal(t, 1, 1)']);
  assert.deepEqual(files[0].addedLines, ['\tassert.Equal(t, 2, 2)']);
});

test('verifyTestIntegrity passes when assertions are added or equal', () => {
  const diff = `
diff --git a/frontend/src/example.test.ts b/frontend/src/example.test.ts
--- a/frontend/src/example.test.ts
+++ b/frontend/src/example.test.ts
@@ -5,2 +5,3 @@
-  expect(result).toBe(true);
+  expect(result).toBe(true);
+  expect(extra).toBe(10);
`;
  const result = verifyTestIntegrity(diff);
  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
});

test('verifyTestIntegrity detects removed assertions without replacement', () => {
  const diff = `
diff --git a/frontend/src/example.test.ts b/frontend/src/example.test.ts
--- a/frontend/src/example.test.ts
+++ b/frontend/src/example.test.ts
@@ -5,3 +5,1 @@
-  expect(result).toBe(true);
-  expect(extra).toBe(10);
+  // removed assertions
`;
  const result = verifyTestIntegrity(diff);
  assert.equal(result.ok, false);
  assert.match(result.violations[0], /Anti-weakening: Assertions removed without replacement/);
});

test('verifyTestIntegrity detects added skip patterns', () => {
  const diff = `
diff --git a/backend/service_test.go b/backend/service_test.go
--- a/backend/service_test.go
+++ b/backend/service_test.go
@@ -10,2 +10,3 @@
+	t.Skip("skipping flaky test")
 	assert.NoError(t, err)
`;
  const result = verifyTestIntegrity(diff);
  assert.equal(result.ok, false);
  assert.match(result.violations[0], /Anti-weakening: Test skipping pattern/);
});

test('verifyTestIntegrity ignores non-test files', () => {
  const diff = `
diff --git a/backend/main.go b/backend/main.go
--- a/backend/main.go
+++ b/backend/main.go
@@ -10,2 +10,1 @@
-	// assert something
+	// code
`;
  const result = verifyTestIntegrity(diff);
  assert.equal(result.ok, true);
});
