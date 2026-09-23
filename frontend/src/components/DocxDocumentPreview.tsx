import { useEffect, useRef, useState } from "react";

const ALLOWED_TAGS = new Set([
  "a", "blockquote", "br", "caption", "code", "em", "h1", "h2", "h3", "h4",
  "h5", "h6", "img", "li", "ol", "p", "pre", "span", "strong", "table", "tbody",
  "td", "th", "thead", "tr", "ul",
]);
const GLOBAL_ATTRIBUTES = new Set(["class", "title"]);
const TABLE_ATTRIBUTES = new Set(["colspan", "rowspan"]);

function isSafeDocxURL(value: string, allowImageData: boolean): boolean {
  try {
    const url = new URL(value, window.location.origin);
    if (["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) return true;
    return allowImageData && /^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(value);
  } catch {
    return false;
  }
}

// Mammoth HTML is untrusted; strip unsupported elements and unsafe attributes.
export function sanitizeDocxHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const allowed = GLOBAL_ATTRIBUTES.has(name)
        || (tag === "a" && name === "href")
        || (tag === "img" && name === "src")
        || (["td", "th"].includes(tag) && TABLE_ATTRIBUTES.has(name));
      if (!allowed || ((name === "href" || name === "src") && !isSafeDocxURL(attribute.value, tag === "img"))) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return template.innerHTML;
}

export function DocxDocumentPreview({ blob }: { blob: Blob }) {
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
