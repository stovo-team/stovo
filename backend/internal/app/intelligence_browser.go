package app

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"net/http"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"
)

const intelligenceBrowserTicketTTL = 2 * time.Minute

func (s *Server) createIntelligenceBrowserSession(ctx context.Context, request *http.Request, principal httptransport.IntelligenceSourceV2ConsentPrincipal, input httptransport.IntelligenceBrowserSessionRequest) (httptransport.IntelligenceBrowserSessionTicket, error) {
	if s.sqlDB == nil || principal.UserID == "" || principal.FamilyID == "" {
		return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentUnauthorized
	}
	switch input.Flow {
	case "oidc":
		if !s.cfg.IntelligenceOIDCEnabled || input.ClientID != s.cfg.IntelligenceOIDCClientID || !containsExactString(s.cfg.IntelligenceOIDCRedirectURIs, input.RedirectURI) || input.ResponseType != "code" || input.Nonce == "" || !validIntelligenceOIDCString(input.State, 512) || !validIntelligenceOIDCString(input.Nonce, 512) || input.CodeChallengeMethod != "S256" || !validIntelligenceOIDCChallenge(input.CodeChallenge) {
			return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceOIDCInvalidRequest
		}
		if err := s.intelligenceOIDCRateLimit(ctx, request, "oidc-browser-session", 30); err != nil {
			return httptransport.IntelligenceBrowserSessionTicket{}, err
		}
		if _, err := s.intelligenceOIDCSubject(ctx, principal.UserID); err != nil {
			return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceOIDCUnauthorized
		}
	case "source_v2":
		if err := s.requireIntelligenceSourceV2ConsentEnabled(); err != nil {
			return httptransport.IntelligenceBrowserSessionTicket{}, err
		}
		if err := s.intelligenceSourceV2ConsentRateLimit(ctx, request, "browser-session", 30); err != nil {
			return httptransport.IntelligenceBrowserSessionTicket{}, err
		}
		parameters := httptransport.IntelligenceSourceV2ConsentParameters{
			ResponseType: input.ResponseType, ClientID: input.ClientID, RedirectURI: input.RedirectURI,
			State: input.State, CodeChallenge: input.CodeChallenge, CodeChallengeMethod: input.CodeChallengeMethod,
		}
		if input.ResponseType != "code" || !s.validIntelligenceSourceV2Client(input.ClientID, input.RedirectURI) || !httptransportConsentParametersValid(parameters) || input.Nonce != "" || input.ChatID == "" || len(input.ChatID) > 256 || len(input.Grants) != len(intelligenceSourceV2GrantTypes) {
			return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
		}
		for grant := range input.Grants {
			if !validAppIntelligenceSourceV2Grant(grant) {
				return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
			}
		}
	default:
		return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}

	if err := s.requireActiveIntelligenceSourceV2Principal(ctx, httptransport.IntelligenceSourceV2ConsentPrincipal{UserID: principal.UserID, FamilyID: principal.FamilyID}); err != nil {
		return httptransport.IntelligenceBrowserSessionTicket{}, err
	}
	ticket, err := randomToken()
	if err != nil {
		return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	digest := sha256.Sum256([]byte(ticket))
	now := s.intelligenceOIDCNow()
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_browser_authorization_sessions WHERE expires_at <= $1`, now); err != nil {
		return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	var chatValue any
	var nonceValue any
	if input.Flow == "oidc" {
		nonceValue = input.Nonce
	} else {
		_, err = s.intelligenceSourceV2EnabledInstallationTx(ctx, tx, principal.FamilyID)
		if err != nil {
			return httptransport.IntelligenceBrowserSessionTicket{}, err
		}
		var accessible bool
		err = tx.QueryRowContext(ctx, `
			SELECT true
			FROM public.users u
			JOIN public.chat_members cm ON cm.chat_id=$3 AND cm.user_id=u.id
			JOIN public.chats ch ON ch.id=cm.chat_id AND ch.family_id=u.family_id
			WHERE u.id=$1 AND u.family_id=$2 AND u.is_active=1
			FOR SHARE OF u,cm,ch`, principal.UserID, principal.FamilyID, input.ChatID).Scan(&accessible)
		if errors.Is(err, sql.ErrNoRows) {
			return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentForbidden
		}
		if err != nil {
			return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
		chatValue = input.ChatID
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_browser_authorization_sessions
			(ticket_hash,flow,user_id,family_id,client_id,redirect_uri,state,code_challenge,code_challenge_method,nonce,chat_id,
			 read_granted,process_granted,external_transfer_granted,export_granted,expires_at,created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
		digest[:], input.Flow, principal.UserID, principal.FamilyID, input.ClientID, input.RedirectURI, input.State,
		input.CodeChallenge, input.CodeChallengeMethod, nonceValue, chatValue,
		input.Grants["read"], input.Grants["process"], input.Grants["external_transfer"], input.Grants["export"], now.Add(intelligenceBrowserTicketTTL), now)
	if err != nil {
		return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if err := tx.Commit(); err != nil {
		return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return httptransport.IntelligenceBrowserSessionTicket{Value: ticket, ExpiresIn: int64(intelligenceBrowserTicketTTL.Seconds())}, nil
}

func (s *Server) authorizeIntelligenceOIDCBrowserSession(ctx context.Context, request *http.Request, ticket string, input httptransport.IntelligenceOIDCAuthorizationRequest) (httptransport.IntelligenceOIDCAuthorizationResult, error) {
	if !s.cfg.IntelligenceOIDCEnabled || s.sqlDB == nil || ticket == "" {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnauthorized
	}
	if err := s.intelligenceOIDCRateLimit(ctx, request, "oidc-browser-authorize", 30); err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, err
	}
	digest := sha256.Sum256([]byte(ticket))
	now := s.intelligenceOIDCNow()
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var userID, familyID, clientID, redirectURI, state, challenge, method, nonce string
	err = tx.QueryRowContext(ctx, `
		SELECT user_id,family_id,client_id,redirect_uri,state,code_challenge,code_challenge_method,nonce
		FROM public.intelligence_browser_authorization_sessions
		WHERE ticket_hash=$1 AND flow='oidc' AND expires_at>$2 FOR UPDATE`, digest[:], now).
		Scan(&userID, &familyID, &clientID, &redirectURI, &state, &challenge, &method, &nonce)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnauthorized
	}
	if err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	if input.ResponseType != "code" || input.ClientID != clientID || input.RedirectURI != redirectURI || input.State != state || input.Nonce != nonce || input.CodeChallenge != challenge || input.CodeChallengeMethod != method || clientID != s.cfg.IntelligenceOIDCClientID || !containsExactString(s.cfg.IntelligenceOIDCRedirectURIs, redirectURI) {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCInvalidRequest
	}
	var active bool
	err = tx.QueryRowContext(ctx, `SELECT true FROM public.users WHERE id=$1 AND family_id=$2 AND is_active=1 FOR SHARE`, userID, familyID).Scan(&active)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnauthorized
	}
	if err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	if _, err := s.intelligenceOIDCSubject(ctx, userID); err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnauthorized
	}
	code, err := randomToken()
	if err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	codeDigest := sha256.Sum256([]byte(code))
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_oidc_authorization_codes WHERE expires_at <= $1`, now); err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_oidc_authorization_codes(code_hash,client_id,redirect_uri,user_id,code_challenge,nonce,expires_at,created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, codeDigest[:], clientID, redirectURI, userID, challenge, nonce, now.Add(intelligenceOIDCAuthorizationCodeTTL), now); err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_browser_authorization_sessions WHERE ticket_hash=$1`, digest[:]); err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	if err := tx.Commit(); err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	return httptransport.IntelligenceOIDCAuthorizationResult{RedirectURI: redirectURI, Code: code, State: state}, nil
}

func (s *Server) authorizeIntelligenceSourceV2BrowserSession(ctx context.Context, request *http.Request, ticket string, input httptransport.IntelligenceSourceV2ConsentRequest) (httptransport.IntelligenceSourceV2ConsentRedirect, error) {
	if err := s.requireIntelligenceSourceV2ConsentEnabled(); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, err
	}
	if err := s.intelligenceSourceV2ConsentRateLimit(ctx, request, "browser-authorize", 30); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, err
	}
	parameters := input.IntelligenceSourceV2ConsentParameters
	if ticket == "" || parameters.ResponseType != "code" || !s.validIntelligenceSourceV2Client(parameters.ClientID, parameters.RedirectURI) || !httptransportConsentParametersValid(parameters) || input.ChatID == "" || len(input.Grants) != len(intelligenceSourceV2GrantTypes) {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	for grant := range input.Grants {
		if !validAppIntelligenceSourceV2Grant(grant) {
			return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
		}
	}
	code, err := randomToken()
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	codeDigest := sha256.Sum256([]byte(code))
	ticketDigest := sha256.Sum256([]byte(ticket))
	now := s.intelligenceOIDCNow()
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var userID, familyID, clientID, redirectURI, state, challenge, method, chatID string
	var readGranted, processGranted, externalTransferGranted, exportGranted bool
	err = tx.QueryRowContext(ctx, `
		SELECT user_id,family_id,client_id,redirect_uri,state,code_challenge,code_challenge_method,chat_id,
		       read_granted,process_granted,external_transfer_granted,export_granted
		FROM public.intelligence_browser_authorization_sessions
		WHERE ticket_hash=$1 AND flow='source_v2' AND expires_at>$2 FOR UPDATE`, ticketDigest[:], now).Scan(
		&userID, &familyID, &clientID, &redirectURI, &state, &challenge, &method, &chatID,
		&readGranted, &processGranted, &externalTransferGranted, &exportGranted)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnauthorized
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	boundGrants := map[string]bool{"read": readGranted, "process": processGranted, "external_transfer": externalTransferGranted, "export": exportGranted}
	if clientID != parameters.ClientID || redirectURI != parameters.RedirectURI || state != parameters.State || challenge != parameters.CodeChallenge || method != parameters.CodeChallengeMethod || chatID != input.ChatID || !equalIntelligenceSourceV2Grants(boundGrants, input.Grants) {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	installationID, err := s.intelligenceSourceV2EnabledInstallationTx(ctx, tx, familyID)
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, err
	}
	var accessible bool
	err = tx.QueryRowContext(ctx, `
		SELECT true
		FROM public.users u
		JOIN public.families f ON f.id=u.family_id AND f.id=$2
		JOIN public.chat_members cm ON cm.user_id=u.id AND cm.chat_id=$3
		JOIN public.chats ch ON ch.id=cm.chat_id AND ch.family_id=f.id
		WHERE u.id=$1 AND u.is_active=1
		FOR SHARE OF u,f,cm,ch`, userID, familyID, chatID).Scan(&accessible)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentForbidden
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_source_v2_consent_codes WHERE expires_at <= $1`, now); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO public.intelligence_source_v2_consent_codes
			(code_hash,client_id,redirect_uri,installation_id,user_id,family_id,chat_id,code_challenge,
			 read_granted,process_granted,external_transfer_granted,export_granted,expires_at,created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, codeDigest[:], clientID, redirectURI,
		installationID, userID, familyID, chatID, challenge, readGranted, processGranted, externalTransferGranted, exportGranted,
		now.Add(intelligenceSourceV2ConsentCodeTTL), now); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_browser_authorization_sessions WHERE ticket_hash=$1`, ticketDigest[:]); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if err := insertIntelligenceSourceV2Audit(ctx, tx, installationID, "", userID, "consent_authorize", "issued", "", now); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if err := tx.Commit(); err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return httptransport.IntelligenceSourceV2ConsentRedirect{RedirectURI: redirectURI, Code: code, State: state}, nil
}

func (s *Server) listIntelligenceSourceV2Connections(ctx context.Context, _ *http.Request, principal httptransport.IntelligenceSourceV2ConsentPrincipal) ([]httptransport.IntelligenceSourceV2ConnectionSummary, error) {
	if s.sqlDB == nil {
		return nil, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	if err := s.requireActiveIntelligenceSourceV2Principal(ctx, principal); err != nil {
		return nil, err
	}
	rows, err := s.sqlDB.QueryContext(ctx, `
		SELECT c.id,COALESCE(scope.chat_id,''),COALESCE(ch.title,''),c.created_at,c.credential_expires_at,c.revoked_at,
		       COALESCE(bool_or(g.grant_type='read' AND g.granted),false),
		       COALESCE(bool_or(g.grant_type='process' AND g.granted),false),
		       COALESCE(bool_or(g.grant_type='external_transfer' AND g.granted),false),
		       COALESCE(bool_or(g.grant_type='export' AND g.granted),false)
		FROM public.intelligence_source_v2_connections c
		JOIN public.intelligence_installations i ON i.id=c.installation_id AND i.family_id=$2
		LEFT JOIN public.intelligence_source_v2_connection_chats scope ON scope.connection_id=c.id
		LEFT JOIN public.chats ch ON ch.id=scope.chat_id
		LEFT JOIN public.intelligence_source_v2_connection_grants g ON g.connection_id=c.id
		WHERE c.principal_user_id=$1
		GROUP BY c.id,scope.chat_id,ch.title
		ORDER BY c.created_at DESC,c.id`, principal.UserID, principal.FamilyID)
	if err != nil {
		return nil, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	defer func() { _ = rows.Close() }()
	connections := make([]httptransport.IntelligenceSourceV2ConnectionSummary, 0)
	for rows.Next() {
		var item httptransport.IntelligenceSourceV2ConnectionSummary
		var revokedAt sql.NullTime
		var read, process, externalTransfer, export bool
		if err := rows.Scan(&item.ID, &item.ChatID, &item.ChatTitle, &item.CreatedAt, &item.ExpiresAt, &revokedAt, &read, &process, &externalTransfer, &export); err != nil {
			return nil, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
		if revokedAt.Valid {
			value := revokedAt.Time
			item.RevokedAt = &value
		}
		item.Grants = map[string]bool{"read": read, "process": process, "external_transfer": externalTransfer, "export": export}
		connections = append(connections, item)
	}
	if err := rows.Err(); err != nil {
		return nil, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return connections, nil
}

func validAppIntelligenceSourceV2Grant(grant string) bool {
	for _, allowed := range intelligenceSourceV2GrantTypes {
		if grant == allowed {
			return true
		}
	}
	return false
}

func equalIntelligenceSourceV2Grants(left, right map[string]bool) bool {
	if len(left) != len(intelligenceSourceV2GrantTypes) || len(right) != len(intelligenceSourceV2GrantTypes) {
		return false
	}
	for _, grant := range intelligenceSourceV2GrantTypes {
		if left[grant] != right[grant] {
			return false
		}
	}
	return true
}
