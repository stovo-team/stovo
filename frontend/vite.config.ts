/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const disableHmr = process.env.VITE_DISABLE_HMR === "true";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
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
