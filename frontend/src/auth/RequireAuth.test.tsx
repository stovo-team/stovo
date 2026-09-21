import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./AuthContext", () => ({ useAuth: vi.fn() }));

import { useAuth } from "./AuthContext";
import { RequireAuth } from "./RequireAuth";

describe("RequireAuth", () => {
  it("renders a remembered session while refresh revalidates in the background", () => {
    vi.mocked(useAuth).mockReturnValue({ currentUser: { id: "user-1" }, isLoading: true } as never);

    expect(renderToStaticMarkup(<RequireAuth><p>Cached chats</p></RequireAuth>)).toContain("Cached chats");
  });
});
