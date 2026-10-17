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
      sidebarCenterY: sidebar.getBoundingClientRect().top + sidebar.getBoundingClientRect().height / 2,
      contentLeft: document.querySelector<HTMLElement>('.plans-content')!.getBoundingClientRect().left,
      buttonLeft: button.getBoundingClientRect().left,
      buttonRight: button.getBoundingClientRect().right,
      buttonCenterY: button.getBoundingClientRect().top + button.getBoundingClientRect().height / 2,
      buttonOpacity: getComputedStyle(button).opacity,
      buttonPosition: getComputedStyle(button).position,
      buttonZIndex: getComputedStyle(button).zIndex,
      buttonCenter: button.getBoundingClientRect().left + button.getBoundingClientRect().width / 2,
      agendaClientWidth: agenda.clientWidth,
      agendaScrollWidth: agenda.scrollWidth,
      layoutWidth: layout.clientWidth,
    };
  });

  expect(geometry.tabsTop).toBeGreaterThanOrEqual(geometry.titleBottom);
  expect(geometry.agendaScrollWidth).toBeGreaterThan(geometry.agendaClientWidth);
  expect(Math.abs(geometry.buttonCenter - geometry.contentLeft)).toBeLessThanOrEqual(24);
  expect(Math.abs(geometry.buttonCenterY - geometry.sidebarCenterY)).toBeLessThanOrEqual(8);
  expect(Number(geometry.buttonOpacity)).toBeGreaterThan(0.5);
  expect(Number(geometry.buttonOpacity)).toBeLessThan(1);
  expect(geometry.buttonPosition).toBe('absolute');
  expect(Number(geometry.buttonZIndex)).toBeGreaterThanOrEqual(100);
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

test('plans week gives every day room and separates weekday columns visibly', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/app/plans');
  await page.getByRole('button', { name: 'Week', exact: true }).click();

  const days = await page.locator('.plans-calendar--7 .plans-calendar-day').evaluateAll((items) => items.map((item) => {
    const style = getComputedStyle(item);
    return { width: item.getBoundingClientRect().width, borderLeftWidth: style.borderLeftWidth, borderLeftStyle: style.borderLeftStyle };
  }));

  expect(days).toHaveLength(7);
  expect(Math.min(...days.map(({ width }) => width))).toBeGreaterThanOrEqual(150);
  expect(days[0].borderLeftWidth).toBe('0px');
  expect(days.slice(1).every(({ borderLeftWidth, borderLeftStyle }) => borderLeftWidth === '1px' && borderLeftStyle === 'solid')).toBe(true);
});

test('plans date headers stay compact, icon-free, hoverless, and sticky while the calendar scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/app/plans');
  await page.getByRole('button', { name: 'Week', exact: true }).click();

  const dateHeading = page.locator('.plans-calendar-day-heading').first();
  await expect(dateHeading).toBeVisible();
  await expect(page.locator('.plans-calendar-day-icon')).toHaveCount(0);
  await expect(page.locator('.plans-calendar-hours-icon')).toHaveCount(0);
  const compactStyle = await dateHeading.evaluate((heading) => {
    const style = getComputedStyle(heading);
    const date = heading.querySelector('strong')!;
    return {
      position: style.position,
      height: heading.getBoundingClientRect().height,
      dateFontSize: Number.parseFloat(getComputedStyle(date).fontSize),
      cursor: style.cursor,
    };
  });
  expect(compactStyle.position).toBe('sticky');
  expect(compactStyle.height).toBeLessThanOrEqual(36);
  expect(compactStyle.dateFontSize).toBeLessThanOrEqual(14);
  expect(compactStyle.cursor).toBe('default');

  const beforeHover = await dateHeading.evaluate((heading) => {
    const { backgroundColor, borderColor, color } = getComputedStyle(heading);
    return { backgroundColor, borderColor, color };
  });
  await dateHeading.hover();
  const afterHover = await dateHeading.evaluate((heading) => {
    const { backgroundColor, borderColor, color } = getComputedStyle(heading);
    return { backgroundColor, borderColor, color };
  });
  expect(afterHover).toEqual(beforeHover);

  const stickyTop = await page.locator('.plans-agenda').evaluate((agenda) => {
    const header = agenda.querySelector<HTMLElement>('.plans-calendar-day-heading')!;
    agenda.scrollTop = 240;
    const headerTop = header.getBoundingClientRect().top;
    const agendaTop = agenda.getBoundingClientRect().top;
    const paddingTop = Number.parseFloat(getComputedStyle(agenda).paddingTop);
    const calendarTopPadding = Number.parseFloat(getComputedStyle(agenda.querySelector('.plans-calendar')!).paddingTop);
    return { headerTop, expectedTop: agendaTop + paddingTop + calendarTopPadding };
  });
  expect(Math.abs(stickyTop.headerTop - stickyTop.expectedTop)).toBeLessThanOrEqual(2);
});

