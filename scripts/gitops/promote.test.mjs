import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, main } from './promote.mjs';

const source = 'a'.repeat(40);
const digest = 'c'.repeat(64);
const imageNames = ['backend', 'orchestrator', 'frontend', 'caddy', 'postgres', 'redis', 'minio', 'coturn', 'livekit', 'atlas'];
const release = () => ({
  source_sha: source,
  sequence: 2,
  secret_version: 1,
  rollback_hold: false,
  images: Object.fromEntries(imageNames.map(name => [name, `ghcr.io/example/${name}@sha256:${digest}`])),
});

test('parseArgs correctly parses flags and positional arguments', () => {
  const parsed = parseArgs(['promote', '--target', 'gitops/production', '--dry-run', '--candidate', 'cand.json']);
  assert.deepEqual(parsed._, ['promote']);
  assert.equal(parsed.target, 'gitops/production');
  assert.equal(parsed['dry-run'], true);
  assert.equal(parsed.candidate, 'cand.json');
});

test('main validate subcommand validates file contents', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gitops-val-'));
  const file = path.join(tmp, 'release.json');
  try {
    fs.writeFileSync(file, JSON.stringify(release(), null, 2));
    const res = main(['validate', '--file', file]);
    assert.equal(res.ok, true);

    fs.writeFileSync(file, JSON.stringify({ ...release(), source_sha: 'invalid' }));
    const invalidRes = main(['validate', '--file', file]);
    assert.equal(invalidRes.ok, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('main unknown command exits with failure', () => {
  const res = main(['unknown']);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'unknown command');
});
