import { useEffect, useState, type ReactNode } from "react";
import { fetchUnfurlData, type UnfurlData } from "../api/unfurl";
import { useStrings } from "../i18n/LanguageContext";

const UNFURL_CACHE_TTL_MS = 5 * 60 * 1000;
const unfurlCache = new Map<string, { promise: Promise<UnfurlData | null>; expiresAt: number }>();
const MAX_CONCURRENT_UNFURL_REQUESTS = 3;
const UNFURL_REQUEST_TIMEOUT_MS = 15_000;
let activeUnfurlRequests = 0;
const unfurlRequestQueue: Array<() => void> = [];

function startNextUnfurlRequest() {
  if (activeUnfurlRequests >= MAX_CONCURRENT_UNFURL_REQUESTS) return;
  const start = unfurlRequestQueue.shift();
  start?.();
}

function enqueueUnfurlRequest(url: string, accessToken: string | null): Promise<UnfurlData | null> {
  return new Promise((resolve) => {
    unfurlRequestQueue.push(() => {
      activeUnfurlRequests += 1;
      const controller = new AbortController();
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<null>((resolveTimeout) => {
        timeoutId = setTimeout(() => {
          controller.abort();
          resolveTimeout(null);
        }, UNFURL_REQUEST_TIMEOUT_MS);
      });
      const requestPromise = Promise.resolve().then(() => fetchUnfurlData(url, accessToken, controller.signal));

      void Promise.race([requestPromise, timeoutPromise])
        .catch(() => null)
        .then(resolve)
        .finally(() => {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
          activeUnfurlRequests -= 1;
          startNextUnfurlRequest();
        });
    });
    startNextUnfurlRequest();
  });
}

export function getDomainName(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return rawUrl;
  }
}

export function LinkUnfurlCard({
  url,
  accessToken,
  fallback
}: {
  url: string;
  accessToken: string | null;
  fallback?: ReactNode;
}) {
  const copy = useStrings().sharedUi;
  const [data, setData] = useState<UnfurlData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    if (!url) {
      setLoading(false);
      setError(true);
      return;
    }

    let entry = unfurlCache.get(url);
    if (!entry || entry.expiresAt <= Date.now()) {
      entry = {
        promise: enqueueUnfurlRequest(url, accessToken),
        expiresAt: Date.now() + UNFURL_CACHE_TTL_MS
      };
      unfurlCache.set(url, entry);
    }

    entry.promise.then((result) => {
      if (!isMounted) return;
      if (result && (result.title || result.description || result.image)) {
        setData(result);
        setError(false);
      } else {
        setError(true);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [url, accessToken]);

  if (loading) {
    return (
      <div className="link-unfurl-card is-loading" aria-label={copy.loadingLinkPreview}>
        <div className="link-unfurl-skeleton-header" />
        <div className="link-unfurl-skeleton-title" />
        <div className="link-unfurl-skeleton-description" />
      </div>
    );
  }

  if (error || !data) {
    return fallback ?? null;
  }

  const domain = getDomainName(data.url || url);
  const siteName = data.siteName || domain;

  return (
    <div className="link-unfurl-card" data-url={url}>
      <div className="link-unfurl-header">
        {data.favicon && (
          <img
            className="link-unfurl-favicon"
            src={data.favicon}
            alt=""
            aria-hidden="true"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
        )}
        <span className="link-unfurl-sitename">{siteName}</span>
      </div>

      <div className="link-unfurl-body">
        {data.title && (
          <a
            className="link-unfurl-title"
            href={data.url || url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {data.title}
          </a>
        )}
        {data.description && (
          <p className="link-unfurl-description">{data.description}</p>
        )}
      </div>

      {data.image && !imageError && (
        <div className="link-unfurl-image-container">
          <img
            className="link-unfurl-image"
            src={data.image}
            alt={data.title || "Link preview"}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageError(true)}
          />
        </div>
      )}
    </div>
  );
}
