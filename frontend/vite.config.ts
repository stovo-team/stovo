import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const disableHmr = process.env.VITE_DISABLE_HMR === "true";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["frontend", ".loca.lt"],
    port: 5173,
    hmr: disableHmr ? false : undefined
  }
});
