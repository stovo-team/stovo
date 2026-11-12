import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntelligenceConnectionsSettings } from "./IntelligenceConnectionsSettings";
import { englishStrings } from "../../config/strings";

const connection = {
  id: "connection-1",
  chat_id: "chat-1",
  chat_title: "Project Alpha",
  grants: { read: true, process: true, external_transfer: false, export: true, codex: false, reply: false },
  created_at: "2026-10-10T10:00:00Z",
  expires_at: "2026-11-09T10:00:00Z",
  revoked_at: null,
};

const mountedRoots: Root[] = [];
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  while (mountedRoots.length > 0) act(() => mountedRoots.pop()?.unmount());
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

async function renderConnections() {
  const authRequest = vi.fn(async (endpoint: string, options?: unknown) => {
    if (endpoint === "/api/v2/intelligence/connections") return { connections: [connection] };
    return { revoked: true };
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(<IntelligenceConnectionsSettings strings={englishStrings} authRequest={authRequest} />));
  return { container, authRequest };
}

describe("IntelligenceConnectionsSettings", () => {
  it("lists only safe connection metadata and exposes each current grant", async () => {
    const { container } = await renderConnections();
    expect(container.textContent).toContain("Project Alpha");
    expect(container.querySelectorAll("button[data-revoke-grant]")).toHaveLength(4);
    expect(container.textContent).not.toMatch(/access_token|bearer|secret/i);
  });

  it("revokes one grant independently and can revoke the whole connection", async () => {
    const { container, authRequest } = await renderConnections();

    await act(async () => container.querySelector<HTMLButtonElement>('button[data-revoke-grant="process"]')!.click());
    expect(authRequest).toHaveBeenCalledWith("/api/v2/intelligence/revoke", expect.objectContaining({ method: "POST" }));
    expect(authRequest).toHaveBeenCalledWith("/api/v2/intelligence/revoke", expect.objectContaining({ body: { connection_id: "connection-1", grant: "process" } }));

    await act(async () => container.querySelector<HTMLButtonElement>('button[data-revoke-grant="connection"]')!.click());
    expect(authRequest).toHaveBeenCalledWith("/api/v2/intelligence/revoke", expect.objectContaining({ body: { connection_id: "connection-1", grant: "connection" } }));
  });
});
