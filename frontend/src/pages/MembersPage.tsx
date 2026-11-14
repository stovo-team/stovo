import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link2, MoreVertical, QrCode, RefreshCw, Search, UserPlus } from "lucide-react";

import { User, UserRole } from "../api/auth";
import {
  Family,
  changeMemberRole,
  createInvite,
  removeMember
} from "../api/family";
import { ApiError } from "../api/client";
import { peekApiResponseCache } from "../api/apiResponseCache";
import { useAuth } from "../auth/AuthContext";
import { EntityAvatar } from "../components/EntityAvatar";
import { PresetNumberControl } from "../components/ui/PresetNumberControl";
import { shareContent } from "../native/nativeSharePlugin";
import AppNav from "./AppNav";
import { useStrings } from "../i18n/LanguageContext";

const ROLE_OPTIONS: UserRole[] = ["admin", "member", "child"];

function canManage(actor: User, target: User) {
  if (actor.id === target.id) {
    return false;
  }
  if (actor.role === "owner") {
    return target.role !== "owner";
  }
  if (actor.role === "admin") {
    return target.role === "member" || target.role === "child";
  }
  return false;
}

function inviteRolesFor(role: UserRole): UserRole[] {
  if (role === "owner") {
    return ["admin", "member", "child"];
  }
  if (role === "admin") {
    return ["member", "child"];
  }
  return [];
}

function MemberAvatar({ accessToken, member }: { accessToken: string | null; member: User }) {
  return <EntityAvatar accessToken={accessToken} className="member-avatar" entityId={member.id} entityKind="person" file={member.profilePhoto} label={member.displayName} mode={member.avatarMode} symbolId={member.avatarSymbolId} colorId={member.avatarColorId} />;
}

