import { expect, test } from "@playwright/test";

const fixtures = [
  { id: "photo", content: ".storage-preview-media > img" },
  { id: "video", content: ".video-player" },
  { id: "report", content: ".document-preview-card--inline", pdf: true },
  { id: "notes", content: ".document-preview-card--inline" },
];

for (const viewport of [{ width: 1400, height: 900 }, { width: 964, height: 530 }]) {
  test.describe(`Storage preview at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, colorScheme: "dark" });

    for (const fixture of fixtures) {
      test(`${fixture.id} stays right aligned and enlarges its content`, async ({ page }, testInfo) => {
        await page.goto("/app/files");
        await page.locator(`[data-storage-file-id="mock-storage-preview-${fixture.id}"]`).click();
        const dialog = page.locator(".storage-preview-dialog");
        const media = dialog.locator(".storage-preview-media");
        const content = dialog.locator(fixture.content);
        await expect(content).toBeVisible();
        if (fixture.id === "video") {
          await expect.poll(() => dialog.locator("video").evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0);
        }
        if (fixture.id === "photo") {
          await expect.poll(() => content.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
        }
        if (fixture.pdf) {
          const pageCanvas = dialog.locator("canvas");
          await expect(pageCanvas).toBeVisible();
          expect((await pageCanvas.boundingBox())!.width).toBeGreaterThan(400);
        }
        const regular = (await content.boundingBox())!;
        expect(regular.width).toBeGreaterThan(fixture.id === "photo" ? 480 : 550);
        const regularDialog = (await dialog.boundingBox())!;
        expect(viewport.width - regularDialog.x - regularDialog.width).toBeCloseTo(24, 0);
        await page.screenshot({ path: testInfo.outputPath(`${fixture.id}-regular.png`) });

        await dialog.getByRole("button", { name: "Full screen", exact: true }).click();
        const enlarged = (await content.boundingBox())!;
        expect(enlarged.width).toBeGreaterThan(regular.width + 30);
        expect(enlarged.height).toBeGreaterThan(regular.height + 30);
        const enlargedDialog = (await dialog.boundingBox())!;
        expect(enlargedDialog.y).toBeGreaterThanOrEqual(15);
        expect(enlargedDialog.y + enlargedDialog.height).toBeLessThanOrEqual(viewport.height - 15);
        expect(viewport.width - enlargedDialog.x - enlargedDialog.width).toBeCloseTo(16, 0);
        const mediaBounds = (await media.boundingBox())!;
        const actions = (await dialog.locator(".storage-preview-actions").boundingBox())!;
        expect(actions.x).toBeGreaterThanOrEqual(mediaBounds.x);
        expect(actions.x + actions.width).toBeLessThanOrEqual(mediaBounds.x + mediaBounds.width + 1);
        if (fixture.pdf) {
          expect((await dialog.locator("canvas").boundingBox())!.width).toBeGreaterThan(400);
        }
        await page.screenshot({ path: testInfo.outputPath(`${fixture.id}-enlarged.png`) });
        await dialog.getByRole("button", { name: "Full screen", exact: true }).click();
        expect((await content.boundingBox())!.width).toBeCloseTo(regular.width, 0);
        await dialog.getByRole("button", { name: "More actions", exact: true }).click();
        await expect(dialog.getByRole("button", { name: "Metadata", exact: true })).toBeVisible();
      });
    }
  });
}
