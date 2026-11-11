const initializedPeers = new WeakMap();

export function createCodexSession(rpc, options = {}) {
  let initialized = initializedPeers.get(rpc);
  const active = new Map();
  const unsubscribe = rpc.onMessage?.((message) => {
    const params = message?.params ?? {};
    if (message?.method === 'item/agentMessage/delta') {
      const turn = active.get(params.threadId);
      if (turn && (!turn.turnId || turn.turnId === params.turnId) && typeof params.delta === 'string') {
        turn.text += params.delta;
        turn.onDelta?.({ threadId: params.threadId, turnId: params.turnId, delta: params.delta });
      }
      return;
    }
    if (message?.method === 'turn/completed') {
      const turn = active.get(params.threadId);
      if (turn && (!turn.turnId || turn.turnId === params.turn?.id)) {
        turn.turnId = params.turn?.id ?? turn.turnId;
        turn.finish(params.turn?.status ?? 'failed');
      }
    }
  });
  let unsubscribeRequests;
  if (options.onServerRequest && rpc.onServerRequest) unsubscribeRequests = rpc.onServerRequest(options.onServerRequest);

  async function initialize() {
    if (!initialized) {
      initialized = (async () => {
        await rpc.request('initialize', {
          clientInfo: { name: 'stovo_codex_bridge', title: 'Stovo Codex Bridge', version: '0.1.0' },
          capabilities: { experimentalApi: true, requiredHumanApproval: true },
        });
        rpc.notify('initialized', {});
      })();
      initializedPeers.set(rpc, initialized);
    }
    await initialized;
  }

  async function run({ workspace, prompt, threadId, onDelta, onThread }) {
    if (!workspace || !prompt) throw new Error('workspace and prompt are required');
    await initialize();
    let id = threadId;
    if (id) {
      const result = await rpc.request('thread/resume', { threadId: id, cwd: workspace, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'read-only' });
      id = result?.thread?.id ?? id;
    } else {
      const result = await rpc.request('thread/start', { cwd: workspace, approvalPolicy: 'on-request', approvalsReviewer: 'user', sandbox: 'read-only' });
      id = result?.thread?.id;
      if (!id) throw new Error('Codex did not return a thread id');
    }
    await onThread?.(id);
    const turn = { turnId: null, text: '', completed: false, status: null, onDelta: onDelta ?? options.onDelta };
    let settle;
    const completion = new Promise((resolve) => { settle = resolve; });
    turn.finish = (status) => {
      if (turn.completed) return;
      turn.completed = true;
      turn.status = status;
      settle();
    };
    active.set(id, turn);
    try {
      const result = await rpc.request('turn/start', { threadId: id, input: [{ type: 'text', text: prompt }] });
      turn.turnId = result?.turn?.id ?? null;
      if (turn.completed) return { threadId: id, turnId: turn.turnId, text: turn.text, status: turn.status };
      await completion;
      return { threadId: id, turnId: turn.turnId, text: turn.text, status: turn.status };
    } finally {
      active.delete(id);
    }
  }

  async function interrupt(threadId) {
    const turn = active.get(threadId);
    if (!turn?.turnId) return false;
    await rpc.request('turn/interrupt', { threadId, turnId: turn.turnId });
    return true;
  }

  async function readApprovalItem({ threadId, turnId, itemId }) {
    const response = await rpc.request('thread/items/read', { threadId, turnId, itemIds: [itemId] });
    return response?.data?.items?.[0]?.item ?? null;
  }

  return {
    run,
    interrupt,
    readApprovalItem,
    onServerRequest(handler) { unsubscribeRequests?.(); unsubscribeRequests = rpc.onServerRequest?.(handler); },
    async close() { unsubscribe?.(); unsubscribeRequests?.(); await rpc.close?.(); },
  };
}

export function createJsonRpcPeer(child) {
  let sequence = 0;
  let buffer = '';
  const pending = new Map();
  const messageHandlers = new Set();
  const serverRequestHandlers = new Set();

  function send(payload) {
    if (child.stdin.destroyed) throw new Error('Codex app-server stdin is closed');
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  function dispatch(message) {
    if (Object.hasOwn(message, 'id') && Object.hasOwn(message, 'result')) {
      const waiter = pending.get(message.id);
      if (waiter) { pending.delete(message.id); waiter.resolve(message.result); }
      return;
    }
    if (Object.hasOwn(message, 'id') && Object.hasOwn(message, 'error')) {
      const waiter = pending.get(message.id);
      if (waiter) { pending.delete(message.id); waiter.reject(new Error(`Codex app-server request failed: ${message.error.message ?? 'unknown error'}`)); }
      return;
    }
    if (Object.hasOwn(message, 'id') && typeof message.method === 'string') {
      const handler = [...serverRequestHandlers].at(-1);
      if (!handler) { send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Request not supported' } }); return; }
      Promise.resolve(handler(message)).then(
        (result) => send({ jsonrpc: '2.0', id: message.id, result }),
        () => send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'Request denied' } }),
      );
      return;
    }
    for (const handler of messageHandlers) handler(message);
  }

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      try { dispatch(JSON.parse(line)); } catch { /* Malformed/diagnostic lines never reach the bridge. */ }
    }
  });
  child.on('exit', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('Codex app-server exited'));
    pending.clear();
  });

  return {
    request(method, params) {
      const id = ++sequence;
      return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); send({ jsonrpc: '2.0', id, method, params }); });
    },
    notify(method, params) { send({ jsonrpc: '2.0', method, params }); },
    respond(id, result) { send({ jsonrpc: '2.0', id, result }); },
    onMessage(handler) { messageHandlers.add(handler); return () => messageHandlers.delete(handler); },
    onServerRequest(handler) { serverRequestHandlers.add(handler); return () => serverRequestHandlers.delete(handler); },
    close() { child.kill('SIGTERM'); },
  };
}
