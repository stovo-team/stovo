package app

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"net/http"
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
