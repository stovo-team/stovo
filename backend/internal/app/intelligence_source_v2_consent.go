package app

import (
	"context"
	"crypto/sha256"
	"errors"
	"net/http"
	"time"

	adapterintelligencesourcev2 "stovo-messenger/backend/internal/adapters/intelligencesourcev2"
	httptransport "stovo-messenger/backend/internal/transport/http"
)

const (
	intelligenceSourceV2ConsentCodeTTL = 5 * time.Minute
	intelligenceSourceV2CredentialTTL  = 30 * 24 * time.Hour
)

var intelligenceSourceV2GrantTypes = []string{"read", "process", "external_transfer", "export", "codex", "reply"}

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
		SELECT ch.id,
			CASE WHEN ch.type='direct' THEN COALESCE(
				(SELECT COALESCE(NULLIF(BTRIM(other_user.display_name),''),other_user.username)
				 FROM public.chat_members other_member
				 JOIN public.users other_user ON other_user.id=other_member.user_id
				 WHERE other_member.chat_id=ch.id AND other_member.user_id<>$1
				 ORDER BY other_member.created_at,other_member.user_id LIMIT 1),
				COALESCE(ch.title,''))
			ELSE COALESCE(ch.title,'') END,
			ch.type
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
		Grants: map[string]bool{"read": false, "process": false, "external_transfer": false, "export": false, "codex": false, "reply": false},
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
	if s.intelligenceSourceV2Persistence() == nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
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
	grants := input.Grants
	if grants == nil {
		grants = map[string]bool{}
	}
	err = s.intelligenceSourceV2Persistence().AuthorizeConsent(ctx, adapterintelligencesourcev2.ConsentAuthorization{
		CodeHash: digest[:], ClientID: parameters.ClientID, RedirectURI: parameters.RedirectURI,
		UserID: principal.UserID, FamilyID: principal.FamilyID, ChatID: input.ChatID,
		CodeChallenge: parameters.CodeChallenge, Grants: grants, Now: now,
		ExpiresAt: now.Add(intelligenceSourceV2ConsentCodeTTL),
	})
	if errors.Is(err, adapterintelligencesourcev2.ErrForbidden) {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentForbidden
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2ConsentRedirect{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return httptransport.IntelligenceSourceV2ConsentRedirect{RedirectURI: parameters.RedirectURI, Code: code, State: parameters.State}, nil
}

func (s *Server) exchangeIntelligenceSourceV2Consent(ctx context.Context, request *http.Request, clientID, clientSecret, code, redirectURI, verifier string) (httptransport.IntelligenceSourceV2CredentialResponse, error) {
	if s.intelligenceSourceV2Persistence() == nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
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
	issued, err := s.intelligenceSourceV2Persistence().ExchangeConsentCode(ctx, adapterintelligencesourcev2.CredentialExchange{
		CodeHash: codeDigest[:], CredentialHash: credentialDigest[:], ClientID: clientID, RedirectURI: redirectURI,
		VerifyPKCE: func(challenge string) bool { return intelligenceOIDCPKCEVerifierMatches(verifier, challenge) },
		Now:        now, CredentialExpiresAt: now.Add(intelligenceSourceV2CredentialTTL),
	})
	if errors.Is(err, adapterintelligencesourcev2.ErrNotFound) || errors.Is(err, adapterintelligencesourcev2.ErrInvalidPKCE) {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentInvalidRequest
	}
	if errors.Is(err, adapterintelligencesourcev2.ErrForbidden) {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentForbidden
	}
	if err != nil {
		return httptransport.IntelligenceSourceV2CredentialResponse{}, httptransport.ErrIntelligenceSourceV2ConsentUnavailable
	}
	return httptransport.IntelligenceSourceV2CredentialResponse{
		ConnectionID: issued.ConnectionID, ChatID: issued.ChatID, SourceCredential: rawCredential, TokenType: "Bearer",
		ExpiresIn: int64(intelligenceSourceV2CredentialTTL.Seconds()), Grants: issued.Grants,
	}, nil
}
