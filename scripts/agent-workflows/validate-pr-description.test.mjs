import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { validatePrDescription, validateMermaid, extractVisualEvidence } from './validate-pr-description.mjs';

const VALID_SAMPLE = `> [!NOTE]
> ### ⚡ 5-Second Quick Glance
>
> * 🔴 **PROBLEM** ➔ **CI Build Failure:** CI failed during docker build due to Go toolchain mismatch between \`go.mod\` and Dockerfile.
> * 🟢 **SOLUTION** ➔ **Toolchain Alignment:** Upgraded builder base image to Go 1.26-alpine and added verification tests.
> * 🛡️ **IMPACT** ➔ **Zero Production Risk:** Build pipeline only; no production runtime or client changes.

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
    A["go.mod 1.26"] --> B["Dockerfile 1.25"]
    B --> C["CI Failed"]
    subgraph Fix
      D["Dockerfile 1.26"]
    end
    Fix -->|build success| E["CI Passed"]
\`\`\`

## Evidence & TDD Verification
- bash .github/workflows/backend-dockerfiles.test.sh passed.

## Risks and manual review
Low risk; build time only.
1. Run docker build locally.
2. Verify exit code is 0.
`;

const VALID_FRONTEND_SAMPLE = `> [!NOTE]
> ### ⚡ 5-Second Quick Glance
>
> * 🔴 **PROBLEM** ➔ **Button Overflow:** Chat action button text overflowed viewport on mobile screen sizes.
> * 🟢 **SOLUTION** ➔ **Responsive Flex:** Applied responsive layout tokens and min-width constraints.
> * 🛡️ **IMPACT** ➔ **Low Risk:** Mobile chat layout styling only.

| Area / Component | Change Summary | Production Risk |
| :--- | :--- | :---: |
| frontend/src/components/ChatButton.tsx | Responsive width style | 🟢 Low |

---

## Problem and behavior
Button overflow on screen widths below 380px.

## Visual Evidence & Architecture
UI component visual hierarchy.

## Evidence & TDD Verification
- npm test passed.
- Visual evidence (before/after screenshots on mock server):
| Before | After |
| :---: | :---: |
| ![Before](https://raw.githubusercontent.com/stovo-team/stovo/evidence/before.png) | ![After](https://raw.githubusercontent.com/stovo-team/stovo/evidence/after.png) |

## Risks and manual review
1. Open mobile viewport 375px.
2. Observe button fits without scrollbar.
`;

test('valid PR description with high-contrast Note and valid Mermaid passes', () => {
  const result = validatePrDescription(VALID_SAMPLE);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.errors.length, 0);
});

test('frontend PR with visual screenshot evidence passes without Mermaid', () => {
  const result = validatePrDescription(VALID_FRONTEND_SAMPLE, { scope: 'frontend' });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.scope, 'frontend');
});

test('frontend PR without visual screenshots fails static validation', () => {
  const noScreenshots = VALID_FRONTEND_SAMPLE.replace(/!\[.*?\]\(.*?\)/g, '');
  const result = validatePrDescription(noScreenshots, { scope: 'frontend' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /Frontend PR requires real visual screenshot evidence/);
});

test('backend PR without Mermaid fails static validation', () => {
  const noMermaid = VALID_SAMPLE.replace(/```mermaid[\s\S]*?```/, '');
  const result = validatePrDescription(noMermaid, { scope: 'backend' });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /Backend PR requires an architecture visual diagram/);
});

test('extractVisualEvidence extracts markdown and html images ignoring placeholders', () => {
  const text = `
    <!-- comment ![ignore](foo.png) -->
    ![before](https://example.com/b.png)
    <img src="https://example.com/a.png" width="400"/>
    ![fake](placeholder)
    ![empty]()
  `;
  const res = extractVisualEvidence(text);
  assert.equal(res.length, 2);
  assert.equal(res[0].url, 'https://example.com/b.png');
  assert.equal(res[1].url, 'https://example.com/a.png');
});

test('Mermaid validator detects invalid arrow labels with quotes', () => {
  const badMermaid = `flowchart LR\n  A -- "quoted label" --> B`;
  const result = validateMermaid(badMermaid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /Invalid arrow label with quotes/);
});

test('Mermaid validator detects literal \\n in node labels', () => {
  const badMermaid = `flowchart TD\n  A["Line 1\\nLine 2"] --> B`;
  const result = validateMermaid(badMermaid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /does not support literal '\\n'/);
});

test('Mermaid validator detects invalid single-dash arrow in flowchart', () => {
  const badMermaid = `flowchart LR\n  A -> B`;
  const result = validateMermaid(badMermaid);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /Invalid single-dash arrow '->'/);
});

test('Mermaid validator detects unbalanced brackets and quotes', () => {
  const badBracket = `flowchart LR\n  A["Unclosed bracket --> B`;
  assert.equal(validateMermaid(badBracket).ok, false);

  const badQuote = `flowchart LR\n  A["Unclosed quote] --> B`;
  assert.equal(validateMermaid(badQuote).ok, false);
});

test('Quick Glance without bold punchlines fails', () => {
  const flatNote = VALID_SAMPLE
    .replace('🔴 **PROBLEM** ➔ **CI Build Failure:**', '🔴 **Problem:** CI failed during docker build due to Go toolchain mismatch.')
    .replace('🟢 **SOLUTION** ➔ **Toolchain Alignment:**', '🟢 **Fix:** Upgraded builder base image to Go 1.26-alpine.')
    .replace('🛡️ **IMPACT** ➔ **Zero Production Risk:**', '🛡️ **Impact:** Build pipeline only.');
  const result = validatePrDescription(flatNote);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('; '), /high-contrast bold punchline/);
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
