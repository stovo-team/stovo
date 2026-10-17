import { expect, test } from '@playwright/test';

test('storage source collapse releases unused preview width and places its control on the divider', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/files');
  await expect(page.locator('.storage-layout')).toBeVisible();

  const collapse = page.getByRole('button', { name: 'Collapse chat list' });
  await collapse.click();

  const geometry = await page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>('.storage-layout')!;
    const sidebar = document.querySelector<HTMLElement>('.storage-source-sidebar')!;
    const content = document.querySelector<HTMLElement>('.storage-main')!;
    const button = document.querySelector<HTMLElement>('.storage-source-collapse')!;
    return {
      tracks: getComputedStyle(layout).gridTemplateColumns.split(' ').length,
      sidebarRight: sidebar.getBoundingClientRect().right,
      contentLeft: content.getBoundingClientRect().left,
      buttonLeft: button.getBoundingClientRect().left,
      buttonRight: button.getBoundingClientRect().right,
      buttonCenter: button.getBoundingClientRect().left + button.getBoundingClientRect().width / 2,
    };
  });

  expect(geometry.tracks).toBe(2);
  expect(Math.abs(geometry.buttonCenter - geometry.contentLeft)).toBeLessThanOrEqual(24);
  expect(geometry.buttonLeft).toBeGreaterThanOrEqual(geometry.sidebarRight);
  expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.contentLeft);
  expect(geometry.contentLeft).toBeGreaterThan(geometry.sidebarRight);
});

test('new chat has no duplicate search label and guest-meeting dropdown fields share label styling', async ({ page }) => {
  await page.goto('/app/chats');
  await page.locator('.compose-fab').click();

  const newChat = page.getByRole('dialog', { name: 'New Chat' });
  await expect(newChat).toBeVisible();
  const searchLabel = newChat.locator('.popup-field__label').filter({ hasText: 'Search messages or members' });
  await expect(searchLabel).toHaveClass(/visually-hidden/);
  expect(await searchLabel.evaluate((label) => {
    const style = getComputedStyle(label);
    return { clipped: style.clipPath, position: style.position };
  })).toEqual({ clipped: 'inset(50%)', position: 'absolute' });
  await newChat.getByRole('button', { name: /Plan guest meeting/ }).click();

  const planner = page.getByRole('dialog', { name: 'Plan guest meeting' });
  await expect(planner).toBeVisible();
  const labelStyles = await planner.locator('.guest-link-field > span').evaluateAll((labels) =>
    labels.map((label) => {
      const style = getComputedStyle(label);
      return { fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color };
    }),
  );
  expect(labelStyles.length).toBeGreaterThanOrEqual(3);
  expect(new Set(labelStyles.map((style) => JSON.stringify(style))).size).toBe(1);
});

test('guest-meeting dropdown options use the shared field typography', async ({ page }) => {
  await page.goto('/app/chats');
  await page.locator('.compose-fab').click();
  await page.getByRole('dialog', { name: 'New Chat' }).getByRole('button', { name: /Plan guest meeting/ }).click();

  const planner = page.getByRole('dialog', { name: 'Plan guest meeting' });
  await expect(planner).toBeVisible();
  const labelStyle = await planner.locator('.guest-link-field > span').first().evaluate((label) => {
    const style = getComputedStyle(label);
    return { fontSize: style.fontSize, fontWeight: style.fontWeight };
  });
  await planner.locator('.guest-link-settings .guest-link-select-trigger').first().click();
  const optionStyle = await planner.locator('[role="option"]').first().evaluate((option) => {
    const style = getComputedStyle(option);
    return { fontSize: style.fontSize, fontWeight: style.fontWeight };
  });
  expect(optionStyle).toEqual(labelStyle);
});

test('plans keep dates above the calendar, allow the week view to scroll horizontally, and anchor collapse control at the divider', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/app/plans');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse event list' }).click();

  const geometry = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.plans-header')!;
    const title = header.querySelector<HTMLElement>('h2')!;
    const tabs = document.querySelector<HTMLElement>('.plans-header-tabs')!;
    const layout = document.querySelector<HTMLElement>('.plans-layout')!;
    const sidebar = document.querySelector<HTMLElement>('.plans-sidebar')!;
    const button = document.querySelector<HTMLElement>('.plans-sidebar-collapse')!;
    const agenda = document.querySelector<HTMLElement>('.plans-agenda')!;
    return {
      titleBottom: title.getBoundingClientRect().bottom,
      tabsTop: tabs.getBoundingClientRect().top,
      sidebarRight: sidebar.getBoundingClientRect().right,
      contentLeft: document.querySelector<HTMLElement>('.plans-content')!.getBoundingClientRect().left,
      buttonLeft: button.getBoundingClientRect().left,
      buttonRight: button.getBoundingClientRect().right,
      buttonCenter: button.getBoundingClientRect().left + button.getBoundingClientRect().width / 2,
      agendaClientWidth: agenda.clientWidth,
      agendaScrollWidth: agenda.scrollWidth,
      layoutWidth: layout.clientWidth,
    };
  });

  expect(geometry.tabsTop).toBeGreaterThanOrEqual(geometry.titleBottom);
  expect(geometry.agendaScrollWidth).toBeGreaterThan(geometry.agendaClientWidth);
  expect(Math.abs(geometry.buttonCenter - geometry.contentLeft)).toBeLessThanOrEqual(24);
  expect(geometry.buttonLeft).toBeGreaterThanOrEqual(geometry.sidebarRight);
  expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.contentLeft);
  expect(geometry.layoutWidth).toBeGreaterThan(0);
});

