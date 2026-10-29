import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRelease, planPromotion } from './release.mjs';

const source = 'a'.repeat(40);
const head = 'b'.repeat(40);
const digest = 'c'.repeat(64);
const imageNames = ['backend', 'orchestrator', 'frontend', 'caddy', 'postgres', 'redis', 'minio', 'coturn', 'livekit', 'atlas'];
const release = () => ({
  source_sha: source,
  sequence: 4,
  secret_version: 7,
  rollback_hold: false,
  images: Object.fromEntries(imageNames.map(name => [name, `ghcr.io/example/${name}@sha256:${digest}`])),
});
const currentSource = 'e'.repeat(40);
const current = () => ({ head, source_sha: currentSource, sequence: 3, secret_version: 7, rollback_hold: false });
const checks = () => ({
  source_sha: source,
  source_ancestry: { base_sha: currentSource, target_sha: source, is_descendant: true },
  bypass: false,
  required: ['changes', 'solid-boundaries'],
  conditional: { 'backend-ci': true, 'frontend-ci': true },
  results: { changes: 'success', 'solid-boundaries': 'success', 'backend-ci': 'success', 'frontend-ci': 'success' },
});

test('accepts a complete immutable release and returns its expected branch head', () => {
  const candidate = release();
  assert.equal(validateRelease(candidate).ok, true);
  const result = planPromotion(current(), candidate, checks());
  assert.equal(result.ok, true);
  assert.equal(result.expectedHead, head);
  assert.deepEqual(result.release, candidate);
});

test('rejects invalid source, sequence, version, and missing hold state', () => {
  for (const change of [
    { source_sha: 'master' }, { source_sha: '' }, { sequence: 0 }, { sequence: 1.5 },
    { secret_version: 0 }, { secret_version: '7' }, { rollback_hold: undefined },
  ]) assert.equal(validateRelease({ ...release(), ...change }).ok, false, JSON.stringify(change));
  assert.equal(validateRelease(null).ok, false);
});

test('requires immutable digests for every application and infrastructure image', () => {
  for (const name of imageNames) {
    const candidate = release();
    delete candidate.images[name];
    assert.equal(validateRelease(candidate).ok, false, name);
  }
  for (const invalid of ['postgres:16-alpine', `postgres@sha256:${'f'.repeat(63)}`, `postgres@sha256:${'g'.repeat(64)}`]) {
    const candidate = release();
    candidate.images.postgres = invalid;
    assert.equal(validateRelease(candidate).ok, false, invalid);
  }
  const candidate = release();
  candidate.images.extra = 'example:latest';
  assert.equal(validateRelease(candidate).ok, false);
});

test('refuses failed, skipped, pending, canceled and absent required checks', () => {
  for (const status of ['failure', 'skipped', 'pending', 'cancelled', undefined]) {
    const result = checks();
    result.results['solid-boundaries'] = status;
    assert.equal(planPromotion(current(), release(), result).ok, false, String(status));
  }
  const result = checks();
  result.required = ['changes'];
  assert.equal(planPromotion(current(), release(), result).ok, false);
});

test('only allows skipped conditional checks explicitly marked inapplicable', () => {
  const inactive = checks();
  inactive.conditional['frontend-ci'] = false;
  inactive.results['frontend-ci'] = 'skipped';
  assert.equal(planPromotion(current(), release(), inactive).ok, true);
  const active = checks();
  active.results['frontend-ci'] = 'skipped';
  assert.equal(planPromotion(current(), release(), active).ok, false);
  inactive.conditional['unknown-job'] = false;
  inactive.results['unknown-job'] = 'skipped';
  assert.equal(planPromotion(current(), release(), inactive).ok, false);
});

test('requires checks for exactly the candidate source and rejects emergency bypass', () => {
  const wrongSource = checks();
  wrongSource.source_sha = 'd'.repeat(40);
  assert.equal(planPromotion(current(), release(), wrongSource).ok, false);
  const bypass = checks();
  bypass.bypass = true;
  assert.equal(planPromotion(current(), release(), bypass).ok, false);
  const missingBypass = checks();
  delete missingBypass.bypass;
  assert.equal(planPromotion(current(), release(), missingBypass).ok, false);
});

test('preserves secret version when promoting an application release', () => {
  const candidate = release();
  candidate.secret_version = 8;
  assert.equal(planPromotion(current(), candidate, checks()).ok, false);
});

test('rejects stale, out-of-order, held and malformed branch state', () => {
  for (const state of [
    { ...current(), sequence: 4 }, { ...current(), sequence: 5 },
    { ...current(), rollback_hold: true }, { ...current(), head: 'master' },
    { ...current(), rollback_hold: undefined }, null,
  ]) assert.equal(planPromotion(state, release(), checks()).ok, false);
  const gap = release();
  gap.sequence = 6;
  assert.equal(planPromotion(current(), gap, checks()).ok, false);
});

test('refuses malformed input without throwing or silently allowing promotion', () => {
  for (const invalid of [null, {}, { ...checks(), required: [] }, { ...checks(), conditional: {} },
    { ...checks(), results: null }, { ...checks(), required: ['changes', 'changes', 'solid-boundaries'] }]) {
    assert.doesNotThrow(() => planPromotion(current(), release(), invalid));
    assert.equal(planPromotion(current(), release(), invalid).ok, false);
  }
});

test('freezes the reviewed release snapshot against later caller mutation', () => {
  const candidate = release();
  const result = planPromotion(current(), candidate, checks());
  candidate.images.backend = 'untrusted:latest';
  candidate.secret_version = 99;
  assert.equal(result.release.images.backend, `ghcr.io/example/backend@sha256:${digest}`);
  assert.equal(result.release.secret_version, 7);
});


test('requires verified ancestry of the candidate from the current release', () => {
  for (const ancestry of [undefined, null, { base_sha: currentSource, target_sha: source, is_descendant: false },
    { base_sha: 'f'.repeat(40), target_sha: source, is_descendant: true },
    { base_sha: currentSource, target_sha: 'f'.repeat(40), is_descendant: true },
    { base_sha: currentSource, target_sha: source, is_descendant: 'true' }]) {
    const evidence = checks();
    evidence.source_ancestry = ancestry;
    assert.equal(planPromotion(current(), release(), evidence).ok, false);
  }
  assert.equal(planPromotion({ ...current(), source_sha: 'master' }, release(), checks()).ok, false);
});

test('rejects invalid repository references even with valid digests', () => {
  for (const name of ['!!!', '/bad', 'Bad/Name', 'foo//bar', 'foo:bad:port']) {
    const candidate = release();
    candidate.images.backend = `${name}@sha256:${digest}`;
    assert.equal(validateRelease(candidate).ok, false, name);
  }
});

test('validates the copied release, not an earlier getter value', () => {
  const candidate = release();
  let reads = 0;
  Object.defineProperty(candidate.images, 'backend', { enumerable: true, get() {
    return ++reads === 1 ? `ghcr.io/example/backend@sha256:${digest}` : 'bad:latest';
  } });
  const result = planPromotion(current(), candidate, checks());
  assert.ok(!result.ok || result.release.images.backend !== 'bad:latest');
});
