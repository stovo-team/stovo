const MAX_BODY_BYTES = 1_048_576;

export function createInsightRelayClient({ baseUrl, credential, pairingCode, expectedChatId, fetchImpl = fetch }) {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('Insight relay URL must be an HTTPS origin');
  }
  let token = String(credential ?? '');
  const pendingPairingCode = String(pairingCode ?? '');
  const expectedChat = String(expectedChatId ?? '');
  const responses = new Map();

  async function request(path, { method = 'GET', body, allowUnauthorized = false, signal } = {}) {
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(`${parsed.origin}${path}`, {
      method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: 'error', ...(signal ? { signal } : {}),
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_BODY_BYTES) throw new Error('Insight relay response exceeds the configured limit');
    let payload = null;
    if (bytes.byteLength) {
      try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { throw new Error('Insight relay returned an invalid response'); }
    }
    if (response.status === 401 && allowUnauthorized) return null;
    if (!response.ok) throw new Error(`Insight relay request failed (${response.status})`);
    return payload;
  }

  async function ensurePaired() {
    if (token) return;
    if (!pendingPairingCode || pendingPairingCode.length > 256 || !expectedChat || expectedChat.length > 256) throw new Error('Insight relay credential, one-time pairing code, and expected chat ID are required');
    const result = await request('/api/v1/local-codex/pair', {
      method: 'POST', body: { pairing_code: pendingPairingCode, expected_chat_id: expectedChat },
    });
    if (typeof result?.relay_credential !== 'string' || !result.relay_credential || typeof result?.companion_id !== 'string' || !result.companion_id || typeof result?.connection_id !== 'string' || !result.connection_id || typeof result?.principal_id !== 'string' || !result.principal_id || typeof result?.chat_id !== 'string' || !result.chat_id) {
      throw new Error('Insight relay pairing response is invalid');
    }
    token = result.relay_credential;
    return { approverId: result.principal_id, companionId: result.companion_id, chatId: result.chat_id, connectionId: result.connection_id };
  }

  function assertEnvelope(value) {
    if (!value || typeof value !== 'object' || typeof value.event_id !== 'string' || !value.event_id || typeof value.chat_id !== 'string' || !value.chat_id || typeof value.sender_id !== 'string' || !value.sender_id || typeof value.text !== 'string' || !value.text || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || (value.origin !== null && typeof value.origin !== 'string')) {
      throw new Error('Insight relay event is invalid');
    }
    return {
      id: value.event_id,
      chatId: value.chat_id,
      senderId: value.sender_id,
      content: value.text,
      sourceSequence: value.sequence,
      origin: value.origin,
      isBot: false,
    };
  }

  return {
    async pair() { return ensurePaired(); },
    get relayCredential() { return token; },
    async poll(cursor, { signal } = {}) {
      await ensurePaired();
      const query = new URLSearchParams();
      if (cursor) query.set('cursor', cursor);
      const result = await request(`/api/v1/local-codex/events${query.size ? `?${query}` : ''}`, { signal });
      if (!Array.isArray(result?.events) || typeof result?.cursor !== 'string') throw new Error('Insight relay event page is invalid');
      return { events: result.events.map(assertEnvelope), cursor: result.cursor };
    },
    async ack(eventId) {
      await ensurePaired();
      if (typeof eventId !== 'string' || !eventId) throw new Error('Insight relay event ID is required');
      return request(`/api/v1/local-codex/events/${encodeURIComponent(eventId)}:ack`, { method: 'POST', body: {} });
    },
    async interrupt(eventId) {
      await ensurePaired();
      if (typeof eventId !== 'string' || !eventId) throw new Error('Insight relay event ID is required');
      return request(`/api/v1/local-codex/events/${encodeURIComponent(eventId)}:interrupt`, { method: 'POST', body: {} });
    },
    async appendResponse(operationId, revision, text, final) {
      await ensurePaired();
      if (typeof operationId !== 'string' || !operationId || !Number.isSafeInteger(revision) || revision < 1 || typeof text !== 'string' || !text.trim() || new TextEncoder().encode(text).byteLength > 4000 || typeof final !== 'boolean') throw new Error('Insight relay response chunk is invalid');
      return request('/api/v1/local-codex/responses', {
        method: 'POST', body: { operation_id: operationId, revision, text, final },
      });
    },
    async send(chatId, content, operationId, { final = true } = {}) {
      const result = await this.appendResponse(operationId, 1, content, final);
      responses.set(result.operation_id, { messageId: result.message_id, revision: 1 });
      return { id: result.message_id };
    },
    async edit(chatId, messageId, content, operationId, { final = false } = {}) {
      const state = responses.get(operationId);
      const revision = (state?.revision ?? 1) + 1;
      const result = await this.appendResponse(operationId, revision, content, final);
      responses.set(operationId, { messageId: result.message_id ?? messageId, revision });
      return { ...result, messageId: result.message_id ?? messageId };
    },
  };
}
