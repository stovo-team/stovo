package http

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

const browserTestChallenge = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

func TestSourceV2BrowserSessionCookieAndOneUseFormPost(t *testing.T) {
	var created IntelligenceBrowserSessionRequest
	var authorized IntelligenceSourceV2ConsentRequest
	var authorizedTicket string
	var listCalls int
	handler := NewIntelligenceSourceV2ConsentHandler(IntelligenceSourceV2ConsentHandlerConfig{
		BrowserAppURL: "https://messenger.example",
		Authenticate: func(r *http.Request) (IntelligenceSourceV2ConsentPrincipal, error) {
			if r.Header.Get("Authorization") != "Bearer synthetic-user-session" {
				return IntelligenceSourceV2ConsentPrincipal{}, ErrIntelligenceSourceV2ConsentUnauthorized
			}
			return IntelligenceSourceV2ConsentPrincipal{UserID: "user-1", FamilyID: "family-1"}, nil
		},
		Operations: IntelligenceSourceV2ConsentOperations{
			CreateBrowserSession: func(_ context.Context, _ *http.Request, principal IntelligenceSourceV2ConsentPrincipal, input IntelligenceBrowserSessionRequest) (IntelligenceBrowserSessionTicket, error) {
				if principal.UserID != "user-1" {
					t.Fatalf("session principal = %#v", principal)
				}
				created = input
				return IntelligenceBrowserSessionTicket{Value: "synthetic-one-use-ticket", ExpiresIn: 120}, nil
			},
			AuthorizeBrowser: func(_ context.Context, _ *http.Request, ticket string, input IntelligenceSourceV2ConsentRequest) (IntelligenceSourceV2ConsentRedirect, error) {
				authorizedTicket = ticket
				authorized = input
				return IntelligenceSourceV2ConsentRedirect{RedirectURI: input.RedirectURI, Code: "synthetic-code", State: input.State}, nil
			},
			ListConnections: func(_ context.Context, _ *http.Request, _ IntelligenceSourceV2ConsentPrincipal) ([]IntelligenceSourceV2ConnectionSummary, error) {
				listCalls++
				return []IntelligenceSourceV2ConnectionSummary{{ID: "connection-1", ChatID: "chat-1", ChatTitle: "Synthetic chat", CreatedAt: time.Unix(1, 0).UTC(), ExpiresAt: time.Unix(2, 0).UTC(), Grants: map[string]bool{"read": true, "process": false, "external_transfer": false, "export": true, "codex": false, "reply": false}}}, nil
			},
		},
	})
	router := chi.NewRouter()
	router.Mount("/api/v2/intelligence", handler)
	handler = router

	sessionBody := `{"flow":"source_v2","response_type":"code","client_id":"intelligence-client","redirect_uri":"https://intelligence.example/callback?tenant=one","state":"state-one","code_challenge":"` + browserTestChallenge + `","code_challenge_method":"S256","chat_id":"chat-1","grants":{"read":true,"process":false,"external_transfer":false,"export":true,"codex":false,"reply":false}}`
	sessionRequest := httptest.NewRequest(http.MethodPost, "/api/v2/intelligence/authorize-session", strings.NewReader(sessionBody))
	sessionRequest.Header.Set("Authorization", "Bearer synthetic-user-session")
	sessionRequest.Header.Set("Content-Type", "application/json")
	sessionResponse := httptest.NewRecorder()
	handler.ServeHTTP(sessionResponse, sessionRequest)
	if sessionResponse.Code != http.StatusOK || !strings.Contains(sessionResponse.Body.String(), `"expires_in":120`) || strings.Contains(sessionResponse.Body.String(), "synthetic-one-use-ticket") {
		t.Fatalf("browser session response = %d %q", sessionResponse.Code, sessionResponse.Body.String())
	}
	if created.Flow != "source_v2" || created.ChatID != "chat-1" || !created.Grants["read"] || created.Grants["process"] {
		t.Fatalf("created browser session binding = %#v", created)
	}
	cookies := sessionResponse.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("session cookies = %#v", cookies)
	}
	cookie := cookies[0]
	if cookie.Name != intelligenceSourceV2BrowserCookieName || cookie.Value != "synthetic-one-use-ticket" || cookie.Path != "/api/v2/intelligence/authorize" || !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteNoneMode || cookie.MaxAge != 120 {
		t.Fatalf("browser cookie policy = %#v", cookie)
	}

	query := url.Values{"client_id": {"intelligence-client"}, "redirect_uri": {"https://intelligence.example/callback?tenant=one"}, "state": {"state-one"}, "code_challenge": {browserTestChallenge}, "code_challenge_method": {"S256"}}
	offerRequest := httptest.NewRequest(http.MethodGet, "/api/v2/intelligence/authorize?"+query.Encode(), nil)
	offerRequest.Header.Set("Accept", "text/html")
	offerResponse := httptest.NewRecorder()
	handler.ServeHTTP(offerResponse, offerRequest)
	if offerResponse.Code != http.StatusFound {
		t.Fatalf("browser offer redirect status = %d body=%s", offerResponse.Code, offerResponse.Body.String())
	}
	consentPage, err := url.Parse(offerResponse.Header().Get("Location"))
	if err != nil || consentPage.Host != "messenger.example" || consentPage.Path != "/intelligence/consent" || consentPage.Query().Get("flow") != "source_v2" || consentPage.Query().Get("response_type") != "code" || consentPage.Query().Get("redirect_uri") != "https://intelligence.example/callback?tenant=one" {
		t.Fatalf("browser consent page location = %q (parsed %#v, err %v)", offerResponse.Header().Get("Location"), consentPage, err)
	}

	form := url.Values{
		"response_type": {"code"}, "client_id": {"intelligence-client"}, "redirect_uri": {"https://intelligence.example/callback?tenant=one"},
		"state": {"state-one"}, "code_challenge": {browserTestChallenge}, "code_challenge_method": {"S256"}, "chat_id": {"chat-1"},
		"read": {"true"}, "process": {"false"}, "external_transfer": {"false"}, "export": {"true"}, "codex": {"true"}, "reply": {"false"},
	}
	formRequest := httptest.NewRequest(http.MethodPost, "/api/v2/intelligence/authorize", strings.NewReader(form.Encode()))
	formRequest.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	formRequest.Header.Set("Origin", "https://messenger.example")
	formRequest.AddCookie(cookie)
	formResponse := httptest.NewRecorder()
	handler.ServeHTTP(formResponse, formRequest)
	if formResponse.Code != http.StatusFound || authorizedTicket != "synthetic-one-use-ticket" || authorized.ChatID != "chat-1" || !authorized.Grants["read"] || authorized.Grants["process"] || !authorized.Grants["codex"] || authorized.Grants["reply"] {
		t.Fatalf("form authorization = status %d ticket %q request %#v body %q", formResponse.Code, authorizedTicket, authorized, formResponse.Body.String())
	}
	location, err := url.Parse(formResponse.Header().Get("Location"))
	if err != nil || location.Host != "intelligence.example" || location.Query().Get("tenant") != "one" || location.Query().Get("code") != "synthetic-code" || location.Query().Get("state") != "state-one" {
		t.Fatalf("form callback location = %q (err %v)", formResponse.Header().Get("Location"), err)
	}
	cleared := formResponse.Result().Cookies()
	if len(cleared) != 1 || cleared[0].Name != intelligenceSourceV2BrowserCookieName || cleared[0].MaxAge != -1 || cleared[0].Path != cookie.Path {
		t.Fatalf("consumed session cookie was not cleared: %#v", cleared)
	}

	listRequest := httptest.NewRequest(http.MethodGet, "/api/v2/intelligence/connections", nil)
	listRequest.Header.Set("Authorization", "Bearer synthetic-user-session")
	listResponse := httptest.NewRecorder()
	handler.ServeHTTP(listResponse, listRequest)
	var listed struct {
		Connections []IntelligenceSourceV2ConnectionSummary `json:"connections"`
	}
	if listResponse.Code != http.StatusOK || json.Unmarshal(listResponse.Body.Bytes(), &listed) != nil || len(listed.Connections) != 1 || listed.Connections[0].ID != "connection-1" || listCalls != 1 || strings.Contains(strings.ToLower(listResponse.Body.String()), "credential") {
		t.Fatalf("safe connection list = %d %q", listResponse.Code, listResponse.Body.String())
	}
}

