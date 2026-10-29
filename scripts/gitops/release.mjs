import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const sourcePattern = /^[0-9a-f]{40}$/;
const imagePattern = /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127})?@sha256:[0-9a-f]{64}$/;
const requiredImages = [
  'backend', 'orchestrator', 'frontend', 'caddy', 'postgres',
  'redis', 'minio', 'coturn', 'livekit', 'atlas',
];
const requiredJobs = ['changes', 'solid-boundaries'];
const conditionalJobs = ['backend-ci', 'frontend-ci'];
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const reject = reason => ({ ok: false, reason });

/** Validate an immutable release snapshot without contacting Git or a registry. */
export function validateRelease(record) {
  if (!isObject(record)) return reject('release must be an object');
  if (typeof record.source_sha !== 'string' || !sourcePattern.test(record.source_sha)) return reject('invalid source SHA');
  if (!positiveInteger(record.sequence)) return reject('invalid release sequence');
  if (!positiveInteger(record.secret_version)) return reject('invalid secret version');
  if (typeof record.rollback_hold !== 'boolean') return reject('invalid rollback hold');
  if (!isObject(record.images)) return reject('images must be an object');
  if (requiredImages.some(name => !Object.hasOwn(record.images, name))) return reject('required image missing');
  if (Object.values(record.images).some(image => typeof image !== 'string' || !imagePattern.test(image))) {
    return reject('every image must use an immutable sha256 digest');
  }
  return { ok: true };
}

/**
 * Plan an application release using trusted CI results and an observed branch head.
 * The caller must authenticate the CI data, compute ancestry from Git, and apply expectedHead with an atomic
 * compare-and-swap. This function neither checks GitHub nor changes any branch.
 */
export function planPromotion(current, candidate, checks) {
  try {
    current = structuredClone(current);
    candidate = structuredClone(candidate);
    checks = structuredClone(checks);
  } catch {
    return reject('promotion inputs cannot be copied');
  }
  const valid = validateRelease(candidate);
  if (!valid.ok) return valid;
  if (!isObject(current) || typeof current.head !== 'string' || !sourcePattern.test(current.head) ||
      typeof current.source_sha !== 'string' || !sourcePattern.test(current.source_sha) ||
      !Number.isSafeInteger(current.sequence) || current.sequence < 0 ||
      !positiveInteger(current.secret_version) || typeof current.rollback_hold !== 'boolean') {
    return reject('invalid current release state');
  }
  if (current.rollback_hold || candidate.rollback_hold) return reject('promotion is on hold');
  if (candidate.sequence !== current.sequence + 1) return reject('stale or out-of-order release');
  if (candidate.secret_version !== current.secret_version) return reject('application release must preserve secret version');
  if (!isObject(checks) || checks.source_sha !== candidate.source_sha || checks.bypass !== false ||
      !Array.isArray(checks.required) || checks.required.length === 0 ||
      checks.required.some(name => typeof name !== 'string' || !name) ||
      new Set(checks.required).size !== checks.required.length ||
      !requiredJobs.every(name => checks.required.includes(name)) ||
      !isObject(checks.conditional) || !isObject(checks.results)) {
    return reject('invalid or mismatched CI evidence');
  }
  const ancestry = checks.source_ancestry;
  if (!isObject(ancestry) || ancestry.base_sha !== current.source_sha ||
      ancestry.target_sha !== candidate.source_sha || ancestry.is_descendant !== true) {
    return reject('candidate does not descend from current release');
  }
  if (checks.required.some(name => checks.results[name] !== 'success')) return reject('required CI check did not pass');
  const names = Object.keys(checks.conditional);
  if (names.length !== conditionalJobs.length || !conditionalJobs.every(name => names.includes(name))) {
    return reject('invalid conditional check policy');
  }
  for (const name of conditionalJobs) {
    const applicable = checks.conditional[name];
    const result = checks.results[name];
    if (typeof applicable !== 'boolean' || (result !== 'success' && !(applicable === false && result === 'skipped'))) {
      return reject('conditional CI check did not pass');
    }
  }
  return { ok: true, expectedHead: current.head, release: candidate };
}

