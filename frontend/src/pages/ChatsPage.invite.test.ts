import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const chatSidebar = readFileSync(
  resolve(process.cwd(), "src/features/chats/sidebar/ChatSidebar.tsx"),
  "utf8"
);
const chatOverlays = readFileSync(resolve(process.cwd(), "src/features/chats/ChatOverlays.tsx"), "utf8");
const inviteModal = readFileSync(resolve(process.cwd(), "src/components/InviteModal.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("chats page family invitation", () => {
  it("shows an invite button in the chats list header for admins", () => {
    expect(chatSidebar).toContain('aria-label="Create invitation"');
    expect(chatSidebar).toContain("canCreateFamilyInvite");
    expect(chatOverlays).toContain("<InviteModal");
    expect(chatOverlays).toContain("isFamilyInviteOpen");
  });

  it("creates a link and QR with copy and share for both", () => {
    expect(inviteModal).toContain("createInvite");
    expect(inviteModal).toContain("QRCode.toDataURL");
    expect(inviteModal).toContain("handleCopyLink");
    expect(inviteModal).toContain("handleShareLink");
    expect(inviteModal).toContain("handleCopyQr");
    expect(inviteModal).toContain("handleShareQr");
    expect(inviteModal).not.toContain('setStatus("Invite ready")');
    expect(styles).toContain(".invite-modal-actions");
    expect(styles).toMatch(/\.invite-modal-link[\s\S]*white-space:\s*nowrap/);
    expect(styles).toMatch(/\.invite-modal-section[\s\S]*border:\s*0/);
    expect(styles).toMatch(/\.invite-modal-actions \.primary-button[\s\S]*border-radius:\s*999px/);
    const qrIndex = inviteModal.indexOf("strings.inviteModal.qrCode");
    const linkIndex = inviteModal.indexOf("strings.inviteModal.inviteLink");
    expect(qrIndex).toBeGreaterThan(-1);
    expect(linkIndex).toBeGreaterThan(qrIndex);
  });
});

