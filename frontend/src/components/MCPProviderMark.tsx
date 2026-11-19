import type { MCPProviderId } from "../api/mcpConnectors";

export function MCPProviderMark({ provider }: { provider: MCPProviderId }) {
  if (provider === "claude_code") {
    return (
      <svg className="mcp-provider-mark is-claude" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M15.9 2.5 18.1 12l7.7-6-4.8 8.4 9.4 2.1-9.4 2.2 4.8 8.3-7.7-6-2.2 9.5-2.1-9.5-7.7 6 4.8-8.3-9.4-2.2 9.4-2.1-4.8-8.4 7.7 6z" fill="currentColor" />
      </svg>
    );
  }

  if (provider === "codex") {
    return (
      <svg className="mcp-provider-mark is-openai" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 3.3a7.3 7.3 0 0 1 6.3 3.6 7.1 7.1 0 0 1 6.2 8.9 7.2 7.2 0 0 1-2.3 12.4 7.3 7.3 0 0 1-12.6 1.2 7.2 7.2 0 0 1-9.5-8.1 7.2 7.2 0 0 1 .5-12.6A7.2 7.2 0 0 1 16 3.3Zm0 3.2a4.1 4.1 0 0 0-3.6 2.1l-.5.8-1-.1a4.1 4.1 0 0 0-4.5 5.1l.3 1-.9.5a4.1 4.1 0 0 0 0 7.2l.9.5-.3 1a4.1 4.1 0 0 0 5.4 4.8l1-.4.7.8a4.1 4.1 0 0 0 7.1-1l.3-1 1-.2a4.1 4.1 0 0 0 1.9-7.2l-.8-.7.4-1a4.1 4.1 0 0 0-3.5-5.7l-1-.1-.3-1a4.1 4.1 0 0 0-4-3.4Z" fill="currentColor" />
        <path d="m11 12 9.9 5.7v2.1L11 14.1zm10 4.2v2.1l-9.9 5.7v-2.1z" fill="currentColor" />
      </svg>
    );
  }

  if (provider === "openclaw") {
    return (
      <svg className="mcp-provider-mark is-openclaw" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 12 6 7m4 10-6 1m8 3-4 5m14-14 4-5m-4 10 6 1m-8 3 4 5" />
        <path d="M10 12c2-3 10-3 12 0l2 7c0 4-3 7-8 7s-8-3-8-7zm2 3v.1m8-.1v.1M13 21c2 1.5 4 1.5 6 0" />
      </svg>
    );
  }

  return (
    <svg className="mcp-provider-mark is-hermes" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M4 24c7-1 12-5 15-12 2-4 5-6 9-7-2 5-3 9-7 12-4 4-9 7-17 7Zm5 3c5-2 9-5 12-9 2-2 4-5 6-9-1 7-3 12-8 16-3 2-6 3-10 2Z" fill="currentColor" />
      <path d="M8 23c4-1 7-3 10-6M12 25c3-1 6-3 8-5" fill="none" stroke="var(--surface-card)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
