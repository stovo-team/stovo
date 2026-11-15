import { describe, expect, it, vi } from "vitest";
import { canAutoOpenLastChat, navigateToSelectedChat } from "./chatNavigation";

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

describe("canAutoOpenLastChat", () => {
  it.each([1199, 1024, 769])("restores the last chat in the side-by-side layout at %ipx", (width) => {
    expect(canAutoOpenLastChat(width, false)).toBe(true);
  });
  it.each([768, 390])("keeps the list-first view at %ipx", (width) => {
    expect(canAutoOpenLastChat(width, false)).toBe(false);
  });
  it("keeps the list-first view in native apps", () => {
    expect(canAutoOpenLastChat(1400, true)).toBe(false);
  });
});
