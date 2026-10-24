import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type { Chat } from "../../api/chats";
import { useArchiveSelectionSync } from "./useArchiveSelectionSync";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("clears archive selection when a forwarded origin opens a group", () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  function Harness({ chat }: { chat: Chat }) { const [open, setOpen] = useState(false); useArchiveSelectionSync(chat, setOpen); return <output>{String(open)}</output>; }
  try {
    act(() => root.render(<Harness chat={{ id: "archive", type: "archive" } as Chat} />));
    expect(host.textContent).toBe("true");
    act(() => root.render(<Harness chat={{ id: "origin", type: "group" } as Chat} />));
    expect(host.textContent).toBe("false");
  } finally { act(() => root.unmount()); host.remove(); }
});
