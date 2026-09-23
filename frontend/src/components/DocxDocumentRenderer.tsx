import { useEffect, useRef, useState } from "react";
import { isSafeDocxURL } from "./docxSanitizer";

export function DocxDocumentRenderer({ blob }: { blob: Blob }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    setError(null);

    void (async () => {
      const stagingHost = document.createElement("div");
      try {
        const docx = await import("docx-preview");
        await docx.renderAsync(blob, stagingHost, stagingHost, {
          className: "stovo-docx",
          useBase64URL: true,
          renderAltChunks: false,
        });
        if (cancelled) return;
        for (const link of Array.from(stagingHost.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
          if (!isSafeDocxURL(link.href, false)) link.removeAttribute("href");
        }
        host.replaceChildren(...Array.from(stagingHost.childNodes));
      } catch (err) {
        console.error("Failed to render DOCX preview:", err);
        if (!cancelled) setError("Document couldn’t be rendered on this device.");
      }
    })();

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [blob]);

  return (
    <div className="document-viewer-docx" ref={hostRef}>
      {error && <div className="document-preview-error" role="alert">{error}</div>}
    </div>
  );
}
