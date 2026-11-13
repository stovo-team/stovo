package app

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"errors"
	"net/http"
	"time"

	adapterintelligencesourcev2 "stovo-messenger/backend/internal/adapters/intelligencesourcev2"
	httptransport "stovo-messenger/backend/internal/transport/http"
)

const intelligenceBrowserTicketTTL = 2 * time.Minute

func (s *Server) createIntelligenceBrowserSession(ctx context.Context, request *http.Request, principal httptransport.IntelligenceSourceV2ConsentPrincipal, input httptransport.IntelligenceBrowserSessionRequest) (httptransport.IntelligenceBrowserSessionTicket, error) {
	if s.intelligenceSourceV2Persistence() == nil || principal.UserID == "" || principal.FamilyID == "" {
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
	err = s.intelligenceSourceV2Persistence().CreateBrowserSession(ctx, adapterintelligencesourcev2.BrowserSession{
		TicketHash: digest[:], Flow: input.Flow, UserID: principal.UserID, FamilyID: principal.FamilyID,
		ClientID: input.ClientID, RedirectURI: input.RedirectURI, State: input.State,
		CodeChallenge: input.CodeChallenge, CodeChallengeMethod: input.CodeChallengeMethod,
		Nonce: input.Nonce, ChatID: input.ChatID, Grants: input.Grants,
		CreatedAt: now, ExpiresAt: now.Add(intelligenceBrowserTicketTTL),
	})
	if errors.Is(err, adapterintelligencesourcev2.ErrForbidden) {
		return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentForbidden
	}
	if err != nil {
		return httptransport.IntelligenceBrowserSessionTicket{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return httptransport.IntelligenceBrowserSessionTicket{Value: ticket, ExpiresIn: int64(intelligenceBrowserTicketTTL.Seconds())}, nil
}

func (s *Server) authorizeIntelligenceOIDCBrowserSession(ctx context.Context, request *http.Request, ticket string, input httptransport.IntelligenceOIDCAuthorizationRequest) (httptransport.IntelligenceOIDCAuthorizationResult, error) {
	if !s.cfg.IntelligenceOIDCEnabled || s.intelligenceSourceV2Persistence() == nil || ticket == "" {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnauthorized
	}
	if err := s.intelligenceOIDCRateLimit(ctx, request, "oidc-browser-authorize", 30); err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, err
	}
	digest := sha256.Sum256([]byte(ticket))
	now := s.intelligenceOIDCNow()
	code, err := randomToken()
	if err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	codeDigest := sha256.Sum256([]byte(code))
	stored, err := s.intelligenceSourceV2Persistence().AuthorizeOIDCBrowserSession(ctx, digest[:], codeDigest[:], now, now.Add(intelligenceOIDCAuthorizationCodeTTL), now, adapterintelligencesourcev2.OIDCBrowserSessionExpectation{
		ClientID: input.ClientID, RedirectURI: input.RedirectURI, State: input.State, Nonce: input.Nonce,
		CodeChallenge: input.CodeChallenge, CodeChallengeMethod: input.CodeChallengeMethod,
		ResponseTypeCode:   input.ResponseType == "code",
		AllowedClientID:    input.ClientID == s.cfg.IntelligenceOIDCClientID,
		RedirectURIAllowed: containsExactString(s.cfg.IntelligenceOIDCRedirectURIs, input.RedirectURI),
	}, func(userID string) bool {
		_, subjectErr := s.intelligenceOIDCSubject(ctx, userID)
		return subjectErr == nil
	})
	if errors.Is(err, adapterintelligencesourcev2.ErrNotFound) || errors.Is(err, adapterintelligencesourcev2.ErrForbidden) {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnauthorized
	}
	if errors.Is(err, adapterintelligencesourcev2.ErrInvalidRequest) {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCInvalidRequest
	}
	if err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	return httptransport.IntelligenceOIDCAuthorizationResult{RedirectURI: stored.RedirectURI, Code: code, State: stored.State}, nil
}

func (s *Server) authorizeIntelligenceSourceV2BrowserSession(ctx context.Context, request *http.Request, ticket string, input httptransport.IntelligenceSourceV2ConsentRequest) (httptransport.IntelligenceSourceV2ConsentRedirect, error) {
	if s.intelligenceSourceV2Persistence() == nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
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
	stored, err := s.intelligenceSourceV2Persistence().AuthorizeSourceV2BrowserSession(ctx, adapterintelligencesourcev2.SourceV2BrowserAuthorization{
		TicketHash: ticketDigest[:], CodeHash: codeDigest[:], ClientID: parameters.ClientID,
		RedirectURI: parameters.RedirectURI, State: parameters.State, CodeChallenge: parameters.CodeChallenge,
		CodeChallengeMethod: parameters.CodeChallengeMethod, ChatID: input.ChatID, Grants: input.Grants,
		Now: now, CodeExpiresAt: now.Add(intelligenceSourceV2ConsentCodeTTL),
	})
	if errors.Is(err, adapterintelligencesourcev2.ErrNotFound) {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnauthorized
	}
	if errors.Is(err, adapterintelligencesourcev2.ErrInvalidRequest) {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	if errors.Is(err, adapterintelligencesourcev2.ErrForbidden) {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentForbidden
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return httptransport.IntelligenceSourceV2ConsentRedirect{RedirectURI: stored.RedirectURI, Code: code, State: stored.State}, nil
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
		       COALESCE(bool_or(g.grant_type='export' AND g.granted),false),
		       COALESCE(bool_or(g.grant_type='codex' AND g.granted),false),
		       COALESCE(bool_or(g.grant_type='reply' AND g.granted),false)
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
		var read, process, externalTransfer, export, codex, reply bool
		if err := rows.Scan(&item.ID, &item.ChatID, &item.ChatTitle, &item.CreatedAt, &item.ExpiresAt, &revokedAt, &read, &process, &externalTransfer, &export, &codex, &reply); err != nil {
			return nil, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
		}
		if revokedAt.Valid {
			value := revokedAt.Time
			item.RevokedAt = &value
		}
		item.Grants = map[string]bool{"read": read, "process": process, "external_transfer": externalTransfer, "export": export, "codex": codex, "reply": reply}
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
