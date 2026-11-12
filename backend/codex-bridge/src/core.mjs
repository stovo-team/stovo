import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

const supportedApprovals = new Map([
  ['item/commandExecution/requestApproval', 'command'],
  ['item/fileChange/requestApproval', 'file-change'],
  ['item/permissions/requestApproval', 'permission'],
]);

export function validateConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('config must be an object');
  const trigger = requiredString(input.trigger, 'trigger');
  if (!Array.isArray(input.chats) || input.chats.length === 0) throw new Error('config requires at least one chat');
  const chats = new Map();
  const workspaces = new Set();
  for (const entry of input.chats) {
    const id = requiredString(entry?.id, 'chat id');
    const workspace = requiredString(entry?.workspace, `workspace for ${id}`);
    if (!isAbsolute(workspace) || resolve(workspace) !== workspace) throw new Error(`chat ${id} requires an absolute workspace path`);
    if (chats.has(id)) throw new Error(`duplicate chat id: ${id}`);
    if (workspaces.has(workspace)) throw new Error(`workspace must be unique per chat: ${workspace}`);
    if (entry.approverIds !== undefined && !Array.isArray(entry.approverIds)) throw new Error(`additional approver IDs for ${id} must be an array`);
    const approverIds = [...new Set((entry.approverIds ?? []).map((value) => requiredString(value, `approver id for ${id}`)))];
    chats.set(id, Object.freeze({ id, workspace, approverIds: Object.freeze(approverIds) }));
    workspaces.add(workspace);
  }
  return Object.freeze({ trigger, chats });
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

export function classifyMessage(message, config) {
  const senderId = String(message?.senderId ?? message?.userId ?? '');
  const chatId = String(message?.chatId ?? '');
  if (message?.origin === 'local_codex_bridge') return null;
  if (!message?.id || !senderId || message.isBot === true || message.sender?.isBot === true) return null;
  if (!config.chats.has(chatId)) return null;
  const chat = config.chats.get(chatId);
  if (!chat.approverIds.includes(senderId)) return null;
  const content = typeof message.content === 'string' ? message.content.trim() : '';
  if (!content) return null;
  const command = content.match(/^\/codex(?:\s+([\s\S]*))?$/i);
  if (command) {
    const rest = (command[1] ?? '').trim();
    const control = parseControl(rest);
    return { id: String(message.id), chatId, senderId, ...(control ? { control } : { prompt: rest || 'Please respond in this chat.' }) };
  }
  const mention = new RegExp(`^${escapeRegExp(config.trigger)}(?:\\s+([\\s\\S]*))?$`, 'i').exec(content);
  if (!mention) return null;
  const prompt = (mention[1] ?? '').trim();
  return { id: String(message.id), chatId, senderId, prompt: prompt || 'Please respond in this chat.' };
}

export function bindPairedApprovers(config, bindings) {
  const chats = new Map();
  for (const [chatId, chat] of config.chats) {
    const linkedUserId = requiredString(bindings?.[chatId]?.linkedUserId, `linked Messenger approver for ${chatId}`);
    chats.set(chatId, Object.freeze({
      ...chat,
      approverIds: Object.freeze([...new Set([linkedUserId, ...chat.approverIds])]),
    }));
  }
  return Object.freeze({ ...config, chats });
}

