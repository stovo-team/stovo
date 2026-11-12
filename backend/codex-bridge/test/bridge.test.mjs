import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridge } from '../src/bridge.mjs';
import { createJournal, validateConfig } from '../src/core.mjs';

const config = validateConfig({ trigger: '@Codex', chats: [{ id: 'chat-1', workspace: '/work/project', approverIds: ['owner-1'] }] });

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
  const message = { id: 'human-1', chatId: 'chat-1', senderId: 'owner-1', content: '@Codex summarize this' };
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
  const running = bridge.handleMessage({ id: 'human-2', chatId: 'chat-1', senderId: 'owner-1', content: '/codex inspect release' });
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

test('relay control messages interrupt an active turn while its streamed response continues', async () => {
  const journal = await createJournal(join(await mkdtemp(join(tmpdir(), 'stovo-bridge-interrupt-')), 'state.json'));
  const sent = [];
  let started;
  const runStarted = new Promise((resolve) => { started = resolve; });
  let finishTurn;
  const interrupted = new Promise((resolve) => { finishTurn = resolve; });
  let interruptCount = 0;
  const session = {
    onServerRequest() {},
    async run({ onThread }) {
      await onThread('thread-active');
      started();
      await interrupted;
      return { threadId: 'thread-active', text: 'finished', status: 'completed' };
    },
    async interrupt() { interruptCount++; finishTurn(); return true; },
  };
  const bridge = createBridge({ config, journal, messenger: {
    async send(chatId, content) { sent.push({ chatId, content }); return { id: `reply-${sent.length}` }; },
    async edit() {},
  }, codexForChat: () => session });

  await bridge.receiveRelayMessage({ id: 'relay-prompt', chatId: 'chat-1', senderId: 'owner-1', content: '@Codex work' });
  await runStarted;
  await bridge.receiveRelayMessage({ id: 'relay-stop', chatId: 'chat-1', senderId: 'owner-1', content: '/codex stop' });
  for (let attempt = 0; attempt < 50 && !journal.isProcessed('relay-prompt'); attempt++) await new Promise((resolve) => setTimeout(resolve, 1));

  assert.equal(interruptCount, 1);
  assert.equal(journal.isProcessed('relay-stop'), true);
  assert.equal(journal.isProcessed('relay-prompt'), true);
  assert.ok(sent.some((item) => item.content === 'Codex turn interrupted.'));
  await bridge.close();
});

test('Codex output redacts token-like secrets from both streamed and final replies', async () => {
  const journal = await createJournal(join(await mkdtemp(join(tmpdir(), 'stovo-bridge-redaction-')), 'state.json'));
  const sent = [];
  const edits = [];
  const session = {
    onServerRequest() {},
    async run({ onThread, onDelta }) {
      await onThread('thread-redaction');
      onDelta({ delta: 'Example token sk-12345678901234567890' });
      return { threadId: 'thread-redaction', text: 'Example token sk-12345678901234567890', status: 'completed' };
    },
  };
  const bridge = createBridge({ config, journal, messenger: {
    async send(chatId, content) { sent.push(content); return { id: 'reply-redacted' }; },
    async edit(_chatId, _messageId, content) { edits.push(content); },
  }, codexForChat: () => session });

  await bridge.handleMessage({ id: 'redaction-1', chatId: 'chat-1', senderId: 'owner-1', content: '@Codex show example' });
  assert.ok([...sent, ...edits].length > 0);
  assert.ok([...sent, ...edits].every((content) => !content.includes('sk-12345678901234567890')));
  assert.ok([...sent, ...edits].some((content) => content.includes('[redacted-token]')));
});

test('file-change approvals reject paths that escape the workspace through symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stovo-bridge-path-'));
  const workspace = join(root, 'workspace');
  const outside = join(root, 'outside');
  await mkdir(workspace);
  await mkdir(outside);
  await symlink(outside, join(workspace, 'linked'));
  const guardedConfig = validateConfig({ trigger: '@Codex', chats: [{ id: 'chat-1', workspace, approverIds: ['owner-1'] }] });
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
  await assert.rejects(bridge.handleMessage({ id: 'request-unsafe', chatId: 'chat-1', senderId: 'owner-1', content: '@Codex update linked/secret.txt' }), /outside the configured workspace/);
});