export default function MembersPage() {
  const strings = useStrings();
  const copy = strings.admin.members;
  const { accessToken, currentUser, authRequest } = useAuth();
  const profileId = currentUser?.id ?? null;
  const [family, setFamily] = useState<Family | null>(
    () => peekApiResponseCache<Family>(profileId, "/api/family")
  );
  const [members, setMembers] = useState<User[]>(
    () => peekApiResponseCache<User[]>(profileId, "/api/family/members") ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(() => {
    // If the cache already has data, start with isLoading=false so the UI
    // is visible immediately while the background fetch revalidates.
    const profileId = null; // will be evaluated per-render after currentUser loads
    return true;
  });
  const [isContactMenuOpen, setIsContactMenuOpen] = useState(false);
  const inviteFormRef = useRef<HTMLFormElement | null>(null);
  const contactMenuRef = useRef<HTMLDivElement | null>(null);
  const [inviteForm, setInviteForm] = useState({
    role: "member" as UserRole,
    expiresInHours: 48,
    maxUses: 1
  });

  // Once currentUser is available, peek the cache and pre-populate state so
  // the list renders instantly before the network request resolves.
  useEffect(() => {
    if (!currentUser?.id) return;
    const cachedFamily = peekApiResponseCache<Family>(currentUser.id, "/api/family");
    const cachedMembers = peekApiResponseCache<User[]>(currentUser.id, "/api/family/members");
    if (cachedFamily) setFamily(cachedFamily);
    if (cachedMembers && cachedMembers.length > 0) {
      setMembers(cachedMembers);
      setIsLoading(false);
    }
  }, [currentUser?.id]);

  const allowedInviteRoles = useMemo(
    () => (currentUser ? inviteRolesFor(currentUser.role) : []),
    [currentUser]
  );

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return members;
    }
    return members.filter((member) =>
      `${member.displayName} ${member.username} ${member.role}`
        .toLowerCase()
        .includes(query)
    );
  }, [members, search]);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    // Only show the full-page spinner when there is nothing cached to display.
    if (members.length === 0) setIsLoading(true);
    setError(null);
    try {
      const [familyResult, memberResult] = await Promise.all([
        authRequest<Family>("/api/family"),
        authRequest<User[]>("/api/family/members")
      ]);
      setFamily(familyResult);
      setMembers(memberResult);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load members");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authRequest, members.length]);

  useEffect(() => {
    void load();
  }, [load]);


  useEffect(() => {
    function handleDocumentMouseDown(event: MouseEvent) {
      if (!contactMenuRef.current?.contains(event.target as Node)) {
        setIsContactMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsContactMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  async function handleInviteSubmit(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      const response = await createInvite(accessToken, inviteForm);
      setInviteUrl(response.inviteUrl);
      setNotice("Invite link created");
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not create invite");
    }
  }

  async function createInviteLink() {
    if (!accessToken) {
      return null;
    }
    setError(null);
    setNotice(null);
    try {
      const response = await createInvite(accessToken, inviteForm);
      setInviteUrl(response.inviteUrl);
      setNotice("Invite link ready");
      return response.inviteUrl;
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not create invite");
      return null;
    }
  }

  function focusInviteForm() {
    inviteFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const firstInput = inviteFormRef.current?.querySelector("select, input, button") as HTMLElement | null;
    firstInput?.focus();
    setIsContactMenuOpen(false);
  }

  async function copyInviteLink() {
    const link = inviteUrl ?? (await createInviteLink());
    if (!link) {
      return;
    }
    await navigator.clipboard?.writeText(link).catch(() => undefined);
    setNotice("Invite link copied");
    setIsContactMenuOpen(false);
  }

  async function shareInviteLink() {
    const link = inviteUrl ?? (await createInviteLink());
    if (!link) {
      return;
    }
    const result = await shareContent({
      title: family?.name ?? "Stovo",
      text: `Join our family "${family?.name ?? "Stovo"}" on Stovo!`,
      url: link,
      dialogTitle: `Invite to ${family?.name ?? "Stovo"}`
    });
    if (result.fallbackToCopy) {
      await navigator.clipboard?.writeText(link).catch(() => undefined);
      setNotice("Invite link copied");
    } else if (result.shared) {
      setNotice("Invite share opened");
    }
    setIsContactMenuOpen(false);
  }

  async function handleRoleChange(member: User, role: UserRole) {
    if (!accessToken) {
      return;
    }
    setError(null);
    try {
      await changeMemberRole(accessToken, member.id, role);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not change role");
    }
  }

  async function handleRemove(member: User) {
    if (!accessToken) {
      return;
    }
    setError(null);
    try {
      await removeMember(accessToken, member.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not remove member");
    }
  }

  return (
    <main className="app-shell app-frame contacts-page">
      <AppNav />
      <section className="page-surface contacts-layout">
        <header className="section-header">
          <div>
            <p className="eyebrow">{family?.name ?? "Stovo"}</p>
          <h1>{copy.contacts}</h1>
          </div>
          <div className="menu-anchor" ref={contactMenuRef}>
            <button
              type="button"
              className="icon-button subtle"
              aria-label={copy.contactActions}
              aria-expanded={isContactMenuOpen}
              aria-haspopup="menu"
              title={copy.contactActions}
              onClick={() => setIsContactMenuOpen((value) => !value)}
            >
              <MoreVertical aria-hidden="true" size={20} />
            </button>
            {isContactMenuOpen && (
              <div className="action-menu" role="menu">
                <button type="button" role="menuitem" onClick={focusInviteForm}>
                  <UserPlus aria-hidden="true" size={16} />
                  {copy.addContact}
                </button>
                <button type="button" role="menuitem" onClick={() => void copyInviteLink()}>
                  <Link2 aria-hidden="true" size={16} />
                  {copy.copyInvite}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void load();
                    setIsContactMenuOpen(false);
                  }}
                >
                  <RefreshCw aria-hidden="true" size={16} />
                  {copy.refresh}
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="summary-band">
          <div>
            <span className="summary-label">{copy.signedIn}</span>
            <strong>{currentUser?.displayName}</strong>
          </div>
          <div>
            <span className="summary-label">{copy.role}</span>
            <strong>{currentUser?.role}</strong>
          </div>
          <div>
            <span className="summary-label">{copy.title}</span>
            <strong>{members.length}</strong>
          </div>
        </div>

        {error && <p className="error-text" role="alert">{error}</p>}
        {notice && <p className="success-text" role="status">{notice}</p>}

        <label className="search-field contacts-search">
          <Search aria-hidden="true" size={18} />
          <input
            placeholder={copy.searchContacts}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="quick-action-row">
          <button type="button" onClick={focusInviteForm}>
            <UserPlus aria-hidden="true" size={18} />
            {copy.addContact}
          </button>
          <button type="button" onClick={() => void createInviteLink()}>
            <Link2 aria-hidden="true" size={18} />
            {copy.inviteLink}
          </button>
          <button type="button" onClick={() => void shareInviteLink()}>
            <QrCode aria-hidden="true" size={18} />
            {copy.shareInvite}
          </button>
        </div>

        {allowedInviteRoles.length > 0 && (
          <form className="toolbar-form" ref={inviteFormRef} onSubmit={handleInviteSubmit}>
            <label>
              {copy.inviteRole}
              <select
                value={inviteForm.role}
                onChange={(event) =>
                  setInviteForm({ ...inviteForm, role: event.target.value as UserRole })
                }
              >
                {allowedInviteRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <label>{copy.hours}<PresetNumberControl ariaLabel={copy.hours} customLabel={strings.chats?.details?.custom ?? "Custom"} presets={[1, 6, 12, 24, 48, 72, 168, 720]} min={1} max={720} value={inviteForm.expiresInHours} onValueChange={(value) => setInviteForm({ ...inviteForm, expiresInHours: Number(value) })} /></label>
            <label>{copy.uses}<PresetNumberControl ariaLabel={copy.uses} customLabel={strings.chats?.details?.custom ?? "Custom"} presets={[1, 5, 10, 25, 50, 100]} min={1} max={100} value={inviteForm.maxUses} onValueChange={(value) => setInviteForm({ ...inviteForm, maxUses: Number(value) })} /></label>
            <button type="submit">{copy.createInvite}</button>
          </form>
        )}

        {inviteUrl && (
          <div className="invite-result">
            <code>{inviteUrl}</code>
            <button type="button" onClick={() => void copyInviteLink()}>
              {copy.copy}
            </button>
          </div>
        )}

        <div className="member-list" aria-busy={isLoading}>
          {filteredMembers.length === 0 && !isLoading && (
            <div className="empty-state compact-empty">
              <UserPlus aria-hidden="true" size={30} />
              <strong>{copy.noContacts}</strong>
              <p>{copy.inviteFamilyOrSearch}</p>
            </div>
          )}
          {filteredMembers.map((member) => {
            const manageable = currentUser ? canManage(currentUser, member) : false;
            const roleOptions =
              currentUser?.role === "admin" ? ROLE_OPTIONS.filter((role) => role !== "admin") : ROLE_OPTIONS;

            return (
              <article className="member-row" key={member.id}>
                <div>
                  <MemberAvatar accessToken={accessToken} member={member} />
                  <span>
                    <strong>{member.displayName}</strong>
                    <small>@{member.username}</small>
                  </span>
                </div>
                <div className="member-actions">
                  <select
                    value={member.role}
                    disabled={!manageable}
                    onChange={(event) => void handleRoleChange(member, event.target.value as UserRole)}
                  >
                    {member.role === "owner" && <option value="owner">owner</option>}
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <button type="button" disabled={!manageable} onClick={() => void handleRemove(member)}>
                    {copy.remove}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