function parseControl(value) {
  let match = value.match(/^(approve|deny|cancel)\s+([a-z0-9-]{4,80})$/i);
  if (match) return { action: match[1].toLowerCase(), code: match[2] };
  if (/^(stop|interrupt)$/i.test(value)) return { action: 'interrupt' };
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function createJournal(filePath) {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  let data;
  try {
    data = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`bridge state is unreadable: ${error.message}`);
    data = { version: 1, threads: {}, cursors: {}, remoteCursors: {}, processed: [], queue: [], approvals: {}, replies: {} };
  }
  data.cursors ??= {};
  data.remoteCursors ??= {};
  if (data.version !== 1 || !isPlainObject(data.threads) || !isPlainObject(data.cursors) || !isPlainObject(data.remoteCursors) || !Array.isArray(data.processed) || !Array.isArray(data.queue) || !isPlainObject(data.approvals) || !isPlainObject(data.replies)) {
    throw new Error('bridge state has an unsupported or invalid format');
  }
  let tail = Promise.resolve();
  const mutate = (operation) => {
    const result = tail.then(async () => {
      const value = await operation(data);
      const temporary = `${filePath}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
      await rename(temporary, filePath);
      return value;
    });
    tail = result.catch(() => {});
    return result;
  };
  return {
    async mapThread(chatId, threadId) {
      return mutate((state) => { state.threads[chatId] = threadId; });
    },
    threadFor(chatId) { return data.threads[chatId] ?? null; },
    cursorFor(chatId) { return data.cursors[chatId] ?? null; },
    async setCursor(chatId, messageId) { return mutate((state) => { state.cursors[chatId] = messageId; }); },
    remoteCursorFor(chatId) { return data.remoteCursors[chatId] ?? null; },
    async setRemoteCursor(chatId, cursor) { return mutate((state) => { state.remoteCursors[chatId] = cursor; }); },
    isProcessed(messageId) { return data.processed.includes(messageId); },
    async enqueue(event) {
      return mutate((state) => {
        if (state.processed.includes(event.id) || state.queue.some((item) => item.id === event.id)) return false;
        state.queue.push({ ...event, status: 'queued' });
        return true;
      });
    },
    pending() { return structuredClone(data.queue.filter((item) => item.status === 'queued')); },
    async begin(messageId) {
      return mutate((state) => {
        const item = state.queue.find((entry) => entry.id === messageId);
        if (!item || item.status !== 'queued') return false;
        item.status = 'processing';
        item.startedAt = new Date().toISOString();
        return true;
      });
    },
    async recoverInterrupted() {
      return mutate((state) => {
        const stale = state.queue.filter((item) => item.status === 'processing');
        for (const item of stale) item.status = 'needs-review';
        return structuredClone(stale);
      });
    },
    async markProcessed(messageId) {
      return mutate((state) => {
        if (!state.processed.includes(messageId)) state.processed.push(messageId);
        state.queue = state.queue.filter((item) => item.id !== messageId);
        if (state.processed.length > 10_000) state.processed.splice(0, state.processed.length - 10_000);
      });
    },
    async addApproval(approval) {
      return mutate((state) => { state.approvals[approval.code] = approval; });
    },
    approval(code) { return data.approvals[code] ?? null; },
    async clearApprovals() { return mutate((state) => { state.approvals = {}; }); },
    async removeApproval(code) {
      return mutate((state) => { delete state.approvals[code]; });
    },
    async setReply(messageId, reply) {
      return mutate((state) => { state.replies[messageId] = reply; });
    },
    replyFor(messageId) { return data.replies[messageId] ?? null; },
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createPendingApproval(request, code = randomBytes(5).toString('hex')) {
  const kind = supportedApprovals.get(request?.method);
  if (!kind || (typeof request.rpcId !== 'string' && typeof request.rpcId !== 'number') || !request.chatId || !Array.isArray(request.approverIds) || request.approverIds.length === 0) return null;
  const summary = redact(request.summary ?? request.params ?? kind).slice(0, 1200);
  return {
    code,
    rpcId: request.rpcId,
    method: request.method,
    kind,
    chatId: request.chatId,
    approverIds: [...new Set(request.approverIds)],
    summary,
    createdAt: new Date().toISOString(),
  };
}

export function resolveApproval(pending, message) {
  if (!pending || pending.used || !message || message.chatId !== pending.chatId || !pending.approverIds.includes(message.senderId)) return { decision: null };
  const match = String(message.content ?? '').trim().match(/^\/codex\s+(approve|deny|cancel)\s+([a-z0-9-]{4,80})$/i);
  if (!match || match[2] !== pending.code) return { decision: null };
  const action = match[1].toLowerCase();
  pending.used = true;
  return { decision: action === 'approve' ? 'accept' : action === 'deny' ? 'decline' : 'cancel', code: pending.code };
}

export function redact(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  return text
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,"}]+/gi, '$1[redacted]')
    .replace(/((?:access|refresh|api)[_-]?token|password|secret|credential|private[_-]?key)(["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1$2[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[redacted-token]');
}
