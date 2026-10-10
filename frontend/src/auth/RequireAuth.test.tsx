import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("./AuthContext", () => ({ useAuth: vi.fn() }));

import { useAuth } from "./AuthContext";
import { RequireAuth } from "./RequireAuth";

describe("RequireAuth", () => {
  it("renders a remembered session while refresh revalidates in the background", () => {
    vi.mocked(useAuth).mockReturnValue({ currentUser: { id: "user-1" }, isLoading: true } as never);

    expect(renderToStaticMarkup(<MemoryRouter><RequireAuth><p>Cached chats</p></RequireAuth></MemoryRouter>)).toContain("Cached chats");
  });
});