/** Write deploy/gitops/release.json into a new git commit without checking out the branch. */
export function writeReleaseCommit({ git, expectedHead = null, release, message }) {
  const content = JSON.stringify(release, null, 2) + '\n';
  const blobSha = git(['hash-object', '-w', '--stdin'], { input: content }).trim();
  const tempIndex = path.join(os.tmpdir(), `stovo-idx-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    const env = { ...process.env, GIT_INDEX_FILE: tempIndex };
    if (expectedHead) {
      git(['read-tree', expectedHead], { env });
    }
    git(['update-index', '--add', '--cacheinfo', '100644', blobSha, 'deploy/gitops/release.json'], { env });
    const treeSha = git(['write-tree'], { env }).trim();
    const parentArgs = expectedHead ? ['-p', expectedHead] : [];
    return git(['commit-tree', treeSha, ...parentArgs, '-m', message], { env }).trim();
  } finally {
    try { fs.rmSync(tempIndex, { force: true }); } catch {}
  }
}

/** Read the current release record from a commit or branch ref. */
export function readBranchRelease(git, ref) {
  try {
    const raw = git(['show', `${ref}:deploy/gitops/release.json`]);
    const parsed = JSON.parse(raw);
    const head = git(['rev-parse', ref]).trim();
    return { head, ...parsed };
  } catch {
    return null;
  }
}

/**
 * Execute promotion to a release branch using atomic compare-and-swap (force-with-lease).
 * Never permits force-push without lease.
 */
export function promoteBranch({ git, remote = 'origin', targetBranch = 'gitops/stage', candidate, checks }) {
  let expectedHead;
  try {
    expectedHead = git(['rev-parse', '--verify', `refs/remotes/${remote}/${targetBranch}`]).trim();
  } catch {
    try {
      expectedHead = git(['rev-parse', '--verify', `refs/heads/${targetBranch}`]).trim();
    } catch {
      expectedHead = null;
    }
  }

  const current = expectedHead ? readBranchRelease(git, expectedHead) : null;
  if (!current) return reject('target branch has no valid current release');

  if (checks && !checks.source_ancestry && current.source_sha && candidate?.source_sha) {
    let isDescendant = false;
    try {
      git(['merge-base', '--is-ancestor', current.source_sha, candidate.source_sha]);
      isDescendant = true;
    } catch {
      isDescendant = false;
    }
    checks.source_ancestry = {
      base_sha: current.source_sha,
      target_sha: candidate.source_sha,
      is_descendant: isDescendant,
    };
  }

  const planned = planPromotion(current, candidate, checks);
  if (!planned.ok) return planned;

  const commitSha = writeReleaseCommit({
    git,
    expectedHead,
    release: planned.release,
    message: `Release sequence ${planned.release.sequence}: ${planned.release.source_sha.slice(0, 8)}`,
  });

  try {
    const leaseArg = `--force-with-lease=refs/heads/${targetBranch}:${expectedHead}`;
    git(['push', remote, leaseArg, `${commitSha}:refs/heads/${targetBranch}`]);
    return { ok: true, commit: commitSha, release: planned.release };
  } catch (err) {
    return reject(`push rejected by compare-and-swap lease: ${err.message || err}`);
  }
}

/** Set rollback hold on the target release branch. */
export function setRollbackHold({ git, remote = 'origin', targetBranch = 'gitops/stage', reason = 'Manual rollback hold' }) {
  let head;
  try {
    head = git(['rev-parse', '--verify', `refs/remotes/${remote}/${targetBranch}`]).trim();
  } catch {
    try { head = git(['rev-parse', '--verify', `refs/heads/${targetBranch}`]).trim(); } catch { return reject('branch not found'); }
  }
  const current = readBranchRelease(git, head);
  if (!current) return reject('cannot read current release');
  if (current.rollback_hold) return reject('branch is already on hold');
  const updated = { ...current, rollback_hold: true, hold_reason: reason };
  delete updated.head;
  const commitSha = writeReleaseCommit({
    git,
    expectedHead: head,
    release: updated,
    message: `Hold release promotion: ${reason}`,
  });
  try {
    git(['push', remote, `--force-with-lease=refs/heads/${targetBranch}:${head}`, `${commitSha}:refs/heads/${targetBranch}`]);
    return { ok: true, commit: commitSha, release: updated };
  } catch (err) {
    return reject(`hold push rejected by lease: ${err.message || err}`);
  }
}

/** Clear rollback hold on the target release branch. */
export function resumeRollbackHold({ git, remote = 'origin', targetBranch = 'gitops/stage', reason = 'Resumed promotion' }) {
  let head;
  try {
    head = git(['rev-parse', '--verify', `refs/remotes/${remote}/${targetBranch}`]).trim();
  } catch {
    try { head = git(['rev-parse', '--verify', `refs/heads/${targetBranch}`]).trim(); } catch { return reject('branch not found'); }
  }
  const current = readBranchRelease(git, head);
  if (!current) return reject('cannot read current release');
  if (!current.rollback_hold) return reject('branch is not on hold');
  const updated = { ...current, rollback_hold: false };
  delete updated.head;
  delete updated.hold_reason;
  const commitSha = writeReleaseCommit({
    git,
    expectedHead: head,
    release: updated,
    message: `Resume release promotion: ${reason}`,
  });
  try {
    git(['push', remote, `--force-with-lease=refs/heads/${targetBranch}:${head}`, `${commitSha}:refs/heads/${targetBranch}`]);
    return { ok: true, commit: commitSha, release: updated };
  } catch (err) {
    return reject(`resume push rejected by lease: ${err.message || err}`);
  }
}

