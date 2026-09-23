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
      playerInsets: { left: player.left - bubble.left, right: bubble.right - player.right },
      controls: { left: controls.left, right: controls.right, width: controls.width },
      controlsChildren: controlsChildren.map(({ left, right }) => ({ left, right })),
    };
  });

  expect(bounds.bubble.width).toBeGreaterThan(0);
  expect(bounds.playerInsets.left).toBeGreaterThanOrEqual(7.5);
  expect(bounds.playerInsets.right).toBeGreaterThanOrEqual(7.5);
  expect(bounds.player.left).toBeGreaterThanOrEqual(bounds.bubble.left);
  expect(bounds.player.right).toBeLessThanOrEqual(bounds.bubble.right + 0.5);
  expect(bounds.controls.left).toBeGreaterThanOrEqual(bounds.player.left);
  expect(bounds.controls.right).toBeLessThanOrEqual(bounds.player.right + 0.5);
  for (const child of bounds.controlsChildren) {
    expect(child.left).toBeGreaterThanOrEqual(bounds.controls.left);
    expect(child.right).toBeLessThanOrEqual(bounds.controls.right + 0.5);
    expect(child.right).toBeLessThanOrEqual(bounds.player.right + 0.5);
  }
});

test('expanded video stays viewport-centered above transformed chat layers', async ({ page }) => {
  const styles = readFileSync(resolve(process.cwd(), '..', 'frontend', 'src', 'styles.css'), 'utf8');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.setContent(`
    <!doctype html>
    <html><head><style>${styles}</style></head><body>
      <div class="message-bubble" style="position:absolute;left:80px;top:50px;width:640px;height:360px;transform:translate3d(32px,12px,0);z-index:1">
        <dialog class="video-player is-expanded" style="width:640px;height:360px;aspect-ratio:16/9">
          <video></video>
          <div class="video-player-controls">
            <button type="button" autofocus aria-label="First dialog control">First</button>
            <button type="button" aria-label="Last dialog control">Last</button>
          </div>
        </dialog>
      </div>
      <button type="button" aria-label="Open video viewer">Open</button>
      <div style="position:fixed;inset:0;z-index:2147483647;background:transparent"></div>
    </body></html>
  `);
  const closedBounds = await page.locator('.video-player').evaluate((player) => {
    const bounds = player.getBoundingClientRect();
    return { display: getComputedStyle(player).display, width: bounds.width, height: bounds.height };
  });
  expect(closedBounds.display).toBe('block');
  expect(closedBounds.width).toBeGreaterThan(0);
  expect(closedBounds.height).toBeGreaterThan(0);

  const trigger = page.getByRole('button', { name: 'Open video viewer' });
  await trigger.focus();
  await page.locator('.video-player').evaluate((player) => {
    player.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const controls = player.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    });
    (player as HTMLDialogElement).showModal();
  });
  const firstControl = page.getByRole('button', { name: 'First dialog control' });
  const lastControl = page.getByRole('button', { name: 'Last dialog control' });
  await expect(firstControl).toBeFocused();

  const result = await page.locator('.video-player').evaluate((player) => {
    const bounds = player.getBoundingClientRect();
    const centerElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    return {
      centerX: bounds.left + bounds.width / 2,
      centerY: bounds.top + bounds.height / 2,
      open: (player as HTMLDialogElement).open,
      ownsViewportCenter: centerElement === player || player.contains(centerElement),
    };
  });

  expect(result.open).toBe(true);
  expect(result.centerX).toBeCloseTo(640, 0);
  expect(result.centerY).toBeCloseTo(360, 0);
  expect(result.ownsViewportCenter).toBe(true);

  await lastControl.focus();
  await page.keyboard.press('Tab');
  await expect(firstControl).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(lastControl).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.video-player')).not.toHaveJSProperty('open', true);
  await expect(trigger).toBeFocused();
});
