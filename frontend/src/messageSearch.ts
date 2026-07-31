export type MessageSearchOptions = {
  wholeWord?: boolean;
  caseSensitive?: boolean;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function messageMatchesSearch(
  content: string,
  query: string,
  options: MessageSearchOptions
) {
  if (!query) {
    return true;
  }

  const haystack = options.caseSensitive ? content : content.toLocaleLowerCase();
  const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
  if (!options.wholeWord) {
    return haystack.includes(needle);
  }

  return new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escapeRegExp(needle)}(?=$|[^\\p{L}\\p{N}_])`,
    "u"
  ).test(haystack);
}
