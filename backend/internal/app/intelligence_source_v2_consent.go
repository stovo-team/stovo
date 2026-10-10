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

const (
	intelligenceSourceV2ConsentCodeTTL = 5 * time.Minute
	intelligenceSourceV2CredentialTTL  = 30 * 24 * time.Hour
)

var intelligenceSourceV2GrantTypes = []string{"read", "process", "external_transfer", "export"}

type intelligenceSourceV2ConsentRecord struct {
	installationID string
	userID         string
	familyID       string
	chatID         string
	codeChallenge  string
	grants         map[string]bool
}

func (s *Server) intelligenceSourceV2ConsentHandler() http.Handler {
	return httptransport.NewIntelligenceSourceV2ConsentHandler(httptransport.IntelligenceSourceV2ConsentHandlerConfig{
		BrowserAppURL: s.cfg.AppURL,
		Authenticate: func(request *http.Request) (httptransport.IntelligenceSourceV2ConsentPrincipal, error) {
			user, err := s.currentUser(request)
			if err != nil {
				return httptransport.IntelligenceSourceV2ConsentPrincipal{}, httptransport.ErrIntelligenceSourceV2ConsentUnauthorized
			}
			return httptransport.IntelligenceSourceV2ConsentPrincipal{UserID: user.ID, FamilyID: user.FamilyID}, nil
		},
		Operations: httptransport.IntelligenceSourceV2ConsentOperations{
			Offer:                s.intelligenceSourceV2ConsentOffer,
			Authorize:            s.authorizeIntelligenceSourceV2Consent,
			CreateBrowserSession: s.createIntelligenceBrowserSession,
			AuthorizeBrowser:     s.authorizeIntelligenceSourceV2BrowserSession,
			Exchange:             s.exchangeIntelligenceSourceV2Consent,
			Rotate:               s.rotateIntelligenceSourceV2Credential,
			Revoke:               s.revokeIntelligenceSourceV2Connection,
			ListConnections:      s.listIntelligenceSourceV2Connections,
		},
	})
}

