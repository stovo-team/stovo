package app

import (
	"context"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"math/big"
	"net/http"
	"strings"
	"time"

	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/golang-jwt/jwt/v5"
)

const intelligenceOIDCAuthorizationCodeTTL = 5 * time.Minute
const intelligenceOIDCIDTokenTTL = 5 * time.Minute

type intelligenceOIDCJWK struct {
	KTY string `json:"kty"`
	USE string `json:"use"`
	ALG string `json:"alg"`
	KID string `json:"kid"`
	N   string `json:"n"`
	E   string `json:"e"`
}

func (s *Server) intelligenceOIDCHandler() http.Handler {
	if !s.cfg.IntelligenceOIDCEnabled || s.cfg.IntelligenceOIDCIssuer == "" || s.cfg.IntelligenceOIDCClientID == "" || s.cfg.IntelligenceOIDCClientSecret == "" || len(s.cfg.IntelligenceOIDCRedirectURIs) == 0 {
		return httptransport.NewIntelligenceOIDCHandler(httptransport.IntelligenceOIDCHandlerConfig{})
	}
	privateKey, err := parseIntelligenceOIDCPrivateKey(s.cfg.IntelligenceOIDCSigningPrivateKeyPEM)
	if err != nil || !validIntelligenceOIDCKeyID(s.cfg.IntelligenceOIDCSigningKeyID) {
		return httptransport.NewIntelligenceOIDCHandler(httptransport.IntelligenceOIDCHandlerConfig{})
	}
	keys := []intelligenceOIDCJWK{intelligenceOIDCJWKFor(s.cfg.IntelligenceOIDCSigningKeyID, &privateKey.PublicKey)}
	seenKids := map[string]struct{}{s.cfg.IntelligenceOIDCSigningKeyID: {}}
	for _, previous := range s.cfg.IntelligenceOIDCPreviousSigningKeys {
		publicKey, parseErr := parseIntelligenceOIDCPublicKey(previous.PublicKeyPEM)
		if parseErr != nil || !validIntelligenceOIDCKeyID(previous.KeyID) {
			return httptransport.NewIntelligenceOIDCHandler(httptransport.IntelligenceOIDCHandlerConfig{})
		}
		if _, exists := seenKids[previous.KeyID]; exists {
			return httptransport.NewIntelligenceOIDCHandler(httptransport.IntelligenceOIDCHandlerConfig{})
		}
		seenKids[previous.KeyID] = struct{}{}
		keys = append(keys, intelligenceOIDCJWKFor(previous.KeyID, publicKey))
	}
	issuer := s.cfg.IntelligenceOIDCIssuer
	return httptransport.NewIntelligenceOIDCHandler(httptransport.IntelligenceOIDCHandlerConfig{
		Enabled:       true,
		BrowserAppURL: s.cfg.AppURL,
		Discovery: map[string]any{
			"issuer":                                issuer,
			"authorization_endpoint":                issuer + "/oauth2/authorize",
			"token_endpoint":                        issuer + "/oauth2/token",
			"jwks_uri":                              issuer + "/oauth2/jwks",
			"response_types_supported":              []string{"code"},
			"grant_types_supported":                 []string{"authorization_code"},
			"token_endpoint_auth_methods_supported": []string{"client_secret_basic"},
			"subject_types_supported":               []string{"public"},
			"id_token_signing_alg_values_supported": []string{"RS256"},
			"code_challenge_methods_supported":      []string{"S256"},
			"scopes_supported":                      []string{"openid"},
		},
		JWKS: map[string]any{"keys": keys},
		Operations: httptransport.IntelligenceOIDCOperations{
			ValidateAuthorization: s.validateIntelligenceOIDCAuthorizationRequest,
			Authorize:             s.authorizeIntelligenceOIDC,
			AuthorizeBrowser:      s.authorizeIntelligenceOIDCBrowserSession,
			Exchange: func(ctx context.Context, request *http.Request, clientID, clientSecret, code, redirectURI, verifier string) (httptransport.IntelligenceOIDCTokenResponse, error) {
				// OIDC's protocol access token is opaque and has no Messenger API
				// authority; app APIs accept signed app sessions and source routes
				// accept only credentials persisted by their own enrollment flow.
				accessToken, err := randomToken()
				if err != nil {
					return httptransport.IntelligenceOIDCTokenResponse{}, httptransport.ErrIntelligenceOIDCUnavailable
				}
				idToken, err := s.exchangeIntelligenceOIDCCode(ctx, request, clientID, clientSecret, code, redirectURI, verifier)
				if err != nil {
					return httptransport.IntelligenceOIDCTokenResponse{}, err
				}
				return httptransport.IntelligenceOIDCTokenResponse{
					AccessToken: accessToken,
					TokenType:   "Bearer",
					ExpiresIn:   int64(intelligenceOIDCIDTokenTTL.Seconds()),
					IDToken:     idToken,
				}, nil
			},
		},
	})
}

