import { expect, it, vi } from "vitest";
import { navigateToSelectedChat } from "./chatNavigation";

it.each(["/app/settings", "/app/plans", "/app/storage", "/app/chats", "/s/cluster/app/settings"])("returns to a cached chat from %s with one navigation", (pathname) => {
  const navigate = vi.fn();
  navigateToSelectedChat("call", "call", pathname, navigate);
  expect(navigate).toHaveBeenCalledOnce();
});
it.each(["/app/chats/call", "/s/cluster/app/chats/call"])("keeps the already selected chat at %s without duplicate history", (pathname) => {
  const navigate = vi.fn();
  navigateToSelectedChat("call", "call", pathname, navigate);
  expect(navigate).not.toHaveBeenCalled();
});
it("opens a different chat exactly once", () => {
  const navigate = vi.fn();
  navigateToSelectedChat("call", "cached", "/app/settings", navigate);
  expect(navigate).toHaveBeenCalledOnce();
});
