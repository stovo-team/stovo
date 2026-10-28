import {test,expect} from './fixtures';
import {prepareVisualScenario,screenshot,type Scenario} from './scenarios';

test('V-17 tablet chat list stays compact and keeps the new-chat button in its panel', async ({ page }, info) => {
  const s: Scenario = { id: 'V-17', viewport: { width: 1024, height: 900 }, theme: 'dark', locale: 'en' };
  await prepareVisualScenario(page, s, '/app/chats');
  const compose = page.locator('.compose-fab');
  await expect(compose).toBeVisible();

  const geometry = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const rect = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    };
    const filters = document.querySelector<HTMLElement>('.chat-list-filters')!;
    return {
      sidebar: bounds('.chat-sidebar'),
      compose: bounds('.compose-fab'),
      search: bounds('.chat-list-search'),
      filters: bounds('.chat-list-filters'),
      chat: bounds('.chat-list-item'),
      detail: bounds('.chat-detail'),
      composePosition: getComputedStyle(document.querySelector('.compose-fab')!).position,
      filterOverflow: getComputedStyle(filters).overflowX,
      filterScrollWidth: filters.scrollWidth,
      filterClientWidth: filters.clientWidth,
    };
  });

  await screenshot(page, info, s);
  expect(geometry.sidebar.width).toBeLessThanOrEqual(280);
  expect(geometry.composePosition).toBe('absolute');
  expect(geometry.compose.right).toBeLessThanOrEqual(geometry.sidebar.right);
  expect(geometry.search.right).toBeLessThanOrEqual(geometry.sidebar.right);
  expect(geometry.filters.right).toBeLessThanOrEqual(geometry.sidebar.right);
  expect(geometry.chat.right).toBeLessThanOrEqual(geometry.sidebar.right);
  expect(geometry.filterOverflow).toMatch(/auto|scroll/);
  expect(geometry.filterScrollWidth).toBeGreaterThan(geometry.filterClientWidth);
  expect(geometry.detail.left).toBeGreaterThanOrEqual(geometry.sidebar.right);
  expect(geometry.detail.width).toBeGreaterThan(0);
});

test.describe('V-18 narrow desktop chat list', () => {
  test.use({ viewport: { width: 512, height: 768 }, deviceScaleFactor: 2 });

  test('keeps the new-chat button beside the compact list at 2x scale', async ({ page }, info) => {
    const s: Scenario = { id: 'V-18', viewport: { width: 512, height: 768 }, theme: 'dark', locale: 'en' };
    await prepareVisualScenario(page, s, '/app/chats');
    await expect(page.locator('.compose-fab')).toBeVisible();

    const geometry = await page.evaluate(() => {
      const bounds = (selector: string) => {
        const rect = document.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      };
      return {
        sidebar: bounds('.chat-sidebar'),
        compose: bounds('.compose-fab'),
        search: bounds('.chat-list-search'),
        filters: bounds('.chat-list-filters'),
        chat: bounds('.chat-list-item'),
        detail: bounds('.chat-detail'),
        emptyState: bounds('.chat-empty-state-wrapper'),
        emptyCard: bounds('.chat-empty-state-card'),
        composePosition: getComputedStyle(document.querySelector('.compose-fab')!).position,
        detailVisibility: getComputedStyle(document.querySelector('.chat-detail')!).visibility,
        filterOverflow: getComputedStyle(document.querySelector('.chat-list-filters')!).overflowX,
        composeHitTarget: (() => {
          const compose = document.querySelector<HTMLElement>('.compose-fab')!;
          const rect = compose.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return hit === compose || compose.contains(hit);
        })(),
      };
    });

    await screenshot(page, info, s);
    expect(geometry.sidebar.width).toBeLessThanOrEqual(280);
    expect(geometry.composePosition).toBe('absolute');
    expect(geometry.compose.left).toBeGreaterThanOrEqual(geometry.sidebar.left);
    expect(geometry.compose.right).toBeLessThanOrEqual(geometry.sidebar.right);
    expect(geometry.compose.right).toBeLessThanOrEqual(s.viewport.width);
    expect(geometry.compose.left).toBeGreaterThanOrEqual(0);
    expect(geometry.composeHitTarget).toBe(true);
    expect(geometry.search.right).toBeLessThanOrEqual(geometry.sidebar.right);
    expect(geometry.chat.right).toBeLessThanOrEqual(geometry.sidebar.right);
    expect(geometry.filters.right).toBeLessThanOrEqual(geometry.sidebar.right);
    expect(geometry.filterOverflow).toMatch(/auto|scroll/);
    expect(geometry.detail.left).toBeGreaterThanOrEqual(geometry.sidebar.right);
    expect(geometry.detail.width).toBeGreaterThan(0);
    expect(geometry.detailVisibility).toBe('visible');
    expect(Math.abs((geometry.emptyState.left + geometry.emptyState.right) / 2 - (geometry.detail.left + geometry.detail.right) / 2)).toBeLessThanOrEqual(1);
    expect(geometry.emptyCard.width).toBeLessThanOrEqual(geometry.detail.width);
  });
});

