import { expect, test } from "./fixtures";
import { prepareVisualScenario, type Scenario } from "./scenarios";

const VIEWPORTS: Array<{ id: string; width: number; height: number }> = [
  { id: "desktop-1440", width: 1440, height: 900 },
  { id: "tablet-1100", width: 1100, height: 900 },
  { id: "mobile-390", width: 390, height: 844 },
];

for (const vp of VIEWPORTS) {
  test(`emoji picker fills container width without trailing gap (${vp.id})`, async ({ page }, info) => {
    const scenario: Scenario = {
      id: `emoji-picker-${vp.id}`,
      viewport: { width: vp.width, height: vp.height },
      theme: "dark",
      locale: "en",
    };
    await prepareVisualScenario(page, scenario);
    await expect(page.locator("#msg-planning-kickoff .message-body")).toBeVisible();

    const emojiButton = page.locator(".message-composer .emoji-picker-button");
    await emojiButton.click();

    const emojiPicker = page.locator(".message-composer .emoji-picker").first();
    await expect(emojiPicker).toBeVisible();

    const metrics = await emojiPicker.evaluate((picker) => {
      const pickerRect = picker.getBoundingClientRect();
      const reactRoot = picker.querySelector(".EmojiPickerReact");
      const reactRect = reactRoot?.getBoundingClientRect() ?? null;
      const categoryContent = picker.querySelector(".epr-emoji-category-content");
      const categoryRect = categoryContent?.getBoundingClientRect() ?? null;
      return {
        pickerWidth: pickerRect.width,
        pickerRight: pickerRect.right,
        reactWidth: reactRect?.width ?? 0,
        reactRight: reactRect?.right ?? 0,
        categoryRight: categoryRect?.right ?? 0,
      };
    });

    const screenshotPath = info.outputPath(`${scenario.id}.png`);
    await emojiPicker.screenshot({ path: screenshotPath, animations: "disabled" });
    await info.attach(scenario.id, { path: screenshotPath, contentType: "image/png" });

    // The inner EmojiPickerReact root and category content must fill the popup
    // without leaving a large empty gap on the right side.
    expect(Math.abs(metrics.pickerWidth - metrics.reactWidth)).toBeLessThanOrEqual(2);
  });
}
