import {test,expect} from './fixtures';
import {prepareVisualScenario,screenshot,type Scenario} from './scenarios';

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
 await screenshot(page,info,s);
});

test('V-16 guest meeting actions stay distinct on a phone',async({page},info)=>{
 const s:Scenario={id:'V-16',viewport:{width:390,height:844},theme:'light',locale:'ru',state:'mobile-layout-meetup'};
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
  const bubbleBackground = await invitation.evaluate((node) => getComputedStyle(node.closest('.message-bubble')!).backgroundColor);
  expect(parseFloat(joinStyle.borderTopLeftRadius)).toBeGreaterThanOrEqual(22);
  expect(parseFloat(planStyle.borderTopLeftRadius)).toBeGreaterThanOrEqual(22);
  expect(joinStyle.backgroundColor).not.toBe(bubbleBackground);
  expect(planStyle.backgroundColor).not.toBe(bubbleBackground);
  expect(joinStyle.backgroundColor).not.toBe(planStyle.backgroundColor);
 }
 await screenshot(page,info,s);
});
