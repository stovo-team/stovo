package app

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"stovo-messenger/backend/internal/config"
	httptransport "stovo-messenger/backend/internal/transport/http"

	"github.com/golang-jwt/jwt/v5"
)

func TestIntelligenceOIDCCodeFlowIsOneUseAndSeparateFromSourceCredential(t *testing.T) {
	server, setupServer, setupClient := newTestServer(t)
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate synthetic OIDC key: %v", err)
	}
	privateKeyDER, err := x509.MarshalPKCS8PrivateKey(privateKey)
	if err != nil {
		t.Fatalf("encode synthetic OIDC key: %v", err)
	}
	previousKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate synthetic previous OIDC key: %v", err)
	}
	previousKeyDER, err := x509.MarshalPKIXPublicKey(&previousKey.PublicKey)
	if err != nil {
		t.Fatalf("encode synthetic previous OIDC public key: %v", err)
	}
	const (
		issuer       = "https://messenger.example"
		clientID     = "synthetic-intelligence-client"
		clientSecret = "synthetic-confidential-client-secret"
		keyID        = "synthetic-key-1"
		redirectURI  = "https://intelligence.example/oauth/callback?tenant=synthetic"
		state        = "state-value-from-client"
		nonce        = "nonce-value-from-client"
		verifier     = "a-long-synthetic-pkce-verifier-that-is-at-least-43-characters-long"
	)
	server.cfg.IntelligenceOIDCEnabled = true
	server.cfg.IntelligenceOIDCIssuer = issuer
	server.cfg.IntelligenceOIDCClientID = clientID
	server.cfg.IntelligenceOIDCClientSecret = clientSecret
	server.cfg.IntelligenceOIDCRedirectURIs = []string{redirectURI}
	server.cfg.IntelligenceOIDCSigningKeyID = keyID
	server.cfg.IntelligenceOIDCSigningPrivateKeyPEM = string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateKeyDER}))
	server.cfg.IntelligenceOIDCPreviousSigningKeys = []config.IntelligenceOIDCSigningPublicKey{{
		KeyID: "synthetic-previous-key", PublicKeyPEM: string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: previousKeyDER})),
	}}
	fixedNow := time.Now().UTC().Truncate(time.Second)
	server.oidcNow = func() time.Time { return fixedNow }

	oidcServer := httptest.NewServer(server.Routes())
	t.Cleanup(oidcServer.Close)
	oidcClient := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

	metadataResponse, err := oidcClient.Get(oidcServer.URL + "/.well-known/openid-configuration")
	if err != nil {
		t.Fatalf("request OIDC discovery: %v", err)
	}
	if metadataResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(metadataResponse.Body)
		_ = metadataResponse.Body.Close()
		t.Fatalf("OIDC discovery status=%d body=%s", metadataResponse.StatusCode, body)
	}
	if metadataResponse.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("OIDC discovery cache policy=%q, want no-store", metadataResponse.Header.Get("Cache-Control"))
	}
	var metadata map[string]any
	if err := json.NewDecoder(metadataResponse.Body).Decode(&metadata); err != nil {
		t.Fatalf("decode discovery: %v", err)
	}
	_ = metadataResponse.Body.Close()
	if metadata["issuer"] != issuer || metadata["authorization_endpoint"] != issuer+"/oauth2/authorize" || metadata["token_endpoint"] != issuer+"/oauth2/token" || metadata["jwks_uri"] != issuer+"/oauth2/jwks" {
		t.Fatalf("OIDC discovery endpoints = %#v", metadata)
	}
	if !containsJSONStrings(metadata["response_types_supported"], "code") || !containsJSONStrings(metadata["code_challenge_methods_supported"], "S256") || !containsJSONStrings(metadata["id_token_signing_alg_values_supported"], "RS256") || !containsJSONStrings(metadata["subject_types_supported"], "public") {
		t.Fatalf("OIDC discovery capabilities = %#v", metadata)
	}

	setupResponse := jsonRequest(t, setupClient, http.MethodPost, setupServer.URL+"/api/auth/setup", "", map[string]any{
		"familyName": "Synthetic OIDC family", "username": "synthetic-oidc-user", "password": "synthetic-oidc-password", "displayName": "Synthetic OIDC User",
	})
	if setupResponse.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(setupResponse.Body)
		_ = setupResponse.Body.Close()
		t.Fatalf("create synthetic OIDC user status=%d body=%s", setupResponse.StatusCode, body)
	}
	owner := decodeJSON[authResponse](t, setupResponse)

	jwksResponse, err := oidcClient.Get(oidcServer.URL + "/oauth2/jwks")
	if err != nil {
		t.Fatalf("request JWKS: %v", err)
	}
	if jwksResponse.StatusCode != http.StatusOK || jwksResponse.Header.Get("Cache-Control") != "no-store" {
		body, _ := io.ReadAll(jwksResponse.Body)
		_ = jwksResponse.Body.Close()
		t.Fatalf("JWKS status=%d cache=%q body=%s", jwksResponse.StatusCode, jwksResponse.Header.Get("Cache-Control"), body)
	}
	var jwks struct {
		Keys []struct {
			KTY string `json:"kty"`
			Use string `json:"use"`
			Alg string `json:"alg"`
			KID string `json:"kid"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(jwksResponse.Body).Decode(&jwks); err != nil {
		t.Fatalf("decode JWKS: %v", err)
	}
	_ = jwksResponse.Body.Close()
	if len(jwks.Keys) != 2 {
		t.Fatalf("JWKS key overlap contains %d keys, want active and previous public keys: %#v", len(jwks.Keys), jwks.Keys)
	}
	keyIDs := map[string]bool{}
	for _, key := range jwks.Keys {
		if key.KTY != "RSA" || key.Use != "sig" || key.Alg != "RS256" || key.N == "" || key.E == "" {
			t.Fatalf("invalid JWKS signing key: %#v", key)
		}
		keyIDs[key.KID] = true
		if key.KID == keyID && (key.N != base64.RawURLEncoding.EncodeToString(privateKey.N.Bytes()) || key.E != base64.RawURLEncoding.EncodeToString(big.NewInt(int64(privateKey.E)).Bytes())) {
			t.Fatalf("active JWKS key does not match signing key: %#v", key)
		}
	}
	if !keyIDs[keyID] || !keyIDs["synthetic-previous-key"] {
		t.Fatalf("JWKS did not retain both configured rotation keys: %#v", jwks.Keys)
	}

	pkceDigest := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(pkceDigest[:])
	makeAuthorizeURL := func(callback string) string {
		query := url.Values{
			"response_type": {"code"}, "client_id": {clientID}, "redirect_uri": {callback},
			"state": {state}, "nonce": {nonce}, "code_challenge": {challenge}, "code_challenge_method": {"S256"},
		}
		return oidcServer.URL + "/oauth2/authorize?" + query.Encode()
	}
	issueCode := func() string {
		t.Helper()
		authorizeRequest, err := http.NewRequest(http.MethodGet, makeAuthorizeURL(redirectURI), nil)
		if err != nil {
			t.Fatalf("build authorize request: %v", err)
		}
		authorizeRequest.Header.Set("Authorization", "Bearer "+owner.AccessToken)
		authorizeResponse, err := oidcClient.Do(authorizeRequest)
		if err != nil {
			t.Fatalf("request OIDC authorize: %v", err)
		}
		if authorizeResponse.StatusCode != http.StatusFound || authorizeResponse.Header.Get("Cache-Control") != "no-store" {
			body, _ := io.ReadAll(authorizeResponse.Body)
			_ = authorizeResponse.Body.Close()
			t.Fatalf("authorize status=%d cache=%q body=%s", authorizeResponse.StatusCode, authorizeResponse.Header.Get("Cache-Control"), body)
		}
		callback, err := url.Parse(authorizeResponse.Header.Get("Location"))
		_ = authorizeResponse.Body.Close()
		if err != nil {
			t.Fatalf("parse OIDC callback: %v", err)
		}
		if callback.Scheme+"://"+callback.Host+callback.EscapedPath() != "https://intelligence.example/oauth/callback" || callback.Query().Get("tenant") != "synthetic" || callback.Query().Get("state") != state || callback.Query().Get("error") != "" {
			t.Fatalf("authorization callback changed the registered URI/state: %s", callback)
		}
		code := callback.Query().Get("code")
		if code == "" {
			t.Fatal("authorization callback omitted one-use code")
		}
		return code
	}
	for _, invalid := range []struct {
		name   string
		change func(url.Values)
	}{
		{name: "missing state", change: func(values url.Values) { values.Del("state") }},
		{name: "missing nonce", change: func(values url.Values) { values.Del("nonce") }},
		{name: "plain PKCE", change: func(values url.Values) { values.Set("code_challenge_method", "plain") }},
		{name: "malformed S256 challenge", change: func(values url.Values) { values.Set("code_challenge", strings.Repeat("!", 43)) }},
	} {
		t.Run(invalid.name, func(t *testing.T) {
			invalidURL, err := url.Parse(makeAuthorizeURL(redirectURI))
			if err != nil {
				t.Fatalf("parse synthetic authorize URL: %v", err)
			}
			query := invalidURL.Query()
			invalid.change(query)
			invalidURL.RawQuery = query.Encode()
			request, err := http.NewRequest(http.MethodGet, invalidURL.String(), nil)
			if err != nil {
				t.Fatalf("build invalid authorize request: %v", err)
			}
			request.Header.Set("Authorization", "Bearer "+owner.AccessToken)
			response, err := oidcClient.Do(request)
			if err != nil {
				t.Fatalf("request invalid authorize parameters: %v", err)
			}
			body, _ := io.ReadAll(response.Body)
			_ = response.Body.Close()
			if response.StatusCode != http.StatusBadRequest || strings.Contains(string(body), owner.User.ID) {
				t.Fatalf("invalid authorization parameters status=%d body=%s", response.StatusCode, body)
			}
		})
	}
	unauthorizedCallback, err := oidcClient.Get(makeAuthorizeURL("https://attacker.example/callback"))
	if err != nil {
		t.Fatalf("request invalid callback: %v", err)
	}
	unauthorizedBody, _ := io.ReadAll(unauthorizedCallback.Body)
	_ = unauthorizedCallback.Body.Close()
	if unauthorizedCallback.StatusCode != http.StatusBadRequest || strings.Contains(string(unauthorizedBody), "attacker.example") {
		t.Fatalf("invalid callback response leaked details or was accepted: status=%d body=%s", unauthorizedCallback.StatusCode, unauthorizedBody)
	}

	browserSession := jsonRequest(t, oidcClient, http.MethodPost, oidcServer.URL+"/api/v2/intelligence/authorize-session", owner.AccessToken, map[string]any{
		"flow": "oidc", "response_type": "code", "client_id": clientID, "redirect_uri": redirectURI,
		"state": state, "nonce": nonce, "code_challenge": challenge, "code_challenge_method": "S256",
	})
	if browserSession.StatusCode != http.StatusOK || browserSession.Header.Get("Cache-Control") != "no-store" {
		body, _ := io.ReadAll(browserSession.Body)
		_ = browserSession.Body.Close()
		t.Fatalf("create OIDC browser session status=%d body=%s", browserSession.StatusCode, body)
	}
	var sessionReply map[string]any
	if err := json.NewDecoder(browserSession.Body).Decode(&sessionReply); err != nil {
		_ = browserSession.Body.Close()
		t.Fatalf("decode OIDC browser session response: %v", err)
	}
	_ = browserSession.Body.Close()
	if sessionReply["expires_in"] != float64(120) || len(sessionReply) != 1 {
		t.Fatalf("OIDC browser session response exposed unexpected fields: %#v", sessionReply)
	}
	var browserTicket string
	for _, cookie := range browserSession.Cookies() {
		if cookie.Name == "messenger_oidc_browser" {
			browserTicket = cookie.Value
			if cookie.Path != "/oauth2/authorize" || !cookie.HttpOnly || cookie.MaxAge != 120 {
				t.Fatalf("OIDC browser cookie is not path-scoped and short-lived: %#v", cookie)
			}
		}
	}
	if browserTicket == "" || len(sessionReply) != 1 {
		t.Fatal("OIDC browser session did not keep its ticket in an HttpOnly cookie")
	}
	ticketHash := sha256.Sum256([]byte(browserTicket))
	var storedTicketHash []byte
	if err := server.sqlDB.QueryRowContext(context.Background(), `SELECT ticket_hash FROM public.intelligence_browser_authorization_sessions WHERE flow='oidc' AND user_id=$1`, owner.User.ID).Scan(&storedTicketHash); err != nil {
		t.Fatalf("read persisted OIDC browser ticket hash: %v", err)
	}
	if len(storedTicketHash) != sha256.Size || !bytes.Equal(storedTicketHash, ticketHash[:]) || bytes.Contains(storedTicketHash, []byte(browserTicket)) {
		t.Fatal("OIDC browser ticket was not stored as only its SHA-256 hash")
	}
	browserRequest, err := http.NewRequest(http.MethodGet, makeAuthorizeURL(redirectURI), nil)
	if err != nil {
		t.Fatalf("build OIDC browser completion request: %v", err)
	}
	browserRequest.Header.Set("Accept", "text/html")
	browserRequest.AddCookie(&http.Cookie{Name: "messenger_oidc_browser", Value: browserTicket})
	browserResponse, err := oidcClient.Do(browserRequest)
	if err != nil {
		t.Fatalf("complete OIDC browser session: %v", err)
	}
	if browserResponse.StatusCode != http.StatusFound || browserResponse.Header.Get("Cache-Control") != "no-store" {
		body, _ := io.ReadAll(browserResponse.Body)
		_ = browserResponse.Body.Close()
		t.Fatalf("complete OIDC browser session status=%d body=%s", browserResponse.StatusCode, body)
	}
	browserLocation, err := url.Parse(browserResponse.Header.Get("Location"))
	_ = browserResponse.Body.Close()
	if err != nil || browserLocation.Query().Get("code") == "" || browserLocation.Query().Get("state") != state {
		t.Fatalf("OIDC browser callback = %q (err %v)", browserResponse.Header.Get("Location"), err)
	}
	var remainingBrowserTickets int
	if err := server.sqlDB.QueryRowContext(context.Background(), `SELECT count(*) FROM public.intelligence_browser_authorization_sessions WHERE ticket_hash=$1`, ticketHash[:]).Scan(&remainingBrowserTickets); err != nil || remainingBrowserTickets != 0 {
		t.Fatalf("one-use OIDC browser ticket rows=%d err=%v", remainingBrowserTickets, err)
	}
	replayRequest, _ := http.NewRequest(http.MethodGet, makeAuthorizeURL(redirectURI), nil)
	replayRequest.AddCookie(&http.Cookie{Name: "messenger_oidc_browser", Value: browserTicket})
	replayResponse, err := oidcClient.Do(replayRequest)
	if err != nil {
		t.Fatalf("replay OIDC browser ticket: %v", err)
	}
	if replayResponse.StatusCode != http.StatusUnauthorized {
		body, _ := io.ReadAll(replayResponse.Body)
		_ = replayResponse.Body.Close()
		t.Fatalf("replayed OIDC browser ticket status=%d body=%s", replayResponse.StatusCode, body)
	}
	_ = replayResponse.Body.Close()

	code := issueCode()
	codeDigest := sha256.Sum256([]byte(code))
	var storedCodeHash []byte
	if err := server.sqlDB.QueryRowContext(context.Background(), `SELECT code_hash FROM public.intelligence_oidc_authorization_codes WHERE code_hash=$1 AND user_id=$2`, codeDigest[:], owner.User.ID).Scan(&storedCodeHash); err != nil {
		t.Fatalf("read synthetic stored authorization code hash: %v", err)
	}
	if !bytes.Equal(storedCodeHash, codeDigest[:]) || bytes.Equal(storedCodeHash, []byte(code)) {
		t.Fatal("authorization code was not stored as a one-way digest")
	}

	exchangeWithClient := func(code, codeVerifier, callback, exchangeClientID, exchangeClientSecret string) *http.Response {
		t.Helper()
		form := url.Values{"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {callback}, "code_verifier": {codeVerifier}}
		request, err := http.NewRequest(http.MethodPost, oidcServer.URL+"/oauth2/token", strings.NewReader(form.Encode()))
		if err != nil {
			t.Fatalf("build token request: %v", err)
		}
		request.SetBasicAuth(exchangeClientID, exchangeClientSecret)
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		response, err := oidcClient.Do(request)
		if err != nil {
			t.Fatalf("exchange OIDC code: %v", err)
		}
		return response
	}
	exchange := func(code, codeVerifier string) *http.Response {
		return exchangeWithClient(code, codeVerifier, redirectURI, clientID, clientSecret)
	}
	tokenResponse := exchange(code, verifier)
	if tokenResponse.StatusCode != http.StatusOK || tokenResponse.Header.Get("Cache-Control") != "no-store" {
		body, _ := io.ReadAll(tokenResponse.Body)
		_ = tokenResponse.Body.Close()
		t.Fatalf("token response status=%d cache=%q body=%s", tokenResponse.StatusCode, tokenResponse.Header.Get("Cache-Control"), body)
	}
	var tokens struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
		ExpiresIn   int64  `json:"expires_in"`
		IDToken     string `json:"id_token"`
	}
	if err := json.NewDecoder(tokenResponse.Body).Decode(&tokens); err != nil {
		t.Fatalf("decode token response: %v", err)
	}
	_ = tokenResponse.Body.Close()
	if tokens.IDToken == "" || tokens.AccessToken == "" || tokens.AccessToken == tokens.IDToken || tokens.TokenType != "Bearer" || tokens.ExpiresIn != int64(intelligenceOIDCIDTokenTTL.Seconds()) {
		t.Fatalf("OIDC code exchange did not return distinct short-lived protocol tokens: %#v", tokens)
	}
	claims := jwt.MapClaims{}
	parsedIDToken, err := jwt.ParseWithClaims(tokens.IDToken, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodRS256 || token.Header["kid"] != keyID {
			return nil, errors.New("unexpected OIDC token signing header")
		}
		return &privateKey.PublicKey, nil
	}, jwt.WithIssuer(issuer), jwt.WithAudience(clientID), jwt.WithExpirationRequired(), jwt.WithIssuedAt())
	if err != nil || !parsedIDToken.Valid {
		t.Fatalf("verify synthetic ID token: valid=%v err=%v", parsedIDToken != nil && parsedIDToken.Valid, err)
	}
	if claims["nonce"] != nonce || claims["sub"] == "" || claims["sub"] == owner.User.ID {
		t.Fatalf("ID token claims omitted nonce or opaque stable subject: %#v", claims)
	}
	issuedAt, issuedErr := claims.GetIssuedAt()
	expiresAt, expiresErr := claims.GetExpirationTime()
	if issuedErr != nil || expiresErr != nil || issuedAt == nil || expiresAt == nil || expiresAt.Sub(issuedAt.Time) <= 0 || expiresAt.Sub(issuedAt.Time) > intelligenceOIDCIDTokenTTL {
		t.Fatalf("ID token lifetime is not bounded: iat=%v exp=%v errors=%v/%v", issuedAt, expiresAt, issuedErr, expiresErr)
	}
	for _, token := range []string{tokens.IDToken, tokens.AccessToken} {
		if _, err := server.authenticateIntelligenceSource(context.Background(), token); !errors.Is(err, httptransport.ErrIntelligenceSourceUnauthorized) {
			t.Fatalf("OIDC token was accepted as an Intelligence source credential: %v", err)
		}
	}
	requestAsOIDCAccessToken := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	requestAsOIDCAccessToken.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	if _, err := server.currentUser(requestAsOIDCAccessToken); err == nil {
		t.Fatal("opaque OIDC access token was accepted as a Messenger API access token")
	}

	reused := exchange(code, verifier)
	reusedBody, _ := io.ReadAll(reused.Body)
	_ = reused.Body.Close()
	if reused.StatusCode != http.StatusBadRequest || strings.Contains(string(reusedBody), "SELECT") || strings.Contains(string(reusedBody), code) {
		t.Fatalf("authorization code reuse response was not generic: status=%d body=%s", reused.StatusCode, reusedBody)
	}

	callbackRetryCode := issueCode()
	wrongCallback := exchangeWithClient(callbackRetryCode, verifier, "https://attacker.example/callback", clientID, clientSecret)
	wrongCallbackBody, _ := io.ReadAll(wrongCallback.Body)
	_ = wrongCallback.Body.Close()
	if wrongCallback.StatusCode != http.StatusBadRequest || strings.Contains(string(wrongCallbackBody), "attacker.example") {
		t.Fatalf("token callback substitution response = %d %s", wrongCallback.StatusCode, wrongCallbackBody)
	}
	callbackRetry := exchange(callbackRetryCode, verifier)
	if callbackRetry.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(callbackRetry.Body)
		_ = callbackRetry.Body.Close()
		t.Fatalf("wrong callback URI consumed the authorization code: status=%d body=%s", callbackRetry.StatusCode, body)
	}
	_ = callbackRetry.Body.Close()

	clientAuthCode := issueCode()
	wrongClient := exchangeWithClient(clientAuthCode, verifier, redirectURI, clientID, "wrong-synthetic-client-secret")
	wrongClientBody, _ := io.ReadAll(wrongClient.Body)
	_ = wrongClient.Body.Close()
	if wrongClient.StatusCode != http.StatusUnauthorized || strings.Contains(string(wrongClientBody), clientSecret) || strings.Contains(string(wrongClientBody), clientAuthCode) {
		t.Fatalf("invalid confidential client response = %d %s", wrongClient.StatusCode, wrongClientBody)
	}
	clientAuthRetry := exchange(clientAuthCode, verifier)
	if clientAuthRetry.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(clientAuthRetry.Body)
		_ = clientAuthRetry.Body.Close()
		t.Fatalf("invalid client secret consumed the authorization code: status=%d body=%s", clientAuthRetry.StatusCode, body)
	}
	_ = clientAuthRetry.Body.Close()

	pkceRetryCode := issueCode()
	wrongVerifier := strings.Repeat("z", len(verifier))
	if wrongVerifier == verifier {
		wrongVerifier = strings.Repeat("y", len(verifier))
	}
	wrongPKCE := exchange(pkceRetryCode, wrongVerifier)
	wrongPKCEBody, _ := io.ReadAll(wrongPKCE.Body)
	_ = wrongPKCE.Body.Close()
	if wrongPKCE.StatusCode != http.StatusBadRequest || strings.Contains(string(wrongPKCEBody), pkceRetryCode) {
		t.Fatalf("wrong PKCE verifier response is not generic: status=%d body=%s", wrongPKCE.StatusCode, wrongPKCEBody)
	}
	validPKCERetry := exchange(pkceRetryCode, verifier)
	if validPKCERetry.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(validPKCERetry.Body)
		_ = validPKCERetry.Body.Close()
		t.Fatalf("invalid verifier unexpectedly consumed the authorization code: status=%d body=%s", validPKCERetry.StatusCode, body)
	}
	_ = validPKCERetry.Body.Close()

	expiredCode := issueCode()
	fixedNow = fixedNow.Add(intelligenceOIDCAuthorizationCodeTTL + time.Second)
	expiredExchange := exchange(expiredCode, verifier)
	expiredBody, _ := io.ReadAll(expiredExchange.Body)
	_ = expiredExchange.Body.Close()
	if expiredExchange.StatusCode != http.StatusBadRequest || strings.Contains(string(expiredBody), expiredCode) {
		t.Fatalf("expired authorization code response = %d %s", expiredExchange.StatusCode, expiredBody)
	}

	if _, err := server.sqlDB.ExecContext(context.Background(), `UPDATE public.users SET is_active=0 WHERE id=$1`, owner.User.ID); err != nil {
		t.Fatalf("deactivate synthetic OIDC user: %v", err)
	}
	inactiveRequest, err := http.NewRequest(http.MethodGet, makeAuthorizeURL(redirectURI), nil)
	if err != nil {
		t.Fatalf("build inactive authorize request: %v", err)
	}
	inactiveRequest.Header.Set("Authorization", "Bearer "+owner.AccessToken)
	inactiveResponse, err := oidcClient.Do(inactiveRequest)
	if err != nil {
		t.Fatalf("request OIDC authorize for inactive user: %v", err)
	}
	inactiveBody, _ := io.ReadAll(inactiveResponse.Body)
	_ = inactiveResponse.Body.Close()
	if inactiveResponse.StatusCode != http.StatusUnauthorized || strings.Contains(string(inactiveBody), owner.User.ID) {
		t.Fatalf("inactive OIDC principal response = %d %s", inactiveResponse.StatusCode, inactiveBody)
	}
}

func containsJSONStrings(raw any, expected string) bool {
	values, ok := raw.([]any)
	if !ok {
		return false
	}
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