func intelligenceOIDCJWKFor(keyID string, key *rsa.PublicKey) intelligenceOIDCJWK {
	return intelligenceOIDCJWK{
		KTY: "RSA", USE: "sig", ALG: "RS256", KID: keyID,
		N: base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
		E: base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
	}
}

func (s *Server) authorizeIntelligenceOIDC(ctx context.Context, request *http.Request, input httptransport.IntelligenceOIDCAuthorizationRequest) (httptransport.IntelligenceOIDCAuthorizationResult, error) {
	if s.sqlDB == nil || !s.cfg.IntelligenceOIDCEnabled || s.cfg.IntelligenceOIDCClientID == "" || s.cfg.IntelligenceOIDCClientSecret == "" {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	if err := s.intelligenceOIDCRateLimit(ctx, request, "oidc-authorize", 30); err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, err
	}
	if err := s.validateIntelligenceOIDCAuthorizationRequest(ctx, request, input); err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, err
	}
	user, err := s.currentUser(request)
	if err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnauthorized
	}
	_, err = s.intelligenceOIDCSubject(ctx, user.ID)
	if errors.Is(err, sql.ErrNoRows) {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnauthorized
	}
	if err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	code, err := randomToken()
	if err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	digest := sha256.Sum256([]byte(code))
	now := s.intelligenceOIDCNow()
	if _, err := s.sqlDB.ExecContext(ctx, `DELETE FROM public.intelligence_oidc_authorization_codes WHERE expires_at <= $1`, now); err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	_, err = s.sqlDB.ExecContext(ctx, `
		INSERT INTO public.intelligence_oidc_authorization_codes
			(code_hash,client_id,redirect_uri,user_id,code_challenge,nonce,expires_at,created_at)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, digest[:], s.cfg.IntelligenceOIDCClientID, input.RedirectURI,
		user.ID, input.CodeChallenge, input.Nonce, now.Add(intelligenceOIDCAuthorizationCodeTTL), now)
	if err != nil {
		return httptransport.IntelligenceOIDCAuthorizationResult{}, httptransport.ErrIntelligenceOIDCUnavailable
	}
	return httptransport.IntelligenceOIDCAuthorizationResult{RedirectURI: input.RedirectURI, Code: code, State: input.State}, nil
}

func (s *Server) validateIntelligenceOIDCAuthorizationRequest(_ context.Context, _ *http.Request, input httptransport.IntelligenceOIDCAuthorizationRequest) error {
	if !s.cfg.IntelligenceOIDCEnabled || s.cfg.IntelligenceOIDCClientID == "" || s.cfg.IntelligenceOIDCClientSecret == "" {
		return httptransport.ErrIntelligenceOIDCUnavailable
	}
	if input.ResponseType != "code" || input.ClientID != s.cfg.IntelligenceOIDCClientID || !containsExactString(s.cfg.IntelligenceOIDCRedirectURIs, input.RedirectURI) || !validIntelligenceOIDCString(input.State, 512) || !validIntelligenceOIDCString(input.Nonce, 512) || input.CodeChallengeMethod != "S256" || !validIntelligenceOIDCChallenge(input.CodeChallenge) {
		return httptransport.ErrIntelligenceOIDCInvalidRequest
	}
	return nil
}

func (s *Server) exchangeIntelligenceOIDCCode(ctx context.Context, request *http.Request, clientID, clientSecret, code, redirectURI, verifier string) (string, error) {
	if s.sqlDB == nil || !s.cfg.IntelligenceOIDCEnabled || s.cfg.IntelligenceOIDCClientID == "" || s.cfg.IntelligenceOIDCClientSecret == "" {
		return "", httptransport.ErrIntelligenceOIDCUnavailable
	}
	if err := s.intelligenceOIDCRateLimit(ctx, request, "oidc-token", 60); err != nil {
		return "", err
	}
	secretMatches := len(clientSecret) == len(s.cfg.IntelligenceOIDCClientSecret) && subtle.ConstantTimeCompare([]byte(clientSecret), []byte(s.cfg.IntelligenceOIDCClientSecret)) == 1
	if clientID != s.cfg.IntelligenceOIDCClientID || !secretMatches {
		return "", httptransport.ErrIntelligenceOIDCInvalidClient
	}
	if !containsExactString(s.cfg.IntelligenceOIDCRedirectURIs, redirectURI) || code == "" || len(code) > 128 || !validIntelligenceOIDCVerifier(verifier) {
		return "", httptransport.ErrIntelligenceOIDCInvalidRequest
	}
	digest := sha256.Sum256([]byte(code))
	now := s.intelligenceOIDCNow()
	tx, err := s.sqlDB.BeginTx(ctx, nil)
	if err != nil {
		return "", httptransport.ErrIntelligenceOIDCUnavailable
	}
	defer func() { _ = tx.Rollback() }()
	var userID, challenge, nonce string
	err = tx.QueryRowContext(ctx, `
		SELECT user_id,code_challenge,nonce
		FROM public.intelligence_oidc_authorization_codes
		WHERE code_hash=$1 AND client_id=$2 AND redirect_uri=$3 AND expires_at>$4
		FOR UPDATE`, digest[:], clientID, redirectURI, now).Scan(&userID, &challenge, &nonce)
	if errors.Is(err, sql.ErrNoRows) {
		return "", httptransport.ErrIntelligenceOIDCInvalidRequest
	}
	if err != nil {
		return "", httptransport.ErrIntelligenceOIDCUnavailable
	}
	if !intelligenceOIDCPKCEVerifierMatches(verifier, challenge) {
		return "", httptransport.ErrIntelligenceOIDCInvalidRequest
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM public.intelligence_oidc_authorization_codes WHERE code_hash=$1`, digest[:]); err != nil {
		return "", httptransport.ErrIntelligenceOIDCUnavailable
	}
	if err := tx.Commit(); err != nil {
		return "", httptransport.ErrIntelligenceOIDCUnavailable
	}
	subject, err := s.intelligenceOIDCSubject(ctx, userID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", httptransport.ErrIntelligenceOIDCUnauthorized
	}
	if err != nil {
		return "", httptransport.ErrIntelligenceOIDCUnavailable
	}
	key, err := parseIntelligenceOIDCPrivateKey(s.cfg.IntelligenceOIDCSigningPrivateKeyPEM)
	if err != nil {
		return "", httptransport.ErrIntelligenceOIDCUnavailable
	}
	issuedAt := s.intelligenceOIDCNow()
	claims := struct {
		Nonce string `json:"nonce"`
		jwt.RegisteredClaims
	}{
		Nonce: nonce,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: s.cfg.IntelligenceOIDCIssuer, Subject: subject,
			Audience: jwt.ClaimStrings{s.cfg.IntelligenceOIDCClientID},
			IssuedAt: jwt.NewNumericDate(issuedAt), ExpiresAt: jwt.NewNumericDate(issuedAt.Add(intelligenceOIDCIDTokenTTL)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = s.cfg.IntelligenceOIDCSigningKeyID
	signed, err := token.SignedString(key)
	if err != nil {
		return "", httptransport.ErrIntelligenceOIDCUnavailable
	}
	return signed, nil
}

func (s *Server) intelligenceOIDCSubject(ctx context.Context, userID string) (string, error) {
	var subject string
	err := s.sqlDB.QueryRowContext(ctx, `
		SELECT identity.subject
		FROM public.intelligence_oidc_subjects identity
		JOIN public.users principal ON principal.id=identity.user_id AND principal.is_active=1
		WHERE identity.issuer=$1 AND identity.user_id=$2`, s.cfg.IntelligenceOIDCIssuer, userID).Scan(&subject)
	if err == nil {
		return subject, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	rawSubject, err := randomToken()
	if err != nil {
		return "", err
	}
	if _, err := s.sqlDB.ExecContext(ctx, `
		INSERT INTO public.intelligence_oidc_subjects(issuer,user_id,subject)
		SELECT $1,id,$3 FROM public.users WHERE id=$2 AND is_active=1
		ON CONFLICT (issuer,user_id) DO NOTHING`, s.cfg.IntelligenceOIDCIssuer, userID, rawSubject); err != nil {
		return "", err
	}
	err = s.sqlDB.QueryRowContext(ctx, `
		SELECT identity.subject
		FROM public.intelligence_oidc_subjects identity
		JOIN public.users principal ON principal.id=identity.user_id AND principal.is_active=1
		WHERE identity.issuer=$1 AND identity.user_id=$2`, s.cfg.IntelligenceOIDCIssuer, userID).Scan(&subject)
	return subject, err
}

func (s *Server) intelligenceOIDCNow() time.Time {
	if s.oidcNow == nil {
		return time.Now().UTC()
	}
	return s.oidcNow().UTC()
}

func (s *Server) intelligenceOIDCRateLimit(ctx context.Context, request *http.Request, operation string, limit int) error {
	if s.cache == nil {
		return httptransport.ErrIntelligenceOIDCUnavailable
	}
	count, err := s.cache.Increment(ctx, "rate-limit:auth-method:"+operation+":"+s.getClientIP(request), 60)
	if err != nil {
		return httptransport.ErrIntelligenceOIDCUnavailable
	}
	if count > int64(limit) {
		return httptransport.ErrIntelligenceOIDCRateLimited
	}
	return nil
}

func validIntelligenceOIDCKeyID(value string) bool {
	if value == "" || len(value) > 128 || strings.TrimSpace(value) != value {
		return false
	}
	for _, char := range value {
		if char < 0x21 || char > 0x7e {
			return false
		}
	}
	return true
}

func validIntelligenceOIDCString(value string, max int) bool {
	if value == "" || len(value) > max || strings.TrimSpace(value) != value {
		return false
	}
	for _, char := range value {
		if char < 0x21 || char == 0x7f {
			return false
		}
	}
	return true
}

func validIntelligenceOIDCChallenge(value string) bool {
	if len(value) != 43 {
		return false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size && base64.RawURLEncoding.EncodeToString(decoded) == value
}

func validIntelligenceOIDCVerifier(value string) bool {
	if len(value) < 43 || len(value) > 128 {
		return false
	}
	for _, char := range value {
		if !(char >= 'A' && char <= 'Z' || char >= 'a' && char <= 'z' || char >= '0' && char <= '9' || strings.ContainsRune("-._~", char)) {
			return false
		}
	}
	return true
}

func intelligenceOIDCPKCEVerifierMatches(verifier, challenge string) bool {
	digest := sha256.Sum256([]byte(verifier))
	computed := base64.RawURLEncoding.EncodeToString(digest[:])
	return len(computed) == len(challenge) && subtle.ConstantTimeCompare([]byte(computed), []byte(challenge)) == 1
}

func containsExactString(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func parseIntelligenceOIDCPrivateKey(raw string) (*rsa.PrivateKey, error) {
	block, rest := pem.Decode([]byte(raw))
	if block == nil || strings.TrimSpace(string(rest)) != "" {
		return nil, errors.New("invalid private key")
	}
	var key *rsa.PrivateKey
	switch block.Type {
	case "PRIVATE KEY":
		parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, err
		}
		var ok bool
		key, ok = parsed.(*rsa.PrivateKey)
		if !ok {
			return nil, errors.New("not an RSA private key")
		}
	case "RSA PRIVATE KEY":
		var err error
		key, err = x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			return nil, err
		}
	default:
		return nil, errors.New("unsupported private key PEM")
	}
	if key.N.BitLen() < 2048 || key.Validate() != nil {
		return nil, errors.New("invalid RSA private key")
	}
	return key, nil
}

func parseIntelligenceOIDCPublicKey(raw string) (*rsa.PublicKey, error) {
	block, rest := pem.Decode([]byte(raw))
	if block == nil || strings.TrimSpace(string(rest)) != "" {
		return nil, errors.New("invalid public key")
	}
	var public any
	var err error
	switch block.Type {
	case "PUBLIC KEY":
		public, err = x509.ParsePKIXPublicKey(block.Bytes)
	case "RSA PUBLIC KEY":
		public, err = x509.ParsePKCS1PublicKey(block.Bytes)
	default:
		return nil, errors.New("unsupported public key PEM")
	}
	if err != nil {
		return nil, err
	}
	key, ok := public.(*rsa.PublicKey)
	if !ok || key.N.BitLen() < 2048 || key.E < 3 || key.E%2 == 0 {
		return nil, errors.New("invalid RSA public key")
	}
	return key, nil
}
