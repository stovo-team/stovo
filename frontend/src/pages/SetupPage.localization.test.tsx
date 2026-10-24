import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setup: vi.fn(),
  fetchSetupStatus: vi.fn(),
}));

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ currentUser: null, setup: mocks.setup }) }));
vi.mock("../api/auth", () => ({ fetchSetupStatus: mocks.fetchSetupStatus }));

import SetupPage from "./SetupPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SetupPage localization", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.setup.mockReset();
    mocks.fetchSetupStatus.mockReset().mockResolvedValue({ setupRequired: true });
    Object.defineProperty(navigator, "language", { configurable: true, value: "ru-RU" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(navigator, "language", { configurable: true, value: "en-US" });
  });

  it("renders the owner setup form in Russian", async () => {
    await act(async () => root.render(<MemoryRouter initialEntries={["/setup"]}><SetupPage /></MemoryRouter>));
    expect(container.textContent).toContain("Первоначальная настройка");
    expect(container.textContent).toContain("Создать аккаунт владельца");
    expect(container.textContent).not.toContain("Initial setup");
  });
});
