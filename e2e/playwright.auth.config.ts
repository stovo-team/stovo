import { defineConfig } from '@playwright/test';
import visual from './playwright.visual.config';
import { readVisualOptions } from './tools/visual-options.mjs';

const options = readVisualOptions();
export default defineConfig({
  ...visual,
  webServer: {
    ...visual.webServer as object,
    command: `npm --prefix ../frontend run dev -- --host 127.0.0.1 --port ${options.port} --strictPort`,
    url: options.origin,
  },
});
