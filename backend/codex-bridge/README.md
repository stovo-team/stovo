# Local Stovo Codex Bridge

This optional, locally run Node service connects a dedicated Stovo Messenger account to the local Codex app-server. It listens for `message:new` events in configured chats, responds to messages beginning with `@Codex` (configurable) or `/codex`, and posts the response as a separate Messenger account. It does not change the Messenger server.

## Requirements and setup

- Node.js 22 or later and `npm`.
- The Stovo Messenger API and Socket.IO service reachable from this machine.
- A dedicated Messenger user account for the bridge. The bridge authenticates as that user, checks `/api/auth/me` against `botUserId`, and ignores messages authored by it. Messenger currently has no bot identity or structured mention field in the realtime event, so `@Codex` is a textual prefix; anyone who can post in an allowed chat can invoke it.
- Codex CLI with the local `app-server` protocol. This bridge enables `experimentalApi` and `requiredHumanApproval`; approval request methods can change across Codex versions. Unknown requests are denied.
- One existing local checkout per configured chat. The chat maps to exactly one absolute workspace path. Workspaces must be distinct and outside the private Codex home.

From this directory, install the dependency and create private config files:

```sh
npm install
cp config.example.json config.json
mkdir -m 700 private
```

Edit `config.json`: set Messenger REST and Socket.IO base URLs/path, the dedicated account's exact user ID, each allowed chat ID, its absolute workspace, and Messenger user IDs allowed to approve actions in that chat. Never put credentials in this file. Copy `requirements.example.toml` to `/etc/codex/requirements.toml` with root-owned, non-writable-by-bridge permissions. The current Unix launcher requires that exact system path so Codex reads the same managed policy. It fails closed if the file does not include `sh`, `bash`, and `zsh` `prompt-user` prefix rules. Include every shell wrapper that the installed Codex environment can use (the example also covers fish and Windows shell names). Restart Codex processes after changing managed requirements.

Create `private/bot-tokens.json` with the dedicated account's existing Messenger session tokens:

```json
{"accessToken":"…","refreshToken":"…"}
```

Set its mode to `0600` (`chmod 600 private/bot-tokens.json`). Tokens are stored only locally; the bridge refreshes through Messenger's existing `/api/auth/refresh` route and atomically replaces this file. The default `refreshOrigin` is `capacitor://localhost`, the native client origin accepted by the current server. Adjust it only to an origin the server explicitly allows. Keep `private/` out of backups and source control.

The bridge uses an isolated `codexHome` under `private/`, pins Codex to read-only sandboxing, disables configured MCP servers for its app-server process, and requests approval on demand. It does not inherit other environment variables except the minimum process environment needed to launch Codex. The state journal and credentials must be protected as local private data.

## Run and use

```sh
npm test
npm start -- ./config.json
```

Mention the configured trigger at the start of a message (`@Codex explain this error`) or send `/codex explain this error`. In a configured chat, `/codex stop` or `/codex interrupt` interrupts the current Codex turn. The bridge resumes the saved Codex thread for that chat. A new user message is serialized behind the active turn in that chat; other chats have their own workspace and thread.

Responses are streamed by creating one bot message and editing it as Codex emits text. Messenger's authenticated message API and operation IDs make retries idempotent. On reconnect, history is fetched to recover missed events. Events are deduplicated in the local journal. If the bridge stops during a Codex turn, it will not replay that uncertain turn; it marks it `needs-review` to avoid duplicate work. Pending approval codes are invalidated on restart.

## Approvals

Each app-server command or file-change request creates a one-time approval code and a summary in the originating chat. A listed approver must issue `/codex approve CODE` or `/codex deny CODE` in that same chat. `/codex cancel CODE` declines it. Approvals are bound to the configured Messenger sender ID and chat, consumed once, expire when the process restarts, and are not granted by the message that triggered the task. Approval applies only to the exact pending Codex request; broader permission-expansion requests and unknown request methods are denied. File changes are shown with their paths and are eligible only when all paths stay within that chat's configured workspace. Command previews are redacted before display and logs are bounded/redacted.

Codex managed `prompt-user` requirements are essential: command executions must arrive as `humanCommand` approval checkpoints for this bridge to expose an approval. An ordinary execution request is rejected. Each approval is for one Codex request only; it does not pre-approve later commands. Commands that publish or deploy (for example `git push`, release/publish commands, or container pushes) receive the same per-command approval and are never run by the bridge on their own. Review the exact displayed command before approving it.

## Security and limitations

- This is an opt-in local bridge, not a hosted bot. It sends real Messenger messages if configured with live credentials; this implementation was developed and tested only with local fixtures and fake transports. No live account or deployment was used.
- `message:new` provides sender and chat IDs but no structured mention target. The textual trigger is therefore the supported explicit invocation. Configure only chats whose members you trust to invoke Codex, and bind each to a deliberately chosen checkout.
- There is no Messenger server-side bot role today. A dedicated regular account supplies the separate sender identity and inherits that account's existing Messenger permissions. Do not share its credentials.
- Approval behavior depends on Codex app-server's experimental `requiredHumanApproval` capability and locally installed managed requirements. The bridge fails closed when those requirements are absent and denies unrecognized approval methods. Verify on the exact Codex version and shell setup before relying on it. Codex/app-server upgrades may change protocol methods or managed policy behavior.
- A shell command can itself perform broad or networked work after approval. The bridge requires exact human approval for each shell request but cannot prove a command's effects from its preview. Do not approve a command you do not understand.
- Codex's `read-only` sandbox blocks normal workspace writes; approved file changes and approved commands are the only intended mutation path. The bridge cannot guarantee isolation from host-level configuration or vulnerabilities in Codex and its dependencies.
- This service is single-process and stores its journal as a local JSON file. Do not run multiple bridge instances against the same config/state file.
- The bridge uses current Messenger routes (`/api/auth/me`, chat message history/send, message edit, token refresh) and Socket.IO `message:new`. If the server changes those contracts or disallows the configured refresh origin, startup or reconnection will fail rather than widening access.

Never commit `config.json`, `private/`, session tokens, or local state. Stop with Ctrl-C; no deployment, publishing, or external message is part of installation.
