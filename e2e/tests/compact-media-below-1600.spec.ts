import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { readCssSource } from "../../frontend/src/test/cssSource";

const repoRoot = resolve(process.cwd(), "..");
const evidenceDir = resolve(repoRoot, "artifacts/agent-workflows/compact-media-below-1600");

function svg(width: number, height: number, label: string, fill: string) {
  return encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${fill}"/><text x="50%" y="50%" fill="white" font-size="48" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${label}</text></svg>`
  );
}

test("media and document previews scale by width and keep their ratio below 1600px", async ({ page }) => {
  const styles = readCssSource(resolve(repoRoot, "frontend/src/styles.css"));
  mkdirSync(evidenceDir, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(`
    <!doctype html>
    <html data-platform="web">
      <head><style>${styles}</style></head>
      <body style="margin:0;background:#16131f;">
        <main class="messages-panel" style="width:980px;padding:24px;box-sizing:border-box;">
          <p id="caption" style="color:#f4f1ff;font:600 16px/1.4 sans-serif;margin:0 0 12px;"></p>
          <div class="message-bubble has-photo-attachments" data-case="wide">
            <div class="message-attachments">
              <button type="button" class="message-photo-attachment">
                <img alt="wide photo" width="1600" height="280" src="data:image/svg+xml,${svg(1600, 280, "wide photo", "#6c5ce7")}" />
              </button>
            </div>
          </div>
          <div class="message-bubble has-photo-attachments" data-case="portrait" style="margin-top:12px;">
            <div class="message-attachments">
              <button type="button" class="message-photo-attachment">
                <img alt="portrait photo" width="600" height="1000" src="data:image/svg+xml,${svg(600, 1000, "portrait", "#a29bfe")}" />
              </button>
            </div>
          </div>
          <div class="message-bubble has-photo-attachments" data-case="video" style="margin-top:12px;">
            <div class="message-attachments">
              <article class="message-video-attachment">
                <div class="video-player is-landscape" style="--video-aspect-ratio: 16 / 9; background:#0984e3; color:#fff; display:grid; place-items:center; font:600 18px sans-serif;">16:9 video</div>
              </article>
            </div>
          </div>
          <div class="message-bubble" data-case="document" style="margin-top:12px;">
            <div class="message-attachments">
              <div class="document-preview-card document-preview-card--inline">
                <div class="document-inline-preview">
                  <img class="document-viewer-pdf-page" alt="document page" width="800" height="1131" src="data:image/svg+xml,${svg(800, 1131, "notes.pdf", "#2d3436")}" />
                </div>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `);

  const measured = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement;
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    };
    const wide = box('[data-case="wide"] img');
    const portrait = box('[data-case="portrait"] img');
    const video = box('[data-case="video"] .video-player');
    const documentPage = box('[data-case="document"] img');
    const caption = document.querySelector("#caption") as HTMLElement;
    caption.textContent = `1440×900 · wide ${Math.round(wide.width)}×${Math.round(wide.height)} · portrait ${Math.round(portrait.width)}×${Math.round(portrait.height)} · video ${Math.round(video.width)}×${Math.round(video.height)} · page ${Math.round(documentPage.width)}×${Math.round(documentPage.height)}`;
    return { wide, portrait, video, documentPage };
  });

  const ratio = (size: { width: number; height: number }) => size.height / size.width;
  expect(measured.wide.width).toBeLessThanOrEqual(420.5);
  expect(measured.portrait.width).toBeLessThanOrEqual(420.5);
  expect(measured.video.width).toBeLessThanOrEqual(420.5);
  expect(measured.documentPage.width).toBeLessThanOrEqual(420.5);
  expect(ratio(measured.wide)).toBeCloseTo(280 / 1600, 2);
  expect(ratio(measured.portrait)).toBeCloseTo(1000 / 600, 2);
  expect(ratio(measured.video)).toBeCloseTo(9 / 16, 2);
  expect(ratio(measured.documentPage)).toBeCloseTo(1131 / 800, 2);
  expect(measured.portrait.width).toBeLessThan(measured.portrait.height);

  await page.screenshot({
    path: resolve(evidenceDir, "after-ratio-1440x900-web.png"),
    fullPage: true,
  });
});
