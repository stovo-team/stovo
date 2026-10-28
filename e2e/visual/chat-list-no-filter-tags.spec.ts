import {test,expect} from './fixtures';
import {shellScenarios,prepareVisualScenario,screenshot} from './scenarios';

for (const [index, scenario] of shellScenarios.entries()) {
  const id = `V-TAGS-${String(index + 1).padStart(2, '0')}`;
  test(`${id} chat list has no filter tags ${scenario.theme} ${scenario.locale}`, async ({page}, info) => {
    await prepareVisualScenario(page, {...scenario, id}, '/app/chats');
    await expect(page.locator('.chat-list-filters')).toHaveCount(0);
    await expect(page.locator('.chat-list-search')).toBeVisible();
    await expect(page.locator('.chat-list-item').first()).toBeVisible();
    await screenshot(page, info, {...scenario, id});
  });
}
