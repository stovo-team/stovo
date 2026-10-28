import {test, expect} from './fixtures';
import {prepareVisualScenario, screenshot} from './scenarios';

test('empty Storage collection centers its message', async ({page}, testInfo) => {
  const scenario = {id: 'V-STORAGE-EMPTY', viewport: {width: 1440, height: 900}, theme: 'dark' as const, locale: 'ru' as const, state: 'storage-empty'};
  await prepareVisualScenario(page, scenario, '/app/files');
  await page.getByRole('button', {name: /Storage preview folder/}).click();
  await expect(page.locator('.storage-collection-empty')).toHaveText('Файлов пока нет. Добавьте существующие или загрузите новые.');
  await expect(page.locator('.storage-collection-full-page')).toHaveCSS('display', 'flex');
  await screenshot(page, testInfo, scenario);
});
