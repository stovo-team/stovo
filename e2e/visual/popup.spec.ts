import {test,expect} from './fixtures';import {prepareVisualScenario,screenshot,type Scenario} from './scenarios';
test('Storage collection type menu stays inside the create dialog',async({page},info)=>{
 const s:Scenario={id:'SC-01',viewport:{width:1440,height:900},theme:'dark',locale:'ru',state:'folder-create-type-menu'};
 await prepareVisualScenario(page,s,'/app/files');
 await page.locator('.storage-collection-new').click();
 const dialog=page.getByRole('dialog',{name:'Новая папка или альбом'});
 await expect(dialog).toBeVisible();
 await dialog.locator('.popup-select__trigger').click();
 const menu=dialog.locator('.popup-select__menu');
 await expect(menu).toBeVisible();
 await expect(menu.getByRole('option')).toHaveCount(3);
 const dialogBounds=await dialog.boundingBox();
 const menuBounds=await menu.boundingBox();
 const fieldBounds=await dialog.locator('.storage-popup-select-field').boundingBox();
 const buttonBounds=await dialog.getByRole('button',{name:'Создать',exact:true}).boundingBox();
 expect(dialogBounds).not.toBeNull();expect(menuBounds).not.toBeNull();expect(fieldBounds).not.toBeNull();expect(buttonBounds).not.toBeNull();
 expect(menuBounds!.y+menuBounds!.height).toBeLessThanOrEqual(dialogBounds!.y+dialogBounds!.height);
 expect(buttonBounds!.y).toBeGreaterThan(fieldBounds!.y+fieldBounds!.height+24);
 expect(buttonBounds!.y).toBeGreaterThanOrEqual(menuBounds!.y+menuBounds!.height+8);
 await screenshot(page,info,s);
});
test('V-12 section settings with long Russian text and keyboard controls',async({page},info)=>{
 const s:Scenario={id:'V-12',viewport:{width:390,height:844},theme:'light',locale:'ru'};
 await prepareVisualScenario(page,s,'/app/chats');
 const open=page.locator('.chat-list-section:not(.chat-list-section--quick-access) .chat-folder-controls button').first();await expect(open).toBeVisible();await open.focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog');await expect(dialog.locator('#chat-folder-title')).toBeVisible();
 const field=dialog.getByRole('textbox',{name:'Название папки',exact:true});await expect(field).toBeFocused();await field.fill('Очень длинное синтетическое название раздела для проверки');
 await page.keyboard.press('Tab');await expect(dialog.locator(':focus')).toHaveCount(1);
 // This settings form intentionally requires its close/cancel control instead of Escape.
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await screenshot(page,info,s);
 await dialog.locator('.popup-close').click();await expect(dialog).toHaveCount(0);
});
