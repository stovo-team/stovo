# Local Stovo Codex Bridge

The bridge runs on your computer. Stovo Insight uses the Messenger connection you already linked to create a short-lived, chat-scoped pairing credential. The local bridge makes outbound HTTPS calls to Insight, runs the local Codex app-server, and sends response revisions through the same linked Messenger account. It does not sign in to Messenger directly and does not create a second Messenger identity.

## Requirements

- Node.js 22 or later.
- Codex CLI with the local `app-server` stdio protocol.
- An existing Insight-to-Messenger connection with the independent `read`, `process`, `codex`, and `reply` grants enabled. `codex` and `reply` are false by default; they do not grant `external_transfer` or `export`.
- An Insight deployment with `messenger_local_codex_relay_enabled=true` and the tenant feature flag `messenger_local_codex_relay=true`. Both gates default off. Enable them only after the matching Messenger and Insight migrations/releases are installed.
- A local checkout explicitly assigned to the configured chat.

## Pair and run

1. In the already connected Stovo Insight MCP session, call `messenger_source_connections` and confirm the selected connection has `read`, `process`, `codex`, and `reply` enabled.
2. Create a private config from the example and set the Insight HTTPS origin, chat ID, and absolute workspace. The already linked Messenger user becomes the default sole approver when pairing completes. Add other trusted Messenger user IDs to `approverIds` only when they should also invoke Codex and approve actions.

   ```sh
   cp config.example.json config.json
   mkdir -m 700 private
   ```

3. In that same authenticated Insight MCP session, call `pair_local_codex(connection_id, chat_id)`. The pairing is restricted to that existing connection and chat, requires all four current grants, starts from a live event fence, and expires after five minutes.
4. Pair locally with the one-time code. It is exchanged once and the returned relay credential is saved only in the owner-private file `private/insight-relay.json`:

   ```sh
   node src/main.mjs pair ./config.json
   ```

   Paste the code when prompted. With one configured chat, the bridge selects it automatically; with several, it asks which configured chat to bind before exchanging the code. Insight checks that chat binding atomically while consuming the one-use code and returns the linked Messenger user ID as the default approver. Never put the code or relay credential in source control, shell scripts, or logs. Pair each configured chat separately; each chat has its own workspace and its own scoped relay credential.
5. Install the managed Codex approval requirements from `requirements.example.toml` at `/etc/codex/requirements.toml` with root-owned, non-writable-by-bridge permissions. The bridge checks the Unix policy file at this exact path before it starts.
6. Start the bridge:

   ```sh
   npm start -- ./config.json
   ```

   Send a message beginning with `@Codex` or `/codex` in the configured chat. `/codex stop` or `/codex interrupt` interrupts the active local turn. Press Ctrl-C to stop the bridge.

`stateFile` stores thread mappings, relay cursors, dedupe receipts, pending events and reply IDs. `codexHome` is isolated from every configured workspace. Protect both directories as private local state and back them up only to storage you trust. The relay credential can be revoked with the Insight tool `revoke_local_codex_companion(companion_id)`; revoking the Messenger connection also makes relay calls fail closed.

## Approvals

Every file change, shell command, and publish/deploy command requires its own one-time approval. The bridge shows the exact pending Codex request and binds approval to its request ID, chat, and configured approver IDs. Reply with `/codex approve CODE`, `/codex deny CODE`, or `/codex cancel CODE` in the same chat. Unknown approval methods, broader permission grants, unapproved users, paths outside the assigned workspace, and incomplete file diffs are denied. Approval codes are cleared when the process restarts. A stale or revoked grant prevents further response chunks.

The bridge starts Codex in read-only mode with MCP servers disabled. Managed Codex `prompt-user` shell rules are required for shell requests to arrive as reviewable approval checkpoints. Review the exact command before approval: the bridge cannot prove every effect of a command after it runs. Publish and deployment commands receive an explicit, separate approval and are never started automatically.

## Limits and rollout status

- Source replay is read through Messenger's current Source v2 credential and exact revision APIs. Insight persists event dedupe, cursor progress, relay credentials as hashes, and response revisions. Messenger stamps `local_codex_bridge` origin server-side; client text and caller-supplied origin do not control loop suppression.
- The linked Messenger user is the default approver; additional users must be listed in `approverIds`. The Messenger source event's authenticated sender ID is used; a textual message cannot spoof it.
- The local journal prevents duplicate turns on replay. An interrupted uncertain turn is not re-run automatically; resend it after review.
- The pairing workflow needs a completed Insight/Messenger release with the new routes and migrations. This code change does not enable either feature gate, perform a live canary, contact a real account, send a real Messenger message, or deploy anything.
- Approval protocol details can change with Codex versions. Unknown methods are denied. Verify the installed Codex app-server against local fixtures before enabling the relay for a real chat.

Run the offline bridge suite from this directory with `npm test`. Do not run the bridge against real credentials or chats as part of development verification.
