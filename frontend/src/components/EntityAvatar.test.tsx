import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { EntityAvatar } from "./EntityAvatar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("EntityAvatar", () => {
  it("uses the same symbol treatment at different sizes", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<EntityAvatar accessToken={null} entityId="group-1" entityKind="group" label="Design" />));
    const avatar = container.querySelector(".entity-avatar");
    expect(avatar?.getAttribute("data-avatar-color")).toBeTruthy();
    expect(avatar?.querySelector("svg")?.classList.contains("entity-avatar__symbol")).toBe(true);

    act(() => root.render(<EntityAvatar accessToken={null} entityId="group-1" entityKind="group" label="Design" size={72} />));
    expect((avatar as HTMLElement).style.height).toBe("72px");
    expect((avatar as HTMLElement).style.width).toBe("72px");
    expect(avatar?.querySelector("svg")?.classList.contains("entity-avatar__symbol")).toBe(true);
    act(() => root.unmount());
  });

  it("keeps people on initials until they choose a built-in symbol", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<EntityAvatar accessToken={null} entityId="person-1" entityKind="person" label="Ada Lovelace" />));
    expect(container.querySelector(".avatar-initials")?.textContent).toBe("AL");
    act(() => root.unmount());
  });
});
