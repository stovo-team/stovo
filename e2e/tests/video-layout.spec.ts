import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('inline video controls stay within a narrow message bubble', async ({ page }) => {
  const styles = readFileSync(resolve(process.cwd(), '..', 'frontend', 'src', 'styles.css'), 'utf8');
  await page.setViewportSize({ width: 320, height: 640 });
  await page.setContent(`
    <!doctype html>
    <html data-platform="web">
      <head><style>${styles}</style></head>
      <body>
        <main class="messages-panel">
          <div class="message-bubble has-photo-attachments">
            <div class="message-attachments">
              <article class="message-video-attachment">
                <div class="video-player is-landscape" style="height: 180px">
                  <video></video>
                  <div class="video-player-controls" aria-label="Video controls">
                    <input type="range" aria-label="Seek video" />
                    <button type="button" aria-label="Play video">Play</button>
                    <output>0:00 / 12:34</output>
                    <button type="button" aria-label="Mute video">Mute</button>
                    <button type="button" aria-label="Open video viewer">Open</button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </main>
      </body>
    </html>
  `);

  const bounds = await page.evaluate(() => {
    const bubble = document.querySelector('.message-bubble')!.getBoundingClientRect();
    const player = document.querySelector('.video-player')!.getBoundingClientRect();
    const controls = document.querySelector('.video-player-controls')!.getBoundingClientRect();
    const controlsChildren = [...document.querySelectorAll('.video-player-controls > *')]
      .map((element) => element.getBoundingClientRect());
    return {
      bubble: { left: bubble.left, right: bubble.right, width: bubble.width },
      player: { left: player.left, right: player.right, width: player.width },
      controls: { left: controls.left, right: controls.right, width: controls.width },
      controlsChildren: controlsChildren.map(({ left, right }) => ({ left, right })),
    };
  });

  expect(bounds.bubble.width).toBeGreaterThan(0);
  expect(bounds.player.left).toBeGreaterThanOrEqual(bounds.bubble.left);
  expect(bounds.player.right).toBeLessThanOrEqual(bounds.bubble.right + 0.5);
  expect(bounds.controls.left).toBeGreaterThanOrEqual(bounds.player.left);
  expect(bounds.controls.right).toBeLessThanOrEqual(bounds.player.right + 0.5);
  for (const child of bounds.controlsChildren) {
    expect(child.left).toBeGreaterThanOrEqual(bounds.controls.left);
    expect(child.right).toBeLessThanOrEqual(bounds.controls.right + 0.5);
  }
});
