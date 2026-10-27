import {test,expect} from './fixtures';import {prepareVisualScenario,screenshot,type Scenario} from './scenarios';
test('V-12 section settings with long Russian text and keyboard controls',async({page},info)=>{
 const s:Scenario={id:'V-12',viewport:{width:390,height:844},theme:'light',locale:'ru'};
 await prepareVisualScenario(page,s,'/app/chats');
 const open=page.locator('.chat-list-section:not(.chat-list-section--quick-access) .chat-folder-controls button').first();await expect(open).toBeVisible();await open.focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog');await expect.soft(dialog.locator('#chat-folder-title')).toHaveText('Настройки папки');
 const field=dialog.getByRole('textbox',{name:'Название папки',exact:true});await expect(field).toBeFocused();await field.fill('Очень длинное синтетическое название раздела для проверки');
 const body=dialog.locator('.chat-folder-body');const form=dialog.locator('.chat-folder-form');const fieldBox=await field.boundingBox();const bodyBox=await body.boundingBox();const formBox=await form.boundingBox();expect.soft(fieldBox&&bodyBox&&bodyBox.x+bodyBox.width-fieldBox.x-fieldBox.width).toBeGreaterThanOrEqual(8);expect.soft(fieldBox&&formBox&&Math.abs(formBox.x+formBox.width-fieldBox.x-fieldBox.width)).toBeLessThanOrEqual(1);
 await page.keyboard.press('Tab');await expect(dialog.locator(':focus')).toHaveCount(1);
 // This settings form intentionally requires its close/cancel control instead of Escape.
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await screenshot(page,info,s);
 await dialog.locator('.popup-close').click();await expect(dialog).toHaveCount(0);
});

test('V-13 folder settings title and scrollbar spacing in English dark mode',async({page},info)=>{
 const s:Scenario={id:'V-13',viewport:{width:576,height:1024},theme:'dark',locale:'en'};
 await prepareVisualScenario(page,s,'/app/chats');
 const open=page.locator('.chat-list-section:not(.chat-list-section--quick-access) .chat-folder-controls button').first();await expect(open).toBeVisible();await open.focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog');await expect.soft(dialog.locator('#chat-folder-title')).toHaveText('Folder settings');
 const field=dialog.getByRole('textbox',{name:'Folder name',exact:true});const body=dialog.locator('.chat-folder-body');const form=dialog.locator('.chat-folder-form');const fieldBox=await field.boundingBox();const bodyBox=await body.boundingBox();const formBox=await form.boundingBox();expect.soft(fieldBox&&bodyBox&&bodyBox.x+bodyBox.width-fieldBox.x-fieldBox.width).toBeGreaterThanOrEqual(8);expect.soft(fieldBox&&formBox&&Math.abs(formBox.x+formBox.width-fieldBox.x-fieldBox.width)).toBeLessThanOrEqual(1);
 await screenshot(page,info,s);await dialog.locator('.popup-close').click();await expect(dialog).toHaveCount(0);
});
