import {test, expect, ready} from './fixtures';
import {screenshot, type Scenario} from './scenarios';

test('avatar choices stay consistent in profile settings', async ({page}, info) => {
  const scenario: Scenario = {id: 'AV-01', viewport: {width: 1440, height: 900}, theme: 'light', locale: 'en', state: 'symbol-avatar'};
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({colorScheme: scenario.theme});
  await page.addInitScript(({theme, locale}) => {
    localStorage.setItem('familyMessenger.appearance', JSON.stringify({themeMode: theme}));
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({language: locale}));
  }, scenario);
  await page.goto('/app/settings?mockUser=user-stovo-demo');
  await ready(page);
  await expect(page.locator('.settings-layout')).toHaveAttribute('aria-busy', 'false');

  await page.getByRole('button', {name: 'Open profile settings'}).click();
  const picker = page.locator('.avatar-choice-picker');
  await expect(picker).toBeVisible();
  await picker.getByRole('button', {name: 'Star', exact: true}).click();
  await picker.getByRole('button', {name: 'Blue', exact: true}).click();
  await expect(picker.getByRole('button', {name: 'Star', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(picker.getByRole('button', {name: 'Blue', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await screenshot(page, info, scenario);
});

test('voice chat uses its saved symbol and color in the list and header', async ({page}, info) => {
  const scenario: Scenario = {id: 'AV-02-voice-chat', viewport: {width: 1440, height: 900}, theme: 'light', locale: 'en', state: 'saved-voice-avatar'};
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({colorScheme: scenario.theme});
  await page.addInitScript(({theme, locale}) => {
    localStorage.setItem('familyMessenger.appearance', JSON.stringify({themeMode: theme}));
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({language: locale}));
  }, scenario);
  await page.goto('/app/chats/chat-voice-avatar?mockScenario=voice-avatar');
  await ready(page);

  const row = page.locator('.chat-list-item[data-chat-id="chat-voice-avatar"]');
  const listAvatar = row.locator('.entity-avatar');
  await expect(listAvatar).toHaveAttribute('data-avatar-color', 'purple');
  await expect(listAvatar.locator('.entity-avatar__symbol')).toBeVisible();
  const headerAvatar = page.locator('[data-call-header-chat-id="chat-voice-avatar"] .entity-avatar');
  await expect(headerAvatar).toHaveAttribute('data-avatar-color', 'purple');
  await expect(headerAvatar.locator('.entity-avatar__symbol')).toBeVisible();
  await screenshot(page, info, scenario);
});

test('family chat owner can choose a symbol and color in chat settings', async ({page}, info) => {
  const scenario: Scenario = {id: 'AV-03-family-chat-settings', viewport: {width: 390, height: 844}, theme: 'dark', locale: 'en', state: 'family-chat-avatar'};
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({colorScheme: scenario.theme});
  await page.addInitScript(({theme, locale}) => {
    localStorage.setItem('familyMessenger.appearance', JSON.stringify({themeMode: theme}));
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({language: locale}));
  }, scenario);
  await page.goto('/app/chats/chat-family-avatar?mockScenario=family-avatar');
  await ready(page);
  await expect(page.locator('[data-call-header-chat-id="chat-family-avatar"]')).toBeVisible();
  await page.getByRole('button', {name: 'Chat details'}).click();
  await page.getByRole('button', {name: 'Chat options'}).click();
  await page.getByRole('menuitem', {name: 'Chat settings'}).click();
  const picker = page.locator('.avatar-choice-picker');
  await expect(picker).toBeVisible();
  const selected = picker.locator('.symbol-color-controls__icons button[aria-pressed="true"]');
  const selectedBox = (await selected.boundingBox())!;
  expect(selectedBox.width).toBe(selectedBox.height);
  const expand = picker.getByRole('button', {name: 'More symbols'});
  const background = await expand.evaluate(node => getComputedStyle(node).backgroundColor);
  await expand.hover();
  await expect(expand).toHaveCSS('background-color', background);
  for (const avatar of await picker.locator('.entity-avatar').all()) {
    await expect(avatar).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await picker.getByRole('button', {name: 'Star', exact: true}).click();
  await picker.getByRole('button', {name: 'Blue', exact: true}).click();
  await expect(picker.getByRole('button', {name: 'Star', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(picker.getByRole('button', {name: 'Blue', exact: true})).toHaveAttribute('aria-pressed', 'true');
  const hovered = picker.getByRole('button', {name: 'Heart', exact: true});
  await hovered.hover();
  await expect(hovered).toHaveCSS('border-radius', '50%');
  const box = await hovered.boundingBox();
  expect(box?.width).toBe(box?.height);
  await screenshot(page, info, scenario);
  await page.getByRole('button', {name: 'Back to chat', exact: true}).click();
  const avatar = page.locator('[data-call-header-chat-id="chat-family-avatar"] .entity-avatar').first();
  await expect(avatar).toHaveAttribute('data-avatar-color', 'blue');
  await expect(avatar.locator('svg.lucide-star')).toBeVisible();
  await expect(avatar).toHaveCSS('background-color', 'rgb(59, 130, 246)');
  await screenshot(page, info, {...scenario, id: 'AV-03-chat-avatar', state: 'saved-family-avatar'});
});

for (const locale of ['en', 'ru'] as const) {
  test(`avatar picker is keyboard accessible on mobile in ${locale}`, async ({page}, info) => {
    const scenario: Scenario = {id: `AV-09-${locale}-dark-mobile`, viewport: {width: 390, height: 844}, theme: 'dark', locale, state: 'symbol-avatar'};
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({colorScheme: scenario.theme});
    await page.addInitScript(({theme, locale}) => {
      localStorage.setItem('familyMessenger.appearance', JSON.stringify({themeMode: theme}));
      localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({language: locale}));
    }, scenario);
    await page.goto('/app/settings?mockUser=user-stovo-demo');
    await ready(page);
    await expect(page.locator('.settings-layout')).toHaveAttribute('aria-busy', 'false');

    await page.getByRole('button', {name: locale === 'en' ? 'Open profile settings' : 'Открыть настройки профиля'}).click();
    const picker = page.locator('.avatar-choice-picker');
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('group', {name: locale === 'en' ? 'Choose a symbol' : 'Выберите символ'})).toBeVisible();
    const star = picker.getByRole('button', {name: locale === 'en' ? 'Star' : 'Звезда'});
    await star.focus();
    await expect(star).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    await screenshot(page, info, scenario);
  });
}

test('folder color applies to its label and symbol', async ({page}, info) => {
  const scenario: Scenario = {id: 'AV-folder-color', viewport: {width: 1440, height: 900}, theme: 'dark', locale: 'en'};
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({colorScheme: scenario.theme});
  await page.addInitScript(() => {
    localStorage.setItem('familyMessenger.appearance', JSON.stringify({themeMode: 'dark'}));
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({language: 'en'}));
  });
  await page.goto('/app/chats');
  await ready(page);
  const section = page.locator('.chat-list-section:not(.chat-list-section--quick-access)').first();
  const settings = section.locator('.chat-folder-controls button').first();
  await settings.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  const picker = dialog.locator('.avatar-choice-picker');
  await picker.getByRole('button', {name: 'Blue', exact: true}).click();
  const hovered = picker.getByRole('button', {name: 'Heart', exact: true});
  await hovered.hover();
  await expect(hovered).toHaveCSS('border-radius', '50%');
  await screenshot(page, info, scenario);
  await dialog.getByRole('button', {name: 'Save folder', exact: true}).click();
  await expect(section.locator('.chat-folder-name')).toHaveCSS('color', 'rgb(59, 130, 246)');
  await expect(section.locator('.chat-folder-avatar')).toHaveCSS('color', 'rgb(59, 130, 246)');
  await screenshot(page, info, {...scenario, id: 'AV-folder-saved'});
});

test('storage folder symbol hover is circular', async ({page}, info) => {
  const scenario: Scenario = {id: 'AV-storage-hover', viewport: {width: 1440, height: 900}, theme: 'dark', locale: 'en'};
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({colorScheme: scenario.theme});
  await page.addInitScript(() => {
    localStorage.setItem('familyMessenger.appearance', JSON.stringify({themeMode: 'dark'}));
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({language: 'en'}));
  });
  await page.goto('/app/files?mockScenario=storage-empty');
  await ready(page);
  await page.getByRole('button', {name: /Storage preview folder/}).click();
  await page.locator('.storage-collection-cover-edit').click();
  const hovered = page.locator('.storage-cover-menu').getByRole('button', {name: 'Heart', exact: true});
  await hovered.hover();
  await expect(hovered).toHaveCSS('border-radius', '50%');
  const box = await hovered.boundingBox();
  expect(box?.width).toBe(box?.height);
  await screenshot(page, info, scenario);
});
