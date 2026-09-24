import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as unfurlApi from "../api/unfurl";
import type { UnfurlData } from "../api/unfurl";
import { getDomainName, LinkUnfurlCard } from "./LinkUnfurlCard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Root[] = [];
const pendingRequestCleanup: Array<() => void> = [];

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

function renderCards(urls: string[], accessToken: string | null): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <>
        {urls.map((url) => <LinkUnfurlCard key={url} url={url} accessToken={accessToken} />)}
      </>
    );
  });
  return container;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let settled = false;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = (value) => {
      settled = true;
      resolvePromise(value);
    };
  });
  pendingRequestCleanup.push(() => {
    if (!settled) resolve(null as T);
  });
  return { promise, resolve };
}

describe("LinkUnfurlCard component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    act(() => {
      while (mountedRoots.length > 0) {
        mountedRoots.pop()?.unmount();
      }
    });
    // Drain deferred requests so the module-level request pool cannot leak
    // occupied slots into another test.
    for (let attempt = 0; attempt < 10 && pendingRequestCleanup.length > 0; attempt += 1) {
      pendingRequestCleanup.splice(0).forEach((cleanup) => cleanup());
      for (let microtask = 0; microtask < 10; microtask += 1) {
        await Promise.resolve();
      }
    }
    expect(pendingRequestCleanup).toHaveLength(0);
    if (vi.isFakeTimers()) {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
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
    const body = card!.querySelector(".link-unfurl-body");
    expect(body).not.toBeNull();
    expect(Boolean(body!.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
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

  it("bounds concurrent unfurl requests and starts the queued link when one finishes", async () => {
    const urls = Array.from({ length: 5 }, (_, index) => `https://queued-${index}.test/page`);
    const requests = new Map<string, ReturnType<typeof deferred<UnfurlData | null>>>();
    const startedUrls: string[] = [];
    vi.spyOn(unfurlApi, "fetchUnfurlData").mockImplementation((url) => {
      const request = deferred<UnfurlData | null>();
      requests.set(url, request);
      startedUrls.push(url);
      return request.promise;
    });

    let container!: HTMLDivElement;
    await act(async () => {
      container = renderCards(urls, "token123");
    });

    // A small fixed cap prevents a chat with many unique links from starting
    // one network request per card simultaneously.
    expect(startedUrls).toHaveLength(3);
    expect(startedUrls).toEqual(urls.slice(0, 3));

    await act(async () => {
      requests.get(urls[0])?.resolve({ url: urls[0], title: "First link" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startedUrls).toHaveLength(4);
    expect(startedUrls[3]).toBe(urls[3]);
    expect(container.textContent).toContain("First link");
  });

  it("times out hung unfurls, aborts their requests, and lets a queued card show its fallback", async () => {
    vi.useFakeTimers();
    const urls = Array.from({ length: 4 }, (_, index) => `https://hung-${index}.test/page`);
    const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    const startedUrls: string[] = [];
    const cleanupRegisteredUrls: string[] = [];
    vi.spyOn(unfurlApi, "fetchUnfurlData").mockImplementation(((url, _accessToken, signal?: AbortSignal) => {
      startedUrls.push(url);
      requests.push({ url, signal });
      return new Promise<UnfurlData>((_resolve, reject) => {
        cleanupRegisteredUrls.push(url);
        pendingRequestCleanup.push(() => reject(new Error("test cleanup")));
        signal?.addEventListener("abort", () => reject(new Error("request timed out")), { once: true });
      });
    }) as typeof unfurlApi.fetchUnfurlData);

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);
    await act(async () => {
      root.render(
        <>
          {urls.map((url, index) => (
            <LinkUnfurlCard
              key={url}
              url={url}
              accessToken="token123"
              fallback={<span>{index < 3 ? `timeout-fallback-${index}` : "queued-link-fallback"}</span>}
            />
          ))}
        </>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(startedUrls).toEqual(urls.slice(0, 3));
    expect(requests).toHaveLength(3);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect({
      activeRequestsAborted: requests.slice(0, 3).every(({ signal }) => signal?.aborted),
      queuedRequestStarted: startedUrls.includes(urls[3]),
      timedOutCardFallbackVisible: container.textContent?.includes("timeout-fallback-0") ?? false,
      queuedRequestHasCleanup: cleanupRegisteredUrls.includes(urls[3]),
      queuedFallbackVisible: container.textContent?.includes("queued-link-fallback") ?? false
    }).toEqual({
      activeRequestsAborted: true,
      queuedRequestStarted: true,
      timedOutCardFallbackVisible: true,
      queuedRequestHasCleanup: true,
      queuedFallbackVisible: true
    });
  });
});