test('plans view switches retain their width instead of wrapping or shrinking', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/app/plans');
  const tabs = page.locator('.plans-mobile-tabs:not(.plans-header-tabs)');
  const sizing = await tabs.evaluate((nav) => {
    const style = getComputedStyle(nav);
    return { clientWidth: nav.clientWidth, scrollWidth: nav.scrollWidth, overflowX: style.overflowX, flexWrap: style.flexWrap };
  });
  const buttons = await tabs.locator('button').evaluateAll((items) => items.map((item) => {
    const style = getComputedStyle(item);
    return { width: item.getBoundingClientRect().width, height: item.getBoundingClientRect().height, flexShrink: style.flexShrink, whiteSpace: style.whiteSpace };
  }));

  expect(sizing.clientWidth).toBeGreaterThan(0);
  expect(sizing.scrollWidth).toBeGreaterThan(sizing.clientWidth);
  expect(sizing.overflowX).toBe('auto');
  expect(sizing.flexWrap).toBe('nowrap');
  expect(buttons).toHaveLength(4);
  expect(buttons.every(({ width, flexShrink, whiteSpace }) => width >= 60 && flexShrink === '0' && whiteSpace === 'nowrap')).toBe(true);
  expect(Math.max(...buttons.map(({ height }) => height))).toBeLessThanOrEqual(60);
  expect(Math.max(...buttons.map(({ height }) => height)) - Math.min(...buttons.map(({ height }) => height))).toBeLessThanOrEqual(2);

  const scroll = await tabs.evaluate((nav) => {
    nav.scrollLeft = nav.scrollWidth;
    const lastButton = nav.querySelectorAll('button')[3].getBoundingClientRect();
    return { scrollLeft: nav.scrollLeft, lastButtonRight: lastButton.right, viewportRight: nav.getBoundingClientRect().right };
  });
  expect(scroll.scrollLeft).toBeGreaterThan(0);
  expect(scroll.lastButtonRight).toBeLessThanOrEqual(scroll.viewportRight + 1);
});

test('plans view switches stay at a normal compact height in the event-list panel', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/app/plans');

  const tabs = page.locator('.plans-tabs');
  await expect(tabs).toBeVisible();
  const sizing = await tabs.evaluate((nav) => ({
    overflowX: getComputedStyle(nav).overflowX,
    flexWrap: getComputedStyle(nav).flexWrap,
    clientWidth: nav.clientWidth,
    scrollWidth: nav.scrollWidth,
  }));
  const buttons = await tabs.locator('button').evaluateAll((items) => items.map((button) => {
    const style = getComputedStyle(button);
    return { text: button.textContent?.trim(), height: button.getBoundingClientRect().height, whiteSpace: style.whiteSpace, flexShrink: style.flexShrink };
  }));

  expect(buttons).toHaveLength(4);
  expect(buttons.every(({ text }) => Boolean(text))).toBe(true);
  expect(Math.max(...buttons.map(({ height }) => height))).toBeLessThanOrEqual(44);
  expect(sizing.overflowX).toBe('auto');
  expect(sizing.flexWrap).toBe('nowrap');
  expect(sizing.scrollWidth).toBeGreaterThan(sizing.clientWidth);
  expect(buttons.every(({ whiteSpace, flexShrink }) => whiteSpace === 'nowrap' && flexShrink === '0')).toBe(true);
});

test('plans three-day view switch remains on one line at the reported 500px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('/app/plans');
  await page.getByRole('button', { name: 'Collapse event list' }).click();
  await page.setViewportSize({ width: 500, height: 700 });
  const tabs = page.locator('.plans-header-tabs');
  const threeDays = tabs.getByRole('button', { name: '3 days', exact: true });
  await expect(threeDays).toBeVisible();
  const metrics = await threeDays.evaluate((button) => {
    const style = getComputedStyle(button);
    const nav = button.closest('nav')!;
    return {
      height: button.getBoundingClientRect().height,
      scrollHeight: button.scrollHeight,
      lineHeight: Number.parseFloat(style.lineHeight),
      flexBasis: style.flexBasis,
      whiteSpace: style.whiteSpace,
      width: button.getBoundingClientRect().width,
      text: button.innerText,
      navClientWidth: nav.clientWidth,
      navScrollWidth: nav.scrollWidth,
      navOverflowX: getComputedStyle(nav).overflowX,
    };
  });
  expect(metrics.whiteSpace).toBe('nowrap');
  expect(metrics.flexBasis).toBe('auto');
  expect(metrics.height).toBeLessThanOrEqual(60);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.lineHeight + 24);
  expect(metrics.navOverflowX).toBe('auto');
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
