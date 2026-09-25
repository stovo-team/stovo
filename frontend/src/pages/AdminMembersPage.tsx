import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { User, UserRole } from "../api/auth";
import { ApiError, getClusterPrefix } from "../api/client";
import { banMemberIP, changeMemberRole, getMemberAdminDetails, getServerRoles, MemberAdminDetails, removeMember, ServerRole, unbanMemberIP } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import AppNav from "./AppNav";
import { BackButton } from "../components/BackButton";
import { formatMemberJoined, formatMemberLastSeen } from "./memberStats";
import { trapDialogTab } from "./adminMemberDialog";

const MEMBERS_PAGE_SIZE = 20;

function canManage(actor: User, target: User) {
  if (actor.id === target.id) return false;
  if (actor.role === "owner") return target.role !== "owner";
  if (actor.role === "admin") return target.role !== "owner";
  return false;
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
    <span className="avatar member-avatar admin-member-avatar">
      {previewUrl ? <img src={previewUrl} alt="" /> : initials(member.displayName)}
    </span>
  );
}

export default function AdminMembersPage() {
  const { accessToken, authRequest, currentUser } = useAuth();
  const [members, setMembers] = useState<User[]>([]);
	const [roles, setRoles] = useState<ServerRole[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(MEMBERS_PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [memberDetails, setMemberDetails] = useState<MemberAdminDetails | null>(null);
  const [memberDetailsError, setMemberDetailsError] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [pendingIPAction, setPendingIPAction] = useState<"ban" | "unban" | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const detailsDialogRef = useRef<HTMLElement | null>(null);
  const confirmDialogRef = useRef<HTMLElement | null>(null);
  const detailsReturnFocusRef = useRef<HTMLElement | null>(null);
  const confirmReturnFocusRef = useRef<HTMLElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const canViewAdmin = currentUser?.role === "owner" || currentUser?.permissions?.includes("manage_members") === true;
  const prefix = getClusterPrefix();

  const filteredMembers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) =>
      `${member.displayName} ${member.username} ${member.role}`.toLowerCase().includes(query)
    );
  }, [memberSearch, members]);

  const visibleMembers = useMemo(
    () => filteredMembers.slice(0, visibleCount),
    [filteredMembers, visibleCount]
  );

  const hasMoreMembers = visibleCount < filteredMembers.length;

  const load = useCallback(async () => {
    if (!accessToken || !canViewAdmin) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
		const [membersResult, roleResult] = await Promise.all([authRequest<User[]>("/api/family/members"), getServerRoles(accessToken)]);
      setMembers(membersResult.filter((member) => (member.role as string) !== "connector"));
		setRoles(roleResult);
      setVisibleCount(MEMBERS_PAGE_SIZE);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not load members");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authRequest, canViewAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setVisibleCount(MEMBERS_PAGE_SIZE);
  }, [memberSearch]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMoreMembers) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setVisibleCount((current) => Math.min(current + MEMBERS_PAGE_SIZE, filteredMembers.length));
      },
      { root: null, rootMargin: "160px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [filteredMembers.length, hasMoreMembers, visibleMembers.length]);

  useEffect(() => {
    if (!openMenuId) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId(null);
    };
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpenMenuId(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (selectedMember && !isLoadingDetails) {
      detailsDialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    } else if (!selectedMember) {
      detailsReturnFocusRef.current?.focus();
      detailsReturnFocusRef.current = null;
    }
  }, [selectedMember, isLoadingDetails]);

  useEffect(() => {
    if (pendingIPAction) {
      confirmDialogRef.current?.querySelector<HTMLElement>(".admin-member-confirm-primary")?.focus();
    } else {
      confirmReturnFocusRef.current?.focus();
      confirmReturnFocusRef.current = null;
    }
  }, [pendingIPAction]);

  async function handleRoleChange(member: User, role: UserRole) {
    if (!accessToken) return;
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      await changeMemberRole(accessToken, member.id, role);
      setNotice(`Updated ${member.displayName} to ${role}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not change role");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(member: User) {
    if (!accessToken) return;
    if (!window.confirm(`Remove “${member.displayName}” from the family?`)) return;
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      await removeMember(accessToken, member.id);
      setNotice(`${member.displayName} removed`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not remove member");
    } finally {
      setIsSaving(false);
    }
  }

  async function openMemberDetails(member: User) {
    detailsReturnFocusRef.current = Array.from(document.querySelectorAll<HTMLElement>("[aria-haspopup='menu']"))
      .find((button) => button.getAttribute("aria-label") === `More actions for ${member.displayName}`) ?? null;
    setOpenMenuId(null);
    setSelectedMember(member);
    setMemberDetails(null);
    setMemberDetailsError(null);
    setIsLoadingDetails(true);
    setError(null);
    try {
      if (!accessToken) throw new Error("Sign in again to manage members");
      setMemberDetails(await getMemberAdminDetails(accessToken, member.id));
    } catch (err) {
      setMemberDetailsError(err instanceof ApiError ? String(err.message) : "Could not load member details");
    } finally {
      setIsLoadingDetails(false);
    }
  }

  function requestIPAction(action: "ban" | "unban") {
    confirmReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPendingIPAction(action);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>, confirmation = false) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (confirmation) setPendingIPAction(null);
      else setSelectedMember(null);
      return;
    }
    trapDialogTab(event);
  }

  async function confirmMemberIPAction() {
    if (!accessToken || !selectedMember || !memberDetails || !pendingIPAction) return;
    const candidateIP = memberDetails.candidateIp;
    const bannedIP = memberDetails.bannedIp;
    if (pendingIPAction === "ban" && !candidateIP) return;
    if (pendingIPAction === "unban" && !bannedIP) return;
    setIsSaving(true);
    setError(null);
    try {
      if (pendingIPAction === "ban") await banMemberIP(accessToken, selectedMember.id, candidateIP!);
      else await unbanMemberIP(accessToken, selectedMember.id);
      setPendingIPAction(null);
      setNotice(pendingIPAction === "ban" ? `An IP block is active for ${selectedMember.displayName}` : `Lifted the IP block for ${selectedMember.displayName}`);
      await openMemberDetails(selectedMember);
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : "Could not update IP block");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="app-shell app-frame admin-page admin-detail-page">
      <AppNav />
      <section className="page-surface admin-surface">
        <div className="admin-detail-header">
          <BackButton to={`${prefix}/app/admin`} className="mobile-back-button" ariaLabel="Back to Admin" />
          <div>
            <h1>Members</h1>
          </div>
        </div>

        {!canViewAdmin && <p className="error-text">Admin access required.</p>}
        {error && <p className="error-text">{error}</p>}
        {notice && <p className="success-text">{notice}</p>}

        {canViewAdmin && (
          <section className="admin-members-panel admin-panel">
            <label className="admin-search-field">
              <span className="ms-icon ms-icon--20" aria-hidden="true">
                search
              </span>
              <input
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search members"
              />
            </label>

            {!isLoading && (
              <p className="admin-member-list-summary" aria-live="polite">
                members {visibleMembers.length} out of {filteredMembers.length}
              </p>
            )}

            <div className="admin-member-list" aria-busy={isLoading}>
              {isLoading && <p className="muted-text">Loading…</p>}
              {!isLoading && filteredMembers.length === 0 && <p className="muted-text">No members found.</p>}
              {visibleMembers.map((member) => {
                const manageable = currentUser ? canManage(currentUser, member) : false;
                const roleOptions = roles;

                return (
                  <article key={member.id} className="admin-member-row admin-member-row--manage">
                    <MemberAvatar accessToken={accessToken} member={member} />
                    <span className="admin-member-copy">
                      <strong>{member.displayName}</strong>
                      <small>
                        @{member.username} · {member.lastSeenVisibility === "nobody" ? "Last seen hidden" : `Last seen ${formatMemberLastSeen(member.lastSeenAt)}`}
                      </small>
                    </span>
                    <div className="admin-member-actions">
                      <select
                        value={member.roleId ?? member.role}
                        disabled={!manageable || isSaving}
                        onChange={(event) => void handleRoleChange(member, event.target.value as UserRole)}
                        aria-label={`Role for ${member.displayName}`}
                      >
                        {member.role === "owner" && <option value="owner">Owner</option>}
                        {roleOptions.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="danger-button admin-member-remove"
                        disabled={!manageable || isSaving}
                        onClick={() => void handleRemove(member)}
                        aria-label={`Remove ${member.displayName}`}
                      >
                        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                          <path
                            fill="currentColor"
                            d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm2 2h2v1h-2V5zM7 6h10v13H7V6zm2 3v8h2V9H9zm4 0v8h2V9h-2z"
                          />
                        </svg>
                      </button>
                      {canViewAdmin && (
                        <div className="admin-member-context" ref={openMenuId === member.id ? menuRef : undefined}>
                          <button
                            type="button"
                            className="admin-member-context-trigger"
                            aria-haspopup="menu"
                            aria-expanded={openMenuId === member.id}
                            aria-label={`More actions for ${member.displayName}`}
                            disabled={isSaving}
                            onClick={() => setOpenMenuId((current) => current === member.id ? null : member.id)}
                          >
                            ⋯
                          </button>
                          {openMenuId === member.id && (
                            <div className="admin-member-context-menu" role="menu" aria-label={`Actions for ${member.displayName}`}>
                              <button type="button" role="menuitem" onClick={() => void openMemberDetails(member)}>Activity and safety</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
              {hasMoreMembers && <div ref={loadMoreRef} className="admin-member-list-sentinel" aria-hidden="true" />}
            </div>
          </section>
        )}
        {selectedMember && (
          <div className="admin-member-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSelectedMember(null); setPendingIPAction(null); } }}>
            <section ref={detailsDialogRef} className="admin-member-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-member-dialog-title" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event)}>
              <h2 id="admin-member-dialog-title">{selectedMember.displayName}: activity and safety</h2>
              {isLoadingDetails && <p className="muted-text">Loading…</p>}
              {memberDetailsError && <p className="error-text" role="alert">{memberDetailsError}</p>}
              {memberDetails && (
                <dl className="admin-member-details">
                  <div><dt>Account</dt><dd>{memberDetails.isActive ? "Enabled" : "Disabled"}</dd></div>
                  <div><dt>Presence</dt><dd>{memberDetails.isOnline ? "Online now" : "Offline"}</dd></div>
                  <div><dt>Joined</dt><dd>{formatMemberJoined(memberDetails.joinedAt)}</dd></div>
                  <div><dt>Last seen</dt><dd>{formatMemberLastSeen(memberDetails.lastSeenAt)}</dd></div>
                  <div><dt>IP block</dt><dd>{memberDetails.candidateIpBanned ? "Blocked" : "Not blocked"}</dd></div>
                </dl>
              )}
              {memberDetails && !isLoadingDetails && memberDetails.bannedIp && <button type="button" className="secondary-button" disabled={isSaving} onClick={() => requestIPAction("unban")}>Lift IP block</button>}
              {memberDetails && !isLoadingDetails && !memberDetails.bannedIp && memberDetails.candidateIp && !memberDetails.candidateIpBanned && <button type="button" className="danger-button" disabled={isSaving} onClick={() => requestIPAction("ban")}>Block this IP</button>}
              {memberDetails && !isLoadingDetails && !memberDetails.bannedIp && memberDetails.candidateIpBanned && <p className="muted-text">This IP is already blocked for this family.</p>}
              {memberDetails && !isLoadingDetails && !memberDetails.candidateIp && !memberDetails.bannedIp && <p className="muted-text">No valid sign-in IP is available for this member.</p>}
              <button type="button" className="secondary-button" onClick={() => { setSelectedMember(null); setPendingIPAction(null); }}>Close</button>
            </section>
          </div>
        )}
        {pendingIPAction && selectedMember && memberDetails && (pendingIPAction === "ban" ? memberDetails.candidateIp : memberDetails.bannedIp) && (
          <div className="admin-member-dialog-backdrop">
            <section ref={confirmDialogRef} className="admin-member-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-ip-confirm-title" aria-describedby="admin-ip-confirm-description" tabIndex={-1} onKeyDown={(event) => handleDialogKeyDown(event, true)}>
              <h2 id="admin-ip-confirm-title">{pendingIPAction === "ban" ? "Block this IP address?" : "Lift this IP block?"}</h2>
              <p id="admin-ip-confirm-description">{pendingIPAction === "ban" ? "Sign-ins from this exact IP address will be blocked for all accounts in this family until you lift the block." : "Accounts in this family will be able to sign in from this IP address again."}</p>
              <p className="admin-member-confirm-ip"><strong>{pendingIPAction === "ban" ? memberDetails.candidateIp : memberDetails.bannedIp}</strong></p>
              <button type="button" className={`admin-member-confirm-primary ${pendingIPAction === "ban" ? "danger-button" : "primary-button"}`} disabled={isSaving} onClick={() => void confirmMemberIPAction()}>{isSaving ? "Saving…" : pendingIPAction === "ban" ? "Confirm block" : "Confirm lift"}</button>
              <button type="button" className="secondary-button" disabled={isSaving} onClick={() => setPendingIPAction(null)}>Cancel</button>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
