import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('public discovery, OAuth, and root source routes reach the selected backend', () => {
  const caddy = read('deploy/caddy/Caddyfile');
  assert.match(caddy, /@intelligence\s+path\s+\/\.well-known\/openid-configuration\s+\/oauth2\/\*\s+\/api\/v2\/intelligence\/\*/);
  assert.match(caddy, /handle @intelligence\s*\{\s*reverse_proxy \{\$INTELLIGENCE_BACKEND_UPSTREAM/);
});

test('deployments explicitly pass integration configuration to backend and gateway', () => {
  const bluegreen = read('deploy/compose/production-bluegreen.yml');
  const multi = read('deploy/compose/production-multiserver.yml');
  for (const name of ['INTELLIGENCE_OIDC_ENABLED', 'INTELLIGENCE_SOURCE_ENABLED', 'INTELLIGENCE_OIDC_ISSUER', 'INTELLIGENCE_OIDC_CLIENT_ID', 'INTELLIGENCE_OIDC_CLIENT_SECRET', 'INTELLIGENCE_OIDC_REDIRECT_URIS', 'INTELLIGENCE_OIDC_SIGNING_KEY_ID', 'INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM', 'INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH']) {
    assert.match(bluegreen, new RegExp(`\\n\\s+${name}:`), `bluegreen is missing ${name}`);
    assert.match(multi, new RegExp(`\\n\\s+${name}:`), `multiserver is missing ${name}`);
  }
  assert.match(multi, /INTELLIGENCE_INTEGRATION_TENANT_SLUG:/);
  assert.match(bluegreen, /INTELLIGENCE_BACKEND_UPSTREAM:/);
  assert.match(multi, /INTELLIGENCE_BACKEND_UPSTREAM:/);
});
