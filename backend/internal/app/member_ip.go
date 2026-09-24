package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	socketio "github.com/doquangtan/socketio/v4"
	"stovo-messenger/backend/internal/ports"
)

type memberAdminDetails struct {
	ID                string     `json:"id"`
	IsActive          bool       `json:"isActive"`
	IsOnline          bool       `json:"isOnline"`
	JoinedAt          *time.Time `json:"joinedAt"`
	LastSeenAt        *time.Time `json:"lastSeenAt"`
	CandidateIP       *string    `json:"candidateIp"`
	CandidateIPBanned bool       `json:"candidateIpBanned"`
	BannedIP          *string    `json:"bannedIp"`
}

type memberIPStore interface {
	CandidateIP(context.Context, string) (string, error)
	IsBanned(context.Context, string, string) (bool, error)
	Ban(context.Context, string, string, string, string) error
	Unban(context.Context, string, string) (bool, error)
	BannedIP(context.Context, string, string) (string, error)
}

type sqlMemberIPStore struct{ db *sql.DB }

var errMemberIPAlreadyBanned = errors.New("IP address is already blocked for this family")
var errMemberIPBanPublish = errors.New("IP ban was persisted but remote socket revocation could not be published")

func normalizeMemberBanIP(value string) (string, bool) {
	parsed := net.ParseIP(strings.TrimSpace(value))
	if parsed == nil {
		return "", false
	}
	return parsed.String(), true
}

func (store sqlMemberIPStore) CandidateIP(ctx context.Context, userID string) (string, error) {
	if store.db == nil {
		return "", errors.New("member IP store unavailable")
	}
	rows, err := store.db.QueryContext(ctx, `SELECT ip_address FROM refresh_tokens WHERE user_id = $1 AND ip_address IS NOT NULL AND ip_address <> '' ORDER BY created_at DESC LIMIT 100`, userID)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return "", err
		}
		if normalized, ok := normalizeMemberBanIP(raw); ok {
			return normalized, nil
		}
	}
	return "", rows.Err()
}

