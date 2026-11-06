import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const normalizeLineEndings = (contents) => contents.replace(/\r\n/g, '\n');
const read = (file) => normalizeLineEndings(readFileSync(file, 'utf8'));

test('workflow text normalizes Windows CRLF line endings before assertions', () => {
  assert.equal(
    normalizeLineEndings('workflow_dispatch:\r\n    inputs:\r\n'),
    'workflow_dispatch:\n    inputs:\n',
  );
});

// Probe both the runner user and the sudo context used by deployment. Some
// self-hosted runners expose neither Compose plugin, so the config check skips there.
const upstream = 'stovo-backend-acdcbca1:8000';
const composeCommand = (probe = spawnSync) => {
  for (const prefix of [['docker'], ['sudo', '-n', 'env', `BACKEND_UPSTREAMS=${upstream}`, 'docker']]) {
    if (probe(prefix[0], [...prefix.slice(1), 'compose', 'version'], { encoding: 'utf8' }).status === 0) return prefix;
  }
  return null;
};

test('Compose discovery reports unavailable when neither runner has the Compose plugin', () => {
  assert.equal(composeCommand(() => ({ status: 125 })), null);
});

const compose = composeCommand();
test('multiserver gateway receives the configured live tenant upstream', { skip: compose ? false : 'Docker Compose is unavailable on this runner' }, () => {
  const [command, ...prefix] = compose;
  const result = spawnSync(command, [...prefix, 'compose', '--project-directory', '.', '--env-file', '.env.example', '-f', 'deploy/compose/production-multiserver.yml', 'config', '--format', 'json'], {
    encoding: 'utf8', env: { ...process.env, BACKEND_UPSTREAMS: 'stovo-backend-acdcbca1:8000' },
  });
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.services.caddy.environment.BACKEND_UPSTREAMS, 'stovo-backend-acdcbca1:8000');
  assert.equal(config.services.orchestrator.environment.TRUSTED_PROXY_CIDRS, '172.34.0.2/32');
  assert.equal(config.services.caddy.networks.master_proxy.ipv4_address, '172.34.0.2');
  assert.equal(config.networks.master_proxy.name, 'stovo-master-members-proxy-v2');
  assert.deepEqual(config.networks.master_proxy.ipam.config[0], {
    subnet: '172.34.0.0/24',
    ip_range: '172.34.0.128/25',
  });
});

test('master tenant backends trust Caddy on the reserved proxy address', () => {
  const compose = read('deploy/compose/production-multiserver.yml');
  const workflow = read('.github/workflows/pipeline.yml');
  assert.match(compose, /TRUSTED_PROXY_CIDRS: \${TRUSTED_PROXY_CIDRS:-172\.34\.0\.2\/32}/);
  assert.equal((workflow.match(/-e "TRUSTED_PROXY_CIDRS=\$\(get_env TRUSTED_PROXY_CIDRS 172\.34\.0\.2\/32\)"/g) || []).length, 2);
});

test('root routing selects a single tenant and requires an explicit choice for multiple tenants', () => {
  const resolve = (...args) => spawnSync('bash', ['deploy/resolve-root-upstream.sh', ...args], { encoding: 'utf8' });
  assert.equal(resolve('', 'acdcbca1').stdout.trim(), 'stovo-backend-acdcbca1:8000');
  assert.equal(resolve('stovo-backend-selected:8000', 'one', 'two').stdout.trim(), 'stovo-backend-selected:8000');
  assert.equal(resolve('', 'one', 'two').status, 1);
  assert.match(resolve('', 'one', 'two').stderr, /BACKEND_UPSTREAMS/);
  assert.equal(resolve('').stdout.trim(), '');
  assert.equal(resolve('', 'invalid/slug').status, 1);
});

test('backend deploy configures root routing before Caddy starts and checks the API after tenant rollout', () => {
  const workflow = read('.github/workflows/pipeline.yml').split('  deploy-backend-web:')[1].split('  deploy-android:')[0];
  const configure = workflow.indexOf('bash deploy/resolve-root-upstream.sh');
  const gateway = workflow.indexOf('up -d --build orchestrator caddy coturn');
  const replace = workflow.indexOf('docker rm -f "$existing_container_id"');
  const probe = workflow.indexOf('"https://$app_domain/api/auth/setup-status"');
  const proxyConnect = workflow.indexOf('bash deploy/scripts/ensure-tenant-proxy-network.sh \"stovo-backend-${server_slug}\"');
  assert.ok(configure >= 0 && configure < gateway, 'root upstream must be set before gateway creation');
  assert.ok(proxyConnect > replace && proxyConnect < probe, 'tenant backends must join the reserved proxy network before the API check');
  assert.ok(probe > replace, 'root API must be checked after backend replacement');
  assert.ok(probe < workflow.indexOf('Backend web deployment finished successfully!'));
});

test('pipeline contract recognizes backend-only dispatch with Windows CRLF', () => {
  const workflow = read('.github/workflows/pipeline.yml').replace(/\n/g, '\r\n');
  assert.match(workflow, /workflow_dispatch:\r?\n    inputs:\r?\n      backend_deploy_only:/);
});

test('manual backend-only deployment skips CI and frontend while normal deployments retain their CI gate', () => {
  const workflow = read('.github/workflows/pipeline.yml');
  assert.match(workflow, /workflow_dispatch:\r?\n    inputs:\r?\n      backend_deploy_only:/);
  assert.match(workflow, /frontend: \$\{\{ !inputs.backend_deploy_only &&/);
  assert.match(workflow, /if: \$\{\{ !cancelled\(\) && needs.changes.outputs.backend == 'true' && !inputs.backend_deploy_only \}\}/);
  const backend = workflow.split('  deploy-backend-web:')[1].split('  deploy-android:')[0];
  assert.match(backend, /needs: \[changes, backend-ci, solid-boundaries, publish-ghcr-images\]/);
  assert.match(backend, /needs.changes.result == 'success'/);
  assert.match(backend, /needs.publish-ghcr-images.result == 'success'/);
  assert.match(backend, /needs.solid-boundaries.result == 'success' \|\| \(github.event_name == 'workflow_dispatch' && inputs.backend_deploy_only\)/);
  assert.match(backend, /needs.backend-ci.result == 'success' \|\| \(github.event_name == 'workflow_dispatch' && inputs.backend_deploy_only\)/);
  assert.match(backend, /!cancelled\(\)/);
});
