import {test,expect} from './fixtures';import {prepareVisualScenario,screenshot,type Scenario} from './scenarios';
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
