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
    // Limit CI concurrency to keep memory available on the shared self-hosted E2E runners.
    maxWorkers: process.env.CI
      ? process.env.VITEST_MAX_WORKERS
        ? Number(process.env.VITEST_MAX_WORKERS)
        : 2
      : undefined,
    environment: "jsdom",
    environmentMatchGlobs: [
      ["src/styles.*.test.ts", "node"],
      ["src/PopupMigrations.*.styles.test.ts", "node"],
      ["src/design-system/*.test.ts", "node"],
      ["src/mediaBlobCache.test.ts", "node"],
      ["src/callHistory.test.ts", "node"],
      ["src/sharedFileQueue.test.ts", "node"],
      ["src/messageMediaAlbum.test.ts", "node"],
      ["src/audioNativeBridge.test.ts", "node"],
      ["src/audioRestore.test.ts", "node"],
      ["src/audioDurationCache.test.ts", "node"],
      ["src/notificationActions.test.ts", "node"],
      ["src/App.route-motion.test.ts", "node"],
      ["src/videoPiPBridge.test.ts", "node"],
      ["vite.config.test.ts", "node"],
    ],
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
