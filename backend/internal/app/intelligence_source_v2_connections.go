package app

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/google/uuid"
)

func (s *Server) rotateIntelligenceSourceV2Credential(ctx context.Context, request *http.Request, clientID, clientSecret, connectionID, oldCredential, redirectURI string) (httptransport.IntelligenceSourceV2CredentialResponse, error) {
	if err := s.requireIntelligenceSourceV2ConsentEnabled(); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, err
	}
	if err := s.intelligenceSourceV2ConsentRateLimit(ctx, request, "rotate", 30); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, err
	}
	if err := s.validateIntelligenceSourceV2ClientAuthentication(clientID, clientSecret); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, err
	}
	if !containsExactString(s.cfg.IntelligenceOIDCRedirectURIs, redirectURI) {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	if strings.TrimSpace(connectionID) == "" || len(connectionID) > 256 || oldCredential == "" || len(oldCredential) > 128 {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	rawCredential, err := randomToken()
	if err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	oldDigest := sha256.Sum256([]byte(oldCredential))
	newDigest := sha256.Sum256([]byte(rawCredential))
	now := s.intelligenceOIDCNow()
	expiresAt := now.Add(intelligenceSourceV2CredentialTTL)
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var installationID, principalUserID string
	err = tx.QueryRowContext(ctx, `
		SELECT i.id,c.principal_user_id
		FROM public.intelligence_source_v2_connections c
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.enabled
		JOIN public.users u ON u.id=c.principal_user_id AND u.is_active=1 AND u.family_id=i.family_id
		WHERE c.id=$1 AND c.credential_hash=$2 AND c.enabled AND c.revoked_at IS NULL
		  AND c.credential_expires_at>$3
		  AND (SELECT count(*) FROM public.intelligence_source_v2_connection_chats scope WHERE scope.connection_id=c.id)=1
		  AND EXISTS (
			SELECT 1 FROM public.intelligence_source_v2_connection_chats scope
			JOIN public.chats ch ON ch.id=scope.chat_id AND ch.family_id=i.family_id
			JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=u.id
			WHERE scope.connection_id=c.id)
		FOR UPDATE OF c`, connectionID, oldDigest[:], now).Scan(&installationID, &principalUserID)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	update, err := tx.ExecContext(ctx, `
		UPDATE public.intelligence_source_v2_connections SET credential_hash=$1,credential_expires_at=$2
		WHERE id=$3 AND credential_hash=$4 AND enabled AND revoked_at IS NULL AND credential_expires_at>$5`,
		newDigest[:], expiresAt, connectionID, oldDigest[:], now)
	if err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if affected, err := update.RowsAffected(); err != nil || affected != 1 {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	grants, err := intelligenceSourceV2ReadGrants(ctx, tx, connectionID)
	if err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if err := insertIntelligenceSourceV2Audit(ctx, tx, installationID, connectionID, principalUserID, "credential_rotate", "rotated", "", now); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if err := tx.Commit(); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return httptransport.IntelligenceSourceV2CredentialResponse{
		ConnectionID: connectionID, SourceCredential: rawCredential, TokenType: "Bearer",
		ExpiresIn: int64(intelligenceSourceV2CredentialTTL.Seconds()), Grants: grants,
	}, nil
}

func (s *Server) revokeIntelligenceSourceV2Connection(ctx context.Context, _ *http.Request, principal httptransport.IntelligenceSourceV2ConsentPrincipal, connectionID, grantType string) error {
	if s.sqlDB == nil {
		return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if err := s.requireActiveIntelligenceSourceV2Principal(ctx, principal); err != nil {
		return err
	}
	now := s.intelligenceOIDCNow()
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var installationID, chatID string
	var connectionEnabled bool
	var revokedAt sql.NullTime
	err = tx.QueryRowContext(ctx, `
		SELECT c.installation_id,scope.chat_id,c.enabled,c.revoked_at
		FROM public.intelligence_source_v2_connections c
	JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id
		WHERE c.id=$1 AND c.principal_user_id=$2 FOR UPDATE OF c`, connectionID, principal.UserID).Scan(&installationID, &chatID, &connectionEnabled, &revokedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.ErrIntelligenceSourceV2ConsentNotFound
	}
	if err != nil {
		return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if grantType != "" {
		var wasGranted bool
		if err := tx.QueryRowContext(ctx, `SELECT granted FROM public.intelligence_source_v2_connection_grants WHERE connection_id=$1 AND grant_type=$2`, connectionID, grantType).Scan(&wasGranted); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return httptransport.ErrIntelligenceSourceV2ConsentNotFound
			}
			return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
		if wasGranted {
			if err := emitIntelligenceSourceV2ScopeTombstone(ctx, tx, connectionID, chatID, "grant_revoked:"+grantType, grantType == "read"); err != nil {
				return err
			}
		}
		result, err := tx.ExecContext(ctx, `
			UPDATE public.intelligence_source_v2_connection_grants
			SET granted=false,revoked_at=COALESCE(revoked_at,$1),updated_at=$1
			WHERE connection_id=$2 AND grant_type=$3`, now, connectionID, grantType)
		if err != nil {
			return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
		if affected, err := result.RowsAffected(); err != nil || affected != 1 {
			return httptransport.ErrIntelligenceSourceV2ConsentNotFound
		}
		if err := insertIntelligenceSourceV2Audit(ctx, tx, installationID, connectionID, principal.UserID, "grant_revoke", "revoked", grantType, now); err != nil {
			return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
	} else {
		if connectionEnabled && !revokedAt.Valid {
			if err := emitIntelligenceSourceV2ScopeTombstone(ctx, tx, connectionID, chatID, "connection_revoked", true); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE public.intelligence_source_v2_connections
			SET enabled=false,revoked_at=COALESCE(revoked_at,$1)
			WHERE id=$2 AND principal_user_id=$3`, now, connectionID, principal.UserID); err != nil {
			return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
		if _, err := tx.ExecContext(ctx, `
			UPDATE public.intelligence_source_v2_connection_grants
			SET granted=false,revoked_at=COALESCE(revoked_at,$1),updated_at=$1
			WHERE connection_id=$2`, now, connectionID); err != nil {
			return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
		if err := insertIntelligenceSourceV2Audit(ctx, tx, installationID, connectionID, principal.UserID, "connection_revoke", "revoked", "", now); err != nil {
			return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
	}
	if err := tx.Commit(); err != nil {
		return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return nil
}

func (s *Server) requireIntelligenceSourceV2ConsentEnabled() error {
	if s.sqlDB == nil || !s.cfg.IntelligenceSourceEnabled || !s.cfg.IntelligenceOIDCEnabled || s.cfg.IntelligenceOIDCClientID == "" || s.cfg.IntelligenceOIDCClientSecret == "" || len(s.cfg.IntelligenceOIDCRedirectURIs) == 0 {
		return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return nil
}

// authenticateIntelligenceSourceV2Credential deliberately excludes v1 source
// credentials. V2 handlers can use this resolver without making a v2 bearer
// valid on the legacy v1 source routes.
func (s *Server) authenticateIntelligenceSourceV2Credential(ctx context.Context, token string) (httptransport.IntelligenceSourceIdentity, error) {
	if s.sqlDB == nil || strings.TrimSpace(token) == "" {
		return httptransport.IntelligenceSourceIdentity{}, httptransport.ErrIntelligenceSourceUnauthorized
	}
	digest := sha256.Sum256([]byte(token))
	var identity httptransport.IntelligenceSourceIdentity
	var scopedChatCount int
	err := s.sqlDB.QueryRowContext(ctx, `
		SELECT i.id,i.tenant_id,c.id,i.family_id,c.principal_user_id,i.enabled,c.enabled,
	       (SELECT scope.chat_id FROM public.intelligence_source_v2_connection_chats scope WHERE scope.connection_id=c.id LIMIT 1),
		       (SELECT count(*) FROM public.intelligence_source_v2_connection_chats scope WHERE scope.connection_id=c.id)
		FROM public.intelligence_source_v2_connections c
		JOIN public.intelligence_installations i ON i.id=c.installation_id
		JOIN public.users u ON u.id=c.principal_user_id AND u.family_id=i.family_id
		JOIN public.families f ON f.id=i.family_id
		WHERE c.credential_hash=$1 AND c.revoked_at IS NULL
		  AND c.credential_expires_at>now() AND u.is_active=1`, digest[:]).Scan(
		&identity.InstallationID, &identity.TenantID, &identity.ConnectionID, &identity.FamilyID,
		&identity.PrincipalUserID, &identity.InstallationEnabled, &identity.ConnectionEnabled, &identity.ChatID, &scopedChatCount)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceSourceIdentity{}, httptransport.ErrIntelligenceSourceUnauthorized
	}
	if err != nil {
		return httptransport.IntelligenceSourceIdentity{}, httptransport.ErrIntelligenceSourceUnavailable
	}
	if scopedChatCount != 1 {
		return httptransport.IntelligenceSourceIdentity{}, httptransport.ErrIntelligenceSourceForbidden
	}
	return identity, nil
}

func (s *Server) validIntelligenceSourceV2Client(clientID, redirectURI string) bool {
	return clientID == s.cfg.IntelligenceOIDCClientID && containsExactString(s.cfg.IntelligenceOIDCRedirectURIs, redirectURI)
}

func (s *Server) validateIntelligenceSourceV2ClientAuthentication(clientID, clientSecret string) error {
	secretMatches := len(clientSecret) == len(s.cfg.IntelligenceOIDCClientSecret) && subtle.ConstantTimeCompare([]byte(clientSecret), []byte(s.cfg.IntelligenceOIDCClientSecret)) == 1
	if clientID != s.cfg.IntelligenceOIDCClientID || !secretMatches {
		return httptransport.ErrIntelligenceSourceV2ConsentInvalidClient
	}
	return nil
}

func httptransportConsentParametersValid(parameters httptransport.IntelligenceSourceV2ConsentParameters) bool {
	return parameters.ClientID != "" && len(parameters.ClientID) <= 256 && parameters.RedirectURI != "" && len(parameters.RedirectURI) <= 2048 && validIntelligenceOIDCString(parameters.State, 512) && parameters.CodeChallengeMethod == "S256" && validIntelligenceOIDCChallenge(parameters.CodeChallenge)
}

func (s *Server) requireActiveIntelligenceSourceV2Principal(ctx context.Context, principal httptransport.IntelligenceSourceV2ConsentPrincipal) error {
	if s.sqlDB == nil || principal.UserID == "" || principal.FamilyID == "" {
		return httptransport.ErrIntelligenceSourceV2ConsentUnauthorized
	}
	var active bool
	err := s.sqlDB.QueryRowContext(ctx, `SELECT true FROM public.users WHERE id=$1 AND family_id=$2 AND is_active=1`, principal.UserID, principal.FamilyID).Scan(&active)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.ErrIntelligenceSourceV2ConsentUnauthorized
	}
	if err != nil {
		return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return nil
}

func (s *Server) intelligenceSourceV2EnabledInstallation(ctx context.Context, familyID string) (string, error) {
	if s.sqlDB == nil || familyID == "" {
		return "", httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	rows, err := s.sqlDB.QueryContext(ctx, `SELECT id FROM public.intelligence_installations WHERE family_id=$1 AND enabled ORDER BY id LIMIT 2`, familyID)
	if err != nil {
		return "", httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	defer func() { _ = rows.Close() }()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return "", httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil || len(ids) != 1 {
		return "", httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return ids[0], nil
}

func (s *Server) intelligenceSourceV2EnabledInstallationTx(ctx context.Context, tx *sql.Tx, familyID string) (string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT id FROM public.intelligence_installations WHERE family_id=$1 AND enabled ORDER BY id LIMIT 2 FOR SHARE`, familyID)
	if err != nil {
		return "", httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	defer func() { _ = rows.Close() }()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return "", httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil || len(ids) != 1 {
		return "", httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return ids[0], nil
}

func (s *Server) intelligenceSourceV2ConsentRateLimit(ctx context.Context, request *http.Request, operation string, limit int) error {
	if s.cache == nil {
		return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	count, err := s.cache.Increment(ctx, "intelligence-source-v2-consent:"+operation+":"+s.getClientIP(request), 60)
	if err != nil {
		return httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if count > int64(limit) {
		return httptransport.ErrIntelligenceSourceV2ConsentRateLimited
	}
	return nil
}

func intelligenceSourceV2ReadGrants(ctx context.Context, tx *sql.Tx, connectionID string) (map[string]bool, error) {
	rows, err := tx.QueryContext(ctx, `SELECT grant_type,granted FROM public.intelligence_source_v2_connection_grants WHERE connection_id=$1`, connectionID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	grants := make(map[string]bool, len(intelligenceSourceV2GrantTypes))
	for rows.Next() {
		var grantType string
		var granted bool
		if err := rows.Scan(&grantType, &granted); err != nil {
			return nil, err
		}
		grants[grantType] = granted
	}
	if err := rows.Err(); err != nil || len(grants) != len(intelligenceSourceV2GrantTypes) {
		return nil, errors.New("incomplete intelligence source v2 grant records")
	}
	return grants, nil
}

func insertIntelligenceSourceV2Audit(ctx context.Context, tx *sql.Tx, installationID, connectionID, principalUserID, operation, result, grantType string, now time.Time) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_audit
			(id,installation_id,connection_id,principal_user_id,operation,result,grant_type,created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, uuid.NewString(), nullString(installationID), nullString(connectionID),
		nullString(principalUserID), operation, result, nullString(grantType), now)
	return err
}
