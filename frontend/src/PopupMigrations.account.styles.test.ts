import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("account and admin popup shared composition", () => {
  it.each([
    "src/components/InviteModal.tsx",
    "src/components/PollVotersModal.tsx",
    "src/components/QuickSwitcherModal.tsx",
    "src/components/ChatStatsDrawer.tsx",
    "src/components/MCPConnectorsPanel.tsx",
    "src/components/YearWithStovoModal.tsx",
    "src/pages/settings/AppearanceEditor.tsx",
    "src/pages/PlansPage.tsx",
    "src/pages/MultiAdminPage.tsx",
    "src/pages/AdminMembersPage.tsx",
  ])("uses the shared popup shell in %s", (path) => {
    expect(source(path)).toContain("PopupDialog");
  });

  it("uses shared fields and dropdowns in plan and admin forms", () => {
    expect(source("src/pages/PlansPage.tsx")).toContain("PopupField");
    expect(source("src/pages/MultiAdminPage.tsx")).toContain("PopupField");
    expect(source("src/pages/AdminMembersPage.tsx")).toContain("PopupSelect");
  });

  it("uses the shared danger button for IP block confirmation", () => {
    expect(source("src/pages/AdminMembersPage.tsx")).toContain('variant="danger"');
  });

  it("uses a shared primary button in the lock gate", () => {
    expect(source("src/AppLockGate.tsx")).toContain('variant="primary"');
  });
});
