import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const caddyfile = readFileSync("../deploy/caddy/Caddyfile", "utf8");
const nginxConfig = readFileSync("nginx.conf", "utf8");

function cspDirective(name: string): string {
  const match = caddyfile.match(/Content-Security-Policy "([^"]+)"/);
  const directive = match?.[1]
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  return directive ?? "";
}

describe("frontend deployment asset policy", () => {
  it("allows the configured Material Symbols stylesheet and font hosts", () => {
    expect(cspDirective("style-src")).toContain("https://fonts.googleapis.com");
    expect(cspDirective("font-src")).toContain("https://fonts.gstatic.com");
  });

  it("serves PDF.js module workers with a JavaScript MIME type at both proxy layers", () => {
    expect(nginxConfig).toMatch(/location ~ \^\/assets\/\.\*\\\.mjs\$[\s\S]*?default_type application\/javascript;/);
    expect(caddyfile).toMatch(/@pdfModuleWorker path_regexp pdfModuleWorker \\\.mjs\$[\s\S]*?header @pdfModuleWorker Content-Type application\/javascript/);
  });
});