func (s *Server) intelligenceSourceV2ConsentOffer(ctx context.Context, request *http.Request, principal httptransport.IntelligenceSourceV2ConsentPrincipal, parameters httptransport.IntelligenceSourceV2ConsentParameters) (httptransport.IntelligenceSourceV2ConsentOffer, error) {
	if err := s.requireIntelligenceSourceV2ConsentEnabled(); err != nil {
		return httptransport.IntelligenceSourceV2ConsentOffer{}, err
	}
	if err := s.intelligenceSourceV2ConsentRateLimit(ctx, request, "offer", 60); err != nil {
		return httptransport.IntelligenceSourceV2ConsentOffer{}, err
	}
	if !s.validIntelligenceSourceV2Client(parameters.ClientID, parameters.RedirectURI) || !httptransportConsentParametersValid(parameters) {
		return httptransport.IntelligenceSourceV2ConsentOffer{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	if err := s.requireActiveIntelligenceSourceV2Principal(ctx, principal); err != nil {
		return httptransport.IntelligenceSourceV2ConsentOffer{}, err
	}
	if _, err := s.intelligenceSourceV2EnabledInstallation(ctx, principal.FamilyID); err != nil {
		return httptransport.IntelligenceSourceV2ConsentOffer{}, err
	}
	rows, err := s.sqlDB.QueryContext(ctx, `
		SELECT ch.id,COALESCE(ch.title,''),ch.type
		FROM public.chats ch
		JOIN public.chat_members cm ON cm.chat_id=ch.id AND cm.user_id=$1
		JOIN public.users u ON u.id=cm.user_id AND u.is_active=1 AND u.family_id=ch.family_id
		WHERE ch.family_id=$2
		ORDER BY COALESCE(ch.title,''),ch.id`, principal.UserID, principal.FamilyID)
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentOffer{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	defer func() { _ = rows.Close() }()
	offer := httptransport.IntelligenceSourceV2ConsentOffer{
		ClientID: parameters.ClientID, RedirectURI: parameters.RedirectURI, State: parameters.State,
		Chats:  make([]httptransport.IntelligenceSourceV2ConsentChat, 0),
		Grants: map[string]bool{"read": false, "process": false, "external_transfer": false, "export": false},
	}
	for rows.Next() {
		var chat httptransport.IntelligenceSourceV2ConsentChat
		if err := rows.Scan(&chat.ID, &chat.Title, &chat.Type); err != nil {
			return httptransport.IntelligenceSourceV2ConsentOffer{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
		offer.Chats = append(offer.Chats, chat)
	}
	if err := rows.Err(); err != nil {
		return httptransport.IntelligenceSourceV2ConsentOffer{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if len(offer.Chats) == 0 {
		return httptransport.IntelligenceSourceV2ConsentOffer{}, httptransport.ErrIntelligenceSourceV2ConsentForbidden
	}
	return offer, nil
}

func (s *Server) authorizeIntelligenceSourceV2Consent(ctx context.Context, request *http.Request, principal httptransport.IntelligenceSourceV2ConsentPrincipal, input httptransport.IntelligenceSourceV2ConsentRequest) (httptransport.IntelligenceSourceV2ConsentRedirect, error) {
	if err := s.requireIntelligenceSourceV2ConsentEnabled(); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, err
	}
	if err := s.intelligenceSourceV2ConsentRateLimit(ctx, request, "authorize", 30); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, err
	}
	parameters := input.IntelligenceSourceV2ConsentParameters
	if !s.validIntelligenceSourceV2Client(parameters.ClientID, parameters.RedirectURI) || !httptransportConsentParametersValid(parameters) {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	if err := s.requireActiveIntelligenceSourceV2Principal(ctx, principal); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, err
	}
	code, err := randomToken()
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	digest := sha256.Sum256([]byte(code))
	now := s.intelligenceOIDCNow()
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	installationID, err := s.intelligenceSourceV2EnabledInstallationTx(ctx, tx, principal.FamilyID)
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, err
	}
	var accessible bool
	err = tx.QueryRowContext(ctx, `
		SELECT true
		FROM public.users u
		JOIN public.chat_members cm ON cm.user_id=u.id
		JOIN public.chats ch ON ch.id=cm.chat_id AND ch.family_id=u.family_id
		WHERE u.id=$1 AND u.family_id=$2 AND u.is_active=1 AND ch.id=$3
		FOR SHARE OF u,cm,ch`, principal.UserID, principal.FamilyID, input.ChatID).Scan(&accessible)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentForbidden
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_source_v2_consent_codes WHERE expires_at <= $1`, now); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	grants := input.Grants
	if grants == nil {
		grants = map[string]bool{}
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_consent_codes
			(code_hash,client_id,redirect_uri,installation_id,user_id,family_id,chat_id,code_challenge,
			 read_granted,process_granted,external_transfer_granted,export_granted,expires_at,created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, digest[:], parameters.ClientID, parameters.RedirectURI,
		installationID, principal.UserID, principal.FamilyID, input.ChatID, parameters.CodeChallenge,
		grants["read"], grants["process"], grants["external_transfer"], grants["export"], now.Add(intelligenceSourceV2ConsentCodeTTL), now)
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if err := insertIntelligenceSourceV2Audit(ctx, tx, installationID, "", principal.UserID, "consent_authorize", "issued", "", now); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if err := tx.Commit(); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return httptransport.IntelligenceSourceV2ConsentRedirect{RedirectURI: parameters.RedirectURI, Code: code, State: parameters.State}, nil
}

func (s *Server) exchangeIntelligenceSourceV2Consent(ctx context.Context, request *http.Request, clientID, clientSecret, code, redirectURI, verifier string) (httptransport.IntelligenceSourceV2CredentialResponse, error) {
	if err := s.requireIntelligenceSourceV2ConsentEnabled(); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, err
	}
	if err := s.intelligenceSourceV2ConsentRateLimit(ctx, request, "token", 60); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, err
	}
	if err := s.validateIntelligenceSourceV2ClientAuthentication(clientID, clientSecret); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, err
	}
	if !containsExactString(s.cfg.IntelligenceOIDCRedirectURIs, redirectURI) || code == "" || len(code) > 128 || !validIntelligenceOIDCVerifier(verifier) {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	rawCredential, err := randomToken()
	if err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	codeDigest := sha256.Sum256([]byte(code))
	credentialDigest := sha256.Sum256([]byte(rawCredential))
	now := s.intelligenceOIDCNow()
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var record intelligenceSourceV2ConsentRecord
	var readGranted, processGranted, externalTransferGranted, exportGranted bool
	err = tx.QueryRowContext(ctx, `
		SELECT installation_id,user_id,family_id,chat_id,code_challenge,
		       read_granted,process_granted,external_transfer_granted,export_granted
		FROM public.intelligence_source_v2_consent_codes
		WHERE code_hash=$1 AND client_id=$2 AND redirect_uri=$3 AND expires_at>$4
		FOR UPDATE`, codeDigest[:], clientID, redirectURI, now).Scan(
		&record.installationID, &record.userID, &record.familyID, &record.chatID, &record.codeChallenge,
		&readGranted, &processGranted, &externalTransferGranted, &exportGranted)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if !intelligenceOIDCPKCEVerifierMatches(verifier, record.codeChallenge) {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	var active bool
	err = tx.QueryRowContext(ctx, `
		SELECT true
		FROM public.users u
		JOIN public.families f ON f.id=u.family_id AND f.id=$2
		JOIN public.chat_members cm ON cm.user_id=u.id
		JOIN public.chats ch ON ch.id=cm.chat_id AND ch.id=$3 AND ch.family_id=f.id
		JOIN public.intelligence_installations i ON i.id=$4 AND i.family_id=f.id AND i.enabled
		WHERE u.id=$1 AND u.is_active=1
		FOR SHARE OF u,f,cm,ch,i`, record.userID, record.familyID, record.chatID, record.installationID).Scan(&active)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentForbidden
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	connectionID := uuid.NewString()
	expiresAt := now.Add(intelligenceSourceV2CredentialTTL)
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_connections
			(id,installation_id,principal_user_id,credential_hash,enabled,credential_expires_at,created_at)
		VALUES($1,$2,$3,$4,true,$5,$6)`, connectionID, record.installationID, record.userID, credentialDigest[:], expiresAt, now); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO public.intelligence_source_v2_connection_chats(connection_id,chat_id) VALUES($1,$2)`, connectionID, record.chatID); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	record.grants = map[string]bool{
		"read": readGranted, "process": processGranted,
		"external_transfer": externalTransferGranted, "export": exportGranted,
	}
	for _, grantType := range intelligenceSourceV2GrantTypes {
		var grantedAt any
		if record.grants[grantType] {
			grantedAt = now
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO public.intelligence_source_v2_connection_grants
				(connection_id,grant_type,granted,granted_at,updated_at)
			VALUES($1,$2,$3,$4,$5)`, connectionID, grantType, record.grants[grantType], grantedAt, now); err != nil {
			return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_source_v2_consent_codes WHERE code_hash=$1`, codeDigest[:]); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if err := insertIntelligenceSourceV2Audit(ctx, tx, record.installationID, connectionID, record.userID, "token_exchange", "issued", "", now); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if err := tx.Commit(); err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return httptransport.IntelligenceSourceV2CredentialResponse{
		ConnectionID: connectionID, SourceCredential: rawCredential, TokenType: "Bearer",
		ExpiresIn: int64(intelligenceSourceV2CredentialTTL.Seconds()), Grants: record.grants,
	}, nil
}

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
