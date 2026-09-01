import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as unfurlApi from "../api/unfurl";
import { getDomainName, LinkUnfurlCard } from "./LinkUnfurlCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Root[] = [];

function renderCard(url: string, accessToken: string | null): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(<LinkUnfurlCard url={url} accessToken={accessToken} />);
  });
  return container;
}

describe("LinkUnfurlCard component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      while (mountedRoots.length > 0) {
        mountedRoots.pop()?.unmount();
      }
    });
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("extracts clean domain name from URLs", () => {
    expect(getDomainName("https://www.github.com/stovo/messenger")).toBe("github.com");
    expect(getDomainName("http://example.org/path?query=1")).toBe("example.org");
    expect(getDomainName("invalid-url")).toBe("invalid-url");
  });

  it("renders loaded OpenGraph data properly", async () => {
    const mockData = {
      url: "https://stovo.app/docs",
      title: "Stovo Documentation",
      description: "Official guides and reference docs.",
      image: "https://stovo.app/banner.png",
      siteName: "Stovo Messenger",
      favicon: "https://stovo.app/favicon.ico"
    };

    vi.spyOn(unfurlApi, "fetchUnfurlData").mockResolvedValue(mockData);

    let container: HTMLDivElement;
    await act(async () => {
      container = renderCard("https://stovo.app/docs", "token123");
    });

    const card = container!.querySelector(".link-unfurl-card");
    expect(card).not.toBeNull();
    expect(container!.textContent).toContain("Stovo Messenger");
    expect(container!.textContent).toContain("Stovo Documentation");
    expect(container!.textContent).toContain("Official guides and reference docs.");

    const titleLink = container!.querySelector("a.link-unfurl-title") as HTMLAnchorElement;
    expect(titleLink.href).toBe("https://stovo.app/docs");
    expect(titleLink.target).toBe("_blank");

    const img = container!.querySelector("img.link-unfurl-image") as HTMLImageElement;
    expect(img.src).toBe("https://stovo.app/banner.png");
  });

  it("renders nothing when unfurl fetch fails", async () => {
    vi.spyOn(unfurlApi, "fetchUnfurlData").mockRejectedValue(new Error("Network error"));

    let container: HTMLDivElement;
    await act(async () => {
      container = renderCard("https://broken-link.test", "token123");
    });

    const card = container!.querySelector(".link-unfurl-card");
    expect(card).toBeNull();
  });
});
