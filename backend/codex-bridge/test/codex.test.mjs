import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexSession } from '../src/codex.mjs';

class FakeRpc {
  requests = [];
  handlers = new Set();
  async request(method, params) {
    this.requests.push({ method, params });
    if (method === 'initialize') return { serverInfo: { version: 'fixture' } };
    if (method === 'thread/start') return { thread: { id: 'thread-1' } };
    if (method === 'thread/resume') return { thread: { id: params.threadId } };
    if (method === 'turn/start') {
      queueMicrotask(() => this.emit({ method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: 'turn-1', delta: 'hello' } }));
      queueMicrotask(() => this.emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } }));
      return { turn: { id: 'turn-1' } };
    }
    return {};
  }
  notify(method, params) { this.requests.push({ method, params, notification: true }); }
  onMessage(handler) { this.handlers.add(handler); return () => this.handlers.delete(handler); }
  emit(message) { for (const handler of this.handlers) handler(message); }
  close() {}
}

test('Codex session initializes required approvals, pins cwd, resumes mapped threads, and streams turns', async () => {
  const rpc = new FakeRpc();
  const deltas = [];
  const session = createCodexSession(rpc, { onDelta: (event) => deltas.push(event.delta), onServerRequest: async () => ({ decision: 'decline' }) });
  const first = await session.run({ workspace: '/work/project', prompt: 'inspect', threadId: null });
  assert.equal(first.threadId, 'thread-1');
  assert.equal(first.text, 'hello');
  assert.equal(rpc.requests.find((r) => r.method === 'initialize').params.capabilities.requiredHumanApproval, true);
  assert.equal(rpc.requests.find((r) => r.method === 'thread/start').params.cwd, '/work/project');
  await session.run({ workspace: '/work/project', prompt: 'continue', threadId: 'thread-1' });
  assert.ok(rpc.requests.some((r) => r.method === 'thread/resume' && r.params.threadId === 'thread-1'));
  assert.deepEqual(deltas, ['hello', 'hello']);
});
