import { expect, test } from './fixtures';
import { prepareVisualScenario, screenshot, type Scenario } from './scenarios';

for (const platform of ['web', 'native'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`mobile bottom nav keeps active background and colored state (${platform}, ${theme})`, async ({ page }, info) => {
      const scenario: Scenario = {
        id: `bottom-nav-active-${platform}-${theme}`,
        viewport: { width: 390, height: 844 },
        theme,
        locale: 'en',
      };

      await prepareVisualScenario(page, scenario, '/app/chats');

      if (platform === 'native') {
        await page.evaluate(() => {
          document.documentElement.dataset.platform = 'native';
        });
      }

      const inspectActiveNav = async () =>
        page.evaluate(() => {
          const nav = document.querySelector<HTMLElement>('.app-frame:not(.has-active-chat) > .app-nav');
          const activeLink = nav?.querySelector<HTMLAnchorElement>('a.active[aria-current="page"]');
          if (!nav || !activeLink) {
            return { found: false };
          }
          const beforeStyle = getComputedStyle(activeLink, '::before');
          const linkStyle = getComputedStyle(activeLink);
          const svg = activeLink.querySelector('svg');
          const svgStyle = svg ? getComputedStyle(svg) : null;
          const label = activeLink.querySelector('span');
          const labelStyle = label ? getComputedStyle(label) : null;
          return {
            found: true,
            href: activeLink.getAttribute('href'),
            beforeContent: beforeStyle.content,
            beforeDisplay: beforeStyle.display,
            beforeWidth: parseFloat(beforeStyle.width),
            beforeHeight: parseFloat(beforeStyle.height),
            beforeBgImage: beforeStyle.backgroundImage,
            beforeBgColor: beforeStyle.backgroundColor,
            beforeZIndex: beforeStyle.zIndex,
            linkColor: linkStyle.color,
            svgColor: svgStyle?.color ?? null,
            svgZIndex: svgStyle?.zIndex ?? null,
            labelColor: labelStyle?.color ?? null,
          };
        });

      const chatsState = await inspectActiveNav();
      expect(chatsState.found).toBe(true);
      expect(chatsState.beforeContent).not.toBe('none');
      expect(chatsState.beforeDisplay).not.toBe('none');
      expect(chatsState.beforeWidth).toBeGreaterThanOrEqual(40);
      expect(chatsState.beforeHeight).toBeGreaterThanOrEqual(40);
      expect(
        chatsState.beforeBgImage !== 'none' || chatsState.beforeBgColor !== 'rgba(0, 0, 0, 0)'
      ).toBe(true);

      // Navigate to Files tab and verify active state persists after route transition
      await page.locator('.app-nav a[href$="/app/files"]').click();
      await page.waitForURL('**/app/files');
      await page.waitForTimeout(350);

      const filesState = await inspectActiveNav();
      expect(filesState.found).toBe(true);
      expect(filesState.href).toContain('/app/files');
      expect(filesState.beforeContent).not.toBe('none');
      expect(filesState.beforeDisplay).not.toBe('none');
      expect(filesState.beforeWidth).toBeGreaterThanOrEqual(40);
      expect(filesState.beforeHeight).toBeGreaterThanOrEqual(40);
      expect(
        filesState.beforeBgImage !== 'none' || filesState.beforeBgColor !== 'rgba(0, 0, 0, 0)'
      ).toBe(true);

      await screenshot(page, info, scenario);
    });
  }
}
