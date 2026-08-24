import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { User, UserRole } from "../api/auth";
import { ApiError, getClusterPrefix } from "../api/client";
import { changeMemberRole, getServerRoles, removeMember, ServerRole } from "../api/family";
import { useAuth } from "../auth/AuthContext";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import AppNav from "./AppNav";

const MEMBERS_PAGE_SIZE = 20;

function canManage(actor: User, target: User) {
  if (actor.id === target.id) return false;
  if (actor.role === "owner") return target.role !== "owner";
  if (actor.role === "admin") return target.role !== "owner";
  return false;
}

function formatLastSeen(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "Active now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return date.toLocaleDateString();
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

  return (
    <main className="app-shell app-frame admin-page admin-detail-page">
      <AppNav />
      <section className="page-surface admin-surface">
        <div className="admin-detail-header">
          <Link to={`${prefix}/app/admin`} className="mobile-back-button" aria-label="Back to Admin">
            <span className="ms-icon ms-icon--22" aria-hidden="true">
              arrow_back
            </span>
          </Link>
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
                        @{member.username} · {formatLastSeen(member.lastSeenAt)}
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
                    </div>
                  </article>
                );
              })}
              {hasMoreMembers && <div ref={loadMoreRef} className="admin-member-list-sentinel" aria-hidden="true" />}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
