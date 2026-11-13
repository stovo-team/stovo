import test from 'node:test';
import assert from 'node:assert/strict';
import { createInsightRelayClient } from '../src/insight_relay.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('relay exchanges one-time pairing code then exposes only validated scoped events', async () => {
  const calls = [];
  const relay = createInsightRelayClient({
    baseUrl: 'https://insight.example', pairingCode: 'one-time-code', expectedChatId: 'chat-1',
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/pair')) return jsonResponse({ relay_credential: 'secret-relay-token', companion_id: 'companion-1', connection_id: 'connection-1', principal_id: 'owner-1', chat_id: 'chat-1' });
      return jsonResponse({ events: [{ event_id: 'event-1', chat_id: 'chat-1', sender_id: 'user-1', text: '@Codex hi', sequence: 17, origin: null }], cursor: 'cursor-17' });
    },
  });

  const pairing = await relay.pair();
  const page = await relay.poll('cursor-16');

  assert.deepEqual(pairing, { approverId: 'owner-1', companionId: 'companion-1', connectionId: 'connection-1', chatId: 'chat-1' });
  assert.equal(page.cursor, 'cursor-17');
  assert.deepEqual(page.events[0], { id: 'event-1', chatId: 'chat-1', senderId: 'user-1', content: '@Codex hi', sourceSequence: 17, origin: null, isBot: false });
  assert.equal(calls[0].init.body, JSON.stringify({ pairing_code: 'one-time-code', expected_chat_id: 'chat-1' }));
  assert.equal(calls[1].init.headers.Authorization, 'Bearer secret-relay-token');
});

test('relay rejects non-HTTPS origins, malformed envelopes, and oversized output', async () => {
  assert.throws(() => createInsightRelayClient({ baseUrl: 'http://insight.example', credential: 'x' }), /HTTPS/);
  const relay = createInsightRelayClient({
    baseUrl: 'https://insight.example', credential: 'x',
    fetchImpl: async () => jsonResponse({ events: [{ event_id: 'e', chat_id: 'c', sender_id: 'u', text: 'x', sequence: 0, origin: null }], cursor: 'c' }),
  });
  await assert.rejects(relay.poll(), /event is invalid/);
});

test('response updates keep stable operation id and increment revisions', async () => {
  const bodies = [];
  const relay = createInsightRelayClient({
    baseUrl: 'https://insight.example', credential: 'x',
    fetchImpl: async (url, init) => {
      bodies.push(JSON.parse(init.body));
      return jsonResponse({ message_id: 'message-1', operation_id: bodies.at(-1).operation_id });
    },
  });
  const first = await relay.send('chat-1', 'part one', 'operation-1', { final: false });
  const second = await relay.edit('chat-1', first.id, 'final text', 'operation-1');
  assert.equal(second.messageId, 'message-1');
  assert.deepEqual(bodies.map(({ operation_id, revision, final }) => ({ operation_id, revision, final })), [
    { operation_id: 'operation-1', revision: 1, final: false },
    { operation_id: 'operation-1', revision: 2, final: false },
  ]);
});
