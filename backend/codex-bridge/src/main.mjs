import { chmod, lstat, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createBridge } from './bridge.mjs';
import { createCodexSession, createJsonRpcPeer } from './codex.mjs';
import { bindPairedApprovers, validateConfig } from './core.mjs';
import { createJournal } from './core.mjs';
import { createInsightRelayClient } from './insight_relay.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export async function startBridge(configPath = process.argv[2] ?? './config.json') {
  const resolvedConfigPath = resolve(configPath);
  const rawConfig = JSON.parse(await readFile(resolvedConfigPath, 'utf8'));
  let policyConfig = validateConfig(rawConfig);
  const relayConfig = rawConfig.relay ?? {};
  const credentialPath = resolve(dirname(resolvedConfigPath), relayConfig.credentialFile ?? '');
  const statePath = resolve(dirname(resolvedConfigPath), rawConfig.stateFile ?? '');
  const codexHome = resolve(dirname(resolvedConfigPath), rawConfig.codexHome ?? '');
  if (!relayConfig.baseUrl || !relayConfig.credentialFile || !rawConfig.stateFile || !rawConfig.codexHome) throw new Error('relay baseUrl, credentialFile, stateFile, and isolated codexHome are required');
  if (!isAbsolute(codexHome) || policyConfig.chats.size === 0) throw new Error('Codex home and chat configuration are invalid');
  for (const chat of policyConfig.chats.values()) {
    const workspaceInfo = await stat(chat.workspace).catch(() => null);
    if (!workspaceInfo?.isDirectory()) throw new Error(`configured workspace is not a directory: ${chat.id}`);
    if (isWithin(chat.workspace, codexHome) || isWithin(codexHome, chat.workspace)) throw new Error('isolated codexHome must be outside every configured workspace');
  }
  const requirementsPath = rawConfig.approvalRequirementsPath ?? '';
  if (!isAbsolute(requirementsPath)) throw new Error('approvalRequirementsPath must be the absolute path to Codex managed requirements.toml');
  if (process.platform !== 'win32' && requirementsPath !== '/etc/codex/requirements.toml') throw new Error('Unix approvalRequirementsPath must be /etc/codex/requirements.toml so the app-server loads the same managed policy');
  const requirements = await readFile(requirementsPath, 'utf8').catch(() => '');
  if (!requirements.includes('[rules]') || !requirements.includes('prefix_rules') || !requirements.includes('prompt-user') || !['bash', 'zsh', 'sh'].every((shell) => requirements.includes(`"${shell}"`))) {
    throw new Error('managed Codex command approval rules are missing; install requirements.example.toml before starting the bridge');
  }
  await ensurePrivateDirectory(dirname(credentialPath), 'credential directory');
  await ensurePrivateDirectory(dirname(statePath), 'state directory');
  await ensurePrivateDirectory(codexHome, 'Codex home');
  await assertPrivateFile(credentialPath, 'Insight relay credential file', true);
  await assertPrivateFile(statePath, 'bridge state file', false);
  const storedBindings = JSON.parse(await readFile(credentialPath, 'utf8'));
  if (storedBindings?.version !== 1 || !storedBindings.bindings || typeof storedBindings.bindings !== 'object' || Array.isArray(storedBindings.bindings)) throw new Error('Insight relay credential file has an invalid format');
  const relayClients = new Map();
  for (const [chatId, chat] of policyConfig.chats) {
    const binding = storedBindings.bindings[chatId];
    if (!binding?.relayCredential || binding.chatId !== chatId || !binding.connectionId || !binding.companionId || !binding.linkedUserId) throw new Error(`chat ${chatId} has no matching Insight relay pairing; run the pair command`);
    relayClients.set(chatId, createInsightRelayClient({ baseUrl: relayConfig.baseUrl, credential: binding.relayCredential }));
  }
  policyConfig = bindPairedApprovers(policyConfig, storedBindings.bindings);
  const messenger = {
    send: (chatId, ...args) => requireRelay(chatId).send(chatId, ...args),
    edit: (chatId, ...args) => requireRelay(chatId).edit(chatId, ...args),
  };

  const journal = await createJournal(statePath);
  const appServer = spawn(rawConfig.codexCommand ?? 'codex', ['app-server', '--stdio', '-c', 'mcp_servers={}'], {
    cwd: [...policyConfig.chats.values()][0].workspace,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      USER: process.env.USER ?? '',
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      LANG: process.env.LANG ?? 'C.UTF-8',
      CODEX_HOME: codexHome,
      NO_COLOR: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  appServer.stderr.on('data', () => {});
  const rpc = createJsonRpcPeer(appServer);
  const sessions = new Map();
  const codexForChat = (chatId) => {
    if (!policyConfig.chats.has(chatId)) throw new Error('chat is not configured');
    if (!sessions.has(chatId)) sessions.set(chatId, createCodexSession(rpc));
    return sessions.get(chatId);
  };
  const bridge = createBridge({
    config: policyConfig,
    journal,
    messenger,
    codexForChat,
    logger: (event, details) => process.stderr.write(`${event} ${JSON.stringify(details)}\n`),
  });

  const abortController = new AbortController();
  const stopping = new Promise((resolveStop) => {
    const stop = async () => {
      abortController.abort();
      await bridge.close();
      for (const session of sessions.values()) await session.close();
      resolveStop();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  await bridge.start();
  for (const [chatId, relay] of relayClients) void pollRelay({ chatId, relay, bridge, journal, signal: abortController.signal });
  process.stderr.write('Local Stovo Codex Bridge started\n');
  await stopping;

  function requireRelay(chatId) {
    const relay = relayClients.get(chatId);
    if (!relay) throw new Error('Messenger chat has no paired Insight relay');
    return relay;
  }
}

async function pollRelay({ chatId, relay, bridge, journal, signal }) {
  while (!signal.aborted) {
    try {
      const page = await relay.poll(journal.remoteCursorFor(chatId), { signal });
      for (const event of page.events) {
        await bridge.receiveRelayMessage(event);
        await relay.ack(event.id);
      }
      await journal.setRemoteCursor(chatId, page.cursor);
      if (page.events.length === 0) await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      if (signal.aborted) return;
      safeLog(error);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

export async function pairBridge(configPath, pairingCode, expectedChatId) {
  const resolvedConfigPath = resolve(configPath);
  const rawConfig = JSON.parse(await readFile(resolvedConfigPath, 'utf8'));
  const policyConfig = validateConfig(rawConfig);
  const relayConfig = rawConfig.relay ?? {};
  const credentialPath = resolve(dirname(resolvedConfigPath), relayConfig.credentialFile ?? '');
  const configuredChatIds = [...policyConfig.chats.keys()];
  const chatId = expectedChatId ?? (configuredChatIds.length === 1 ? configuredChatIds[0] : '');
  if (!relayConfig.baseUrl || !relayConfig.credentialFile || !pairingCode) throw new Error('relay baseUrl, credentialFile, and a one-time Insight pairing code are required');
  if (!chatId || !policyConfig.chats.has(chatId)) throw new Error('pairing requires a chat ID from the local allowlist');
  await ensurePrivateDirectory(dirname(credentialPath), 'credential directory');
  await assertPrivateFile(credentialPath, 'Insight relay credential file', false);
  const existing = await readFile(credentialPath, 'utf8').then(JSON.parse).catch((error) => {
    if (error.code !== 'ENOENT') throw new Error('Insight relay credential file is unreadable');
    return { version: 1, bindings: {} };
  });
  if (existing?.version !== 1 || !existing.bindings || typeof existing.bindings !== 'object' || Array.isArray(existing.bindings)) throw new Error('Insight relay credential file has an invalid format');
  const relay = createInsightRelayClient({ baseUrl: relayConfig.baseUrl, pairingCode, expectedChatId: chatId });
  const binding = await relay.pair();
  if (binding.chatId !== chatId) throw new Error('Insight paired a different Messenger chat than requested');
  existing.bindings[binding.chatId] = {
    relayCredential: relay.relayCredential,
    companionId: binding.companionId,
    connectionId: binding.connectionId,
    linkedUserId: binding.approverId,
    chatId: binding.chatId,
  };
  await writePrivateJson(credentialPath, existing);
  process.stderr.write(`Paired local Codex with configured Messenger chat ${binding.chatId}. Credential saved privately.\n`);
}

async function writePrivateJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
}

async function ensurePrivateDirectory(path, label) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(`${label} must be a real directory`);
  if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw new Error(`${label} permissions must be 0700`);
}

async function assertPrivateFile(path, label, required) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT' && !required) return;
    if (error.code === 'ENOENT' && required) throw new Error(`${label} is missing; run the pairing command first`);
    throw new Error(`${label} cannot be inspected`);
  }
  if (!info) {
    if (required) throw new Error(`${label} is missing; run the pairing command first`);
    return;
  }
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
  if (process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw new Error(`${label} permissions must be 0600`);
}

function isWithin(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function safeLog(error) {
  const text = String(error instanceof Error ? error.message : error).replace(/(bearer\s+)[^\s]+/gi, '$1[redacted]').slice(0, 300);
  process.stderr.write(`Bridge operation failed: ${text}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2] === 'pair' ? 'pair' : 'start';
  const configPath = mode === 'pair' ? process.argv[3] ?? join(here, 'config.json') : process.argv[2] ?? join(here, 'config.json');
  const operation = mode === 'pair'
    ? (async () => {
        const code = process.argv[4] ?? await readOneTimeCode();
        const chatId = process.argv[5] ?? await readPairingChatId(configPath);
        await pairBridge(configPath, code, chatId);
      })()
    : startBridge(configPath);
  operation.catch((error) => {
    safeLog(error);
    process.exitCode = 1;
  });
}

async function readOneTimeCode() {
  const { createInterface } = await import('node:readline/promises');
  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  try { return (await terminal.question('Paste the one-time pairing code from Stovo Insight: ')).trim(); }
  finally { terminal.close(); }
}

async function readPairingChatId(configPath) {
  const rawConfig = JSON.parse(await readFile(resolve(configPath), 'utf8'));
  const chatIds = [...validateConfig(rawConfig).chats.keys()];
  if (chatIds.length === 1) return chatIds[0];
  const { createInterface } = await import('node:readline/promises');
  const terminal = createInterface({ input: process.stdin, output: process.stderr });
  try {
    process.stderr.write(`Configured chats: ${chatIds.join(', ')}\n`);
    return (await terminal.question('Enter the configured Messenger chat ID to pair: ')).trim();
  } finally { terminal.close(); }
}
