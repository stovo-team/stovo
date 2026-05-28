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
import { useAuth } from "../auth/AuthContext";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import AppNav from "./AppNav";

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

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase())
    .join("");
}

function MemberAvatar({ accessToken, member }: { accessToken: string | null; member: User }) {
  const previewUrl = useFilePreviewUrl(accessToken, member.profilePhoto, Boolean(member.profilePhoto));

  return (
    <span className="avatar member-avatar">
      {previewUrl ? <img src={previewUrl} alt="" /> : initials(member.displayName)}
    </span>
  );
}

export default function MembersPage() {
  const { accessToken, currentUser, authRequest } = useAuth();
  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isContactMenuOpen, setIsContactMenuOpen] = useState(false);
  const inviteFormRef = useRef<HTMLFormElement | null>(null);
  const contactMenuRef = useRef<HTMLDivElement | null>(null);
  const [inviteForm, setInviteForm] = useState({
    role: "member" as UserRole,
    expiresInHours: 48,
    maxUses: 1
  });

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
      `${member.displayName} ${member.email} ${member.username} ${member.role}`
        .toLowerCase()
        .includes(query)
    );
  }, [members, search]);

  const load = useCallback(async () => {
    if (!accessToken) {
      return;
    }
    setIsLoading(true);
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
  }, [accessToken, authRequest]);

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
    if (navigator.share) {
      await navigator.share({ title: family?.name ?? "Velo", url: link }).catch(() => undefined);
      setNotice("Invite share opened");
    } else {
      await navigator.clipboard?.writeText(link).catch(() => undefined);
      setNotice("Invite link copied");
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
            <p className="eyebrow">{family?.name ?? "Velo"}</p>
            <h1>Contacts</h1>
          </div>
          <div className="menu-anchor" ref={contactMenuRef}>
            <button
              type="button"
              className="icon-button subtle"
              aria-label="Contact actions"
              aria-expanded={isContactMenuOpen}
              aria-haspopup="menu"
              title="Contact actions"
              onClick={() => setIsContactMenuOpen((value) => !value)}
            >
              <MoreVertical aria-hidden="true" size={20} />
            </button>
            {isContactMenuOpen && (
              <div className="action-menu" role="menu">
                <button type="button" role="menuitem" onClick={focusInviteForm}>
                  <UserPlus aria-hidden="true" size={16} />
                  Add contact
                </button>
                <button type="button" role="menuitem" onClick={() => void copyInviteLink()}>
                  <Link2 aria-hidden="true" size={16} />
                  Copy invite
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
                  Refresh
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="summary-band">
          <div>
            <span className="summary-label">Signed in</span>
            <strong>{currentUser?.displayName}</strong>
          </div>
          <div>
            <span className="summary-label">Role</span>
            <strong>{currentUser?.role}</strong>
          </div>
          <div>
            <span className="summary-label">Members</span>
            <strong>{members.length}</strong>
          </div>
        </div>

        {error && <p className="error-text" role="alert">{error}</p>}
        {notice && <p className="success-text" role="status">{notice}</p>}

        <label className="search-field contacts-search">
          <Search aria-hidden="true" size={18} />
          <input
            placeholder="Search contacts"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <div className="quick-action-row">
          <button type="button" onClick={focusInviteForm}>
            <UserPlus aria-hidden="true" size={18} />
            Add contact
          </button>
          <button type="button" onClick={() => void createInviteLink()}>
            <Link2 aria-hidden="true" size={18} />
            Invite link
          </button>
          <button type="button" onClick={() => void shareInviteLink()}>
            <QrCode aria-hidden="true" size={18} />
            Share invite
          </button>
        </div>

        {allowedInviteRoles.length > 0 && (
          <form className="toolbar-form" ref={inviteFormRef} onSubmit={handleInviteSubmit}>
            <label>
              Invite role
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
            <label>
              Hours
              <input
                min={1}
                max={720}
                type="number"
                value={inviteForm.expiresInHours}
                onChange={(event) =>
                  setInviteForm({ ...inviteForm, expiresInHours: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Uses
              <input
                min={1}
                max={100}
                type="number"
                value={inviteForm.maxUses}
                onChange={(event) =>
                  setInviteForm({ ...inviteForm, maxUses: Number(event.target.value) })
                }
              />
            </label>
            <button type="submit">Create invite</button>
          </form>
        )}

        {inviteUrl && (
          <div className="invite-result">
            <code>{inviteUrl}</code>
            <button type="button" onClick={() => void copyInviteLink()}>
              Copy
            </button>
          </div>
        )}

        <div className="member-list" aria-busy={isLoading}>
          {filteredMembers.length === 0 && !isLoading && (
            <div className="empty-state compact-empty">
              <UserPlus aria-hidden="true" size={30} />
              <strong>No contacts found</strong>
              <p>Invite family members or adjust the search.</p>
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
                    <small>{member.email}</small>
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
                    Remove
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
