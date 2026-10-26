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
