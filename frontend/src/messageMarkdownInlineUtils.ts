const plainLinkPrefixes = ["https://", "http://", "mailto:"];

export function hasPlainLinkPrefixAt(source: string, start: number): boolean {
  return plainLinkPrefixes.some((prefix) =>
    source.slice(start, start + prefix.length).toLowerCase() === prefix
  );
}

export function inlineTokenEnd(source: string, start: number): number {
  let end = start;
  while (end < source.length && !/[\s<>"']/.test(source[end])) end += 1;
  return end;
}
