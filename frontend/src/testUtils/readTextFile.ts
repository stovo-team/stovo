import { readFileSync } from "node:fs";

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function readTextFile(path: string): string {
  return normalizeLineEndings(readFileSync(path, "utf8"));
}
