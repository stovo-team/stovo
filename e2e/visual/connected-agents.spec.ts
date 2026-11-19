import { expect, test, ready } from "./fixtures";
import { screenshot, shellScenarios } from "./scenarios";

for (const scenario of shellScenarios) {
  test(`Connected Agents create and onboarding ${scenario.id} ${scenario.viewport.width}px ${scenario.theme} ${scenario.locale}`, async ({ page }, info) => {
    await page.setViewportSize(scenario.viewport);
    await page.emulateMedia({ colorScheme: scenario.theme });
    await page.addInitScript(({ theme, locale }) => {
      localStorage.setItem("familyMessenger.appearance", JSON.stringify({ themeMode: theme }));
      localStorage.setItem("familyMessenger.devicePreferences", JSON.stringify({ language: locale }));
    }, { theme: scenario.theme, locale: scenario.locale });

    await page.route("**/api/admin/mcp-connectors", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ json: [] });
        return;
      }
      await route.fulfill({ json: {
        connector: {
          id: "visual-connected-agent", name: "Researcher", actorUserId: "local-agent", enabled: true,
          revoked: false, createdBy: "local-owner", createdAt: "2026-10-19T06:00:00Z", lastUsedAt: null,
          maxHistoryMessages: 50, permissions: {}, provider: "codex", alias: "researcher",
          authMode: "subscription", allowedChatIds: ["chat-planning-team"],
        },
        token: "visual-private-token", mcpUrl: "https://messenger.example/api/mcp/visual-connected-agent",
        setupPrompt: "Connect to stovo-messenger over Streamable HTTP. Set Authorization: Bearer <token> as an HTTP header; do not add env or configure an unrelated MCP server. To test the connection, call stovo_connection_status. Do not list chats or send messages.",
        cliCommand: "codex mcp add stovo-messenger", claudeCommand: "codex mcp add stovo-messenger",
      } });
    });

    await page.goto("/app/admin/mcp");
    await ready(page);

    const pageTitle = scenario.locale === "ru" ? "Подключённые агенты" : "Connected Agents";
    const nicknameLabel = scenario.locale === "ru" ? "Псевдоним агента" : "Agent nickname";
    const providerLabel = scenario.locale === "ru" ? "Провайдер агента" : "Agent provider";
    const insightLabel = scenario.locale === "ru" ? "Разрешения Stovo Insight" : "Stovo Insight permissions";
    const selectedPermissions = page.locator(".mcp-connector-form input[type='checkbox']:checked");

    await expect(page.getByRole("heading", { level: 1, name: pageTitle })).toBeVisible();
    await expect(page.getByLabel(nicknameLabel)).toBeVisible();
    await expect(page.getByLabel(providerLabel)).toBeVisible();
    await expect(page.getByText(insightLabel)).toBeVisible();
    await expect(selectedPermissions).toHaveCount(0);
    await expect(page.getByRole("button", { name: scenario.locale === "ru" ? "Создать подключение" : "Create connection" })).toBeDisabled();
    await screenshot(page, info, { ...scenario, id: `CA-create-${scenario.id}` });

    await page.getByLabel(nicknameLabel).fill("Researcher");
    await page.getByLabel(providerLabel).selectOption("codex");
    await page.locator(".mcp-tag").filter({ hasText: "Planning Team" }).locator("input").check();
    await page.getByRole("button", { name: scenario.locale === "ru" ? "Создать подключение" : "Create connection" }).click();

    await expect(page.getByText(scenario.locale === "ru" ? "Настройка: Researcher" : "Set up Researcher")).toBeVisible();
    await expect(page.locator(".mcp-secret-card .mcp-setup-prompt").first()).toHaveValue(/To test the connection/);
    await expect(page.locator(".mcp-setup-steps")).toContainText("stovo-messenger");
    await expect(page.locator(".mcp-setup-steps")).toContainText("Streamable HTTP");
    await expect(page.locator(".mcp-setup-steps")).toContainText(scenario.locale === "ru" ? "не добавляйте env" : "do not add env");
    await expect(page.getByText(scenario.locale === "ru" ? "ШАГ 3 ИЗ 3" : "STEP 3 OF 3")).toBeVisible();
    await expect(page.locator(".mcp-local-codex-prompt textarea")).toHaveValue(/pair_local_codex\(connection_id, chat_id\)/);
    await expect(page.locator(".mcp-local-codex-prompt button")).toBeVisible();
    await screenshot(page, info, { ...scenario, id: `CA-onboarding-${scenario.id}` });
  });
}

test("Codex setup screenshot", async ({ page }, info) => {
  const scenario = { id: "Codex-setup", viewport: { width: 1440, height: 900 }, theme: "light" as const, locale: "en" as const };
  await page.setViewportSize(scenario.viewport);
  await page.emulateMedia({ colorScheme: scenario.theme });
  await page.addInitScript(() => {
    localStorage.setItem("familyMessenger.appearance", JSON.stringify({ themeMode: "light" }));
    localStorage.setItem("familyMessenger.devicePreferences", JSON.stringify({ language: "en" }));
  });
  await page.goto("/app/admin/mcp");
  await ready(page);
  await page.getByLabel("Agent nickname").fill("Researcher");
  await page.getByLabel("Agent provider").selectOption("codex");
  await page.locator(".mcp-tag").filter({ hasText: "Planning Team" }).locator("input").check();
  await page.getByRole("button", { name: "Create connection" }).click();
  await expect(page.locator(".mcp-secret-card .mcp-setup-prompt").first()).toBeVisible();
  await screenshot(page, info, scenario);
});
