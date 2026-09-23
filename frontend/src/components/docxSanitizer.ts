const DOCX_ALLOWED_TAGS = new Set([
  "a", "blockquote", "br", "caption", "code", "em", "h1", "h2", "h3", "h4",
  "h5", "h6", "img", "li", "ol", "p", "pre", "span", "strong", "table", "tbody",
  "td", "th", "thead", "tr", "ul",
]);
const DOCX_GLOBAL_ATTRIBUTES = new Set(["class", "title"]);
const DOCX_TABLE_ATTRIBUTES = new Set(["colspan", "rowspan"]);

export function isSafeDocxURL(value: string, allowImageData: boolean): boolean {
  try {
    const url = new URL(value, window.location.origin);
    if (["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) return true;
    return allowImageData && /^data:image\/(?:png|gif|jpe?g|webp);base64,/i.test(value);
  } catch {
    return false;
  }
}

// Mammoth generates HTML from untrusted office documents. Keep its allowed
// output small and centralised; regexes cannot safely parse adversarial HTML.
export function sanitizeDocxHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    const tag = element.tagName.toLowerCase();
    if (!DOCX_ALLOWED_TAGS.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const allowed = DOCX_GLOBAL_ATTRIBUTES.has(name)
        || (tag === "a" && name === "href")
        || (tag === "img" && name === "src")
        || (["td", "th"].includes(tag) && DOCX_TABLE_ATTRIBUTES.has(name));
      if (!allowed || ((name === "href" || name === "src") && !isSafeDocxURL(attribute.value, tag === "img"))) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return template.innerHTML;
}
