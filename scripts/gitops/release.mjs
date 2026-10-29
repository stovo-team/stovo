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
