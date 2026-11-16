import { useState } from "react";
import { Check, Copy, ShieldCheck, Terminal } from "lucide-react";
import { useStrings } from "../i18n/LanguageContext";
import "./CodexBridgeSetupPanel.css";

const setupPrompt = `Help me set up the Local Stovo Codex Bridge on this computer. Guide me one step at a time and stop for my confirmation before every command that changes files, installs software, uses sudo, or contacts an account. First explain the exact command and its effect. Never run publish or deployment commands.

Use only the source at https://github.com/stovo-team/stovo-messenger, specifically backend/codex-bridge. This is source-based software; there is no signed or published companion installer. Do not trust or run a downloaded binary. Inspect the README, package scripts, and source before running anything. If the checkout does not contain the documented bridge, stop.

Prerequisites: macOS or Linux, Node.js 22 or later, Codex CLI with app-server stdio support, an existing Stovo Insight to Messenger connection, and a local workspace explicitly assigned to the intended Messenger chat. This flow does not support Windows. Check prerequisites first; do not install tools automatically. If any requirement is missing, explain how I can resolve it and wait.

Prepare a private working copy of backend/codex-bridge. Copy config.example.json to a private config.json; keep the relay credential, pairing code, config, state, and Codex home out of git and out of chat. Ask me for the Insight HTTPS origin, the exact allowed Messenger chat ID, and the absolute local workspace path. Never infer these values. Keep approverIds empty unless I explicitly name additional trusted Messenger user IDs. Preserve isolated codexHome and stateFile paths under a private directory. Do not ask me to paste passwords, tokens, or the pairing code into this Codex conversation.

Before pairing, show me the selected Insight origin and chat ID for confirmation. Then stop and ask me to open my authenticated Insight MCP session, call messenger_source_connections, and verify that the selected existing connection has read, process, codex, and reply grants. The codex and reply grants are opt-in; do not request external_transfer or export. I must explicitly perform the Insight Connect step by calling pair_local_codex(connection_id, chat_id) in that same authenticated session. The deployment and tenant relay feature gates must already be enabled by an administrator. If the tool is unavailable or either gate is off, stop; do not try another endpoint or bypass the gate.

The pairing code expires after five minutes and is restricted to this connection and exact chat. Only after I confirm the Insight step, help me run the local pairing command interactively: node src/main.mjs pair ./config.json. The code must be typed directly into the local terminal prompt, never into this chat, a file, a command argument, or a log. If pairing fails or expires, do not reuse the code; ask me to generate a fresh one for the same chat.

Before starting, review requirements.example.toml with me. The managed Codex approval policy must be installed by me or my administrator at /etc/codex/requirements.toml with root-owned, non-writable-by-bridge permissions. Do not use sudo or edit the system policy automatically. If it is absent or cannot be verified, stop. Confirm I understand each shell command, file change, and publish/deploy action in the bridge still needs its own one-time approval. The bridge runs local Codex in read-only mode with MCP servers disabled; do not weaken that policy.

Only after all checks and my explicit approval, show me the exact start command: npm start -- ./config.json. Explain how to stop with Ctrl-C and how to revoke the companion in Insight with revoke_local_codex_companion(companion_id). If anything is unclear, insecure, unsupported, or different from the repository documentation, stop and explain the blocker instead of guessing.`;

export default function CodexBridgeSetupPanel() {
  const strings = useStrings().codexBridgeSetup;
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(setupPrompt);
      setCopied(true);
      setCopyFailed(false);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <section className="mcp-local-codex-panel">
      <div className="mcp-copy-field">
        <div className="mcp-copy-field-label">
          <span>{strings.promptLabel}</span>
          <button className="mcp-inline-copy" onClick={copyPrompt} type="button">
            {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? strings.copied : strings.copy}
          </button>
        </div>
        <textarea className="mcp-setup-prompt" aria-label={strings.promptLabel} readOnly rows={5} value={setupPrompt} onFocus={(event) => event.currentTarget.select()} />
        {copyFailed && <p className="mcp-local-codex-copy-error" role="status">{strings.copyError}</p>}
      </div>

      <section className="mcp-local-codex-details">
        <h4><Terminal size={15} aria-hidden="true" />{strings.stepsTitle}</h4>
        <ol><li>{strings.stepOne}</li><li>{strings.stepTwo}</li><li>{strings.stepThree}</li><li>{strings.stepFour}</li></ol>
      </section>

      <section className="mcp-local-codex-note">
        <ShieldCheck size={20} aria-hidden="true" /><div><h2>{strings.safetyTitle}</h2><p>{strings.safety}</p></div>
      </section>
      <details className="mcp-local-codex-details">
        <summary>{strings.limitsTitle} &amp; {strings.failureTitle}</summary>
        <p><strong>{strings.limitsTitle}:</strong> {strings.limits}</p>
        <p><strong>{strings.failureTitle}:</strong> {strings.failure}</p>
      </details>
    </section>
  );
}
