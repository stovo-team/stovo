/// <reference types="vitest/config" />
import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const disableHmr = process.env.VITE_DISABLE_HMR === "true";

function bundlePdfJsSupportAssets() {
  return {
    name: "bundle-pdfjs-support-assets",
    writeBundle() {
      const distPdfJs = fileURLToPath(new URL("./dist/pdfjs/", import.meta.url));
      const packageRoot = new URL("./node_modules/pdfjs-dist/", import.meta.url);

      // PDF.js loads character maps and fallback fonts at runtime. Keep them
      // in the app bundle so the Android WebView never relies on a CDN.
      cpSync(fileURLToPath(new URL("cmaps/", packageRoot)), `${distPdfJs}cmaps`, {
        recursive: true,
      });
      cpSync(
        fileURLToPath(new URL("standard_fonts/", packageRoot)),
        `${distPdfJs}standard_fonts`,
        { recursive: true },
      );
    },
  };
}

export default defineConfig({
  cacheDir: process.env.STOVO_VITE_CACHE_DIR || undefined,
  plugins: [react(), bundlePdfJsSupportAssets()],
  test: {
    // Self-hosted CI shares memory with other jobs; avoid a worker per CPU.
    maxWorkers: process.env.CI ? 1 : undefined,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["frontend", ".loca.lt", "stovo-cloud.stovo.ru"],
    port: 5173,
    hmr: disableHmr ? false : undefined,
    proxy: {
      "/api/v1/master": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:8000",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