test('plans week calendar remains horizontally scrollable when the event list is collapsed', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/app/plans');
  await page.getByRole('button', { name: 'Week', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse event list' }).click();
  const widths = await page.locator('.plans-agenda').evaluate((agenda) => ({ client: agenda.clientWidth, scroll: agenda.scrollWidth }));
  expect(widths.scroll).toBeGreaterThan(widths.client);
});

test('plans event-list collapse control sits on the list/content divider', async ({ page }) => {
  await page.goto('/app/plans');
  await page.getByRole('button', { name: 'Collapse event list' }).click();
  const geometry = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>('.plans-sidebar')!;
    const content = document.querySelector<HTMLElement>('.plans-content')!;
    const button = document.querySelector<HTMLElement>('.plans-sidebar-collapse')!;
    const center = (sidebar.getBoundingClientRect().right + content.getBoundingClientRect().left) / 2;
    const rect = button.getBoundingClientRect();
    return { distance: Math.abs(rect.left + rect.width / 2 - center), insideDivider: rect.left >= sidebar.getBoundingClientRect().right && rect.right <= content.getBoundingClientRect().left };
  });
  expect(geometry.distance).toBeLessThanOrEqual(8);
  expect(geometry.insideDivider).toBe(true);
});

test('plans date and view controls sit in a separate row above the plan display', async ({ page }) => {
  await page.goto('/app/plans');
  await expect(page.getByText(/Mock API route not implemented: GET \/api\/plans/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Collapse event list' }).click();
  const positions = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>('.plans-header')!;
    const tabs = document.querySelector<HTMLElement>('.plans-header-tabs')!;
    const agenda = document.querySelector<HTMLElement>('.plans-agenda')!;
    return {
      tabsAreInsideHeader: header.contains(tabs),
      headerBottom: header.getBoundingClientRect().bottom,
      tabsTop: tabs.getBoundingClientRect().top,
      tabsBottom: tabs.getBoundingClientRect().bottom,
      agendaTop: agenda.getBoundingClientRect().top,
    };
  });
  expect(positions.tabsAreInsideHeader).toBe(false);
  expect(positions.tabsTop).toBeGreaterThanOrEqual(positions.headerBottom);
  expect(positions.tabsBottom).toBeLessThanOrEqual(positions.agendaTop);
});

test('storage source collapse control sits on the list/content divider', async ({ page }) => {
  await page.goto('/app/files');
  await page.getByRole('button', { name: 'Collapse chat list' }).click();
  const distance = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>('.storage-source-sidebar')!;
    const content = document.querySelector<HTMLElement>('.storage-main')!;
    const button = document.querySelector<HTMLElement>('.storage-source-collapse')!;
    const center = (sidebar.getBoundingClientRect().right + content.getBoundingClientRect().left) / 2;
    const rect = button.getBoundingClientRect();
    return { distance: Math.abs(rect.left + rect.width / 2 - center), insideDivider: rect.left >= sidebar.getBoundingClientRect().right && rect.right <= content.getBoundingClientRect().left };
  });
  expect(distance.distance).toBeLessThanOrEqual(8);
  expect(distance.insideDivider).toBe(true);
});

test('Russian chat transfer action is concise and import/export dialogs escape the chat-list stacking context', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({ language: 'ru' }));
  });
  await page.goto('/app/chats');
  const chat = page.locator('.chat-list-item[data-chat-id="chat-planning-team"]');
  await expect(chat).toBeVisible();

  await chat.click({ button: 'right' });
  const importAction = page.getByRole('menuitem', { name: /Импортировать чат/ });
  await expect(importAction).toBeVisible();
  await expect(importAction).toHaveText('Импортировать чат');
});

test('Russian import dialog title avoids the file wording', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('familyMessenger.devicePreferences', JSON.stringify({ language: 'ru' }));
  });
  await page.goto('/app/chats');
  await page.locator('.chat-list-item[data-chat-id="chat-planning-team"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Импортировать чат/ }).click();
  await expect(page.locator('.chat-transfer-dialog h2')).toHaveText('Импорт чата');
});

test('chat export dialog is mounted outside the chat-list stacking context', async ({ page }) => {
  await page.goto('/app/chats');
  await page.locator('.chat-list-item[data-chat-id="chat-planning-team"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Export chat', exact: true }).click();
  const backdrop = page.locator('.popup-backdrop:has(.chat-transfer-dialog)');
  await expect(backdrop).toBeVisible();
  expect(await backdrop.evaluate((element) => element.parentElement === document.body)).toBe(true);
});

test('chat import dialog is mounted outside the chat-list stacking context', async ({ page }) => {
  await page.goto('/app/chats');
  await page.locator('.chat-list-item[data-chat-id="chat-planning-team"]').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Import chat from file', exact: true }).click();
  const backdrop = page.locator('.popup-backdrop:has(.chat-transfer-dialog)');
  await expect(backdrop).toBeVisible();
  expect(await backdrop.evaluate((element) => element.parentElement === document.body)).toBe(true);
});