test('V-13 new chat opens as a full-screen page on a phone',async({page},info)=>{
 const s:Scenario={id:'V-13',viewport:{width:390,height:844},theme:'dark',locale:'ru'};
 await prepareVisualScenario(page,s,'/app/chats');
 await page.locator('.compose-fab').click();
 const dialog=page.locator('.popup-dialog.new-chat-screen');
 await expect(dialog).toBeVisible();
 const bounds=await dialog.boundingBox();
 expect(bounds).not.toBeNull();
 expect(bounds!.x).toBe(0);
 expect(bounds!.y).toBe(0);
 expect(bounds!.width).toBe(s.viewport.width);
 expect(bounds!.height).toBe(s.viewport.height);
 expect(parseFloat(await dialog.evaluate((node) => getComputedStyle(node).borderTopLeftRadius))).toBeGreaterThanOrEqual(16);
 expect(await dialog.evaluate((node) => getComputedStyle(node).borderWidth)).toBe('0px');
 expect(await dialog.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
 await screenshot(page,info,s);
});

test('V-14 file tiles form two 120px columns on a narrow phone',async({page},info)=>{
 const s:Scenario={id:'V-14',viewport:{width:320,height:844},theme:'dark',locale:'ru'};
 await prepareVisualScenario(page,s,'/app/files');
 const tiles=page.locator('.storage-grid .storage-tile');
 await expect(tiles.first()).toBeVisible();
 await expect.poll(()=>tiles.count()).toBeGreaterThanOrEqual(2);
 const first=await tiles.nth(0).boundingBox();
 const second=await tiles.nth(1).boundingBox();
 expect(first).not.toBeNull();expect(second).not.toBeNull();
 expect(first!.width).toBe(120);expect(first!.height).toBe(120);
 expect(await tiles.first().evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none');
 expect(second!.width).toBe(120);expect(second!.y).toBe(first!.y);
 expect(second!.x-first!.x).toBeGreaterThanOrEqual(120);
 await screenshot(page,info,s);
});

test('V-15 canvas message preview is compact on a phone',async({page},info)=>{
 const s:Scenario={id:'V-15',viewport:{width:390,height:844},theme:'dark',locale:'en',state:'mobile-layout-canvas'};
 await prepareVisualScenario(page,s);
 const card=page.locator('.canvas-card-bubble');
 await expect(card).toBeVisible();
 const cardBounds=await card.boundingBox();
 const previewBounds=await card.locator('.canvas-card-bubble-preview').boundingBox();
 expect(cardBounds).not.toBeNull();expect(previewBounds).not.toBeNull();
 expect(cardBounds!.width).toBeLessThanOrEqual(280);
 expect(previewBounds!.height).toBeLessThanOrEqual(120);
 expect(cardBounds!.x + cardBounds!.width).toBeLessThanOrEqual(s.viewport.width);
 expect(await card.evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none');
 await screenshot(page,info,s);
});

test('V-16 guest meeting actions stay equal and distinct on a narrow phone',async({page},info)=>{
 const s:Scenario={id:'V-16',viewport:{width:320,height:844},theme:'light',locale:'ru',state:'mobile-layout-meetup'};
 await prepareVisualScenario(page,s);
 const invitations=page.locator('.guest-meeting-invitation');
 await expect(invitations).toHaveCount(2);
 await expect(page.locator('.guest-meeting-invitation-join')).toHaveCount(2);
 await expect(page.locator('.guest-meeting-invitation-plan')).toHaveCount(2);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for (let index = 0; index < await invitations.count(); index++) {
  const invitation = invitations.nth(index);
  const join = invitation.locator('.guest-meeting-invitation-join');
  const plan = invitation.locator('.guest-meeting-invitation-plan');
  const joinStyle = await join.evaluate((node) => getComputedStyle(node));
  const planStyle = await plan.evaluate((node) => getComputedStyle(node));
  const joinBounds = await join.boundingBox();
  const planBounds = await plan.boundingBox();
  expect(joinBounds).not.toBeNull();
  expect(planBounds).not.toBeNull();
  expect(Math.abs(joinBounds!.width - planBounds!.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(joinBounds!.y - planBounds!.y)).toBeLessThanOrEqual(1);
  expect(await join.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('nowrap');
  expect(await join.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await plan.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  const bubbleBackground = await invitation.evaluate((node) => getComputedStyle(node.closest('.message-bubble')!).backgroundColor);
  expect(parseFloat(joinStyle.borderTopLeftRadius)).toBeGreaterThanOrEqual(22);
  expect(parseFloat(planStyle.borderTopLeftRadius)).toBeGreaterThanOrEqual(22);
  expect(joinStyle.backgroundColor).not.toBe(bubbleBackground);
  expect(planStyle.backgroundColor).not.toBe(bubbleBackground);
  expect(joinStyle.backgroundColor).not.toBe(planStyle.backgroundColor);
  expect(await invitation.locator('.guest-meeting-invitation-icon').evaluate((node) => getComputedStyle(node).boxShadow)).toBe('none');
 }
 await screenshot(page,info,s);
});
