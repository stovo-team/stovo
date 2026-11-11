import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { classifyMessage, createPendingApproval, redact, resolveApproval } from './core.mjs';

const publishPattern = /\b(?:git\s+push|gh\s+(?:pr|release)\s+(?:create|edit|merge)|npm\s+publish|docker\s+push|helm\s+push|twine\s+upload|cargo\s+publish)\b/i;

export function createBridge({ config, journal, messenger, codexForChat, logger = () => {} }) {
  const pendingResolvers = new Map();
  const activeTurns = new Map();
  const chatLocks = new Map();
  let closed = false;
  let started = false;

  async function send(chatId, text, operationKey) {
    const value = text.trim().slice(0, 3900) || 'Codex returned no text.';
    return messenger.send(chatId, value, operationId(operationKey));
  }

  async function handleApproval(request) {
    const params = request?.params ?? {};
    const chatId = [...config.chats.keys()].find((id) => journal.threadFor(id) === params.threadId);
    if (!chatId || (typeof request.id !== 'string' && typeof request.id !== 'number')) throw new Error('approval request is not bound to an allowed chat thread');
    const chat = config.chats.get(chatId);
    if (request.method === 'item/permissions/requestApproval') {
      await send(chatId, `Codex requested broader permissions. Bridge denied this request because permissions can outlive one reviewed file/command. Reason: ${redact(params.reason ?? 'not provided')}`, `permission-denied:${request.id}`);
      throw new Error('permission escalation is not supported');
    }

    let summary;
    let kind;
    let session = codexForChat(chatId);
    if (request.method === 'item/commandExecution/requestApproval') {
      const command = typeof params.command === 'string' ? params.command.trim() : '';
      if (!command || params.kind !== 'humanCommand') throw new Error('managed human-command checkpoint is required');
      if (params.cwd && !await isInsideWorkspace(chat.workspace, params.cwd)) throw new Error('command working directory is outside the configured workspace');
      kind = publishPattern.test(command) ? 'publish' : 'command';
      summary = `${kind === 'publish' ? 'PUBLISH ACTION' : 'SHELL COMMAND'}\n${redact(command)}\nWorking directory: ${params.cwd ? redact(params.cwd) : 'configured workspace'}`;
    } else if (request.method === 'item/fileChange/requestApproval') {
      kind = 'file-change';
      const chatSession = session;
      const item = await chatSession.readApprovalItem({ threadId: params.threadId, turnId: params.turnId, itemId: params.itemId });
      const changes = item?.changes ?? item?.fileChanges ?? [];
      if (!Array.isArray(changes) || changes.length === 0) throw new Error('file-change approval has no reviewable diff');
      const paths = [];
      for (const change of changes) {
        const candidate = change.path ?? change.filePath;
        if (typeof candidate !== 'string' || !await isInsideWorkspace(chat.workspace, candidate)) throw new Error('file-change path is outside the configured workspace');
        paths.push(candidate);
      }
      summary = `FILE CHANGE\n${paths.map((path) => `• ${redact(path)}`).join('\n')}\n${redact(params.reason ?? '')}\nReview preview: ${redact(JSON.stringify(changes)).slice(0, 1500)}`;
    } else {
      throw new Error('unsupported Codex approval request');
    }

    const pending = createPendingApproval({ rpcId: request.id, method: request.method, chatId, approverIds: chat.approverIds, summary });
    if (!pending) throw new Error('invalid Codex approval request');
    pending.kind = kind;
    await journal.addApproval(pending);
    let resolveRequest;
    const waiting = new Promise((resolve) => { resolveRequest = resolve; });
    pendingResolvers.set(pending.code, resolveRequest);
    try {
      await send(chatId, `Codex asks for one-time ${kind} approval.\n${pending.summary}\nOnly configured approvers may reply:\n/codex approve ${pending.code}\n/codex deny ${pending.code}`, `approval:${pending.code}`);
    } catch (error) {
      pendingResolvers.delete(pending.code);
      await journal.removeApproval(pending.code);
      throw error;
    }
    return waiting;
  }

  async function handleControl(event) {
    const control = event.control;
    if (control.action === 'interrupt') {
      const session = codexForChat(event.chatId);
      const interrupted = await session.interrupt(journal.threadFor(event.chatId));
      if (interrupted) await send(event.chatId, 'Codex turn interrupted.', `interrupt:${event.id}`);
      return;
    }
    const pending = journal.approval(control.code);
    if (!pending) return;
    const decision = resolveApproval(pending, { senderId: event.senderId, chatId: event.chatId, content: `/codex ${control.action} ${control.code}` });
    if (!decision.decision) return;
    const resolveRequest = pendingResolvers.get(control.code);
    if (!resolveRequest) {
      await journal.removeApproval(control.code);
      await send(event.chatId, 'This approval request is no longer active. Send the request again if it is still needed.', `approval-stale:${event.id}`);
      return;
    }
    pendingResolvers.delete(control.code);
    await journal.removeApproval(control.code);
    resolveRequest({ decision: decision.decision });
    await send(event.chatId, `Approval ${decision.decision === 'accept' ? 'granted once' : decision.decision === 'cancel' ? 'cancelled' : 'denied'}.`, `approval-result:${event.id}`);
  }

  async function processEvent(event) {
    if (event.control) {
      await handleControl(event);
      await journal.markProcessed(event.id);
      return;
    }
    const started = await journal.begin(event.id);
    if (!started) return;
    const chat = config.chats.get(event.chatId);
    let session = codexForChat(event.chatId);
    session.onServerRequest(handleApproval);
    let partial = '';
    let reply = journal.replyFor(event.id);
    let lastUpdate = 0;
    let updateChain = Promise.resolve();
    const stream = ({ delta }) => {
      partial += delta;
      const now = Date.now();
      if (now - lastUpdate < 750) return;
      lastUpdate = now;
      updateChain = updateChain.then(async () => {
        if (!partial) return;
        if (!reply) {
          const created = await messenger.send(event.chatId, partial.slice(0, 3900), operationId(event.id));
          reply = { messageId: created?.id };
          if (!reply.messageId) throw new Error('Messenger did not return the streamed reply id');
          await journal.setReply(event.id, reply);
        } else {
          await messenger.edit(event.chatId, reply.messageId, partial.slice(0, 3900));
        }
      });
    };
    activeTurns.set(event.chatId, { id: event.id, session });
    try {
      const result = await session.run({
        workspace: chat.workspace,
        prompt: event.prompt,
        threadId: journal.threadFor(event.chatId),
        onDelta: stream,
        onThread: (threadId) => journal.mapThread(event.chatId, threadId),
      });
      await journal.mapThread(event.chatId, result.threadId);
      await updateChain;
      if (result.status !== 'completed') throw new Error(`Codex turn ended with status ${result.status}`);
      const finalText = partial || result.text || 'Codex returned no text.';
      if (reply?.messageId) await messenger.edit(event.chatId, reply.messageId, finalText.slice(0, 3900));
      else await send(event.chatId, finalText, event.id);
      await journal.markProcessed(event.id);
    } catch (error) {
      logger('turn-failed', { chatId: event.chatId, messageId: event.id, error: safeError(error) });
      await updateChain.catch(() => {});
      if (!partial) await send(event.chatId, 'Codex could not complete this request. Check the local bridge log for a redacted error.', `error:${event.id}`).catch(() => {});
      throw error;
    } finally {
      activeTurns.delete(event.chatId);
    }
  }

  async function serialized(chatId, operation) {
    const previous = chatLocks.get(chatId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    chatLocks.set(chatId, next);
    try { return await next; } finally { if (chatLocks.get(chatId) === next) chatLocks.delete(chatId); }
  }

  async function handleMessage(raw) {
    if (closed) return;
    const message = raw?.message ?? raw;
    const event = classifyMessage(message, config);
    if (event) {
      await journal.enqueue(event);
      await journal.setCursor(event.chatId, event.id);
      if (event.control) return processEvent(event);
      return serialized(event.chatId, () => processEvent(event));
    }
    const chatId = String(message?.chatId ?? '');
    if (config.chats.has(chatId) && message?.id && message?.senderId !== config.botUserId) await journal.setCursor(chatId, String(message.id));
  }

  async function recoverChat(chatId) {
    const cursor = journal.cursorFor(chatId);
    const collected = [];
    let before;
    let found = !cursor;
    for (let page = 0; page < 10; page++) {
      const history = await messenger.history(chatId, { before, limit: 100 });
      const messages = Array.isArray(history?.messages) ? history.messages : [];
      if (!cursor) {
        const latest = messages.at(-1);
        if (latest?.id) await journal.setCursor(chatId, latest.id);
        return;
      }
      for (const message of messages) {
        if (String(message.id) === cursor) { found = true; break; }
        collected.push(message);
      }
      if (found || !history?.hasMore || !history?.nextBefore) break;
      before = history.nextBefore;
    }
    if (!found) {
      logger('recovery-cursor-not-found', { chatId });
      return;
    }
    collected.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    for (const message of collected) await handleMessage(message);
  }

  async function start() {
    if (started) return recover();
    started = true;
    const interrupted = await journal.recoverInterrupted();
    for (const event of interrupted) {
      const chat = config.chats.get(event.chatId);
      if (chat) await send(event.chatId, `A previous Codex turn was interrupted while the bridge stopped. It was not replayed to avoid duplicate work. Please resend the request if needed. Original request id: ${event.id}`, `interrupted:${event.id}`);
    }
    await journal.clearApprovals();
    for (const event of journal.pending()) await serialized(event.chatId, () => processEvent(event));
    await recover();
  }

  async function recover() {
    for (const chatId of config.chats.keys()) await recoverChat(chatId);
  }

  return {
    handleMessage,
    start,
    recover,
    async close() {
      closed = true;
      for (const [chatId, { session }] of activeTurns) await session.interrupt(journal.threadFor(chatId)).catch(() => {});
    },
  };
}

function operationId(input) {
  const bytes = createHash('sha256').update(String(input)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function isInsideWorkspace(root, target) {
  const resolved = resolve(root, target);
  const path = relative(resolve(root), resolved);
  if (path !== '' && (path === '..' || path.startsWith(`..${sep}`) || path.startsWith(sep))) return false;
  try {
    if (await realpath(root) !== resolve(root)) return false;
    let cursor = resolved;
    while (cursor !== resolve(root)) {
      try { if ((await lstat(cursor)).isSymbolicLink()) return false; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const parent = resolve(cursor, '..');
      if (parent === cursor) return false;
      cursor = parent;
    }
    return !(await lstat(cursor)).isSymbolicLink();
  } catch { return false; }
}

function safeError(error) {
  return redact(error instanceof Error ? error.message : String(error)).slice(0, 300);
}
