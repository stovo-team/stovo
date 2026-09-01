import { useEffect, useState } from "react";
import { fetchUnfurlData, type UnfurlData } from "../api/unfurl";

const unfurlCache = new Map<string, Promise<UnfurlData | null>>();

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
  accessToken
}: {
  url: string;
  accessToken: string | null;
}) {
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

    let promise = unfurlCache.get(url);
    if (!promise) {
      promise = fetchUnfurlData(url, accessToken).catch(() => null);
      unfurlCache.set(url, promise);
    }

    promise.then((result) => {
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
      <div className="link-unfurl-card is-loading" aria-label="Loading link preview">
        <div className="link-unfurl-skeleton-header" />
        <div className="link-unfurl-skeleton-title" />
        <div className="link-unfurl-skeleton-description" />
      </div>
    );
  }

  if (error || !data) {
    return null;
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
    </div>
  );
}
