import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridge } from '../src/bridge.mjs';
import { createJournal, validateConfig } from '../src/core.mjs';

const config = validateConfig({ botUserId: 'bot-1', trigger: '@Codex', chats: [{ id: 'chat-1', workspace: '/work/project', approverIds: ['owner-1'] }] });

test('E2E fixture: explicit Messenger prompt streams into a persistent Codex thread and a separate bot reply', async () => {
  const journal = await createJournal(join(await mkdtemp(join(tmpdir(), 'stovo-bridge-e2e-')), 'state.json'));
  const sent = [];
  const edits = [];
  let turns = 0;
  const session = {
    onServerRequest() {},
    async run({ workspace, prompt, threadId, onDelta, onThread }) {
      turns++;
      assert.equal(workspace, '/work/project');
      assert.equal(prompt, 'summarize this');
      assert.equal(threadId, null);
      await onThread('thread-1');
      onDelta({ delta: 'Working ' });
      onDelta({ delta: 'complete.' });
      return { threadId: 'thread-1', text: 'Working complete.', status: 'completed' };
    },
    async interrupt() { return true; },
  };
  const bridge = createBridge({
    config, journal, messenger: {
      async send(chatId, content, operationId) { sent.push({ chatId, content, operationId, senderId: 'bot-1' }); return { id: `reply-${sent.length}` }; },
      async edit(chatId, messageId, content) { edits.push({ chatId, messageId, content }); },
      async history() { return { messages: [], hasMore: false }; },
    },
    codexForChat: () => session,
  });
  const message = { id: 'human-1', chatId: 'chat-1', senderId: 'member-1', content: '@Codex summarize this' };
  await bridge.handleMessage(message);
  await bridge.handleMessage(message);
  assert.equal(turns, 1);
  assert.equal(journal.threadFor('chat-1'), 'thread-1');
  assert.ok(sent.some((reply) => reply.senderId === 'bot-1' && reply.content === 'Working complete.'));
  assert.ok(edits.some((reply) => reply.messageId === 'reply-1' && reply.content === 'Working complete.'));
});

test('E2E fixture: only the configured approver can authorize one command or publish action', async () => {
  const journal = await createJournal(join(await mkdtemp(join(tmpdir(), 'stovo-bridge-approval-')), 'state.json'));
  const sent = [];
  const decisions = [];
  let handler;
  const session = {
    onServerRequest(next) { handler = next; },
    async readApprovalItem() { return null; },
    async run({ onThread }) {
      await onThread('thread-1');
      decisions.push(await handler({ jsonrpc: '2.0', id: 'rpc-1', method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', kind: 'humanCommand', command: 'git push origin main' } }));
      return { threadId: 'thread-1', text: 'published', status: 'completed' };
    },
    async interrupt() { return false; },
  };
  const bridge = createBridge({ config, journal, messenger: {
    async send(chatId, content) { sent.push({ chatId, content }); return { id: `reply-${sent.length}` }; },
    async edit() {}, async history() { return { messages: [], hasMore: false }; },
  }, codexForChat: () => session });
  const running = bridge.handleMessage({ id: 'human-2', chatId: 'chat-1', senderId: 'member-1', content: '/codex inspect release' });
  for (let attempt = 0; attempt < 50 && !sent.some((item) => item.content.includes('/codex approve ')); attempt++) await new Promise((resolve) => setTimeout(resolve, 1));
  const prompt = sent.find((item) => item.content.includes('/codex approve '));
  assert.match(prompt.content, /PUBLISH ACTION/);
  const code = prompt.content.match(/\/codex approve ([a-z0-9]+)/)[1];
  await bridge.handleMessage({ id: 'approval-bad', chatId: 'chat-1', senderId: 'member-2', content: `/codex approve ${code}` });
  assert.ok(journal.approval(code));
  assert.equal(decisions.length, 0);
  await bridge.handleMessage({ id: 'approval-good', chatId: 'chat-1', senderId: 'owner-1', content: `/codex approve ${code}` });
  assert.equal(journal.approval(code), null);
  await running;
  assert.deepEqual(decisions, [{ decision: 'accept' }]);
});

test('file-change approvals reject paths that escape the workspace through symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stovo-bridge-path-'));
  const workspace = join(root, 'workspace');
  const outside = join(root, 'outside');
  await mkdir(workspace);
  await mkdir(outside);
  await symlink(outside, join(workspace, 'linked'));
  const guardedConfig = validateConfig({ botUserId: 'bot-1', trigger: '@Codex', chats: [{ id: 'chat-1', workspace, approverIds: ['owner-1'] }] });
  const journal = await createJournal(join(root, 'state.json'));
  await journal.mapThread('chat-1', 'thread-1');
  let requestHandler;
  const session = {
    onServerRequest(handler) { requestHandler = handler; },
    async readApprovalItem() { return { changes: [{ path: 'linked/secret.txt', diff: '+unsafe' }] }; },
    async run({ onThread }) {
      await onThread('thread-1');
      return requestHandler({ jsonrpc: '2.0', id: 'rpc-unsafe', method: 'item/fileChange/requestApproval', params: { threadId: 'thread-1', turnId: 'turn-1', itemId: 'item-1' } });
    },
  };
  const bridge = createBridge({ config: guardedConfig, journal, messenger: {
    async send() { throw new Error('an unsafe change must never be presented for approval'); },
    async edit() {}, async history() { return { messages: [], hasMore: false }; },
  }, codexForChat: () => session });
  await assert.rejects(bridge.handleMessage({ id: 'request-unsafe', chatId: 'chat-1', senderId: 'member-1', content: '@Codex update linked/secret.txt' }), /outside the configured workspace/);
});
