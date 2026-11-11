import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessengerClient } from '../src/messenger.mjs';

test('Messenger history and send use bearer auth, allowlisted chat ids, and operation idempotency', async () => {
  const calls = [];
  const client = createMessengerClient({
    apiBaseUrl: 'https://messenger.example.test/prefix', refreshOrigin: 'capacitor://localhost',
    accessToken: 'synthetic-access',
    refreshToken: 'synthetic-refresh',
    allowedChatIds: new Set(['chat-1']),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ messages: [], id: 'reply-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  await client.history('chat-1', { limit: 50 });
  await client.send('chat-1', 'answer', '00000000-0000-4000-8000-000000000001');
  assert.match(calls[0].url, /\/api\/chats\/chat-1\/messages\?limit=50$/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer synthetic-access');
  assert.equal(calls[1].options.headers['X-Stovo-Operation-Id'], '00000000-0000-4000-8000-000000000001');
  assert.equal(JSON.parse(calls[1].options.body).content, 'answer');
});

test('Messenger client refuses history and sends outside its allowlist', async () => {
  const client = createMessengerClient({ apiBaseUrl: 'http://messenger.test', accessToken: 'token', allowedChatIds: new Set(['chat-1']), fetchImpl: async () => { throw new Error('network must not be called'); } });
  await assert.rejects(client.history('chat-2'), /not allowed/);
  await assert.rejects(client.send('chat-2', 'x', '00000000-0000-4000-8000-000000000001'), /not allowed/);
});

test('expired access token is refreshed through the existing Messenger endpoint and rotated locally', async () => {
  let calls = 0;
  let rotated;
  const client = createMessengerClient({
    apiBaseUrl: 'https://messenger.test', refreshOrigin: 'capacitor://localhost', accessToken: 'expired', refreshToken: 'refresh-1', allowedChatIds: new Set(['chat-1']),
    onTokens: async (tokens) => { rotated = tokens; },
    fetchImpl: async (_url, options) => {
      calls++;
      if (calls === 1) return new Response('{}', { status: 401 });
      if (calls === 2) {
        assert.equal(options.headers.Origin, 'capacitor://localhost');
        return new Response(JSON.stringify({ accessToken: 'fresh', refreshToken: 'refresh-2' }), { status: 200 });
      }
      assert.equal(options.headers.Authorization, 'Bearer fresh');
      return new Response(JSON.stringify({ messages: [] }), { status: 200 });
    },
  });
  await client.history('chat-1');
  assert.equal(rotated.accessToken, 'fresh');
  assert.equal(rotated.refreshToken, 'refresh-2');
  assert.equal(calls, 3);
});
