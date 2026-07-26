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
    hmr: disableHmr ? false : undefined
  }
});