func TestSourceV2BrowserFormRejectsUntrustedOrigin(t *testing.T) {
	called := false
	consentHandler := NewIntelligenceSourceV2ConsentHandler(IntelligenceSourceV2ConsentHandlerConfig{
		BrowserAppURL: "https://messenger.example",
		Operations: IntelligenceSourceV2ConsentOperations{AuthorizeBrowser: func(context.Context, *http.Request, string, IntelligenceSourceV2ConsentRequest) (IntelligenceSourceV2ConsentRedirect, error) {
			called = true
			return IntelligenceSourceV2ConsentRedirect{}, nil
		}},
	})
	router := chi.NewRouter()
	router.Mount("/api/v2/intelligence", consentHandler)
	var handler http.Handler = router
	form := url.Values{
		"response_type": {"code"}, "client_id": {"intelligence-client"}, "redirect_uri": {"https://intelligence.example/callback"},
		"state": {"state-one"}, "code_challenge": {browserTestChallenge}, "code_challenge_method": {"S256"}, "chat_id": {"chat-1"},
		"read": {"false"}, "process": {"false"}, "external_transfer": {"false"}, "export": {"false"}, "codex": {"false"}, "reply": {"false"},
	}
	request := httptest.NewRequest(http.MethodPost, "/api/v2/intelligence/authorize", strings.NewReader(form.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Origin", "https://attacker.example")
	request.AddCookie(&http.Cookie{Name: intelligenceSourceV2BrowserCookieName, Value: "ticket"})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || called {
		t.Fatalf("cross-origin consent form = %d called=%v body=%s", response.Code, called, response.Body.String())
	}
}

func TestOIDCBrowserAuthorizeReturnsToLoginThenConsumesBoundTicket(t *testing.T) {
	var ticket string
	handler := NewIntelligenceOIDCHandler(IntelligenceOIDCHandlerConfig{
		Enabled: true, BrowserAppURL: "https://messenger.example",
		Operations: IntelligenceOIDCOperations{AuthorizeBrowser: func(_ context.Context, _ *http.Request, value string, request IntelligenceOIDCAuthorizationRequest) (IntelligenceOIDCAuthorizationResult, error) {
			ticket = value
			return IntelligenceOIDCAuthorizationResult{RedirectURI: request.RedirectURI, Code: "oidc-code", State: request.State}, nil
		}},
	})
	query := url.Values{
		"response_type": {"code"}, "client_id": {"intelligence-client"}, "redirect_uri": {"https://intelligence.example/callback"},
		"state": {"state-one"}, "nonce": {"nonce-one"}, "code_challenge": {browserTestChallenge}, "code_challenge_method": {"S256"},
	}
	request := httptest.NewRequest(http.MethodGet, "/oauth2/authorize?"+query.Encode(), nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusFound {
		t.Fatalf("unauthenticated OIDC browser status = %d body=%s", response.Code, response.Body.String())
	}
	location, err := url.Parse(response.Header().Get("Location"))
	if err != nil || location.Host != "messenger.example" || location.Path != "/intelligence/consent" || location.Query().Get("flow") != "oidc" || location.Query().Get("nonce") != "nonce-one" {
		t.Fatalf("OIDC login continuation location = %q (err %v)", response.Header().Get("Location"), err)
	}

	request = httptest.NewRequest(http.MethodGet, "/oauth2/authorize?"+query.Encode(), nil)
	request.AddCookie(&http.Cookie{Name: intelligenceOIDCBrowserCookieName, Value: "bound-ticket"})
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusFound || ticket != "bound-ticket" || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("OIDC browser completion = %d ticket=%q body=%s", response.Code, ticket, response.Body.String())
	}
	callback, err := url.Parse(response.Header().Get("Location"))
	if err != nil || callback.Query().Get("code") != "oidc-code" || callback.Query().Get("state") != "state-one" {
		t.Fatalf("OIDC callback = %q (err %v)", response.Header().Get("Location"), err)
	}
}

func TestOIDCBrowserAuthorizeAcceptsOpenIDScope(t *testing.T) {
	handler := NewIntelligenceOIDCHandler(IntelligenceOIDCHandlerConfig{Enabled: true, BrowserAppURL: "https://messenger.example"})
	query := url.Values{
		"response_type": {"code"}, "client_id": {"intelligence-client"}, "redirect_uri": {"https://intelligence.example/callback"},
		"state": {"state-one"}, "nonce": {"nonce-one"}, "code_challenge": {browserTestChallenge}, "code_challenge_method": {"S256"}, "scope": {"openid"},
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/oauth2/authorize?"+query.Encode(), nil))
	if response.Code != http.StatusFound {
		t.Fatalf("OIDC openid scope: status=%d body=%s", response.Code, response.Body.String())
	}
	location, err := url.Parse(response.Header().Get("Location"))
	if err != nil || location.Query().Has("scope") || location.Query().Get("flow") != "oidc" {
		t.Fatalf("OIDC consent continuation = %q (err %v)", response.Header().Get("Location"), err)
	}
	for _, scopes := range [][]string{{"profile"}, {"openid profile"}, {"openid", "openid"}, {""}} {
		query["scope"] = scopes
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/oauth2/authorize?"+query.Encode(), nil))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("scope %q: status=%d, want 400", scopes, response.Code)
		}
	}
}
