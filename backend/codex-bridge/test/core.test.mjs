import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  classifyMessage,
  createJournal,
  createPendingApproval,
  resolveApproval,
  validateConfig,
} from '../src/core.mjs';

const config = {
  botUserId: 'bot-1',
  trigger: '@Codex',
  chats: [{ id: 'chat-1', workspace: '/work/project', approverIds: ['owner-1'] }],
};

test('only explicit commands and mentions from allowed chats start turns', () => {
  const classify = (message) => classifyMessage(message, validateConfig(config));
  assert.equal(classify({ id: 'm1', chatId: 'chat-1', senderId: 'user-1', content: '/codex inspect' }).prompt, 'inspect');
  assert.equal(classify({ id: 'm2', chatId: 'chat-1', senderId: 'user-1', content: '@Codex explain this' }).prompt, 'explain this');
  assert.equal(classify({ id: 'm3', chatId: 'other', senderId: 'user-1', content: '/codex hi' }), null);
  assert.equal(classify({ id: 'm4', chatId: 'chat-1', senderId: 'user-1', content: 'hello' }), null);
});

test('messages from the bridge account and bots cannot create loops', () => {
  const classify = (message) => classifyMessage(message, validateConfig(config));
  assert.equal(classify({ id: 'm1', chatId: 'chat-1', senderId: 'bot-1', content: '/codex again' }), null);
  assert.equal(classify({ id: 'm2', chatId: 'chat-1', senderId: 'user-1', isBot: true, content: '/codex again' }), null);
});

test('journal persists thread mapping, queued events, and dedupe state across restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'stovo-bridge-test-'));
  const path = join(dir, 'state.json');
  const journal = await createJournal(path);
  await journal.mapThread('chat-1', 'thread-1');
  await journal.enqueue({ id: 'message-1', chatId: 'chat-1', prompt: 'inspect' });
  await journal.markProcessed('message-0');
  const restarted = await createJournal(path);
  assert.equal(restarted.threadFor('chat-1'), 'thread-1');
  assert.equal(restarted.isProcessed('message-0'), true);
  assert.deepEqual(restarted.pending(), [{ id: 'message-1', chatId: 'chat-1', prompt: 'inspect', status: 'queued' }]);
  const persisted = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(persisted.version, 1);
});

test('interrupted in-flight events are held for review instead of replayed as duplicate turns', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'stovo-bridge-recovery-')), 'state.json');
  const journal = await createJournal(path);
  await journal.enqueue({ id: 'message-1', chatId: 'chat-1', prompt: 'change code' });
  assert.equal(await journal.begin('message-1'), true);
  const restarted = await createJournal(path);
  const recovered = await restarted.recoverInterrupted();
  assert.equal(recovered[0].status, 'needs-review');
  assert.deepEqual(restarted.pending(), []);
});

test('approvals are one-use, operation-specific, and restricted to the configured approver', async () => {
  const pending = createPendingApproval({
    rpcId: 'req-command-1',
    method: 'item/commandExecution/requestApproval',
    kind: 'command',
    chatId: 'chat-1',
    approverIds: ['owner-1'],
    summary: 'git status',
  }, 'fixed-code');
  assert.equal(resolveApproval(pending, { senderId: 'intruder', chatId: 'chat-1', content: '/codex approve fixed-code' }).decision, null);
  assert.equal(resolveApproval(pending, { senderId: 'owner-1', chatId: 'other', content: '/codex approve fixed-code' }).decision, null);
  assert.equal(resolveApproval(pending, { senderId: 'owner-1', chatId: 'chat-1', content: '/codex approve fixed-code' }).decision, 'accept');
  assert.equal(resolveApproval(pending, { senderId: 'owner-1', chatId: 'chat-1', content: '/codex approve fixed-code' }).decision, null);
});

test('unknown approval requests are rejected and cannot be approved by chat commands', async () => {
  const requests = JSON.parse(await readFile(new URL('../fixtures/app-server/approval-requests.json', import.meta.url)));
  const unknown = requests.find((item) => item.method === 'process/spawn');
  assert.equal(createPendingApproval({ rpcId: unknown.id, method: unknown.method, chatId: 'chat-1', approverIds: ['owner-1'] }), null);
});

test('bridge config requires absolute distinct workspaces, explicit chats, and an approver', () => {
  assert.throws(() => validateConfig({ ...config, chats: [] }), /at least one chat/);
  assert.throws(() => validateConfig({ ...config, chats: [{ id: 'chat-1', workspace: '../project', approverIds: ['owner-1'] }] }), /absolute workspace/);
  assert.throws(() => validateConfig({ ...config, chats: [{ id: 'chat-1', workspace: '/work/project', approverIds: [] }] }), /approver/);
});
