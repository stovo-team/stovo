import { expect, test } from '@playwright/test';

test('Storage search uses the available content width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/files');
  await expect(page.locator('.storage-search')).toBeVisible();

  const widths = await page.evaluate(() => ({
    main: document.querySelector<HTMLElement>('.storage-main')!.getBoundingClientRect().width,
    search: document.querySelector<HTMLElement>('.storage-search')!.getBoundingClientRect().width,
    layoutBottom: document.querySelector<HTMLElement>('.storage-layout')!.getBoundingClientRect().bottom,
    documentHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));

  expect(widths.search / widths.main).toBeGreaterThan(0.7);
  expect(widths.viewportHeight - widths.layoutBottom).toBeLessThanOrEqual(1);
  expect(widths.documentHeight).toBeLessThanOrEqual(widths.viewportHeight + 1);
});

test('collapsing Storage keeps its sidebar narrow and its control vertically anchored', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/files');
  await page.getByRole('button', { name: 'Collapse chat list' }).evaluate((button) => (button as HTMLButtonElement).click());
  const geometry = await page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>('.storage-layout')!;
    const sidebar = document.querySelector<HTMLElement>('.storage-source-sidebar')!;
    const content = document.querySelector<HTMLElement>('.storage-main')!;
    const button = document.querySelector<HTMLElement>('.storage-source-collapse')!;
    const sidebarRect = sidebar.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return {
      sidebarWidth: sidebarRect.width,
      layoutWidth: layout.getBoundingClientRect().width,
      contentWidth: content.getBoundingClientRect().width,
      sidebarCenterY: sidebarRect.top + sidebarRect.height / 2,
      buttonCenterY: buttonRect.top + buttonRect.height / 2,
    };
  });

  expect(geometry.sidebarWidth).toBeLessThanOrEqual(36);
  expect(geometry.contentWidth / geometry.layoutWidth).toBeGreaterThan(0.75);
  expect(Math.abs(geometry.sidebarCenterY - geometry.buttonCenterY)).toBeLessThanOrEqual(8);
  expect(await page.locator('.storage-source-collapse').evaluate((button) => button.classList.contains('sidebar-collapse-button'))).toBe(true);
});

test('Plans collapse control stays centered and the calendar fills the freed space', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/app/plans');
  await page.getByRole('button', { name: 'Collapse event list' }).click();

  const geometry = await page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>('.plans-layout')!;
    const sidebar = document.querySelector<HTMLElement>('.plans-sidebar')!;
    const content = document.querySelector<HTMLElement>('.plans-content')!;
    const button = document.querySelector<HTMLElement>('.plans-sidebar-collapse')!;
    const sidebarRect = sidebar.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    return {
      sidebarWidth: sidebarRect.width,
      layoutWidth: layout.getBoundingClientRect().width,
      contentWidth: content.getBoundingClientRect().width,
      sidebarCenterY: sidebarRect.top + sidebarRect.height / 2,
      buttonCenterY: buttonRect.top + buttonRect.height / 2,
      contentLeft: content.getBoundingClientRect().left,
      sidebarRight: sidebarRect.right,
    };
  });

  expect(geometry.sidebarWidth).toBeLessThanOrEqual(36);
  expect(geometry.contentWidth / geometry.layoutWidth).toBeGreaterThan(0.8);
  expect(geometry.contentLeft - geometry.sidebarRight).toBeLessThanOrEqual(16);
  expect(Math.abs(geometry.sidebarCenterY - geometry.buttonCenterY)).toBeLessThanOrEqual(8);
  expect(await page.locator('.plans-sidebar-collapse').evaluate((button) => button.classList.contains('sidebar-collapse-button'))).toBe(true);
});

test('guest meeting title field is slightly narrower than its popup row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/app/chats');
  await page.locator('.compose-fab').click();
  await page.getByRole('dialog', { name: 'New Chat' }).getByRole('button', { name: /Plan guest meeting/ }).click();

  const planner = page.getByRole('dialog', { name: 'Plan guest meeting' });
  const widths = await planner.locator('.guest-link-field input').first().evaluate((input) => ({
    field: input.closest('.guest-link-field')!.getBoundingClientRect().width,
    input: input.getBoundingClientRect().width,
  }));

  expect(widths.field - widths.input).toBeGreaterThanOrEqual(12);
  expect(widths.field - widths.input).toBeLessThanOrEqual(20);
});
