import { expect, test } from './fixtures';
import { prepareVisualScenario, screenshot, type Scenario } from './scenarios';

test.describe('mobile chats list tab transition', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('switching to chats list uses the same tab carousel animation as other pages without stacking chat-sidebar slide', async ({ page }, info) => {
    const scenario: Scenario = {
      id: 'V-mobile-chats-tab-transition',
      viewport: { width: 390, height: 844 },
      theme: 'dark',
      locale: 'en',
    };

    await prepareVisualScenario(page, scenario, '/app/plans');

    const readAnimationDetails = async (selector: string) =>
      page.evaluate((sel) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return null;
        const style = getComputedStyle(el);
        return {
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          animationTimingFunction: style.animationTimingFunction,
        };
      }, selector);

    // 1. Switch Plans -> Files (baseline "back" tab transition on another page)
    await page.locator('.app-nav a[href="/app/files"]').click();
    await page.waitForURL('**/app/files');
    const filesAnim = await readAnimationDetails('.app-shell > :not(.app-nav)');
    expect(filesAnim).not.toBeNull();
    expect(filesAnim?.animationName).toBe('app-tab-carousel-back');

    // 2. Switch Files -> Chats list ("back" tab transition to Chats)
    await page.locator('.app-nav a[href="/app/chats"]').click();
    await page.waitForURL('**/app/chats');
    const chatsWorkspaceAnim = await readAnimationDetails('.app-shell > :not(.app-nav)');
    const chatSidebarAnim = await readAnimationDetails('.messenger-shell.chat-list-view .chat-sidebar');

    expect(chatsWorkspaceAnim).not.toBeNull();
    expect(chatsWorkspaceAnim?.animationName).toBe(filesAnim?.animationName);
    expect(chatsWorkspaceAnim?.animationDuration).toBe(filesAnim?.animationDuration);
    expect(chatsWorkspaceAnim?.animationTimingFunction).toBe(filesAnim?.animationTimingFunction);

    // The inner chat-list-slide-in-from-left animation must NOT stack on top of app-tab-carousel-back.
    expect(chatSidebarAnim?.animationName).toBe('none');

    // Wait for the transition to settle and capture screenshot evidence of the mobile chats list view.
    await expect(page.locator('.messenger-shell.chat-list-view .chat-sidebar')).toBeVisible();
    await screenshot(page, info, scenario);
  });
});
