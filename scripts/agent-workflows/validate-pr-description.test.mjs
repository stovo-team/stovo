import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { validatePrDescription } from './validate-pr-description.mjs';

const VALID_SAMPLE = `> [!NOTE]
> ### ⚡ 5-Second Quick Glance
> - 🔴 **Problem / Trigger:** CI failed during docker build due to Go toolchain mismatch.
> - 🟢 **Fix / Change:** Upgraded builder base image to Go 1.26-alpine.
> - 🛡️ **Scope & Impact:** Build pipeline only; no production runtime impact.

| Area / Component | Change Summary | Production Risk |
| :--- | :--- | :---: |
| backend/Dockerfile | Bump Go builder to 1.26 | 🟢 Low |

---

## Problem and behavior
Detailed explanation of why Go 1.26 was needed and how the failure was triggered.

## Architecture and Call Trace
Detailed affected layers.

\`\`\`mermaid
flowchart LR
    A[go.mod 1.26] --> B[Dockerfile 1.25]
    B --> C[CI Failed]
    subgraph Fix
      D[Dockerfile 1.26]
    end
    Fix --> E[CI Passed]
\`\`\`

## Evidence & TDD Verification
- bash .github/workflows/backend-dockerfiles.test.sh passed.

## Risks and manual review
Low risk; build time only.
1. Run docker build locally.
2. Verify exit code is 0.
`;

test('valid PR description passes static validation', () => {
  const result = validatePrDescription(VALID_SAMPLE);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.errors.length, 0);
});

test('empty PR description fails', () => {
  const result = validatePrDescription('   ');
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /PR description is empty/);
});

test('unreplaced template comments fail', () => {
  const text = VALID_SAMPLE + '\n<!-- 1-2 plain sentences: what broke -->';
  const result = validatePrDescription(text);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /unreplaced template comments/);
});

test('missing Quick Glance callout fails', () => {
  const text = VALID_SAMPLE.replace('> [!NOTE]\n> ### ⚡ 5-Second Quick Glance', '## Summary');
  const result = validatePrDescription(text);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /Missing top-level "> \[!NOTE\] ### ⚡ 5-Second Quick Glance" callout/);
});

test('missing 🔴/🟢/🛡️ markers in Quick Glance fails', () => {
  const text = VALID_SAMPLE.replace('🔴 **Problem / Trigger:**', 'Problem:');
  const result = validatePrDescription(text);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /Quick Glance is missing non-empty "🔴 \*\*Problem \/ Trigger:\*\*"/);
});

test('missing component risk table fails', () => {
  const text = VALID_SAMPLE.replace(/\| Area \/ Component[\s\S]*?🟢 Low \|\n/, '');
  const result = validatePrDescription(text);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /Missing component risk matrix table/);
});

test('missing Mermaid diagram fails', () => {
  const text = VALID_SAMPLE.replace(/```mermaid[\s\S]*?```/, '');
  const result = validatePrDescription(text);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /Missing mandatory visual diagram/);
});

test('template placeholder Mermaid diagram fails', () => {
  const text = VALID_SAMPLE.replace(
    /```mermaid[\s\S]*?```/,
    '```mermaid\nsequenceDiagram\n    participant Caller\n    participant Core\n    Caller->>Core: Invocation\n```'
  );
  const result = validatePrDescription(text);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /placeholder sequence/);
});

test('missing numbered manual review steps fails', () => {
  const text = VALID_SAMPLE.replace(/1\. Run docker build locally\.[\s\S]*2\. Verify exit code is 0\./, 'Just check it manually.');
  const result = validatePrDescription(text);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /Manual review must contain concrete numbered steps/);
});

test('CLI supports --body and --file flags', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pr-desc-test-'));
  try {
    const filePath = path.join(root, 'pr.md');
    writeFileSync(filePath, VALID_SAMPLE);

    const rFile = spawnSync(process.execPath, ['scripts/agent-workflows/validate-pr-description.mjs', '--file', filePath], { encoding: 'utf8' });
    assert.equal(rFile.status, 0, rFile.stderr);

    const rBad = spawnSync(process.execPath, ['scripts/agent-workflows/validate-pr-description.mjs', '--body', 'bad body'], { encoding: 'utf8' });
    assert.equal(rBad.status, 1);
    assert.match(rBad.stderr, /PR description static validation failed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
