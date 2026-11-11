export function createMessengerClient(options) {
  const baseUrl = String(options.apiBaseUrl ?? '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error('Messenger API URL must use http or https');
  let accessToken = String(options.accessToken ?? '');
  let refreshToken = String(options.refreshToken ?? '');
  const allowedChatIds = options.allowedChatIds;
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!accessToken || !(allowedChatIds instanceof Set) || allowedChatIds.size === 0) throw new Error('Messenger token and chat allowlist are required');

  async function request(path, init = {}, allowRefresh = true) {
    const headers = { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, ...init.headers };
    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    if (response.status === 401 && allowRefresh && refreshToken) {
      const refresh = await fetchImpl(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-Refresh-Token': refreshToken, ...(options.refreshOrigin ? { Origin: options.refreshOrigin } : {}) },
      });
      if (!refresh.ok) throw new Error(`Messenger session refresh failed (${refresh.status})`);
      const tokens = await refresh.json();
      if (!tokens.accessToken || !tokens.refreshToken) throw new Error('Messenger returned an invalid token rotation response');
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
      await options.onTokens?.({ accessToken, refreshToken });
      return request(path, init, false);
    }
    if (!response.ok) throw new Error(`Messenger API request failed (${response.status})`);
    if (response.status === 204) return null;
    return response.json();
  }

  function assertChat(chatId) {
    if (!allowedChatIds.has(chatId)) throw new Error('Messenger chat is not allowed');
  }

  return {
    get accessToken() { return accessToken; },
    async me() { return request('/api/auth/me'); },
    async history(chatId, { before, limit = 100 } = {}) {
      assertChat(chatId);
      const query = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, limit))) });
      if (before) query.set('before', before);
      return request(`/api/chats/${encodeURIComponent(chatId)}/messages?${query}`);
    },
    async send(chatId, content, operationId) {
      assertChat(chatId);
      if (!operationId) throw new Error('idempotent Messenger operation ID is required');
      return request(`/api/chats/${encodeURIComponent(chatId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Stovo-Operation-Id': operationId },
        body: JSON.stringify({ type: 'text', content }),
      });
    },
    async edit(chatId, messageId, content) {
      assertChat(chatId);
      return request(`/api/messages/${encodeURIComponent(messageId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
      });
    },
  };
}
