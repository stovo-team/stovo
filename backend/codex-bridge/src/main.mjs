import { chmod, lstat, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createBridge } from './bridge.mjs';
import { createCodexSession, createJsonRpcPeer } from './codex.mjs';
import { validateConfig } from './core.mjs';
import { createJournal } from './core.mjs';
import { createMessengerClient } from './messenger.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export async function startBridge(configPath = process.argv[2] ?? './config.json') {
  const resolvedConfigPath = resolve(configPath);
  const rawConfig = JSON.parse(await readFile(resolvedConfigPath, 'utf8'));
  const policyConfig = validateConfig(rawConfig);
  const messengerConfig = rawConfig.messenger ?? {};
  const tokenPath = resolve(dirname(resolvedConfigPath), rawConfig.tokenFile ?? '');
  const statePath = resolve(dirname(resolvedConfigPath), rawConfig.stateFile ?? '');
  const codexHome = resolve(dirname(resolvedConfigPath), rawConfig.codexHome ?? '');
  if (!rawConfig.tokenFile || !rawConfig.stateFile || !rawConfig.codexHome) throw new Error('tokenFile, stateFile, and isolated codexHome are required');
  if (!messengerConfig.apiBaseUrl || !messengerConfig.socketUrl || !messengerConfig.socketPath) throw new Error('Messenger REST and Socket.IO URLs are required');
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
  await mkdir(dirname(tokenPath), { recursive: true, mode: 0o700 });
  const tokenStat = await lstat(tokenPath).catch(() => null);
  if (!tokenStat?.isFile()) throw new Error(`private Messenger token file is missing: ${tokenPath}`);
  if (process.platform !== 'win32' && (tokenStat.mode & 0o077) !== 0) throw new Error('Messenger token file permissions must be 0600');
  await mkdir(codexHome, { recursive: true, mode: 0o700 });
  let tokens = JSON.parse(await readFile(tokenPath, 'utf8'));
  if (!tokens.accessToken || !tokens.refreshToken) throw new Error('Messenger token file must contain accessToken and refreshToken');

  let socket;
  const allowedChatIds = new Set(policyConfig.chats.keys());
  const messenger = createMessengerClient({
    apiBaseUrl: messengerConfig.apiBaseUrl,
    refreshOrigin: messengerConfig.refreshOrigin ?? 'capacitor://localhost',
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    allowedChatIds,
    onTokens: async (nextTokens) => {
      tokens = nextTokens;
      await writePrivateJson(tokenPath, tokens);
      if (socket) {
        socket.auth = { token: tokens.accessToken };
        socket.disconnect();
        socket.connect();
      }
    },
  });
  const identity = await messenger.me();
  const actualBotId = identity?.id ?? identity?.user?.id;
  if (!actualBotId || actualBotId !== policyConfig.botUserId) throw new Error('configured botUserId does not match the authenticated Messenger account');

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

  const { io } = await import('socket.io-client');
  socket = io(messengerConfig.socketUrl, {
    path: messengerConfig.socketPath,
    auth: { token: tokens.accessToken },
    query: { token: tokens.accessToken },
    transports: ['polling'],
    upgrade: false,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
  });
  socket.on('message:new', (message) => { void bridge.handleMessage(message).catch((error) => safeLog(error)); });
  socket.on('connect', () => process.stderr.write('Messenger realtime connected\n'));
  socket.on('disconnect', (reason) => process.stderr.write(`Messenger realtime disconnected: ${String(reason).slice(0, 120)}\n`));
  socket.on('connect_error', () => process.stderr.write('Messenger realtime connection failed; reconnect will retry\n'));

  const stopping = new Promise((resolveStop) => {
    const stop = async () => {
      socket.disconnect();
      await bridge.close();
      for (const session of sessions.values()) await session.close();
      resolveStop();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  let started = false;
  socket.on('connect', () => {
    if (!started) {
      started = true;
      void bridge.start().catch((error) => safeLog(error));
    } else {
      void bridge.recover().catch((error) => safeLog(error));
    }
  });
  process.stderr.write('Local Stovo Codex Bridge started\n');
  await stopping;
}

async function writePrivateJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
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
  startBridge(process.argv[2] ?? join(here, 'config.json')).catch((error) => {
    safeLog(error);
    process.exitCode = 1;
  });
}