func (store sqlMemberIPStore) IsBanned(ctx context.Context, familyID, ip string) (bool, error) {
	normalized, ok := normalizeMemberBanIP(ip)
	if !ok {
		return false, nil
	}
	if store.db == nil {
		return false, errors.New("member IP store unavailable")
	}
	var banned bool
	err := store.db.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM family_ip_bans WHERE family_id = $1 AND ip_address = $2::inet)`, familyID, normalized).Scan(&banned)
	return banned, err
}

func (store sqlMemberIPStore) Ban(ctx context.Context, familyID, targetID, rawIP, actorID string) error {
	ip, ok := normalizeMemberBanIP(rawIP)
	if !ok {
		return errors.New("invalid IP address")
	}
	candidate, err := store.CandidateIP(ctx, targetID)
	if err != nil {
		return err
	}
	if candidate != ip {
		return sql.ErrNoRows
	}
	banned, err := store.IsBanned(ctx, familyID, ip)
	if err != nil {
		return err
	}
	if banned {
		ownedIP, ownErr := store.BannedIP(ctx, familyID, targetID)
		if ownErr == nil && ownedIP == ip {
			return nil
		}
		if ownErr != nil && !errors.Is(ownErr, sql.ErrNoRows) {
			return ownErr
		}
		return errMemberIPAlreadyBanned
	}
	_, err = store.db.ExecContext(ctx, `INSERT INTO family_ip_bans (family_id, ip_address, target_user_id, created_by) VALUES ($1, $2::inet, $3, $4) ON CONFLICT (family_id, target_user_id) DO UPDATE SET ip_address = EXCLUDED.ip_address, created_at = now(), created_by = EXCLUDED.created_by`, familyID, ip, targetID, actorID)
	if err != nil {
		// If a concurrent ban won the unique-IP race, make the client refresh
		// rather than reporting a successful operation for this target.
		banned, checkErr := store.IsBanned(ctx, familyID, ip)
		if checkErr == nil && banned {
			ownedIP, ownErr := store.BannedIP(ctx, familyID, targetID)
			if ownErr == nil && ownedIP == ip {
				return nil
			}
			if ownErr == nil || errors.Is(ownErr, sql.ErrNoRows) {
				return errMemberIPAlreadyBanned
			}
		}
	}
	return err
}

func (store sqlMemberIPStore) Unban(ctx context.Context, familyID, targetID string) (bool, error) {
	if store.db == nil {
		return false, errors.New("member IP store unavailable")
	}
	result, err := store.db.ExecContext(ctx, `DELETE FROM family_ip_bans WHERE family_id = $1 AND target_user_id = $2`, familyID, targetID)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count > 0, err
}

func (store sqlMemberIPStore) BannedIP(ctx context.Context, familyID, targetID string) (string, error) {
	if store.db == nil {
		return "", errors.New("member IP store unavailable")
	}
	var ip string
	err := store.db.QueryRowContext(ctx, `SELECT ip_address::text FROM family_ip_bans WHERE family_id = $1 AND target_user_id = $2`, familyID, targetID).Scan(&ip)
	return ip, err
}

func (s *Server) candidateMemberIP(ctx context.Context, userID string) (string, error) {
	if s.memberIPs == nil {
		return "", errors.New("member IP store unavailable")
	}
	return s.memberIPs.CandidateIP(ctx, userID)
}

func (s *Server) isFamilyIPBanned(ctx context.Context, familyID, ip string) (bool, error) {
	if strings.TrimSpace(ip) == "" {
		return false, nil
	}
	normalized, ok := normalizeMemberBanIP(ip)
	if !ok {
		return false, errors.New("invalid client IP address")
	}
	if s.memberIPs == nil {
		return false, errors.New("member IP store unavailable")
	}
	return s.memberIPs.IsBanned(ctx, familyID, normalized)
}

func (s *Server) authorizeSocketClientIP(ctx context.Context, user userPublic, ip string) error {
	if _, ok := normalizeMemberBanIP(ip); !ok {
		return errUnauthorized
	}
	banned, err := s.isFamilyIPBanned(ctx, user.FamilyID, ip)
	if err != nil || banned {
		return errUnauthorized
	}
	return nil
}

// withSocketAdmission serializes the ban check and complete connection setup
// against BanMemberIP's database-write-and-disconnect critical section.
func (s *Server) withSocketAdmission(ctx context.Context, user userPublic, socket *socketio.Socket, ip string, connected func()) error {
	s.memberIPMu.RLock()
	defer s.memberIPMu.RUnlock()
	if err := s.authorizeSocketClientIP(ctx, user, ip); err != nil {
		_ = socket.Disconnect()
		return err
	}
	if s.sessions == nil {
		_ = socket.Disconnect()
		return errUnauthorized
	}
	s.sessions.RegisterWithIP(user, socket, ip)
	if connected != nil {
		connected()
	}
	return nil
}

func (s *Server) banMemberIPAndDisconnect(ctx context.Context, familyID, targetID, ip, actorID string) error {
	s.memberIPMu.Lock()
	if s.memberIPs == nil {
		s.memberIPMu.Unlock()
		return errors.New("member IP store unavailable")
	}
	if err := s.memberIPs.Ban(ctx, familyID, targetID, ip, actorID); err != nil {
		s.memberIPMu.Unlock()
		return err
	}
	if s.sessions != nil {
		s.sessions.DisconnectFamilyIP(familyID, ip)
	}
	s.memberIPMu.Unlock()
	if s.broker != nil {
		canonicalIP, ok := normalizeMemberBanIP(ip)
		if !ok {
			return errors.New("invalid IP address")
		}
		if err := s.broker.Publish(ctx, brokerChannelMemberIPBans, ports.Event{
			"type":      "family_ip_banned",
			"family_id": familyID,
			"ip":        canonicalIP,
		}); err != nil {
			return fmt.Errorf("%w: %v", errMemberIPBanPublish, err)
		}
	}
	return nil
}

func (s *Server) sweepBannedMemberIPSockets(ctx context.Context) error {
	if s.sessions == nil || s.memberIPs == nil {
		return nil
	}
	lookupFailed := false
	for _, pair := range s.sessions.FamilyIPPairs() {
		ip, ok := normalizeMemberBanIP(pair.ip)
		if !ok {
			continue
		}
		s.memberIPMu.Lock()
		banned, err := s.isFamilyIPBanned(ctx, pair.familyID, ip)
		if err == nil && banned {
			s.sessions.DisconnectFamilyIP(pair.familyID, ip)
		}
		s.memberIPMu.Unlock()
		if err != nil {
			lookupFailed = true
		}
	}
	if lookupFailed {
		return errors.New("one or more active socket IP ban lookups failed")
	}
	return nil
}

func (s *Server) rejectBannedInviteIP(ctx context.Context, familyID, ip string) error {
	if _, ok := normalizeMemberBanIP(ip); !ok {
		return errUnauthorized
	}
	banned, err := s.isFamilyIPBanned(ctx, familyID, ip)
	if err != nil || banned {
		return errUnauthorized
	}
	return nil
}

func validIP(value string) bool { _, ok := normalizeMemberBanIP(value); return ok }

func authorizeMemberSafety(actor, target userPublic, inspectOnly bool) error {
	if !hasPermission(actor, permissionManageMembers) {
		return errForbidden
	}
	if !target.IsActive || actor.FamilyID != target.FamilyID {
		return errNotFound
	}
	if !inspectOnly && (actor.ID == target.ID || target.Role == ownerRole) {
		return errForbidden
	}
	return nil
}

func redactMemberIPDetails(actor, target userPublic, details memberAdminDetails) memberAdminDetails {
	if actor.ID == target.ID || target.Role == ownerRole {
		details.CandidateIP = nil
		details.CandidateIPBanned = false
		details.BannedIP = nil
	}
	return details
}

func isMemberIPRecoveryRequest(r *http.Request) bool {
	path := strings.TrimSuffix(r.URL.Path, "/")
	return r.Method == http.MethodGet && strings.HasSuffix(path, "/admin-details") ||
		r.Method == http.MethodDelete && strings.HasSuffix(path, "/ip-ban")
}

func (s *Server) ensureMemberIPCandidate(ctx context.Context, userID, rawIP string) (string, error) {
	normalized, ok := normalizeMemberBanIP(rawIP)
	if !ok {
		return "", errors.New("invalid IP address")
	}
	candidate, err := s.candidateMemberIP(ctx, userID)
	if err != nil {
		return "", err
	}
	if candidate != normalized {
		return "", sql.ErrNoRows
	}
	return normalized, nil
}

func (s *Server) loadMemberAdminDetails(ctx context.Context, member userPublic) (memberAdminDetails, error) {
	if s.memberIPs == nil {
		return memberAdminDetails{}, errors.New("member IP store unavailable")
	}
	details := memberAdminDetails{ID: member.ID, IsActive: member.IsActive, JoinedAt: member.CreatedAt}
	// Respect the member's last-seen setting even for administrative metadata.
	if member.LastSeenVisibility != "nobody" {
		details.LastSeenAt = member.LastSeenAt
		details.IsOnline = s.sessions != nil && s.sessions.IsOnline(member.ID)
	}
	candidate, err := s.candidateMemberIP(ctx, member.ID)
	if err != nil {
		return memberAdminDetails{}, err
	}
	if candidate != "" {
		details.CandidateIP = &candidate
		details.CandidateIPBanned, err = s.isFamilyIPBanned(ctx, member.FamilyID, candidate)
		if err != nil {
			return memberAdminDetails{}, err
		}
	}
	bannedIP, err := s.memberIPs.BannedIP(ctx, member.FamilyID, member.ID)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return memberAdminDetails{}, err
	}
	if err == nil && bannedIP != "" {
		details.BannedIP = &bannedIP
	}
	return details, nil
}
